import React, { useState } from 'react';
import {
  Check,
  Copy,
  Share2,
  Volume2,
  X,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { OCRResult } from '../types';

interface OCRResultModalProps {
  result: OCRResult | null;
  onClose: () => void;
}

export const OCRResultModal: React.FC<OCRResultModalProps> = ({ result, onClose }) => {
  if (!result) return null;

  const [copied, setCopied] = useState(true); // Since it was auto-copied upon scan!
  const [text, setText] = useState(result.text);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleCopyAgain = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      navigator.vibrate?.([40]);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'SnapOCR 辨識結果',
          text: text,
        });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopyAgain();
    }
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = result.language.includes('chi') ? 'zh-TW' : 'en-US';
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header & Auto-copy Toast */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                辨識完成
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  已自動複製至剪貼簿
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                信心度: {result.confidence}% · 純前端離線辨識
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3">
          {/* Cropped thumbnail */}
          {result.previewUrl && (
            <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-1.5 flex items-center justify-center max-h-32">
              <img
                src={result.previewUrl}
                alt="框選辨識區域"
                className="max-h-28 object-contain rounded-lg"
              />
            </div>
          )}

          {/* Editable Text Area */}
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="未辨識出文字"
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 resize-none font-mono leading-relaxed"
            />
          </div>
        </div>

        {/* Actions Bar */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap gap-2">
          <button
            onClick={handleCopyAgain}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-sky-600 hover:bg-sky-500 text-white'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? '已再次複製！' : '重新複製文字'}
          </button>

          <button
            onClick={handleSpeak}
            className={`p-2.5 rounded-xl border transition ${
              isSpeaking
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="語音朗讀文字"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
            title="分享文字"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition"
          >
            關閉並繼續框選
          </button>
        </div>
      </div>
    </div>
  );
};
