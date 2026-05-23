(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Ad detection markers
  //
  // These selectors / text patterns are the heuristics for "is an ad playing?"
  // Refine after observing a live ad break in DevTools (Phase 0). The detector
  // returns true if ANY of these signals fire — keep this list narrow enough
  // that false positives don't mute the game itself.
  // ---------------------------------------------------------------------------
  const AD_TEXT_PATTERNS = [
    /광고/,             // Korean for "advertisement"
    /\bAD\b/,           // common English ad badge
    /Advertisement/i,
  ];

  // CSS selectors that, if present and visible, indicate an ad overlay.
  // Refine after Phase 0. Vague class names like ".ad" are intentionally avoided
  // because they hit too many false positives in modern bundlers.
  const AD_ELEMENT_SELECTORS = [
    '[class*="adContainer" i]',
    '[class*="ad-container" i]',
    '[class*="adOverlay" i]',
    '[data-ad="true"]',
    '[data-testid*="ad" i]',
  ];

  const PLAYER_CONTAINER_SELECTORS = [
    '[class*="player" i]',
    '[id*="player" i]',
    '#vlive-player',
  ];

  const DEBOUNCE_MS = 100;
  const VIDEO_POLL_MS = 500;
  const VIDEO_POLL_TIMEOUT_MS = 30000;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    enabled: true,
    isAd: false,
    prevMuted: null,         // volume state when ad started; null between ads
    video: null,
    container: null,
    observer: null,
    debounceTimer: null,
  };

  // ---------------------------------------------------------------------------
  // Detection
  //
  // We only match ad text when it appears inside a SMALL LEAF element — i.e.
  // a node with no element children and short text content. The TVING player
  // chrome contains "광고" in settings/menus/legal copy, so a naive scan of the
  // container's innerText perma-mutes the game. A real ad badge is almost
  // always a tiny standalone label or counter ("광고", "광고 1/3", "AD 00:15").
  // ---------------------------------------------------------------------------
  const MAX_AD_LABEL_LENGTH = 24;

  function detectAd(root) {
    if (!root) return false;

    for (const sel of AD_ELEMENT_SELECTORS) {
      const el = root.querySelector(sel);
      if (el && isVisible(el)) return true;
    }

    return findAdTextLeaf(root) !== null;
  }

  function findAdTextLeaf(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.nextNode();
    while (node) {
      if (node.childElementCount === 0) {
        const text = (node.textContent || '').trim();
        if (text && text.length <= MAX_AD_LABEL_LENGTH) {
          for (const pattern of AD_TEXT_PATTERNS) {
            if (pattern.test(text) && isVisible(node)) return node;
          }
        }
      }
      node = walker.nextNode();
    }
    return null;
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
    log('Ad detected — muted (prior muted state:', state.prevMuted, ')');
  }

  function onAdEnd() {
    if (!state.video) return;
    if (!state.enabled) {
      state.prevMuted = null;
      return;
    }
    if (state.prevMuted !== null) {
      state.video.muted = state.prevMuted;
      log('Ad ended — restored muted state to', state.prevMuted);
    }
    state.prevMuted = null;
  }

  function evaluate() {
    if (!state.container) return;
    const nowAd = detectAd(state.container);
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
  function findVideo() {
    return document.querySelector('video');
  }

  function findPlayerContainer(video) {
    for (const sel of PLAYER_CONTAINER_SELECTORS) {
      const el = video.closest(sel) || document.querySelector(sel);
      if (el) return el;
    }
    return video.parentElement || document.body;
  }

  function attachObserver() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(scheduleEvaluate);
    state.observer.observe(state.container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    evaluate();
  }

  function waitForVideo(deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS) {
    const v = findVideo();
    if (v) {
      state.video = v;
      state.container = findPlayerContainer(v);
      attachObserver();
      log('Initialized on video element', v, 'container', state.container);
      return;
    }
    if (Date.now() > deadline) {
      log('Gave up waiting for <video> element after', VIDEO_POLL_TIMEOUT_MS, 'ms');
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
      log('Enabled flag now', state.enabled);
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
  // Debug
  // ---------------------------------------------------------------------------
  function log(...args) {
    if (window.__TVING_MUTE_DEBUG) console.log('[TVING-Mute]', ...args);
  }
  // Toggle in DevTools console: window.__TVING_MUTE_DEBUG = true
  window.__TVING_MUTE_DEBUG = window.__TVING_MUTE_DEBUG || false;

  // ---------------------------------------------------------------------------
  // Go
  // ---------------------------------------------------------------------------
  loadSettings();
  waitForVideo();
})();
