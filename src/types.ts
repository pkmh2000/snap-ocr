export interface CropBox {
  x: number; // percentage (0 to 100) or pixels
  y: number;
  width: number;
  height: number;
}

export interface OCRResult {
  id: string;
  text: string;
  confidence: number;
  timestamp: number;
  previewUrl?: string;
  language: string;
}

export type OCRLanguage = 'chi_tra+eng' | 'chi_tra' | 'chi_sim+eng' | 'eng';

export interface VersionInfo {
  version: string;
  buildDate: string;
  isBeta: boolean;
  channel: 'beta' | 'stable';
  releaseNotes: string[];
}
