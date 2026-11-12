# D59 lead decisions 1 (Stage 2 report)

2026-11-11 · lead → builder, on the Stage 2 `LEAD:` notes (`56ca78b`..`3edc9c5`).

1. **Owners are notified about Owners channel messages: do it.** The approved spec's O10 says
   `owner`/`owner2` see an Owners message in-app/push per their preferences. In
   `Messaging.recipients("dept:" <> key)`, an `owners_only` department's recipients are its active
   members **plus every active owner** (deduplicated; the author is still dropped). Every other
   department channel is unchanged (members only). Test: a post by `ownersAsst` notifies `owner`
   and `owner2` and not `dualMgr`/`office1`; a post in a normal department channel still doesn't
   notify a non-member owner.
2. **`manages_departments`/`modules` on `/api/me`:** leave the API as is (D31 parity). Stage 3
   filters in the UI by `scheduling`.
3. **Calendar feed 404 vs a missing department:** fine as is; the spec wording was loose.
   Unknown-department behavior is out of scope.
4. **Template items:** no direct guard. Covered indirectly, since no position can be in Owners.
5. **422 before 403** for a manager asking for manager in Owners: fine, nothing is applied either way.
6. **Migration warnings:** pre-existing, fine.

After item 1: `mix test` twice and `mix compile --warnings-as-errors`, one commit, short report.
