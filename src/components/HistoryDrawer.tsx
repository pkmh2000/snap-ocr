import React, { useState } from 'react';
import { Check, Clock, Copy, Trash2, X } from 'lucide-react';
import { OCRResult } from '../types';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: OCRResult[];
  onClearHistory: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  history,
  onClearHistory,
}) => {
  if (!isOpen) return null;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (item: OCRResult) => {
    try {
      await navigator.clipboard.writeText(item.text);
      setCopiedId(item.id);
      navigator.vibrate?.([40]);
      setTimeout(() => setCopiedId(null), 1800);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold text-white">辨識歷史紀錄</h3>
            <span className="text-xs text-slate-400">({history.length})</span>
          </div>

          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={onClearHistory}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 p-1"
                title="清除所有紀錄"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清空</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              尚無辨識紀錄。框選文字後將自動記錄在此。
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-sky-400 font-medium">信心度: {item.confidence}%</span>
                </div>

                <p className="text-xs text-slate-200 font-mono whitespace-pre-wrap line-clamp-3 select-text">
                  {item.text}
                </p>

                <div className="flex items-center justify-end pt-1">
                  <button
                    onClick={() => handleCopy(item)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      copiedId === item.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>已複製</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>複製</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-2 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
        >
          關閉
        </button>
      </div>
    </div>
  );
};
