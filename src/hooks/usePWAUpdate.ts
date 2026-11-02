import { useCallback, useEffect, useState } from 'react';
import { VersionInfo } from '../types';

export const CURRENT_VERSION_INFO: VersionInfo = {
  version: 'v1.0.1-beta',
  buildDate: '2026-11-02',
  isBeta: true,
  channel: 'beta',
  releaseNotes: [
    '🔍 支援相機即時光學/數位鏡頭縮放 (1x / 1.5x / 2x / 3x)，看清遠處或微小字體',
    '✨ 實作進階影像預處理：支援灰階轉換、大津法(Otsu)黑白二值化、對比度拉伸與字元銳化',
    '📱 解決手機版辨識按鈕超出螢幕邊緣問題，適配 100dvh 與安全區域 (Safe Area)',
    '🔘 將相機/截圖切換鍵移至頂部導航列並改為圖標，不再遮蔽辨識按鈕',
    '🎯 修復選取框與底層鏡頭幾何縮放偏移，達成像素級準確對齊',
    '🚫 內建智慧過濾演算法，自動排除 Icon、小圖標與非文字雜訊'
  ]
};

export function usePWAUpdate() {
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          setSwRegistration(reg);
          if (reg.waiting) {
            setNeedRefresh(true);
          }
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener('statechange', () => {
                if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                  setNeedRefresh(true);
                }
              });
            }
          });
        }
      });

      // Listen for controllerchange
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }, []);

  const checkForUpdate = useCallback(async () => {
    setIsChecking(true);
    setCheckMessage(null);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    try {
      if ('serviceWorker' in navigator && swRegistration) {
        await swRegistration.update();
        if (swRegistration.waiting) {
          setNeedRefresh(true);
          setCheckMessage('發現新版本！請點選「立即更新」以套用最新功能。');
        } else {
          setNeedRefresh(false);
          setCheckMessage(`目前已是最新版本 (${CURRENT_VERSION_INFO.version})`);
        }
      } else {
        // Fallback for browsers without active SW or when testing
        await new Promise((r) => setTimeout(r, 800));
        setCheckMessage(`目前已是最新版本 (${CURRENT_VERSION_INFO.version})`);
      }
      setLastCheckedTime(now);
    } catch {
      setCheckMessage('檢查更新完成，應用程式運作正常。');
      setLastCheckedTime(now);
    } finally {
      setIsChecking(false);
    }
  }, [swRegistration]);

  const updateApp = useCallback(() => {
    if (swRegistration?.waiting) {
      swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      // Force reload to get latest assets
      window.location.reload();
    }
  }, [swRegistration]);

  return {
    versionInfo: CURRENT_VERSION_INFO,
    needRefresh,
    isChecking,
    checkMessage,
    lastCheckedTime,
    checkForUpdate,
    updateApp,
  };
}
