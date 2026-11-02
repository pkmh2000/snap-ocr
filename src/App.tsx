import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Clock,
  Copy,
  Download,
  Image as ImageIcon,
  Info,
  RefreshCw,
  Scan,
  Sparkles,
  WifiOff
} from 'lucide-react';
import { OCRLanguage, OCRResult } from './types';
import { CameraViewfinder } from './components/CameraViewfinder';
import { ImageUploaderView } from './components/ImageUploaderView';
import { OCRResultModal } from './components/OCRResultModal';
import { VersionUpdateModal } from './components/VersionUpdateModal';
import { HistoryDrawer } from './components/HistoryDrawer';
import { PWAInstallButton } from './components/PWAInstallButton';
import { usePWAUpdate } from './hooks/usePWAUpdate';

export default function App() {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [language, setLanguage] = useState<OCRLanguage>('chi_tra+eng');
  const [currentResult, setCurrentResult] = useState<OCRResult | null>(null);
  const [history, setHistory] = useState<OCRResult[]>([]);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const updateHook = usePWAUpdate();

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('snap_ocr_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {
      // Ignore
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save history
  const saveHistoryItem = (item: OCRResult) => {
    setHistory((prev) => {
      const next = [item, ...prev.slice(0, 49)];
      try {
        localStorage.setItem('snap_ocr_history', JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const handleClearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('snap_ocr_history');
    } catch {
      // Ignore
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  // Called when OCR completes
  const handleOCRComplete = (text: string, confidence: number, previewUrl: string) => {
    const newResult: OCRResult = {
      id: Date.now().toString(),
      text,
      confidence,
      timestamp: Date.now(),
      previewUrl,
      language,
    };

    saveHistoryItem(newResult);
    setCurrentResult(newResult);

    if (text.trim().length > 0) {
      showToast('✨ 已自動複製識別文字至剪貼簿！');
    } else {
      showToast('⚠️ 框選區內未辨識出明顯文字，請對焦後再試');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Application Navigation Bar */}
      <header className="relative z-40 flex items-center justify-between px-3.5 py-2.5 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          {/* Logo Icon */}
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-md shadow-sky-500/20">
            <Scan className="w-4 h-4 text-white" />
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              SnapOCR
            </h1>

            {/* Beta Version Badge - click to inspect & update */}
            <button
              onClick={() => setIsVersionModalOpen(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold tracking-wider uppercase hover:bg-amber-500/25 transition active:scale-95"
              title="點擊查看版本與更新資訊"
            >
              <span>{updateHook.versionInfo.version}</span>
              {updateHook.needRefresh && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mode switch icon pill in header - doesn't block camera or bottom buttons */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-800/90 border border-slate-700/60 shadow-sm">
            <button
              onClick={() => setActiveTab('camera')}
              className={`p-1.5 rounded-lg transition ${
                activeTab === 'camera'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="切換至相機即時框選"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`p-1.5 rounded-lg transition ${
                activeTab === 'upload'
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="切換至相簿截圖導入"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          </div>

          {/* PWA Install Button (Chromium / iOS Safari) */}
          <PWAInstallButton />

          {/* History Button */}
          <button
            onClick={() => setIsHistoryOpen(true)}
            className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition active:scale-95"
            title="歷史紀錄"
          >
            <Clock className="w-4 h-4" />
            {history.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-bold text-white">
                {history.length}
              </span>
            )}
          </button>

          {/* Version / Update info button */}
          <button
            onClick={() => setIsVersionModalOpen(true)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 hover:text-white transition active:scale-95"
            title="檢查更新資訊"
          >
            <RefreshCw className={`w-4 h-4 ${updateHook.isChecking ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Mode View */}
      <main className="relative flex-1 w-full overflow-hidden flex flex-col">
        {activeTab === 'camera' ? (
          <CameraViewfinder
            language={language}
            onLanguageChange={setLanguage}
            onOCRComplete={handleOCRComplete}
            onSwitchToUpload={() => setActiveTab('upload')}
          />
        ) : (
          <ImageUploaderView
            language={language}
            onLanguageChange={setLanguage}
            onOCRComplete={handleOCRComplete}
            onSwitchToCamera={() => setActiveTab('camera')}
          />
        )}
      </main>

      {/* Floating Auto-Copy Toast */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-emerald-600/95 text-white font-medium text-xs shadow-2xl backdrop-blur-md border border-emerald-400/40 animate-in fade-in slide-in-from-top-4 duration-200">
          <Check className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Offline Status Badge */}
      {!isOnline && (
        <div className="fixed bottom-24 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs backdrop-blur-md shadow-lg">
          <WifiOff className="w-3.5 h-3.5" />
          <span>離線模式 (Tesseract 純前端辨識正常可用)</span>
        </div>
      )}

      {/* Modals & Drawers */}
      <OCRResultModal
        result={currentResult}
        onClose={() => setCurrentResult(null)}
      />

      <VersionUpdateModal
        isOpen={isVersionModalOpen}
        onClose={() => setIsVersionModalOpen(false)}
        updateHook={updateHook}
      />

      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onClearHistory={handleClearHistory}
      />
    </div>
  );
}
