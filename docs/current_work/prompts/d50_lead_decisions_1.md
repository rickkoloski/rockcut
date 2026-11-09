# D50: lead decisions 1 (answers to Stop 1)

2026-11-08 · lead → builder50.

1. **Expired before "not yours":** yes. An expired Undo answers `undo_expired` whoever presses it.
2. **Cross-batch link wording:** OK as written.
3. **Show planned batches on a device:** keep it `:manage_device` (owner-only today), the same as
   every other device setting except the theme. Spec D9 uses `owner`.

**Servers:** the local servers now run from `~/src/rockcut-d50` (API :4002 with your migration
applied, UI :5174, both in the lead tab). Don't start or stop them. Playwright runs are yours
from now on: run them in a separate shell, log to `/tmp/claude-501/pwlogs/d50_*.log`, and don't run
`mix compile --force` while a run is going.

**Stage 2:** go ahead (plan stage 2), and stop at Stop 2. Your note on previews is right: on the
device the code dialog opens before the move or check-off prompt (`useActing.run` around the
preview). The window is shared, so a second request inside it doesn't ask again.
