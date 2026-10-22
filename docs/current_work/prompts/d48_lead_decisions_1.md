# D48 lead decisions 1, 2026-10-21

**Flag signature version tag** (Matt, after Rick's questions in discussion 80):
- **The prefix:** `Flags.signature/1` adds a recipe version as the first part, so the string reads `v1|…`. Put the version in one module attribute (`@signature_version "v1"`), with a doc comment explaining what follows from it. Changing which values go into any flag's signature, or how they're written, means **bumping the version and shipping a data migration that recomputes the stored `flag_signoffs.signature` values** for sign-offs that still match under the old recipe. Without that migration, every sign-off would read as reopened.
- **ExUnit:**
  - the signature starts from the `v1` tag (assert it on the canonical string, before hashing);
  - an existing sign-off made with the current recipe stays signed off;
  - a moduledoc check isn't needed.
- **Existing DEV and local sign-offs** get new signatures. The reseed restores the seed's, as in D47 cycle 3. Prod has no sign-offs yet.
- **When:** in Task 4, as its own small commit. It doesn't matter whether it goes before or after the UI work.
