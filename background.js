// SPA 라우팅 처리: TVING 은 Next.js 클라이언트 라우터로 페이지를 바꾸기 때문에
// 사용자가 다른 페이지(메인, VOD 등)에서 중계 URL 로 이동해도 전체 페이지 로드가
// 일어나지 않아 정적 content_scripts 가 주입되지 않는다. webNavigation API 의
// history state 이벤트로 SPA 전환을 감지해서 직접 주입한다.

// TVING 중계/스포츠 콘텐츠 페이지. 라이브 스트리밍 경로는 한때 `/broadcast` 였다가
// 현재는 `/power` 로 바뀌었으므로(예: contents/sports/20260529HTLG02026/power),
// 특정 하위 경로에 묶지 않고 sports/kbo 콘텐츠 경로 전체를 대상으로 한다. content
// script 는 영상/광고가 없는 페이지에서는 아무 일도 하지 않으므로 넓게 잡아도 안전하다.
const BROADCAST_URL_RE = /^https:\/\/www\.tving\.com\/contents\/(sports|kbo)\//;

function injectIfBroadcast(details) {
  if (details.frameId !== 0) return;
  if (!BROADCAST_URL_RE.test(details.url)) return;
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ['content_script.js'],
  }).catch(() => {
    // 같은 페이지에서 두 번째 주입이 무시되거나, 탭이 닫혀 있는 등 정상 케이스.
  });
}

chrome.webNavigation.onHistoryStateUpdated.addListener(injectIfBroadcast);
chrome.webNavigation.onCommitted.addListener(injectIfBroadcast);

// 탭 단위 음소거. content script 는 chrome.tabs 에 접근할 수 없어서 mute/unmute
// 요청을 여기로 보낸다. 비디오 엘리먼트의 .muted 대신 브라우저 레벨 탭 음소거를
// 쓰는 이유는, TVING 플레이어가 광고용 <video> 를 갈아끼우거나 .muted 를 되돌려도
// 페이지가 무력화할 수 없기 때문이다.
//
// 광고 시작 전의 음소거 상태를 chrome.storage.session 에 탭별로 저장해 두고,
// 광고가 끝나면 그 상태로 되돌린다(service worker 가 중간에 죽어도 살아남도록).
async function muteTab(tabId) {
  try {
    const key = String(tabId);
    const stored = await chrome.storage.session.get(key);
    // 광고 진입 시 한 번만 이전 상태를 기록한다. 이미 기록돼 있으면(=이미 음소거됨)
    // 덮어쓰지 않아 복원값이 'true' 로 오염되는 것을 막는다.
    if (!(key in stored)) {
      const tab = await chrome.tabs.get(tabId);
      const wasMuted = !!(tab.mutedInfo && tab.mutedInfo.muted);
      await chrome.storage.session.set({ [key]: wasMuted });
    }
    await chrome.tabs.update(tabId, { muted: true });
  } catch (_) {
    // 탭이 닫혔거나 접근 불가. 정상 케이스로 무시.
  }
}

async function restoreTab(tabId) {
  try {
    const key = String(tabId);
    const stored = await chrome.storage.session.get(key);
    const prev = (key in stored) ? !!stored[key] : false;
    await chrome.storage.session.remove(key);
    await chrome.tabs.update(tabId, { muted: prev });
  } catch (_) {
    // 탭이 닫힘 등. 무시.
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (typeof tabId === 'number' && msg) {
    if (msg.type === 'mute') muteTab(tabId);
    else if (msg.type === 'unmute') restoreTab(tabId);
  }
  sendResponse({ ok: true });
  return false;
});

// 탭이 닫히면 남은 복원 상태를 정리.
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(String(tabId)).catch(() => {});
});
