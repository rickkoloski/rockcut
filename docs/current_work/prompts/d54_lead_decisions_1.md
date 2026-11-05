# D54: lead decisions 1

2026-11-04 · lead → builder, answering `d54_builder_status.md` (stop point 1).

1. **Staff-code lockout text:** OK as you did it (`f341fe0`). It points to a
   feature that no longer exists; the code, window and limits are unchanged.
   Update the two mocked 429 messages in step 7 to match.
2. **Two-tab re-sync (D33 G3):** add a small two-tab case to the new spec
   in step 7, with a normal person's sign-out in tab A and tab B leaving the
   app. Don't leave it uncovered.
3. **Shim without a reload:** fine. It runs before the auth store reads
   storage, so there's nothing to clear.
4. **`Accounts.effective_color_mode/2` removed:** fine. It was the API half
   of the theme handover the spec removes.
5. **Step 7:** go ahead once the lead says the servers are up from
   `~/src/rockcut-d54`. Include the extra specs from your inventory
   (`device_session`, `beer-board-device` S13, the mocked messages). Run
   `npx playwright test --project setup` first, then **only the specs you
   touched or added**, prefixed with `caffeinate -ims`. Commit, write the
   status and stop (stop point 2). **The lead runs the full suite** in its
   own tab afterwards, so Matt can watch it; don't start it yourself.
