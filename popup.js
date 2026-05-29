(() => {
  'use strict';

  const enabledInput = document.getElementById('enabled');
  const hideAdsInput = document.getElementById('hideAds');
  const statusEl = document.getElementById('status');
  const indicatorEl = document.getElementById('indicator');
  const indicatorIconEl = document.getElementById('indicator-icon');

  function setStatus(text, klass) {
    statusEl.textContent = text;
    statusEl.className = 'status-badge ' + klass;
    
    if (indicatorEl) {
      indicatorEl.className = 'status-indicator ' + klass;
    }
    
    if (indicatorIconEl) {
      let icon = '⚪';
      if (klass === 'ad') icon = '🔇';
      else if (klass === 'playing') icon = '🔊';
      else if (klass === 'idle') icon = '💤';
      indicatorIconEl.textContent = icon;
    }
  }

  chrome.storage.sync.get({ enabled: true, hideAds: true }, (cfg) => {
    enabledInput.checked = !!cfg.enabled;
    hideAdsInput.checked = !!cfg.hideAds;
  });

  enabledInput.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledInput.checked });
  });

  hideAdsInput.addEventListener('change', () => {
    chrome.storage.sync.set({ hideAds: hideAdsInput.checked });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !/^https:\/\/www\.tving\.com\/contents\/(sports|kbo)\/.+\/broadcast/.test(tab.url)) {
      setStatus('대기 중 (중계 페이지 아님)', 'idle');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'getStatus' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        setStatus('대기 중 (탭을 새로고침해 주세요)', 'idle');
        return;
      }
      if (!resp.hasVideo) {
        setStatus('플레이어 대기 중…', 'idle');
        return;
      }
      if (!resp.enabled) {
        setStatus('사용 꺼짐', 'idle');
        return;
      }
      if (resp.isAd) setStatus('광고 감지 — 음소거됨', 'ad');
      else setStatus('재생 중', 'playing');
    });
  });
})();
