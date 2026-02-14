# D2: CRUD APIs — Complete

**Completed:** 2026-02-12

## Summary
Built full CRUD API layer: 13 Phoenix controllers, Brewing context module, 65+ routes. All endpoints tested via curl.

## What Was Built
- `lib/rockcut_api/brewing.ex` — context module with all CRUD functions
- 13 controllers in `lib/rockcut_api_web/controllers/`
- `lib/rockcut_api_web/controllers/json_helpers.ex` — shared JSON rendering
- Router with 65+ RESTful routes under `/api/`

## Key Patterns
- Flat params (not nested `{ "recipe": { ... } }`)
- Preloading associations on show endpoints (e.g., recipe preloads ingredients, mash_steps, etc.)
- Batch preloads brew_turns with recipe summaries
- Filtering via query params (e.g., `?brand_id=1`, `?status=active`)

## Deviations
- None
