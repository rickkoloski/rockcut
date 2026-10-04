# D34 QA report, pass 3: start-up when the server can't be reached (DEV)

- **Tester:** independent QA agent (Claude), synthetic personas only
- **Time:** 2026-10-04, about 21:10 to 22:00 UTC
- **Target:** DEV only. UI https://rockcut-ui-dev.fly.dev, API https://rockcut-api-dev.fly.dev, build D34 `e708a70` (API v18 / UI v12). Prod was not touched.
- **Method:** Node + Playwright (Chromium, headless, 1280x800). I loaded the persona storageState files and the spare `bartender2` sessions; no token was printed or logged. I simulated failures with `context.setOffline`, and with `context.route` on the API host using `fulfill` (404/408/429/500/502/503/403/407/511, a 200 HTML "Wi-Fi portal" page, a 302 to a portal, 200 empty/`{}`, and 204), `abort` (connection reset/refused), never-answered requests, and slow requests (8 s and 20 s). The service worker was ready and controlling the page before each reload. I used `page.clock` for the 5-minute idle return. I ran the long outages in real time (6 min). For each run I sampled the screen every 0.3–1 s and checked whether `rockcut_token` was still present (as a yes/no only). Scripts are in `scripts/` and screenshots in `shots/`.

## Result

**PASS with gaps.** Every API failure at start-up or reload keeps the person or tablet signed in. The "Can't reach the server, retrying…" screen appears at once for errors and offline, and at about 15.4 s for requests that never answer. The app then recovers on its own. Only a real 401 ends a session. I found three minor gaps and no must-fix.

## Gaps

### G1: "Try now" does nothing while a retry request is stalled, so recovery can take about 20 s (minor)
- **Path:** The tablet or person is on the "Can't reach the server, retrying…" screen. The connection stalls, so the request is neither answered nor refused. The server comes back while the automatic retry request is still in flight. The user presses **Try now**.
- **Expected:** The app recovers at once with "Try now", and on its own within about 10 s of the server answering.
- **Observed:** Try now is accepted (the button is not disabled and shows no busy state) but sends no request; 3 presses produced 0 new `/api/me` requests. The stalled request runs to its 15 s timeout, and the next retry follows 5 s later. The app came back **19.4–20.1 s** after the server did, with or without Try now. The 25 rapid presses during a stalled request also produced only one request, so presses are dropped silently, not queued.
- **Repro:** `node scripts/t6_trynow_feedback.mjs` (barMgr). Every API request hangs, the retry screen appears at 15.5 s, and the server "returns" 10 s later while the 25.1 s retry is hung. `/api/me` requests were at 0.1, 25.1 and 45.1 s, and the app came back 20.1 s after the server. Also `scripts/t6_hangkeep.mjs press 10500`. Screenshot: `shots/gap_trynow_ignored_while_hung.png`.

### G2: Reloading Admin → Shared devices (`/devices`) during an outage shows a browser or proxy error page that never recovers (minor)
- **Path:** A manager (barMgr or owner) is on `/devices`. The device goes offline, or the UI host answers with an error such as a Fly 502, and the manager reloads.
- **Expected:** The same as every other route: the "Can't reach the server, retrying…" screen, then recovery on its own.
- **Observed:** The service worker does not serve the app shell for `/devices`. Offline, the reload fails with `net::ERR_INTERNET_DISCONNECTED`, giving Chrome's error page (blank in headless). When the UI host returns 502, the proxy's "502 Bad Gateway" page is shown. Neither recovered within 15 s of the network or server returning, so a manual reload was needed. The same request also bypasses the service worker for `/dev`, `/device` and `/developer`. This suggests the navigation-fallback denylist matches the `/dev` prefix. Every other route I tried was served from the cache and behaved correctly: `/`, `/schedule`, `/scheduler`, `/time_off`, `/availability`, `/profile`, `/messages/*`, `/channels/1`, `/users`, `/activity`, `/brewery`, `/brands`, `/ingredients`, `/settings`, `/batches`. Tablets are not affected because they can't reach `/devices`.
- **Repro:** `node scripts/deeplink_offline.mjs barMgr /schedule,/devices reload`: `/schedule` gives retrying and then recovers in 1.0 s, while `/devices` gives the error page and does not recover. `node scripts/routes_offline2.mjs` lists the routes not served offline. `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node scripts/uihost502.mjs` shows the 502 page. Screenshots: `shots/deeplink_offline_barMgr__devices.png` and `shots/uihost502_devices.png`.

### G3: When the 5-minute idle return happens during an outage, the person's server session is left alive (minor)
- **Path:** On a tablet, someone uses "Sign in as me", the connection drops, and the 5-minute idle return fires.
- **Expected:** The tablet goes back to its own session (it does), and the person's session is ended.
- **Observed:** The idle return sends `DELETE /api/session`, which fails, and the request is never retried, including over 1 more minute after the network returns. The tablet discards the personal token locally and goes back to "Shared device · Taproom" with its pairing intact. On the server the person's session stays valid: "Sign out of all other devices" for that person afterwards reported "Signed out of 1 other session" (baseline 0). After three such idle returns earlier in the run, it reported 6. The risk is low because the tablet no longer holds that token, but the session stays open until it expires.
- **Repro:** `node scripts/idle_orphan.mjs offline` (throwaway user, now deactivated). The log shows `baseline: Signed out of 0 other sessions` and then `after idle-return during offline: Signed out of 1 other session`.

### Observations (not counted as gaps)
- **Malformed 200 data gives a white screen:** if `/api/channels` or `/api/departments` returns 200 with `{"data":null}`, the app throws (`Cannot read properties of null (reading 'reduce'/'find')`) and shows a blank page that does not recover; `/api/me` returning that body is handled. This is unlikely from a real proxy (HTML, empty and `{}` 200 bodies are all handled), but there is no error boundary. Repro: `node scripts/probe_null.mjs channels`.
- **Any 401 ends the session:** a 401 at start-up, even with an HTML body that a proxy might send, signs a person out or unpairs a tablet. This matches the brief ("only 401 ends it").
- **First visit offline:** in the first ~2.4 s of a first visit, before the service worker controls the page, an offline reload gives Chrome's offline page. This is outside the app's control.
- **Recovery timing:** the retry interval is a steady 10 s, with no backoff over a 6-minute outage. After server errors the app recovered in 9–10.3 s. After offline it recovered in about 1 s through the online event, and after a pressed Try now in 0.4–0.7 s.

## Scenarios

| # | Result | Evidence |
|---|---|---|
| T1 | PASS (G1 applies to stalled connections) | `taproomDevice` and the paired `[TEST-TEMP]` tablet A were tested on reload and cold start with offline, 404, 408, 429, 500, 502, 503, 403, 407, 511, a 200 HTML portal, a 302 portal, an empty 200, `{}`, 204, a connection reset, a hang, a slow 20 s request, and failure of `/api/me` only. In every case pairing was kept; the retry screen appeared at 0.1–1.1 s, or at 15.4 s for a hang. Recovery took ≤10.3 s, or about 1 s from offline. A deep-link reload offline (`/schedule`, `/messages`, `/channels/1`) also passed. |
| T2 | FAIL (minor, G2) | A spare `bartender2` session and `barMgr` passed the same failure matrix (stayed signed in, retry screen, recovered on their own). A must-reset person stayed on "Set a new password" after a 503 or offline reload. The failing path is a `/devices` reload during an outage, which shows a browser or proxy error page with no recovery (G2). |
| T3 | PASS (G3 noted) | During "Sign in as me", a reload with 500, offline or a hang kept the personal session and recovered. The idle return with 500, offline or a hang went back to "Shared device · Taproom" with pairing kept. A personal session ended elsewhere while the tablet was offline also went back to the tablet's session on recovery. |
| T4 | PASS | `barMgr` revoked a tablet while it showed retrying (500, offline, hang). When the server returned, the 401 gave the setup screen with "This tablet was unpaired" in 1.1–8.2 s. Owner deactivating the device during retrying gave the same result in 10.3 s. |
| T5 | PASS | A spare session was signed out from another context while the person was offline (on reload), on a 500 (on reload), or offline while using the app. When back online it showed the sign-in form in 1.1 s, 3.2 s and 10.3 s respectively, not stuck retrying. |
| T6 | PASS | 25 rapid Try now presses and a double-click (500, offline, hang) gave one retry screen, no sign-out and no page errors. Network flapping offline/503 every 0.3–1.8 s for 40 cycles, with reloads and Try now, gave no duplicates and no sign-out, and recovered. 6-minute outages (503, hang, offline) stayed on the retry screen throughout and recovered in 9.2 s, 4.1 s and 1.0 s. See G1 for Try now during a stalled request. |
| T7 | PASS | While the app was in use, a 503 (spare), a hang (tablet A) and offline (barMgr) while moving through Schedule, Time off, Availability and Home gave inline "Couldn't load…" errors only, with no sign-out or unpairing. After the server returned, the same pages loaded normally without a reload. Partial start-up failures (channels/departments 503) left "No channels", which came back on the next visit to Messages. |
| T8 | PASS | Form sign-in for a throwaway person, including the forced password change, worked with no retry flash. Pairing new tablets worked; a pairing attempt during a 503 showed an inline error and the next attempt succeeded. When sign-in or pairing succeeded and the next start-up check failed (503 or hang), the retry screen showed and then the app recovered, with no sign-in or setup screen. |

**Totals:** 7 PASS, 1 FAIL (minor), 0 NOT RUN.

## Cleanup
- Tablets `[TEST-TEMP] QA3 tablet A–H` are all revoked. The devices `[TEST-TEMP] QA3 bar tablets` (id 404) and `[TEST-TEMP] QA3 deact test` (id 407) are deactivated.
- The throwaway users 405 (`[TEST-TEMP] QA3 U1`) and 406 (`[TEST-TEMP] QA3 U2 mustreset`) are deactivated (`active:false` confirmed). A first PATCH with a `{user:{active:false}}` body returned 200 but did not change `active`; the brief's `{active:false}` body worked.
- I used 16 spare sessions (indices 0–15), and all are ended (`/api/me` now returns 401). Persona tokens were never signed out or revoked, and no persona password was changed.
- I deleted the local temporary files that held tablet states and the throwaway passwords.
- No credential beyond the brief was requested.
