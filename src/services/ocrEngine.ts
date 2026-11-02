import { createWorker } from 'tesseract.js';
import { CropBox, OCRLanguage } from '../types';

let cachedWorker: any = null;
let currentLoadedLang: string | null = null;

export interface ProgressCallback {
  (status: string, progress: number): void;
}

/**
 * Preprocesses and crops a region from an HTMLVideoElement or HTMLImageElement
 * with precise viewport-to-natural coordinate translation accounting for object-fit (cover / contain).
 */
export function cropAndPreprocessImage(
  source: HTMLVideoElement | HTMLImageElement,
  box: CropBox,
  containerSize?: { width: number; height: number },
  objectFit: 'cover' | 'contain' = 'cover',
  options: {
    enhanceContrast?: boolean;
    binarize?: boolean;
  } = { enhanceContrast: true, binarize: false }
): { canvas: HTMLCanvasElement; dataUrl: string } {
  const isVideo = source instanceof HTMLVideoElement;
  const naturalWidth = isVideo ? source.videoWidth : source.naturalWidth;
  const naturalHeight = isVideo ? source.videoHeight : source.naturalHeight;

  if (!naturalWidth || !naturalHeight) {
    throw new Error('影像來源尚未準備好');
  }

  let pixelX: number;
  let pixelY: number;
  let pixelWidth: number;
  let pixelHeight: number;

  if (containerSize && containerSize.width > 0 && containerSize.height > 0) {
    const { width: cWidth, height: cHeight } = containerSize;

    // Calculate scale and offset applied by CSS object-fit
    let scale: number;
    if (objectFit === 'cover') {
      scale = Math.max(cWidth / naturalWidth, cHeight / naturalHeight);
    } else {
      scale = Math.min(cWidth / naturalWidth, cHeight / naturalHeight);
    }

    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;

    // CSS object-position defaults to center (50% 50%)
    const offsetX = (cWidth - renderedWidth) / 2;
    const offsetY = (cHeight - renderedHeight) / 2;

    // The crop box coordinates in container pixels
    const screenX = (box.x / 100) * cWidth;
    const screenY = (box.y / 100) * cHeight;
    const screenW = (box.width / 100) * cWidth;
    const screenH = (box.height / 100) * cHeight;

    // Map screen coordinates back to raw unscaled video/image coordinates
    const rawX = (screenX - offsetX) / scale;
    const rawY = (screenY - offsetY) / scale;
    const rawW = screenW / scale;
    const rawH = screenH / scale;

    // Constrain to valid image boundaries
    pixelX = Math.max(0, Math.min(naturalWidth, rawX));
    pixelY = Math.max(0, Math.min(naturalHeight, rawY));
    pixelWidth = Math.max(1, Math.min(naturalWidth - pixelX, rawW));
    pixelHeight = Math.max(1, Math.min(naturalHeight - pixelY, rawH));
  } else {
    // Fallback if no containerSize is supplied
    pixelX = Math.max(0, Math.round((box.x / 100) * naturalWidth));
    pixelY = Math.max(0, Math.round((box.y / 100) * naturalHeight));
    pixelWidth = Math.min(naturalWidth - pixelX, Math.round((box.width / 100) * naturalWidth));
    pixelHeight = Math.min(naturalHeight - pixelY, Math.round((box.height / 100) * naturalHeight));
  }

  const canvas = document.createElement('canvas');
  // Upscale if crop is too small (greatly improves OCR for tiny fonts)
  const minDimension = 320;
  let renderScale = 1;
  if (pixelWidth < minDimension || pixelHeight < minDimension) {
    renderScale = Math.min(3, Math.max(minDimension / pixelWidth, minDimension / pixelHeight));
  }

  canvas.width = Math.max(1, Math.round(pixelWidth * renderScale));
  canvas.height = Math.max(1, Math.round(pixelHeight * renderScale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法取得 2D Canvas 繪製環境');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw exactly the mapped slice
  ctx.drawImage(
    source,
    pixelX,
    pixelY,
    pixelWidth,
    pixelHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  // Apply contrast / binarization preprocessing if requested
  if (options.enhanceContrast || options.binarize) {
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let minLum = 255;
      let maxLum = 0;

      for (let i = 0; i < data.length; i += 4) {
        const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }

      const lumRange = maxLum - minLum || 1;
      const threshold = minLum + lumRange * 0.5;

      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const stretched = ((lum - minLum) / lumRange) * 255;

        if (options.binarize) {
          const val = stretched > threshold ? 255 : 0;
          data[i] = val;
          data[i + 1] = val;
          data[i + 2] = val;
        } else if (options.enhanceContrast) {
          data[i] = stretched;
          data[i + 1] = stretched;
          data[i + 2] = stretched;
        }
      }

      ctx.putImageData(imgData, 0, 0);
    } catch {
      // In case of any canvas security restriction, proceed with clean cropped image
    }
  }

  const dataUrl = canvas.toDataURL('image/png');
  return { canvas, dataUrl };
}

/**
 * Recognizes text from an image or canvas using Tesseract.js (Pure Client-side Offline OCR)
 */
export async function recognizeTextLocally(
  imageSource: HTMLCanvasElement | string,
  language: OCRLanguage = 'chi_tra+eng',
  onProgress?: ProgressCallback
): Promise<{ text: string; confidence: number }> {
  try {
    if (!cachedWorker || currentLoadedLang !== language) {
      if (cachedWorker) {
        await cachedWorker.terminate();
        cachedWorker = null;
      }

      onProgress?.('正在載入離線辨識核心...', 0.1);

      cachedWorker = await createWorker(language, 1, {
        logger: (m: { status: string; progress: number }) => {
          let statusText = '正在辨識文字...';
          if (m.status === 'loading tesseract core') statusText = '載入 OCR 核心引擎...';
          else if (m.status === 'initializing tesseract') statusText = '初始化中...';
          else if (m.status === 'loading language traineddata') statusText = '載入語言特徵庫 (初次載入需數秒)...';
          else if (m.status === 'recognizing text') statusText = '正在分析並識別文字...';
          
          onProgress?.(statusText, m.progress || 0);
        },
      });

      currentLoadedLang = language;
    }

    onProgress?.('進行影像深度分析...', 0.7);
    const result = await cachedWorker.recognize(imageSource);
    onProgress?.('完成辨識！', 1);

    const rawText = result?.data?.text || '';
    const cleanedText = rawText
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .join('\n');

    return {
      text: cleanedText,
      confidence: Math.round(result?.data?.confidence || 0),
    };
  } catch (error) {
    console.error('Tesseract OCR error:', error);
    throw error;
  }
}
