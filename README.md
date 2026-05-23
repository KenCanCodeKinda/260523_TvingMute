# TVING Sports Ad Muter

Chrome extension that auto-mutes the TVING player during ad breaks on sports broadcast pages and restores the prior mute state when the game resumes.

## Install (developer mode)

1. Open `chrome://extensions` in Chrome.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this project folder.
4. Open a TVING sports broadcast URL — for example:
   `https://www.tving.com/contents/sports/<broadcastId>/broadcast?...`
5. The toolbar icon shows a popup with an On/Off toggle and current status.

## How it works

`content_script.js` runs only on broadcast URLs. It:

1. Locates the player's `<video>` element and surrounding container.
2. Watches the container with a `MutationObserver`.
3. On every change, checks for ad markers — visible elements matching ad-related selectors, or text nodes containing "광고", "AD", "Advertisement".
4. On a content → ad transition, records `video.muted` and forces `muted = true`.
5. On an ad → content transition, restores `video.muted` to whatever it was.

Settings persist in `chrome.storage.sync`.

## Refining ad detection

The initial detection markers in `content_script.js` are educated guesses. If you see the popup show "Playing" while an ad is actually running, refine the markers:

1. On a broadcast page, open DevTools → Console.
2. Enable debug logging: `window.__TVING_MUTE_DEBUG = true`
3. Wait for an ad break. Inspect the player DOM in the Elements panel:
   - Look for unique text nodes ("광고", "AD", an ad counter).
   - Look for stable class names or `data-*` attributes that only exist during ads.
4. Update the constants at the top of `content_script.js`:
   - `AD_TEXT_PATTERNS` — regex patterns matched against the container's `innerText`.
   - `AD_ELEMENT_SELECTORS` — CSS selectors that, if matched and visible, indicate an ad.
   - `PLAYER_CONTAINER_SELECTORS` — fallback selectors for the player container.
5. Reload the extension (`chrome://extensions` → reload button on the card) and refresh the tab.

### Using chrome-devtools MCP (optional)

The `chrome-devtools` MCP server is configured for this project (see `.claude.json`). After restarting Claude Code, ask it to drive Chrome to the broadcast page and snapshot the DOM during content vs. during an ad — this surfaces the exact markers to put in `content_script.js`.

## File layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 declaration: broadcast URL match, host permissions, popup, icons. |
| `content_script.js` | Ad detection + mute control + popup message handler. |
| `popup.html` / `popup.js` | Toolbar UI: On/Off toggle and live status. |
| `icons/16.png` `48.png` `128.png` | Toolbar icons (placeholder — replace as desired). |

## Caveats — read before testing

**The ad-detection markers are unverified guesses.** I didn't observe a live ad break before shipping (the `chrome-devtools` MCP was added but isn't loaded until Claude Code restarts, and I built the scaffold first). Two known risks:

1. **False positives from text matching.** The detector now requires the ad pattern (e.g. `광고`) to appear in a *small leaf element* (≤24 chars, no child elements), not anywhere in the player's `innerText`. This is much safer than a naive scan, but if the TVING UI has a tiny "광고 차단" toggle or similar label sitting visibly on the page during the game, you'll get a false positive and the game will be perma-muted. **First-time check:** open the broadcast page, open DevTools console on the *top frame*, run:
   ```js
   Array.from(document.querySelectorAll('*'))
     .filter(e => e.childElementCount === 0 && /광고|\bAD\b/.test((e.textContent || '').trim()) && (e.textContent || '').trim().length <= 24)
     .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height; });
   ```
   If this returns any nodes while the game is playing (no ad), refine `AD_TEXT_PATTERNS` or `MAX_AD_LABEL_LENGTH` in `content_script.js`.

2. **Player may live in a cross-origin iframe.** Run `document.querySelector('video')` in the top-frame console:
   - Returns a node → fine, the content script will find it.
   - Returns `null` → the `<video>` is in an iframe. Check the iframe's `src`; if it's a different origin (e.g. `player.tving.com`), add that pattern to `manifest.json` → `content_scripts.matches`. The script already has `all_frames: true`, so the match pattern is the only thing missing.

- TVING may swap player markup; if the popup status goes out of sync with reality, refine the detection markers as in "Refining ad detection".
- Ad-blocker extensions can strip the ad markers we rely on — disable them on tving.com or accept that this extension becomes a no-op when no ads play.
- The match pattern only covers `*/broadcast*` URLs. To cover live TV or VOD, add another entry to `manifest.json` → `content_scripts.matches`.
