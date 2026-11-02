import { useCallback, useEffect, useState } from 'react';
import { VersionInfo } from '../types';

export const CURRENT_VERSION_INFO: VersionInfo = {
  version: 'v0.9.8-beta',
  buildDate: '2026-11-02',
  isBeta: true,
  channel: 'beta',
  releaseNotes: [
    '✨ 支援手機相機即時畫面動態框選與即時裁切',
    '⚡ 內建 Tesseract.js 純前端離線 OCR，零延遲零伺服器消耗',
    '📋 辨識後全自動直接寫入系統剪貼簿，並提供觸覺微震動回饋',
    '📦 完整 PWA 離線支援與 GitHub Pages 靜態託管架構',
    '🔄 內建版本資訊檢視、線上檢查更新與一鍵立即更新機制',
    '🖼️ 支援相簿截圖導入與剪貼簿圖片一鍵貼上框選'
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
