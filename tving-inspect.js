// TVING 광고 탐지 진단용 스니펫.
//
// 사용법:
//   1. TVING 중계 페이지에서 F12 → Console 탭을 연다.
//   2. 이 파일 내용을 통째로 복사해서 콘솔에 붙여넣고 Enter.
//   3. "광고 구간"에서 한 번, "경기 구간"에서 한 번 실행한다.
//   4. 실행할 때마다 tving-ad.txt / tving-game.txt 가 자동 다운로드되고,
//      클립보드에도 복사된다. 두 파일을 저장소 폴더에 넣고 Claude 에게 보여주면 된다.
//
//   * 플레이어가 cross-origin iframe 안에 있으면, Console 상단의 프레임 선택
//     드롭다운에서 그 iframe 컨텍스트로 바꾼 뒤 다시 실행해야 안이 보인다.
(() => {
  const MARKER = '광고 정보 더 보기';
  const lines = [];
  const out = (s = '') => lines.push(s);

  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const view = el.ownerDocument.defaultView || window;
    const st = view.getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  };

  // 현재 문서 + 열린 shadow root 들을 재귀적으로 모은다.
  const collectRoots = (root, acc) => {
    acc.push(root);
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectRoots(el.shadowRoot, acc);
    });
    return acc;
  };

  out('===== TVING INSPECT =====');
  out('time: ' + new Date().toISOString());
  out('url: ' + location.href);
  out('topFrame: ' + (window.top === window));
  out('');

  const iframes = [...document.querySelectorAll('iframe')];
  out('--- iframes (' + iframes.length + ') ---');
  iframes.forEach((f, i) => {
    let access = 'cross-origin (스니펫이 내부를 못 봄)';
    try { void f.contentDocument.body; access = 'same-origin (접근 가능)'; } catch (_) {}
    out(`[${i}] src=${f.src || '(none)'} | ${access}`);
  });
  out('');

  const roots = collectRoots(document, []);
  out('--- shadow roots: ' + (roots.length - 1) + ' ---');
  out('');

  out('--- video elements ---');
  let vc = 0;
  roots.forEach((root) => {
    root.querySelectorAll('video').forEach((v) => {
      vc++;
      const dur = isFinite(v.duration) ? v.duration.toFixed(1) : '?';
      out(`#${vc} muted=${v.muted} paused=${v.paused} t=${v.currentTime.toFixed(1)} dur=${dur} ready=${v.readyState} ${v.videoWidth}x${v.videoHeight}`);
      out('    src=' + (v.currentSrc || v.src || '(blob/none)').slice(0, 120));
    });
  });
  if (!vc) out('(video 없음 — cross-origin iframe 안에 있을 수 있음)');
  out('');

  out('--- marker check: "' + MARKER + '" ---');
  let found = false;
  const labels = new Map();
  roots.forEach((root) => {
    root.querySelectorAll('button, a, span').forEach((el) => {
      if (el.childElementCount > 0) return;
      const t = norm(el.textContent);
      if (!t || t.length > 40 || !visible(el)) return;
      if (t.includes(MARKER)) found = true;
      labels.set(t, (labels.get(t) || 0) + 1);
    });
  });
  out('marker present: ' + found);
  out('');
  out('--- 화면에 보이는 말단 라벨 (button/a/span, 40자 이하) ---');
  [...labels.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => out(`(${n}) ${t}`));

  const report = lines.join('\n');
  console.log(report);
  try { copy(report); console.log('\n[클립보드에 복사됨]'); } catch (_) {}
  try {
    const blob = new Blob([report], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tving-' + (found ? 'ad' : 'game') + '.txt';
    a.click();
  } catch (_) {}
  return report;
})();
