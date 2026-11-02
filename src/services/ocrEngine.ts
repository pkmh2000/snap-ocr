import { createWorker } from 'tesseract.js';
import { CropBox, OCRLanguage } from '../types';

let cachedWorker: any = null;
let currentLoadedLang: string | null = null;

export type PreprocessMode = 'enhanced' | 'binarized' | 'none';

export interface PreprocessOptions {
  mode?: PreprocessMode;
  sharpen?: boolean;
}

export interface ProgressCallback {
  (status: string, progress: number): void;
}

/**
 * Computes Otsu's optimal global binarization threshold
 * by maximizing between-class variance.
 */
function computeOtsuThreshold(grayData: Uint8Array): number {
  const histogram = new Uint32Array(256);
  const total = grayData.length;

  for (let i = 0; i < total; i++) {
    histogram[grayData[i]]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Intelligent filter to remove icons, visual symbols, stray dividers,
 * and non-text noise from OCR outputs.
 */
export function filterNonTextAndIconNoise(rawText: string): string {
  if (!rawText) return '';

  const lines = rawText.split('\n');
  const filteredLines: string[] = [];

  const hasValidTextRegex = /[\u4e00-\u9fa5a-zA-Z0-9]/;

  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line) continue;

    if (!hasValidTextRegex.test(line)) {
      continue;
    }

    line = line.replace(/^[|_~^•*<>+=—\-·\\/[\](){}:;,\s]+/, '');
    line = line.replace(/[|_~^•*<>+=—\-·\\/[\](){}:;\s]+$/, '');

    if (line.length <= 1 && !/[\u4e00-\u9fa5a-zA-Z0-9]/.test(line)) {
      continue;
    }

    line = line.replace(/[|_~—\-]{2,}/g, ' ');
    line = line.replace(/\s{2,}/g, ' ').trim();

    if (line.length > 0 && hasValidTextRegex.test(line)) {
      filteredLines.push(line);
    }
  }

  return filteredLines.join('\n');
}

/**
 * Preprocesses and crops a region from an HTMLVideoElement or HTMLImageElement
 * with viewport-to-natural coordinate translation and image optimization
 * (Grayscale, Otsu Binarization, Contrast Stretch, and Text Sharpening).
 */
export function cropAndPreprocessImage(
  source: HTMLVideoElement | HTMLImageElement,
  box: CropBox,
  containerSize?: { width: number; height: number },
  objectFit: 'cover' | 'contain' = 'cover',
  options: PreprocessOptions = { mode: 'enhanced', sharpen: true }
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

    let scale: number;
    if (objectFit === 'cover') {
      scale = Math.max(cWidth / naturalWidth, cHeight / naturalHeight);
    } else {
      scale = Math.min(cWidth / naturalWidth, cHeight / naturalHeight);
    }

    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;

    const offsetX = (cWidth - renderedWidth) / 2;
    const offsetY = (cHeight - renderedHeight) / 2;

    const screenX = (box.x / 100) * cWidth;
    const screenY = (box.y / 100) * cHeight;
    const screenW = (box.width / 100) * cWidth;
    const screenH = (box.height / 100) * cHeight;

    const rawX = (screenX - offsetX) / scale;
    const rawY = (screenY - offsetY) / scale;
    const rawW = screenW / scale;
    const rawH = screenH / scale;

    pixelX = Math.max(0, Math.min(naturalWidth, rawX));
    pixelY = Math.max(0, Math.min(naturalHeight, rawY));
    pixelWidth = Math.max(1, Math.min(naturalWidth - pixelX, rawW));
    pixelHeight = Math.max(1, Math.min(naturalHeight - pixelY, rawH));
  } else {
    pixelX = Math.max(0, Math.round((box.x / 100) * naturalWidth));
    pixelY = Math.max(0, Math.round((box.y / 100) * naturalHeight));
    pixelWidth = Math.min(naturalWidth - pixelX, Math.round((box.width / 100) * naturalWidth));
    pixelHeight = Math.min(naturalHeight - pixelY, Math.round((box.height / 100) * naturalHeight));
  }

  const canvas = document.createElement('canvas');
  // Upscale if crop is too small (greatly improves OCR for tiny fonts)
  const minDimension = 360;
  let renderScale = 1;
  if (pixelWidth < minDimension || pixelHeight < minDimension) {
    renderScale = Math.min(3, Math.max(minDimension / pixelWidth, minDimension / pixelHeight));
  }

  const targetWidth = Math.max(1, Math.round(pixelWidth * renderScale));
  const targetHeight = Math.max(1, Math.round(pixelHeight * renderScale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法取得 2D Canvas 繪製環境');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw slice
  ctx.drawImage(
    source,
    pixelX,
    pixelY,
    pixelWidth,
    pixelHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const mode = options.mode || 'enhanced';

  // Perform Image Preprocessing
  if (mode !== 'none') {
    try {
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const data = imgData.data;
      const numPixels = targetWidth * targetHeight;
      const gray = new Uint8Array(numPixels);

      // 1. Grayscale Conversion
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        // Luminance: 0.299R + 0.587G + 0.114B
        gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }

      // 2. Histogram Analysis for Robust Contrast Stretching (1% and 99% Percentiles)
      const hist = new Uint32Array(256);
      for (let p = 0; p < numPixels; p++) {
        hist[gray[p]]++;
      }

      const p1Count = Math.floor(numPixels * 0.015);
      const p99Count = Math.floor(numPixels * 0.985);
      let cumulative = 0;
      let minVal = 0;
      let maxVal = 255;

      for (let i = 0; i < 256; i++) {
        cumulative += hist[i];
        if (cumulative <= p1Count) minVal = i;
        if (cumulative >= p99Count && maxVal === 255) maxVal = i;
      }
      if (maxVal <= minVal) maxVal = minVal + 1;

      // Contrast Stretched Grayscale
      const stretched = new Uint8Array(numPixels);
      const range = maxVal - minVal;
      for (let p = 0; p < numPixels; p++) {
        const val = gray[p];
        if (val <= minVal) stretched[p] = 0;
        else if (val >= maxVal) stretched[p] = 255;
        else stretched[p] = Math.round(((val - minVal) / range) * 255);
      }

      // 3. Mode Branching: Binarization vs Enhanced Grayscale
      if (mode === 'binarized') {
        const otsuThreshold = computeOtsuThreshold(stretched);

        // Check polarity: count how many pixels are dark vs bright
        let darkCount = 0;
        for (let p = 0; p < numPixels; p++) {
          if (stretched[p] < otsuThreshold) darkCount++;
        }
        // If more than 55% pixels are dark, text is probably white on dark background -> invert!
        const isInverted = darkCount > numPixels * 0.55;

        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          let bVal: number;
          if (isInverted) {
            // White text becomes black (0), dark background becomes white (255)
            bVal = stretched[p] >= otsuThreshold ? 0 : 255;
          } else {
            // Standard dark text on light background
            bVal = stretched[p] < otsuThreshold ? 0 : 255;
          }
          data[i] = bVal;
          data[i + 1] = bVal;
          data[i + 2] = bVal;
        }
      } else {
        // 'enhanced' Mode: Stretched Grayscale + Unsharp Stroke Sharpening
        const sharpen = options.sharpen !== false;
        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            const p = y * targetWidth + x;
            const idx = p * 4;

            let pixelValue = stretched[p];

            if (sharpen && x > 0 && x < targetWidth - 1 && y > 0 && y < targetHeight - 1) {
              // 3x3 Sharpen Kernel: center 3.0, neighbors -0.5
              const up = stretched[(y - 1) * targetWidth + x];
              const down = stretched[(y + 1) * targetWidth + x];
              const left = stretched[y * targetWidth + (x - 1)];
              const right = stretched[y * targetWidth + (x + 1)];
              const sharpVal = 3.0 * pixelValue - 0.5 * (up + down + left + right);
              pixelValue = Math.max(0, Math.min(255, Math.round(sharpVal)));
            }

            data[idx] = pixelValue;
            data[idx + 1] = pixelValue;
            data[idx + 2] = pixelValue;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Fallback to original crop if canvas processing is restricted
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
  onProgress?: ProgressCallback,
  options: { filterIconsAndNoise?: boolean } = { filterIconsAndNoise: true }
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
    
    let cleanedText = rawText;
    if (options.filterIconsAndNoise) {
      cleanedText = filterNonTextAndIconNoise(rawText);
    } else {
      cleanedText = rawText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0)
        .join('\n');
    }

    return {
      text: cleanedText,
      confidence: Math.round(result?.data?.confidence || 0),
    };
  } catch (error) {
    console.error('Tesseract OCR error:', error);
    throw error;
  }
}
