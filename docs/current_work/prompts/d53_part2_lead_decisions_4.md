# D53 Part 2: lead decisions 4

2026-11-08 · lead → builder, answering stop 4. The UI looks right in the screenshots I checked
(board, card notes, phone board, Company send).

- **LEAD-5 (dragging lists) is waiting on Matt.** Don't touch the shared drag layer yet; keep Move
  left/right. I'll tell you his answer before stage 8's specs are final.
- The checklist's ↑/↓ and the Send picker's roster source are accepted.

## Next: stage 7, then stage 8, to stop 5

Stage 7 (spec §4.8, all items: gaps 4, 5, 6, 9, 11, 13, 14 and the two recheck observations), each
with a test from its repro that fails with the fix reverted. Reports: `stepwise_results/d53_part1_dev_qa*`.

Then stage 8:
- seed and reseed cleanup, as the plan and decisions 1.6 say;
- Playwright for S223–S243 and S255–S261 (including S239's long-press drop on a tab with `touchDrag`);
- `tests/COVERAGE.md`.

Run the specs you touch and `--project brewery-board --no-deps` (stage 7 changes the task boards),
one project at a time. Stop 5: the non-Playwright gate passing and your specs passing. Commit with a
message containing `stop 5`, then stop.

## Matt's answers (2026-11-08, added after this file was sent)

- **LEAD-5:** keep Move left/right. No list dragging in D53. The lead files a follow-up task.
  Spec §4.4 updated.
- **New: search in Archived.** A search box at the top of the Archived dialog narrows archived
  lists and cards as you type: list name, card title and card description, ignoring case. Show
  "Nothing archived matches" when nothing does. If `…/archived` returns everything, filter on the
  client; if it pages or caps, add a `q` param on the API instead. S237 now includes this. Add it
  to stage 8's specs, with a screenshot of the dialog searching, light and dark.

## Matt (2026-11-08, later): the name

**Every user-visible "Idea Board(s)" / "… ideas" becomes "Board(s)" / "… board".** Code, tables, API
paths and the `/ideas` URLs stay as they are. Spec §2.1 is updated.

| Where | Now | New |
|---|---|---|
| Nav (`App.tsx`) | Idea Boards | **Boards** |
| Board title (`ideaBoardTitle`) and the switcher | Taproom ideas | **Taproom board** (Company board, Brewery board…) |
| History title | History: Taproom ideas | History: Taproom board |
| Notification preferences | Changes to Idea Board cards you watch | **Changes to board cards you watch** |
| Send's cut-off text | … see the Idea Board card | **… see the card on the board** |
| Task dialog | From idea: Patio heaters | **From the Taproom board: Patio heaters** (link as before; plain title when no link) |
| Notification and any other text | "Idea Board" | "board" |

- **Icon:** use a board/columns icon (MUI `ViewKanbanOutlined`) instead of the lightbulb.
- Grep the UI and the API's user-facing strings (notifications, errors) for "Idea Board", "Idea
  Boards" and "ideas" in visible text, and update tests that assert them.
- **The starter list named "Ideas" stays** (it's a list, not the board).

## Matt (2026-11-08, later still): URLs and auto-watch

- **URLs become `/boards`:** `/boards`, `/boards/:board`, `/boards/:board/cards/:id`, everywhere the UI
  builds or matches them (`lib/ideas.ts` paths, `App.tsx` routes for people and tablets,
  `IdeaBoardRoutes`, links in the task dialog, Messages-shareable card URLs) and in the API's
  notification `url` (`Watchers`: `/boards/<board>/cards/<id>`). No `/ideas` redirect is needed,
  since nothing has shipped. The UI route `/boards` doesn't clash with anything (the task boards are
  `/tasks`; `/api/boards` is the API's). Code names and API paths (`/api/idea_boards`) stay.
  Spec updated.
- **No auto-watch when someone is added to a card** (confirmed; as the spec already says).
