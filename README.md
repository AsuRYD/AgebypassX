# AgebypassX

A Tampermonkey/Violentmonkey userscript that bypasses X.com's age verification gate and sensitive media restrictions directly in the browser.

## How it works

X.com's age gate changed significantly. The old approach of patching `__INITIAL_STATE__` feature flags no longer works because that global was removed. The gate is now a React Router soft-navigation — when you open an age-gated post, X calls `history.pushState` to redirect you to `/i/age_verification/start` before any content loads.

v3 intercepts that navigation call and kills it. Five layers run in order:

| Layer | What it intercepts | Why |
|---|---|---|
| 1 | `history.pushState` / `replaceState` | Primary gate on current build — kills the soft-nav redirect |
| 2 | `window.location` setter | Fallback for any hard-redirect path |
| 3 | `fetch` response bodies | Nulls out `redirect_url` fields pointing to age verification |
| 4 | `__INITIAL_DATA__` / `__INITIAL_STATE__` | Patches feature flags on page load for future regressions |
| 5 | `JSON.parse` | Patches flag names found in raw API response text |

Layers 4 and 5 also spoof the `birthdate` field to 1990-01-01 wherever it appears in parsed objects.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Click → [![Install](https://img.shields.io/badge/Install-Script-blue)](https://greasyfork.org/scripts/547244-agebypassx-tampermonkey-edition/code/AgebypassX.user.js)
3. Confirm the install prompt
4. Reload X.com

## Usage

A small dot appears in the top-right corner of X.com.

- **Green dot** — script is active and blocking
- **Red dot** — an internal error occurred (check console)
- **Click the dot** — prints diagnostics to the browser console
- **Alt + .** — toggles the dot's visibility (persisted across sessions)

The diagnostics panel shows how many redirects were blocked, how many fetch responses were patched, and how many feature flags were rewritten.

## Diagnostics

Open the console and click the dot to see:

```
nav redirects blocked:    3
location assigns blocked: 0
fetch responses patched:  0
feature flags patched:    0
no errors
```

If `navBlocked` increments when you open an age-gated post, Layer 1 is working. If it stays at 0 and the redirect still fires, X changed the mechanism again — open an issue with your console output.

## Notes

- Runs entirely in the browser. No data is sent anywhere, no accounts are modified, no auth tokens are touched.
- The script does not store or transmit your session cookies, credentials, or any personal data.
- Server-side enforcement (where X filters content before sending it) cannot be bypassed client-side. This script only handles what happens after the response arrives in your browser.
- X deploys frequently. If it breaks, the green dot turns red and the diagnostics counter stays at 0. Check the Issues tab.

## Compatibility

Tested on Chrome + Tampermonkey, November 2026 build of X.com. Should work on Firefox + Violentmonkey. Mobile browsers with userscript support (Kiwi Browser, Orion) should work but are not regularly tested.

## Contributing

If a new redirect mechanism shows up, the most useful thing you can send in an issue is:

1. `Object.keys(window.__INITIAL_DATA__ || {})` output
2. The soft-navigation URL from the console (the `/i/age_verification/...` line)
3. Output of clicking the diagnostic dot

That's enough to identify the new mechanism and patch it.

## License

MIT — see [LICENSE](LICENSE)
