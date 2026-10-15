# D43 lead decisions 1 (after Task 1, 2026-10-15)

1. **Dev DB migrated** (`20261018120001_add_color_mode_to_users`); API restarted.
2. **Keep `:set_color_mode`** for managers of the device's home department.
   It matches D33's model (those managers already view, pair and revoke the
   tablet) and the spec (Q5, S147, S149). The plan's "nothing new in Authz"
   was wrong: `:manage_device` is owner-only. Theme alone → `:set_color_mode`;
   any other field → `:manage_device`, as built.
3. **`effective_color_mode` via the session's device token** (not
   `on_device_id`): right, `on_device_id` is only set while acting with a
   staff code.
4. **The 9 date-pinned test failures** (`accounts_test` leaving-the-Brewery,
   `task_board_test`, `task_boards_test`): pre-existing on `develop` since the
   date passed 2026-10-14. Fix them on this branch in a **separate commit**
   (`fix: tests pinned to 2026-10-14 …`), making the Daily items' dates follow
   the pinned "today" (or pinning relative to the real date), whichever is
   the smaller, clearer change. Don't change app code for it. `mix test`
   fully green after.
