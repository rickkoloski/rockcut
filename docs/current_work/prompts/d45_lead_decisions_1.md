# D45 lead decisions 1 (after Task 2, 2026-10-15)

1. **Accepted:** `UpdatePrompt` mounted in `main.tsx`; the typing blocker in
   the tablet idle rule; `<html data-build>`; no new dependency.
2. **First rollout (Matt, Q5): auto-reload once.** The first D45 worker on a
   device (no marker yet) takes over at once **and reloads every open window
   it now controls** (e.g. in `activate`: `clients.matchAll({type: 'window'})`
   → `client.navigate(client.url)`), then writes the marker. Later workers
   wait for the prompt as built. Spec §3.1 and S189 updated. Test it the way
   you checked the first rollout (a build of `develop` as A, D45 as B): the
   old page reloads by itself once with no tap; a third build then shows the
   prompt. Make sure the reload can't loop (marker written before/after
   navigate; a second activation doesn't navigate again).
3. **S178 (push after Reload):** stays a manual check on DEV (Pixel + tablet).
4. **Order now:** decision 2 → **Task 4 (Hide shifts)** → Task 3 (full local
   run, default suite, plus one `PWA_UPDATE=1` run). Commit per step; stop
   after Task 3 with one report.
