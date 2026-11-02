import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed or running as standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-md hover:from-sky-400 hover:to-indigo-500 transition active:scale-95"
      >
        <Download className="w-3.5 h-3.5" />
        <span>安裝 App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-950/40 px-3 py-1 text-xs font-medium text-sky-300 hover:bg-sky-900/40 transition active:scale-95"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>加到主畫面</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" />
                  安裝至 iPhone / iPad 主畫面
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs text-slate-300">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 font-bold text-[11px]">
                    1
                  </span>
                  <span>
                    在 Safari 瀏覽器底部工具列點擊「<strong>分享</strong>」圖示（帶箭頭的方框）。
                  </span>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 font-bold text-[11px]">
                    2
                  </span>
                  <span>
                    選單往下滑動，點選「<strong>加入主畫面</strong> (Add to Home Screen)」。
                  </span>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-sky-400 font-bold text-[11px]">
                    3
                  </span>
                  <span>
                    點右上角「<strong>新增</strong>」，即可在手機桌面像原生 App 一樣全螢幕秒開！
                  </span>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
              >
                我知道了
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
