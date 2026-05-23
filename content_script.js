(() => {
  'use strict';

  // 이미 주입된 페이지에서는 재실행 안 함. SPA 라우팅 후 background.js 가
  // 다시 주입하더라도 옵저버/리스너가 중복 등록되지 않도록 한다.
  if (window.__TVING_MUTE_LOADED) return;
  window.__TVING_MUTE_LOADED = true;

  // The TVING player renders a top-right "광고 정보 더 보기" button only
  // during ad breaks. Presence of this button is the ad signal; absence
  // means the broadcast is playing.
  const AD_MARKER_TEXT = '광고 정보 더 보기';

  const DEBOUNCE_MS = 100;
  const VIDEO_POLL_MS = 500;
  const VIDEO_POLL_TIMEOUT_MS = 30000;

  const state = {
    enabled: true,
    isAd: false,
    prevMuted: null,
    video: null,
    observer: null,
    debounceTimer: null,
  };

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------
  function normalize(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function isAdNow() {
    const candidates = document.querySelectorAll('button, a, span');
    for (const el of candidates) {
      if (el.childElementCount > 0) continue;
      if (normalize(el.textContent).includes(AD_MARKER_TEXT) && isVisible(el)) {
        return true;
      }
    }
    return false;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  // ---------------------------------------------------------------------------
  // Mute control
  // ---------------------------------------------------------------------------
  function onAdStart() {
    if (!state.video || !state.enabled) return;
    state.prevMuted = state.video.muted;
    state.video.muted = true;
    log('광고 감지 — 음소거 (이전 음소거 상태:', state.prevMuted, ')');
  }

  function onAdEnd() {
    if (!state.video) return;
    if (!state.enabled) {
      state.prevMuted = null;
      return;
    }
    if (state.prevMuted !== null) {
      state.video.muted = state.prevMuted;
      log('광고 종료 — 음소거 상태 복원:', state.prevMuted);
    }
    state.prevMuted = null;
  }

  function evaluate() {
    // SPA 라우팅으로 <video> 가 갈렸을 수도 있어서 매번 다시 확인.
    const currentVideo = document.querySelector('video');
    if (currentVideo && currentVideo !== state.video) {
      state.video = currentVideo;
      state.prevMuted = null;
    }

    const nowAd = isAdNow();
    if (nowAd === state.isAd) return;
    state.isAd = nowAd;
    if (nowAd) onAdStart();
    else onAdEnd();
  }

  function scheduleEvaluate() {
    if (state.debounceTimer) return;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      evaluate();
    }, DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  function attachObserver() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(scheduleEvaluate);
    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    evaluate();
  }

  function waitForVideo(deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS) {
    const v = document.querySelector('video');
    if (v) {
      state.video = v;
      attachObserver();
      log('초기화 완료. video 요소:', v);
      return;
    }
    if (Date.now() > deadline) {
      log('<video> 요소를 찾지 못해 대기 중단 (', VIDEO_POLL_TIMEOUT_MS, 'ms 경과)');
      return;
    }
    setTimeout(() => waitForVideo(deadline), VIDEO_POLL_MS);
  }

  // ---------------------------------------------------------------------------
  // Settings + messaging
  // ---------------------------------------------------------------------------
  function loadSettings() {
    chrome.storage.sync.get({ enabled: true }, (cfg) => {
      state.enabled = !!cfg.enabled;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync' || !changes.enabled) return;
      state.enabled = !!changes.enabled.newValue;
      log('사용 설정 변경됨:', state.enabled);
      if (!state.enabled) state.prevMuted = null;
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'getStatus') {
      sendResponse({
        ok: true,
        isAd: state.isAd,
        enabled: state.enabled,
        hasVideo: !!state.video,
      });
      return true;
    }
  });

  // ---------------------------------------------------------------------------
  // Debug — toggle in DevTools console: window.__TVING_MUTE_DEBUG = true
  // ---------------------------------------------------------------------------
  function log(...args) {
    if (window.__TVING_MUTE_DEBUG) console.log('[TVING-Mute]', ...args);
  }
  window.__TVING_MUTE_DEBUG = window.__TVING_MUTE_DEBUG || false;

  loadSettings();
  waitForVideo();
})();
