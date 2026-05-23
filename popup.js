(() => {
  'use strict';

  const enabledInput = document.getElementById('enabled');
  const statusEl = document.getElementById('status');

  function setStatus(text, klass) {
    statusEl.textContent = text;
    statusEl.classList.remove('ad', 'playing', 'idle');
    statusEl.classList.add(klass);
  }

  chrome.storage.sync.get({ enabled: true }, (cfg) => {
    enabledInput.checked = !!cfg.enabled;
  });

  enabledInput.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledInput.checked });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !/^https:\/\/www\.tving\.com\/contents\/sports\/.+\/broadcast/.test(tab.url)) {
      setStatus('Idle (not a broadcast page)', 'idle');
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: 'getStatus' }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok) {
        setStatus('Idle (content script not loaded — reload tab)', 'idle');
        return;
      }
      if (!resp.hasVideo) {
        setStatus('Waiting for player…', 'idle');
        return;
      }
      if (!resp.enabled) {
        setStatus('Disabled', 'idle');
        return;
      }
      if (resp.isAd) setStatus('Ad detected — muted', 'ad');
      else setStatus('Playing', 'playing');
    });
  });
})();
