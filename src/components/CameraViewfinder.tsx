import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Copy,
  FlipHorizontal,
  Grid3X3,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  ZapOff
} from 'lucide-react';
import { CropBox, OCRLanguage } from '../types';
import { cropAndPreprocessImage, recognizeTextLocally } from '../services/ocrEngine';

interface CameraViewfinderProps {
  language: OCRLanguage;
  onLanguageChange: (lang: OCRLanguage) => void;
  onOCRComplete: (text: string, confidence: number, previewUrl: string) => void;
  onSwitchToUpload: () => void;
}

export const CameraViewfinder: React.FC<CameraViewfinderProps> = ({
  language,
  onLanguageChange,
  onOCRComplete,
  onSwitchToUpload,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);

  // Crop Box state in percentage (0 to 100)
  const [cropBox, setCropBox] = useState<CropBox>({
    x: 10,
    y: 35,
    width: 80,
    height: 25,
  });

  // Dragging and resizing state
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startBox: CropBox;
  } | null>(null);

  // OCR Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [enhanceContrast, setEnhanceContrast] = useState<boolean>(true);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setCameraActive(true);
      setIsFrozen(false);

      // Check for torch capability
      const track = stream.getVideoTracks()[0];
      const capabilities = (track.getCapabilities?.() as any) || {};
      setHasTorch(Boolean(capabilities.torch));
    } catch (err: any) {
      console.error('Camera access error:', err);
      let msg = '無法取得相機權限。請確認瀏覽器已允許使用相機。';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = '相機權限已被拒絕。請至手機瀏覽器設定中開啟相機權限，或使用「截圖/照片導入」。';
      } else if (err.name === 'NotFoundError') {
        msg = '找不到可用的攝影鏡頭裝置。';
      }
      setCameraError(msg);
      setCameraActive(false);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  // Toggle Torch
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const newState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: newState }],
        });
        setTorchOn(newState);
      } catch (e) {
        console.warn('Torch toggle failed', e);
      }
    }
  };

  // Toggle Freeze Frame
  const toggleFreeze = () => {
    if (!videoRef.current) return;
    if (isFrozen) {
      videoRef.current.play();
      setIsFrozen(false);
    } else {
      videoRef.current.pause();
      setIsFrozen(true);
    }
  };

  // Switch Camera facing mode
  const switchCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Handle touch / mouse dragging and resizing of the crop box
  const handlePointerDown = (e: React.PointerEvent, handleType: string) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

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

    const minSize = 10; // minimum percentage

    if (activeHandle === 'move') {
      newX = Math.max(0, Math.min(100 - start.width, start.x + deltaXPercent));
      newY = Math.max(0, Math.min(100 - start.height, start.y + deltaYPercent));
    } else {
      // Corner & Edge resizing
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

  // Preset aspect ratios
  const applyPreset = (preset: 'line' | 'card' | 'square' | 'free') => {
    if (preset === 'line') {
      setCropBox({ x: 8, y: 42, width: 84, height: 16 });
    } else if (preset === 'card') {
      setCropBox({ x: 10, y: 30, width: 80, height: 40 });
    } else if (preset === 'square') {
      setCropBox({ x: 20, y: 30, width: 60, height: 40 });
    } else {
      setCropBox({ x: 10, y: 25, width: 80, height: 50 });
    }
  };

  // Execute OCR on the cropped box region
  const handlePerformOCR = async () => {
    if (!videoRef.current || isProcessing) return;

    try {
      setIsProcessing(true);
      setProgressStatus('正在截取框選區域...');
      setProgressPercent(0.15);

      // Crop the target region
      const { canvas, dataUrl } = cropAndPreprocessImage(videoRef.current, cropBox, {
        enhanceContrast,
        binarize: false,
      });

      // Local offline OCR
      const { text, confidence } = await recognizeTextLocally(
        canvas,
        language,
        (status, progress) => {
          setProgressStatus(status);
          setProgressPercent(progress);
        }
      );

      // Directly auto-copy to clipboard!
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
      alert('辨識過程發生問題：' + (err.message || '請確認相機鏡頭對焦與字體清晰'));
    } finally {
      setIsProcessing(false);
      setProgressPercent(0);
      setProgressStatus('');
    }
  };

  return (
    <div className="relative flex flex-col w-full h-[calc(100vh-4rem)] max-h-[880px] bg-slate-950 overflow-hidden select-none touch-none">
      {/* Top Floating Control Bar */}
      <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-auto">
        {/* Language selector pill */}
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

        {/* Quick tool icons */}
        <div className="flex items-center gap-1.5">
          {hasTorch && (
            <button
              onClick={toggleTorch}
              className={`p-2 rounded-full backdrop-blur-md border transition ${
                torchOn
                  ? 'bg-amber-500/20 border-amber-500/80 text-amber-300'
                  : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:text-white'
              }`}
              title="開啟/關閉補光燈"
            >
              {torchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={toggleFreeze}
            className={`p-2 rounded-full backdrop-blur-md border transition ${
              isFrozen
                ? 'bg-sky-500/20 border-sky-500/80 text-sky-400'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300 hover:text-white'
            }`}
            title={isFrozen ? '恢復即時預覽' : '定格畫面調整框選'}
          >
            {isFrozen ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <button
            onClick={switchCamera}
            className="p-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-300 hover:text-white transition"
            title="切換前後鏡頭"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={onSwitchToUpload}
            className="p-2 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 text-slate-300 hover:text-white transition"
            title="切換至照片/截圖導入"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center bg-black cursor-crosshair touch-none"
      >
        {/* Live Camera Video Feed */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Camera Permission / Error Fallback */}
        {cameraError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 backdrop-blur-sm">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-400">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">相機無法啟動</h3>
            <p className="text-sm text-slate-400 max-w-xs mb-6">{cameraError}</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={startCamera}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition"
              >
                <RotateCcw className="w-4 h-4" /> 重新連接相機
              </button>
              <button
                onClick={onSwitchToUpload}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition"
              >
                <ImageIcon className="w-4 h-4" /> 改用截圖/相片導入
              </button>
            </div>
          </div>
        )}

        {/* Darkened Mask Outside the Crop Box */}
        {cameraActive && !cameraError && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(transparent 0, rgba(0, 0, 0, 0.72) 100%)`,
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
              backgroundColor: 'rgba(5, 10, 20, 0.65)',
            }}
          />
        )}

        {/* Dynamic Draggable & Resizable Target Crop Box */}
        {cameraActive && !cameraError && (
          <div
            style={{
              left: `${cropBox.x}%`,
              top: `${cropBox.y}%`,
              width: `${cropBox.width}%`,
              height: `${cropBox.height}%`,
            }}
            className="absolute border-2 border-sky-400/90 rounded-md shadow-[0_0_20px_rgba(56,189,248,0.35)] transition-shadow duration-200"
          >
            {/* Center Drag Area */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'move')}
              className="absolute inset-0 cursor-move flex items-center justify-center"
            >
              {/* Internal Framing Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-25">
                <div className="border-r border-b border-sky-300/40" />
                <div className="border-r border-b border-sky-300/40" />
                <div className="border-b border-sky-300/40" />
                <div className="border-r border-b border-sky-300/40" />
                <div className="border-r border-b border-sky-300/40" />
                <div className="border-b border-sky-300/40" />
                <div className="border-r border-sky-300/40" />
                <div className="border-r border-sky-300/40" />
                <div />
              </div>

              {/* Scanning Laser Line when processing */}
              {isProcessing && (
                <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#38bdf8] animate-scan-line pointer-events-none" />
              )}

              {/* Center Crosshair Hint */}
              {!isProcessing && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950/70 backdrop-blur-md border border-sky-500/30 text-[11px] font-medium text-sky-200 pointer-events-none shadow-sm">
                  <Sparkles className="w-3 h-3 text-sky-400 animate-pulse" />
                  拖曳調整辨識區域
                </div>
              )}
            </div>

            {/* Corner Decorative Brackets */}
            <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-sky-400 pointer-events-none rounded-tl-sm" />
            <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-sky-400 pointer-events-none rounded-tr-sm" />
            <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-sky-400 pointer-events-none rounded-bl-sm" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-sky-400 pointer-events-none rounded-br-sm" />

            {/* 4 Interactive Corner Resize Handles */}
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

            {/* Top & Bottom edge handles */}
            <div
              onPointerDown={(e) => handlePointerDown(e, 'n')}
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-n-resize z-10"
            >
              <div className="w-5 h-1 bg-sky-300 rounded-full" />
            </div>
            <div
              onPointerDown={(e) => handlePointerDown(e, 's')}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-4 flex items-center justify-center cursor-s-resize z-10"
            >
              <div className="w-5 h-1 bg-sky-300 rounded-full" />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls & Action Bar */}
      <div className="relative z-30 flex flex-col gap-2.5 px-4 pt-3 pb-5 bg-gradient-to-t from-slate-950 via-slate-950/95 to-slate-950/80 border-t border-slate-800/80">
        {/* Preset buttons & Contrast enhancer toggle */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto py-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap pl-1">框選比例:</span>
            <button
              onClick={() => applyPreset('line')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white hover:border-sky-500/50 transition whitespace-nowrap"
            >
              橫向單行
            </button>
            <button
              onClick={() => applyPreset('card')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white hover:border-sky-500/50 transition whitespace-nowrap"
            >
              段落卡片
            </button>
            <button
              onClick={() => applyPreset('square')}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-900 border border-slate-700/60 text-slate-300 hover:text-white hover:border-sky-500/50 transition whitespace-nowrap"
            >
              正方形
            </button>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer pr-1 select-none">
            <input
              type="checkbox"
              checked={enhanceContrast}
              onChange={(e) => setEnhanceContrast(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="whitespace-nowrap">高對比強化</span>
          </label>
        </div>

        {/* Processing Progress Bar */}
        {isProcessing && (
          <div className="flex flex-col gap-1 w-full px-1">
            <div className="flex justify-between text-xs text-sky-300">
              <span className="truncate">{progressStatus || '正在分析框選文字...'}</span>
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

        {/* Primary Action Button: Scan & Auto Copy */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePerformOCR}
            disabled={!cameraActive || isProcessing}
            className={`relative flex-1 flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-2xl font-semibold text-base shadow-lg transition active:scale-[0.98] ${
              isProcessing
                ? 'bg-sky-700/60 text-sky-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-sky-500 via-sky-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-sky-500/25 ring-2 ring-sky-400/30'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>正在本地辨識中...</span>
              </>
            ) : (
              <>
                <Copy className="w-5 h-5 text-sky-200" />
                <span>辨識框選區 (自動複製至剪貼簿)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
