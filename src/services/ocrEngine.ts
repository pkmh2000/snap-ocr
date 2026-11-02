import { createWorker } from 'tesseract.js';
import { CropBox, OCRLanguage } from '../types';

let cachedWorker: any = null;
let currentLoadedLang: string | null = null;

export interface ProgressCallback {
  (status: string, progress: number): void;
}

/**
 * Preprocesses and crops a region from an HTMLVideoElement or HTMLImageElement
 */
export function cropAndPreprocessImage(
  source: HTMLVideoElement | HTMLImageElement,
  box: CropBox,
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

  // Calculate actual pixel bounding box on the native source resolution
  const pixelX = Math.max(0, Math.round((box.x / 100) * naturalWidth));
  const pixelY = Math.max(0, Math.round((box.y / 100) * naturalHeight));
  const pixelWidth = Math.min(naturalWidth - pixelX, Math.round((box.width / 100) * naturalWidth));
  const pixelHeight = Math.min(naturalHeight - pixelY, Math.round((box.height / 100) * naturalHeight));

  const canvas = document.createElement('canvas');
  // Upscale if crop is too small (improves OCR for tiny text)
  const minDimension = 300;
  let scale = 1;
  if (pixelWidth < minDimension || pixelHeight < minDimension) {
    scale = Math.min(3, Math.max(minDimension / pixelWidth, minDimension / pixelHeight));
  }

  canvas.width = Math.round(pixelWidth * scale);
  canvas.height = Math.round(pixelHeight * scale);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法取得 2D Canvas 繪製環境');

  // Disable smoothing for crisp text edges when scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw cropped slice
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

  // Apply image preprocessing if requested
  if (options.enhanceContrast || options.binarize) {
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      // 1. Grayscale & Contrast stretch
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
        // Contrast stretch
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
      // If tainted canvas or security constraint, fallback to standard image
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
    // If language changed or worker not initialized, recreate worker
    if (!cachedWorker || currentLoadedLang !== language) {
      if (cachedWorker) {
        await cachedWorker.terminate();
        cachedWorker = null;
      }

      onProgress?.('正在載入離線辨識核心...', 0.1);

      // Initialize Tesseract worker with progress callback
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
    // Clean up excessive empty lines while preserving sensible paragraphs
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
