# Rockcut Testing Knowledge Store

Project-specific testing knowledge for Rockcut Brewing Co app.
Cross-project patterns live in `~/src/ops/sdlc/testing-knowledge/`.

## Layers

| File | Layer | What it captures |
|------|-------|-----------------|
| `layer0-upstream.yaml` | 0 — Upstream SDLC | Risk areas, architect observations, known bugs, integration points |
| `app-map.yaml` | 1 — App Map | Routes, pages, components, navigation patterns |
| `element-catalog.yaml` | 2 — Element Catalog | Stable selectors per page from Playwright snapshots |
| *(cross-project)* | 3 — Interaction Recipes | In `tool-patterns.yaml` and `component-catalog.yaml` |
| `timing-profile.yaml` | 4 — Timing Profile | Measured wait times for Rockcut-specific operations |
| *(cross-project)* | 5 — Gotchas | In `~/src/ops/sdlc/testing-knowledge/gotchas.yaml` |

## How to Use

1. Before a test session, load Layer 0 (upstream risks) and Layer 1 (app map)
2. For specific pages, load Layer 2 (element catalog) for that page
3. Cross-project layers (3, 5) are loaded from the shared knowledge store
4. After a test session, update layers with human review (D7 decision)

## Maintenance

- Updated after each test cycle
- Human-reviewed before committing changes (evolving toward automation)
- Layer 0 refreshed when new deliverables are completed
- Layer 2 refreshed when UI changes are deployed
