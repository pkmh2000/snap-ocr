import React from 'react';
import {
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  Globe,
  Info,
  RefreshCw,
  Sparkles,
  Tag,
  X,
  Zap
} from 'lucide-react';
import { usePWAUpdate } from '../hooks/usePWAUpdate';

interface VersionUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateHook: ReturnType<typeof usePWAUpdate>;
}

export const VersionUpdateModal: React.FC<VersionUpdateModalProps> = ({
  isOpen,
  onClose,
  updateHook,
}) => {
  if (!isOpen) return null;

  const {
    versionInfo,
    needRefresh,
    isChecking,
    checkMessage,
    lastCheckedTime,
    checkForUpdate,
    updateApp,
  } = updateHook;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-white">版本與更新資訊</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold tracking-wide uppercase">
                  BETA
                </span>
              </div>
              <p className="text-xs text-slate-400">目前版本: {versionInfo.version}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Card */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">更新狀態</span>
            {needRefresh ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                發現新版本待更新
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                已是最新版本
              </span>
            )}
          </div>

          {checkMessage && (
            <p className="text-xs text-sky-300 bg-sky-950/40 border border-sky-800/40 p-2 rounded-lg">
              {checkMessage}
            </p>
          )}

          {lastCheckedTime && (
            <p className="text-[11px] text-slate-500">
              最後檢查時間：今天 {lastCheckedTime}
            </p>
          )}
        </div>

        {/* Action Buttons: 檢查更新 & 立即更新 */}
        <div className="flex flex-col gap-2">
          {needRefresh ? (
            <button
              onClick={updateApp}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold text-sm shadow-lg shadow-orange-500/25 transition active:scale-[0.98]"
            >
              <Zap className="w-4 h-4 fill-current" />
              立即更新 (套用新版本並重新載入)
            </button>
          ) : (
            <button
              onClick={checkForUpdate}
              disabled={isChecking}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm transition active:scale-[0.98]"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? '正在向伺服器檢查更新...' : '檢查更新資訊'}
            </button>
          )}
        </div>

        {/* Release Notes */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-sky-400" />
            本次 Beta 版本更新內容
          </h4>
          <ul className="text-xs text-slate-400 space-y-1.5 bg-slate-950/50 p-3 rounded-xl border border-slate-800/60 max-h-36 overflow-y-auto">
            {versionInfo.releaseNotes.map((note, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-sky-400 leading-none mt-0.5">•</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* GitHub Pages Deployment Note */}
        <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-900/40 text-[11px] text-indigo-300/90 flex items-start gap-2">
          <Globe className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-indigo-200">GitHub Pages 相容模式</span>
            <p className="mt-0.5 text-slate-400">
              已配置相對路徑 (<code className="text-sky-300">base: './'</code>) 與純靜態離線服務，可直接打包推送到 GitHub Pages 網址運行。
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition"
        >
          關閉
        </button>
      </div>
    </div>
  );
};
