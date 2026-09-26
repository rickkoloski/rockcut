# D29: RBAC Capability Model — Completion Record

**Status:** Complete (2026-09-26) — signed off by Matt; Rick informed in discussion 80
**Spec:** `specs/d29_rbac_capability_model_spec.md`
**Roadmap:** `planning/rbac_configurable_authorization_roadmap.md` (Phase 0)
**Concept:** 06_auth_roles
**Branch:** `d28-production-deploy-readiness` (PR #1) — docs only, no code

---

## What shipped

A design, not code: the capability model every later RBAC phase builds on.

- **Decision inventory (spec Appendix A):** 48 authorization decisions across
  the API and UI, each with file:line, kind (check / list / self / derived /
  owner / UI), today's rule, and its mapping to the new vocabulary. Key
  finding: `Authz.can?/3` is called only by the shift and position
  controllers; everything else reads `is_owner` / `memberships.role` directly.
- **Model (spec §3):**
  - Three layers: owner flag → fixed baseline for every active user →
    roles held per department (via memberships).
  - 8 modules: schedule, schedule_setup, time_off, availability,
    calendar_feeds, people, messaging, brewing — brewing is **bound** to the
    Brewery department.
  - Levels `read < edit < manage`; scope `own | department | all` per
    capability.
  - `Authz.scope/3` as the single list-filtering function (handles record-
    and person-scoped modules).
  - Owner-only set that no role can grant; `counts_as_manager` role flag for
    the Managers channel; assignment guardrails.
- **Today as a matrix (Appendix B)** with a row-by-row parity check.

## Decisions (Matt, 2026-09-26)

- Model: per-department roles; three levels; brewing department-bound;
  explicit `counts_as_manager` flag.
- Kept: manager self-approval of time off; brewery employees' full brewing
  access; everyone sees published shifts; only the requester cancels time off
  (managers/owners deny); "Other" department owner-only.
- **One deliberate change (spec §6 C):** managers create users and edit
  positions / templates **only in their own departments**; roster order
  becomes owner-only. Lands in roadmap Phase 2.

## Next

- D30 — shared DEV server + synthetic test accounts (Rick's plan, file #3944);
  its personas become the RBAC test fixtures.
- D31 — RBAC consolidation (roadmap Phase 1): route every decision through
  `Authz` with parity tests first; no behavior change.
