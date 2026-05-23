// SPA 라우팅 처리: TVING 은 Next.js 클라이언트 라우터로 페이지를 바꾸기 때문에
// 사용자가 다른 페이지(메인, VOD 등)에서 중계 URL 로 이동해도 전체 페이지 로드가
// 일어나지 않아 정적 content_scripts 가 주입되지 않는다. webNavigation API 의
// history state 이벤트로 SPA 전환을 감지해서 직접 주입한다.

const BROADCAST_URL_RE = /^https:\/\/www\.tving\.com\/contents\/(sports|kbo)\/[^/]+\/broadcast/;

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
