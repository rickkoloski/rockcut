# List View Search — Micro Spec

## Goal
Add a text search input above every list view table so users can quickly filter visible rows.

## Affected Pages
| Page | File | Existing Filters |
|------|------|-----------------|
| Brands & Recipes | `BrandsList.tsx` | None |
| Ingredient Library | `IngredientsList.tsx` | Category dropdown |
| Batches | `BatchesList.tsx` | Status dropdown |
| Settings | `SettingsPage.tsx` | None |

## Behavior
- **Client-side filtering** — all data is already loaded, no backend changes needed.
- Search is **case-insensitive** and matches against **all string-coercible column values** per row.
- Partial matches (substring) are sufficient.
- Search input is a `TextField` with `size="small"`, `placeholder="Search..."`, and a `SearchIcon` adornment.
- When a page already has filter controls (Ingredients, Batches), the search sits in the same horizontal row alongside the existing controls.
- When a page has no existing filters (Brands, Settings), the search appears in a `Box` between the PageHeader and the Paper/table.
- Clearing the search shows all rows again.

## Implementation
- Use `useMemo` to derive filtered rows from the full dataset + search term.
- Match against `Object.values(row)` joined, case-insensitive `.includes()`.
- For nested values (e.g., `row.brand?.name`, `row.category?.name`), flatten before matching.
- No debounce needed — datasets are small (< 100 rows).

## Testing
- Each page: type a search term, verify grid shows only matching rows.
- Clear search, verify all rows return.
- Verify existing filters (category, status) still work alongside search.
