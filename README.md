# TVING 스포츠 광고 음소거 (Chrome 확장)

TVING 스포츠 중계 페이지에서 광고가 나올 때 자동으로 플레이어를 음소거하고, 경기가 다시 시작되면 원래 음소거 상태로 되돌리는 Chrome 확장 프로그램입니다.

## 설치 방법 (개발자 모드)

1. Chrome 주소창에 `chrome://extensions` 입력 후 이동.
2. 오른쪽 위 **개발자 모드** 토글을 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다** 버튼을 누르고 이 프로젝트 폴더를 선택.
4. TVING 스포츠 중계 URL을 엽니다. 예:
   `https://www.tving.com/contents/sports/<중계ID>/broadcast?...`
5. 도구 모음의 확장 아이콘을 누르면 사용 토글과 현재 상태가 표시됩니다.

## 작동 방식

`content_script.js`는 중계 URL에서만 실행되며 다음 순서로 동작합니다.

1. 플레이어의 `<video>` 요소와 주변 컨테이너를 찾습니다.
2. `MutationObserver`로 컨테이너의 DOM 변화를 감시합니다.
3. 변화가 감지될 때마다, 작은 텍스트 요소(자식 없는 leaf 요소이면서 24자 이하)에 "광고", "AD", "Advertisement" 같은 패턴이 보이는지, 또는 광고 관련 CSS 선택자(`[class*="adContainer" i]` 등)에 해당하는 보이는 요소가 있는지 확인합니다.
4. **재생 → 광고** 로 바뀌면 현재 `video.muted` 값을 기억해두고 강제로 음소거합니다.
5. **광고 → 재생** 으로 바뀌면 기억해둔 값으로 `video.muted` 를 되돌립니다. 즉, 광고 시작 전 음소거 상태였다면 광고가 끝나도 음소거를 그대로 유지합니다.

설정은 `chrome.storage.sync` 에 저장되므로 같은 Chrome 계정의 다른 기기에도 동기화됩니다.

## ⚠️ 광고 감지 마커가 아직 검증되지 않았습니다

`content_script.js` 상단의 `AD_TEXT_PATTERNS` 와 `AD_ELEMENT_SELECTORS` 는 **실제 광고 화면을 관찰하기 전에 추측으로 작성한 값**입니다. 처음 사용할 때는 아래 절차로 검증을 권장합니다.

### 1) 잘못된 음소거(false positive) 점검

문제: TVING 플레이어 UI 자체에 "광고 차단", "광고 건너뛰기" 같은 짧은 라벨이 항상 보이면, 경기 중에도 광고로 오인해서 계속 음소거될 수 있습니다.

확인 방법:
1. 광고가 **아닌** 경기 화면이 재생 중인 상태에서 페이지를 엽니다.
2. F12 를 눌러 DevTools 열고, **Console** 탭에서 (최상위 프레임에서) 아래 명령을 실행:
   ```js
   Array.from(document.querySelectorAll('*'))
     .filter(e => e.childElementCount === 0 && /광고|\bAD\b/.test((e.textContent || '').trim()) && (e.textContent || '').trim().length <= 24)
     .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; });
   ```
3. 결과 배열이 비어있으면 정상. 만약 노드가 나오면 그 텍스트가 무엇인지 확인하고, `content_script.js` 의 `AD_TEXT_PATTERNS` 를 더 좁히거나 `MAX_AD_LABEL_LENGTH` 를 더 작게 조정.

### 2) `<video>` 위치 확인 (iframe 여부)

문제: TVING 플레이어가 다른 도메인(예: `player.tving.com`)의 iframe 안에 있으면 현재 매니페스트의 `matches` 패턴으로는 content script 가 그 안에 주입되지 않아 동작하지 않을 수 있습니다.

확인 방법:
1. 중계 페이지에서 DevTools Console 에 다음 입력:
   ```js
   document.querySelector('video')
   ```
2. `<video>` 노드가 반환되면 OK. `null` 이 반환되면 iframe 안에 있는 것이고, iframe 의 `src` 도메인을 확인한 뒤 `manifest.json` → `content_scripts.matches` 에 해당 URL 패턴을 추가하세요. (예: `"https://player.tving.com/*"`)

### 3) 실제 광고 발생 시점 마커 수집

광고가 실제로 재생되는 동안 위 ①의 명령을 다시 실행하면 광고임을 알려주는 요소(작은 라벨, 카운터 등)가 잡혀야 합니다. 만약 안 잡힌다면 광고 화면의 DOM 을 직접 살펴서 안정적으로 식별 가능한 요소를 찾고, `content_script.js` 의 상수에 추가하세요.

디버그 로그를 보고 싶다면 Console 에서 `window.__TVING_MUTE_DEBUG = true` 를 입력하면 감지 시점마다 로그가 찍힙니다.

## 파일 구조

| 파일 | 역할 |
| --- | --- |
| `manifest.json` | MV3 매니페스트. 중계 URL 매칭, 권한, 팝업, 아이콘 선언. |
| `content_script.js` | 광고 감지 + 음소거 제어 + 팝업 메시지 응답. |
| `popup.html` / `popup.js` | 도구 모음 팝업. 사용 토글과 실시간 상태 표시. |
| `icons/16.png` `48.png` `128.png` | 도구 모음 아이콘 (임시 플레이스홀더). |

## 자주 묻는 질문 / 주의 사항

- **광고가 끝났는데 음소거가 안 풀려요.** 광고 감지 마커가 광고 종료 후에도 계속 매칭되고 있을 수 있습니다. 위 검증 절차로 어떤 텍스트/요소가 잡히는지 확인하세요.
- **광고인데 음소거가 안 돼요.** 광고 화면의 DOM 에 우리가 보고 있는 텍스트/선택자가 없는 경우입니다. DevTools 에서 광고 화면을 살펴보고 안정적인 식별자를 `content_script.js` 에 추가하세요.
- **광고 차단 확장(AdGuard, uBlock 등)이 켜져 있으면** TVING 의 광고 마커 자체가 제거되어 이 확장이 아무 일도 하지 않을 수 있습니다. tving.com 에서는 광고 차단 확장을 끄고 사용하세요.
- **다른 TVING 페이지(라이브 TV, VOD 등)에서도 쓰고 싶어요.** `manifest.json` 의 `content_scripts.matches` 에 해당 URL 패턴을 추가하면 됩니다.

## 라이선스

개인 사용을 위한 프로젝트입니다.
