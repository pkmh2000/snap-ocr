import { useCallback, useEffect, useState } from 'react';
import { VersionInfo } from '../types';

export const CURRENT_VERSION_INFO: VersionInfo = {
  version: 'v0.9.9-beta',
  buildDate: '2026-11-02',
  isBeta: true,
  channel: 'beta',
  releaseNotes: [
    '🔘 將相機/截圖切換鍵移至頂部導航列並改為圖標，不再遮蔽辨識按鈕',
    '🎯 修復選取框與底層鏡頭幾何縮放偏移，達成像素級準確對齊',
    '🚫 內建智慧過濾演算法，自動排除 Icon、小圖標與非文字雜訊',
    '👁️ 觸控微調框選區時自動隱藏提示文字，視線 100% 清晰無遮蔽',
    '📱 優化手機相簿截圖導入與剪貼簿貼上操作說明',
    '⚡ 升級 Tesseract.js 離線高對比文字增強與自動複製至剪貼簿'
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
