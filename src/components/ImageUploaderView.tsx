import React, { useRef, useState } from 'react';
import { Camera, Clipboard, Copy, Image as ImageIcon, Sparkles, Upload } from 'lucide-react';
import { CropBox, OCRLanguage } from '../types';
import { cropAndPreprocessImage, recognizeTextLocally, PreprocessMode } from '../services/ocrEngine';

interface ImageUploaderViewProps {
  language: OCRLanguage;
  onLanguageChange: (lang: OCRLanguage) => void;
  onOCRComplete: (text: string, confidence: number, previewUrl: string) => void;
  onSwitchToCamera: () => void;
}

export const ImageUploaderView: React.FC<ImageUploaderViewProps> = ({
  language,
  onLanguageChange,
  onOCRComplete,
  onSwitchToCamera,
}) => {
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 10,
    y: 20,
    width: 80,
    height: 35,
  });

  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startBox: CropBox;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [preprocessMode, setPreprocessMode] = useState<PreprocessMode>('enhanced');
  const [filterIcons, setFilterIcons] = useState<boolean>(true);
  const [showHint, setShowHint] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Auto-dismiss the center hint after 2.5s
  React.useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Handle file select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageUrl(url);
    }
  };

  // Read image from clipboard
  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        alert('您的瀏覽器不支援直接讀取剪貼簿圖片，請點選「選取相簿截圖」。');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const url = URL.createObjectURL(blob);
            setImageUrl(url);
            return;
          }
        }
      }
      alert('剪貼簿中未找到圖片。請先在手機進行截圖或複製一張圖片！');
    } catch (err: any) {
      console.warn('Clipboard read error:', err);
      alert('無法讀取剪貼簿圖片。請改用「選取相片/截圖檔案」。');
    }
  };

  // Handle pointer drag & resize
  const handlePointerDown = (e: React.PointerEvent, handleType: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    setShowHint(false); // Immediately remove the label so text is 100% visible
    setActiveHandle(handleType);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...cropBox },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !dragStartRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const deltaXPercent = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;
    const start = dragStartRef.current.startBox;

    let newX = start.x;
    let newY = start.y;
    let newW = start.width;
    let newH = start.height;

    const minSize = 10;

    if (activeHandle === 'move') {
      newX = Math.max(0, Math.min(100 - start.width, start.x + deltaXPercent));
      newY = Math.max(0, Math.min(100 - start.height, start.y + deltaYPercent));
    } else {
      if (activeHandle.includes('n')) {
        const maxDeltaY = start.height - minSize;
        const validDeltaY = Math.min(maxDeltaY, Math.max(-start.y, deltaYPercent));
        newY = start.y + validDeltaY;
        newH = start.height - validDeltaY;
      }
      if (activeHandle.includes('s')) {
        newH = Math.max(minSize, Math.min(100 - start.y, start.height + deltaYPercent));
      }
      if (activeHandle.includes('w')) {
        const maxDeltaX = start.width - minSize;
        const validDeltaX = Math.min(maxDeltaX, Math.max(-start.x, deltaXPercent));
        newX = start.x + validDeltaX;
        newW = start.width - validDeltaX;
      }
      if (activeHandle.includes('e')) {
        newW = Math.max(minSize, Math.min(100 - start.x, start.width + deltaXPercent));
      }
    }

    setCropBox({
      x: Math.round(newX * 10) / 10,
      y: Math.round(newY * 10) / 10,
      width: Math.round(newW * 10) / 10,
      height: Math.round(newH * 10) / 10,
    });
  };

  const handlePointerUp = () => {
    setActiveHandle(null);
    dragStartRef.current = null;
  };

  // Perform OCR
  const handlePerformOCR = async () => {
    if (!imageRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setProgressStatus('正在截取框選區域...');
      setProgressPercent(0.15);

      const containerRect = containerRef.current?.getBoundingClientRect();
      const containerSize = containerRect
        ? { width: containerRect.width, height: containerRect.height }
        : undefined;

      const { canvas, dataUrl } = cropAndPreprocessImage(
        imageRef.current,
        cropBox,
        containerSize,
        'contain',
        {
          mode: preprocessMode,
          sharpen: true,
        },
        zoomLevel
      );

      // Local offline OCR with optional non-text/icon noise filtering
      const { text, confidence } = await recognizeTextLocally(
        canvas,
        language,
        (status, progress) => {
          setProgressStatus(status);
          setProgressPercent(progress);
        },
        { filterIconsAndNoise: filterIcons }
      );

      // Auto copy
      if (text.trim().length > 0) {
        try {
          await navigator.clipboard.writeText(text);
          navigator.vibrate?.([40, 20, 40]);
        } catch (clipErr) {
          console.warn('Clipboard write warning:', clipErr);
        }
      }

      onOCRComplete(text, confidence, dataUrl);
    } catch (err: any) {
      console.error('OCR Process error:', err);
      alert('辨識過程發生問題：' + (err.message || '請確認字體清晰'));
    } finally {
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressStatus('');
    }
  };

  return (
    <div className="relative flex-1 min-h-0 w-full flex flex-col bg-slate-950 overflow-hidden select-none justify-between">
      {/* Top Bar */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-auto">
        <div className="flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 rounded-full px-2.5 py-1 text-xs shadow-lg">
          <span className="text-slate-400 font-medium">語言:</span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as OCRLanguage)}
            className="bg-transparent text-sky-400 font-medium focus:outline-none cursor-pointer"
          >
            <option value="chi_tra+eng" className="bg-slate-900 text-white">繁中 + 英文</option>
            <option value="chi_tra" className="bg-slate-900 text-white">純繁體中文</option>
            <option value="chi_sim+eng" className="bg-slate-900 text-white">簡中 + 英文</option>
            <option value="eng" className="bg-slate-900 text-white">純英文 / 數字</option>
          </select>
        </div>

        <button
          onClick={onSwitchToCamera}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-lg transition"
        >
          <Camera className="w-3.5 h-3.5" />
          返回即時相機
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Image Frame or Upload Empty State */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-black cursor-crosshair touch-none"
      >
        {imageUrl ? (
          <>
            <img
              ref={imageRef}
              src={imageUrl}
              alt="待框選截圖"
              style={{
                transform: zoomLevel > 1 ? `scale(${zoomLevel})` : undefined,
                transformOrigin: 'center center',
              }}
              className="w-full h-full object-contain pointer-events-none transition-transform duration-200"
            />

            {/* Floating Zoom Selector (1x, 1.5x, 2x, 3x) */}
            <div className="absolute right-2.5 bottom-4 z-30 flex flex-col items-center gap-1.5 p-1 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-slate-700/60 shadow-xl pointer-events-auto">
              {[1.0, 1.5, 2.0, 3.0].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setZoomLevel(lvl)}
                  className={`w-7 h-7 rounded-xl text-[10px] font-bold transition flex items-center justify-center ${
                    zoomLevel === lvl
                      ? 'bg-amber-400 text-slate-950 shadow-md scale-105'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                  }`}
                  title={`縮放至 ${lvl} 倍`}
                >
                  {lvl}x
                </button>
              ))}
            </div>

            {/* Dark Mask */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                clipPath: `polygon(
                  0% 0%, 0% 100%, 
                  ${cropBox.x}% 100%, 
                  ${cropBox.x}% ${cropBox.y}%, 
                  ${cropBox.x + cropBox.width}% ${cropBox.y}%, 
                  ${cropBox.x + cropBox.width}% ${cropBox.y + cropBox.height}%, 
                  ${cropBox.x}% ${cropBox.y + cropBox.height}%, 
                  ${cropBox.x}% 100%, 
                  100% 100%, 100% 0%
                )`,
                backgroundColor: 'rgba(5, 10, 20, 0.7)',
              }}
            />

            {/* Interactive Crop Box */}
            <div
              style={{
                left: `${cropBox.x}%`,
                top: `${cropBox.y}%`,
                width: `${cropBox.width}%`,
                height: `${cropBox.height}%`,
              }}
              className="absolute border-2 border-sky-400 rounded-md shadow-[0_0_20px_rgba(56,189,248,0.35)]"
            >
              <div
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                className="absolute inset-0 cursor-move flex items-center justify-center"
              >
                {isProcessing && (
                  <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-scan-line pointer-events-none" />
                )}
                {/* Center Crosshair Hint - auto-dismissed on touch/move to not block text */}
                {!isProcessing && showHint && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-sky-500/30 text-[11px] font-medium text-sky-200 pointer-events-none shadow-sm transition-opacity duration-300">
                    <Sparkles className="w-3 h-3 text-sky-400 animate-pulse" />
                    拖曳縮放選取文字
                  </div>
                )}
              </div>

              {/* Corner Handles */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'nw')}
                className="absolute -top-3 -left-3 w-7 h-7 flex items-center justify-center cursor-nw-resize z-20 touch-none"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md" />
              </div>
              <div
                onPointerDown={(e) => handlePointerDown(e, 'ne')}
                className="absolute -top-3 -right-3 w-7 h-7 flex items-center justify-center cursor-ne-resize z-20 touch-none"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md" />
              </div>
              <div
                onPointerDown={(e) => handlePointerDown(e, 'sw')}
                className="absolute -bottom-3 -left-3 w-7 h-7 flex items-center justify-center cursor-sw-resize z-20 touch-none"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md" />
              </div>
              <div
                onPointerDown={(e) => handlePointerDown(e, 'se')}
                className="absolute -bottom-3 -right-3 w-7 h-7 flex items-center justify-center cursor-se-resize z-20 touch-none"
              >
                <div className="w-3.5 h-3.5 bg-white border-2 border-sky-500 rounded-full shadow-md" />
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4 text-sky-400">
              <ImageIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">導入手機截圖或照片</h3>
            <p className="text-xs text-slate-400 mb-5">
              可直接從手機相簿載入截圖，或貼上剪貼簿圖片進行框選辨識
            </p>

            <div className="flex flex-col gap-2.5 w-full">
              {/* Primary button: Open Photo Gallery */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-sky-600/25 active:scale-[0.98]"
              >
                <Upload className="w-4 h-4" /> 開啟手機相簿選取截圖
              </button>

              {/* Secondary button: Paste clipboard image */}
              <button
                onClick={handlePasteFromClipboard}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition active:scale-[0.98]"
              >
                <Clipboard className="w-3.5 h-3.5 text-sky-400" /> 貼上已複製的截圖 (剪貼簿)
              </button>
            </div>

            {/* Mobile screenshot tip card */}
            <div className="mt-5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-left w-full space-y-1.5">
              <span className="text-[11px] font-semibold text-sky-300 flex items-center gap-1.5">
                📱 手機截圖操作說明：
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                1. 手機按<strong>「電源鍵 + 音量鍵」</strong>進行螢幕截圖。<br />
                2. 回到此 App 點上方<strong>「開啟手機相簿」</strong>，選取第一張剛截好的圖。<br />
                3. 手指框選目標文字，自動完成 OCR 並複製到剪貼簿！
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      {imageUrl && (
        <div className="relative z-30 shrink-0 flex flex-col gap-2 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))] bg-slate-950/95 border-t border-slate-800 backdrop-blur-md">
          {/* Row 1: Change photo & Filter Icons */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-4"
            >
              更換照片
            </button>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterIcons}
                onChange={(e) => setFilterIcons(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span className="text-sky-300 font-medium">過濾圖標/雜訊</span>
            </label>
          </div>

          {/* Row 2: Preprocess Mode Selector */}
          <div className="flex items-center justify-between gap-1.5 bg-slate-900/60 p-1 rounded-lg border border-slate-800/80 text-[11px]">
            <span className="text-slate-400 font-medium whitespace-nowrap pl-1">影像預處理:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPreprocessMode('enhanced')}
                className={`px-2 py-0.5 rounded transition whitespace-nowrap font-medium ${
                  preprocessMode === 'enhanced'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="灰階轉換 + 對比拉伸 + 字元銳化"
              >
                智慧增強 (灰階+銳化)
              </button>
              <button
                onClick={() => setPreprocessMode('binarized')}
                className={`px-2 py-0.5 rounded transition whitespace-nowrap font-medium ${
                  preprocessMode === 'binarized'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="大津法自動黑白二值化"
              >
                黑白二值化
              </button>
              <button
                onClick={() => setPreprocessMode('none')}
                className={`px-2 py-0.5 rounded transition whitespace-nowrap font-medium ${
                  preprocessMode === 'none'
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                原圖
              </button>
            </div>
          </div>

          {isProcessing && (
            <div className="flex flex-col gap-1 w-full">
              <div className="flex justify-between text-xs text-sky-300">
                <span className="truncate">{progressStatus}</span>
                <span>{Math.round(progressPercent * 100)}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-200"
                  style={{ width: `${Math.max(5, progressPercent * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="w-full pt-0.5">
            <button
              onClick={handlePerformOCR}
              disabled={isProcessing}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm sm:text-base shadow-lg transition active:scale-[0.98] ${
                isProcessing
                  ? 'bg-sky-700/60 text-sky-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 ring-2 ring-sky-400/30'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在本地辨識中...</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-sky-200" />
                  <span>辨識框選區 (自動複製至剪貼簿)</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
