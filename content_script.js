(() => {
  'use strict';

  // 이미 주입된 페이지에서는 재실행 안 함. SPA 라우팅 후 background.js 가
  // 다시 주입하더라도 옵저버/리스너가 중복 등록되지 않도록 한다.
  if (window.__TVING_MUTE_LOADED) return;
  window.__TVING_MUTE_LOADED = true;

  // 광고 구간에만 플레이어 위에 "광고 정보 더보기" 링크 버튼이 뜬다. 이 버튼의
  // 존재가 광고 신호이고, 사라지면 경기 재생 중이다. 1차로는 버튼의 CSS Module
  // 클래스(PcAdvertisementLinkButton_advertisementLinkButton__해시)를 부분 매칭해
  // 문구가 바뀌어도 견디게 하고, 2차로 버튼 텍스트를 공백 무시로 비교한다.
  const AD_BUTTON_SELECTOR = '[class*="advertisementLinkButton" i]';
  const AD_MARKER_TEXT = '광고 정보 더보기';
  // 공백 유무가 빌드마다 달라질 수 있어("더보기" vs "더 보기") 공백을 완전히
  // 제거하고 비교한다.
  const AD_MARKER_KEY = AD_MARKER_TEXT.replace(/\s+/g, '');

  // 플레이어 아래에 붙는 디스플레이 배너 광고. TVING 이 SPA 재렌더링으로 다시
  // 끼워 넣어도 항상 가려지도록, 엘리먼트를 지우는 대신 <style> 로 숨긴다.
  const AD_BANNER_SELECTOR = '.display-ad-item-wrapper';
  const HIDE_STYLE_ID = '__tving_mute_hide_ads';

  const DEBOUNCE_MS = 100;
  const VIDEO_POLL_MS = 500;
  const VIDEO_POLL_TIMEOUT_MS = 30000;

  const state = {
    enabled: true,
    hideAds: true,
    isAd: false,
    video: null,
    observer: null,
    debounceTimer: null,
  };

  // ---------------------------------------------------------------------------
  // Detection
  // ---------------------------------------------------------------------------
  // 공백을 전부 제거한다. "광고 정보 더보기" / "광고 정보 더 보기" 처럼 띄어쓰기가
  // 달라도 같은 문자열로 보이게 한다.
  function squash(text) {
    return (text || '').replace(/\s+/g, '');
  }

  function isAdNow() {
    // 1) 클래스 기반 — 가장 견고. 광고 링크 버튼이 보이면 광고 구간이다.
    for (const el of document.querySelectorAll(AD_BUTTON_SELECTOR)) {
      if (isVisible(el)) return true;
    }
    // 2) 텍스트 기반 폴백 — 공백 무시 비교.
    for (const el of document.querySelectorAll('button, a, span')) {
      if (el.childElementCount > 0) continue;
      if (squash(el.textContent).includes(AD_MARKER_KEY) && isVisible(el)) {
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
  // 탭 자체를 음소거한다. content script 에서는 chrome.tabs 를 직접 쓸 수 없어
  // background service worker 에 mute/unmute 를 요청한다. 비디오 엘리먼트의
  // .muted 를 만지는 방식은 TVING 플레이어가 광고용 <video> 를 갈아끼우거나
  // .muted 를 되돌려 버리면 무력화되기 때문에, 브라우저 레벨 탭 음소거를 쓴다.
  function setMuted(muted) {
    try {
      chrome.runtime.sendMessage({ type: muted ? 'mute' : 'unmute' }, () => {
        void chrome.runtime.lastError; // worker 깨우는 중/컨텍스트 소멸 등 무시
      });
    } catch (_) {
      // 확장 프로그램 리로드 중 컨텍스트 무효화. 무시.
    }
  }

  // ---------------------------------------------------------------------------
  // 디스플레이 배너 광고 숨김
  // ---------------------------------------------------------------------------
  function applyHideAds() {
    let styleEl = document.getElementById(HIDE_STYLE_ID);
    if (state.hideAds) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = HIDE_STYLE_ID;
        styleEl.textContent = `${AD_BANNER_SELECTOR} { display: none !important; }`;
        (document.head || document.documentElement).appendChild(styleEl);
        log('배너 광고 숨김 활성화');
      }
    } else if (styleEl) {
      styleEl.remove();
      log('배너 광고 숨김 해제');
    }
  }

  function onAdStart() {
    if (!state.enabled) return;
    setMuted(true);
    log('광고 감지 — 탭 음소거 요청');
  }

  function onAdEnd() {
    if (!state.enabled) return;
    setMuted(false);
    log('광고 종료 — 탭 음소거 해제 요청');
  }

  function evaluate() {
    // <video> 는 음소거에는 더 이상 쓰지 않지만, 팝업의 "플레이어 대기 중"
    // 상태 표시를 위해 현재 video 엘리먼트를 계속 추적한다.
    const currentVideo = document.querySelector('video');
    if (currentVideo && currentVideo !== state.video) {
      state.video = currentVideo;
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
    chrome.storage.sync.get({ enabled: true, hideAds: true }, (cfg) => {
      state.enabled = !!cfg.enabled;
      state.hideAds = !!cfg.hideAds;
      applyHideAds();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;
      if (changes.enabled) {
        state.enabled = !!changes.enabled.newValue;
        log('사용 설정 변경됨:', state.enabled);
        // 광고 중에 켜고 끄면 즉시 음소거/해제를 반영한다.
        if (state.isAd) setMuted(state.enabled);
      }
      if (changes.hideAds) {
        state.hideAds = !!changes.hideAds.newValue;
        applyHideAds();
      }
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'getStatus') {
      sendResponse({
        ok: true,
        isAd: state.isAd,
        enabled: state.enabled,
        hideAds: state.hideAds,
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
