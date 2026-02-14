# Browser Automation Testing Playbook

> Cumulative knowledge base for browser automation testing. Each test
> run reads this first and adds to it when done. The goal: each run
> makes the next one faster and more thorough.
>
> **First authored:** D7 (DataGrid Formula Engine)
> **Last updated:** 2026-02-14 (D7 post-mortem)

---

## App Navigation Map

### Rockcut UI (localhost:5174)

| Surface | URL | How to reach | Notes |
|---------|-----|-------------|-------|
| Login | `/login` | Direct or redirect from any auth-required page | |
| Home | `/` | After login, or nav sidebar "Home" | |
| Brands | `/brands` | Nav sidebar | |
| Ingredients | `/ingredients` | Nav sidebar | |
| Batches | `/batches` | Nav sidebar | |
| Settings | `/settings` | Nav sidebar | |

**Login flow:** POST matt@rockcut.com / rockcut2026

**Login automation recipe:**
1. Navigate to `http://localhost:5174/login`
2. Use `form_input` tool to fill email field, then password field
3. Click login button
4. Wait 1-2 seconds for redirect to `/`
5. Verify page loaded by checking for nav sidebar elements

### DataGrid Extended Dev Harness

| Surface | URL | Notes |
|---------|-----|-------|
| Dev harness | `http://localhost:5178/` | Single page with sample grid. Port may vary (5173 often occupied) — check Vite output for actual port |

**Port conflicts:** Port 5173 is often occupied by other dev servers (e.g., vnext_admin). Start with `pnpm dev --port 5176` and check Vite output for actual port. Vite auto-increments if port is in use.

---

## Element Discovery Patterns

_How to reliably find elements in MUI DataGrid and rockcut UI._

### MUI DataGrid (v8 / @mui/x-data-grid)

| Element | Selector / Pattern | Notes |
|---------|-------------------|-------|
| Column headers | `[role="columnheader"]` | Each header is a column header cell |
| Data rows | `[role="rowgroup"] [role="row"]` | Rows inside the grid body |
| Grid cells | `[role="gridcell"]` | Individual data cells |
| Computed column headers | Look for elements containing "fx" text | D7 adds "fx" suffix to computed column headers |
| Computed column indicator | `aria-label` containing "Computed column" | Accessibility tree reveals these |
| Cell content | Inner `div` with class `MuiBox-root` | Actual rendered content inside gridcell |
| Error icons | SVG with class `MuiSvgIcon-root MuiSvgIcon-fontSizeSmall` | MUI error icon in cells |
| Error tooltips | `aria-label` on error SVG elements | Contains the error message text |

### Best approach: use `read_page` + `javascript_tool`

The `read_page` tool returns an accessibility tree that is the most reliable way to verify DataGrid **structure and content**. It captures:
- All column header text (including "fx" indicators)
- All cell values in reading order
- Aria labels (critical for error states)
- Visual state indicators

**Tip:** `read_page` is more reliable than trying to use CSS selectors or XPath with MUI DataGrid because MUI uses complex nested DOM with generated class names.

**Critical limitation:** `read_page` verifies DOM correctness, not visual correctness. An element can have the right text content but be invisible due to styling (e.g., foreground color matching background color, opacity near zero, element clipped or hidden). Always pair `read_page` checks with computed style assertions for visual indicators. See the **Computed Style Verification** recipe below.

### Computed cell visual indicators (D7)

- **Italic text:** Computed cells use `fontStyle: "italic"` on the inner Box
- **fx in headers:** Column headers for computed columns show "fx" text
- **Error state:** Error cells show "Error" text + SVG icon with `aria-label` = error message
- **Normal cells:** `fontStyle: "normal"` — clear distinction from computed

---

## Timing & Sequencing

_What needs waits, what's safe to click immediately, async patterns._

### General rules

| Action | Wait needed? | How long | Notes |
|--------|-------------|----------|-------|
| Navigate to page | Yes | 2-3s | Wait for React hydration + initial data fetch |
| MUI DataGrid render | Yes | 1-2s | Grid initializes after page mount |
| Formula computation | No | Instant | Local formulas (arithmetic, ROUND, IF) resolve synchronously |
| Remote function calls | Yes | 0.5-1s | Dev harness uses 500ms simulated delay |
| remoteValueGetter | Yes | 0.3-0.5s | Dev harness uses 300ms delay |
| Login flow | Yes | 1-2s | Auth request + redirect |
| Page after login | Yes | 1-2s | Data fetch on mount |

### Recommended pattern for formula verification

1. Navigate to page
2. Wait 3 seconds (covers page load + all async remote functions)
3. Take screenshot for visual inspection
4. Use `read_page` to capture accessibility tree
5. Parse text content to verify formula results

**Loading states are hard to catch.** Remote functions in the dev harness resolve in 300-500ms. By the time you can screenshot (after navigation + wait), they're already resolved. To test loading states, you'd need a slower simulated delay or to screenshot immediately after navigation.

---

## Browser Automation Tool Quirks

_Lessons learned about the chrome MCP tools specifically._

### Tool effectiveness ratings

| Tool | Reliability | Best use |
|------|-------------|----------|
| `tabs_context_mcp` | High | Always call first to get current state |
| `tabs_create_mcp` | High | Always create new tabs, don't reuse old ones |
| `navigate` | High | Reliable page navigation |
| `read_page` | High | **Best tool for DataGrid verification** — returns full accessibility tree |
| `computer` (screenshot) | Medium | Good for visual verification but can't read values programmatically |
| `form_input` | Medium | Works for standard inputs, untested on MUI components |
| `find` | Low (for DataGrid) | MUI DataGrid's DOM is complex; prefer read_page |

### Key lessons

1. **Always create new tabs.** Tab IDs from previous sessions are invalid. Call `tabs_context_mcp` first, then `tabs_create_mcp`.

2. **read_page > find for DataGrid.** MUI DataGrid uses a virtualized, heavily-nested DOM with generated class names. The `read_page` accessibility tree is far more reliable for reading cell values than trying to target specific elements.

3. **Port conflicts are common.** Multiple Vite dev servers may compete for ports. Always verify the actual port from Vite's console output.

4. **3-second wait is sufficient.** For the D7 dev harness, a 3-second wait after navigation captures all resolved states including 500ms remote functions.

5. **Accessibility labels are gold.** Error states, computed column indicators, and tooltips all surface via aria-labels in the read_page output. This is the most reliable way to verify error handling.

6. **DOM correctness ≠ visual correctness.** D7 taught us this the hard way: the FxBadge had correct "fx" text in the accessibility tree, but was invisible because `color` and `bgcolor` were identical with `opacity: 0.15`. The `read_page` tool reported PASS, but a human saw a blank gray box. **Always verify visual indicators with computed style checks**, not just DOM content.

7. **Verify servers before testing.** If the backend is down, the Vite proxy returns 500/502 errors. Formula cells will show error indicators that look like bugs but are just "server not running." Always run the prerequisites health check (see recipe below) as step 0.

---

## Reusable Verification Patterns

_Step-by-step recipes for common verification tasks._

### Recipe: Prerequisites health check (ALWAYS RUN FIRST)

```
1. Check API server: curl -s -o /dev/null -w "%{http_code}" http://localhost:4002/api/health
   - Expected: 200
   - If not running: cd rockcut_api && mix phx.server &
   - Wait 5 seconds, retry
2. Check frontend server: curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/
   - Expected: 200
   - If not running: cd rockcut-ui && pnpm dev &
   - Wait 3 seconds, retry
3. Check Vite proxy: curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/api/health
   - Expected: 200 (confirms proxy forwarding works)
   - If this fails but steps 1+2 pass: Vite proxy misconfiguration
4. Only proceed to browser tests after all three return 200
```

**Why this matters:** D7 showed that formula cells display error indicators when the backend is down. These look like bugs but are just infrastructure. This check takes 5 seconds and prevents false-negative test runs.

### Recipe: Computed style verification (visual correctness)

```
1. After verifying an element exists via read_page, use javascript_tool to check
   its computed visual properties
2. For text visibility, verify:
   - opacity > 0.3 (element is not effectively invisible)
   - color !== backgroundColor (text is distinguishable from background)
   - fontSize > 0 and display !== "none"
3. For visual indicators (badges, icons, styled text):
   - Verify fontStyle, fontWeight, color match expectations
   - Verify the element has non-zero dimensions (offsetWidth > 0, offsetHeight > 0)
```

**Example: Verify FxBadge is visible**
```javascript
// Run via javascript_tool after identifying the badge element
const badge = document.querySelector('[aria-label="Computed column"] span')
  || [...document.querySelectorAll('span')].find(el => el.textContent.trim() === 'fx');
if (badge) {
  const s = getComputedStyle(badge);
  const result = {
    text: badge.textContent,
    color: s.color,
    backgroundColor: s.backgroundColor,
    opacity: s.opacity,
    visible: parseFloat(s.opacity) > 0.3 && s.color !== s.backgroundColor,
    width: badge.offsetWidth,
    height: badge.offsetHeight,
  };
  JSON.stringify(result);
}
```

**Rule of thumb:** If a test asserts a visual indicator is present, it must include both:
1. A `read_page` check (content exists in DOM)
2. A computed style check (content is actually visible to a human)

### Recipe: Verify DataGrid formula column values

```
1. Navigate to page containing DataGridExtended
2. Wait 3 seconds
3. Call read_page to get accessibility tree
4. Search text for column header name (e.g., "Scaled (×2.5)")
5. Find corresponding cell values in reading order
6. Compare against expected computed values
```

### Recipe: Verify computed cell visual indicators

```
1. Navigate to DataGrid page
2. Wait 2 seconds
3. Call read_page
4. Check column headers contain "fx" text for computed columns
5. Check for "Computed column" in aria-labels
6. Visually verify italic styling via screenshot (read_page shows structure, not CSS)
```

### Recipe: Verify error state in formula column

```
1. Navigate to DataGrid page
2. Wait 3 seconds (let error-producing functions fail)
3. Call read_page
4. Search for "Error" text in grid cells
5. Check aria-labels contain the error message (e.g., "Simulated remote failure")
6. Verify SVG icon is present (class contains "MuiSvgIcon-root")
```

### Recipe: Verify remote function resolution

```
1. Navigate to DataGrid page
2. Wait 3 seconds
3. Call read_page
4. Find cells in the remote function column
5. Verify values match expected outputs (e.g., stock levels, LOT-xxx patterns)
6. Confirm no "loading" or "pending" indicators remain
```

### Recipe: Login to Rockcut UI

```
1. Navigate to http://localhost:5174/login
2. Use form_input to fill email: matt@rockcut.com
3. Use form_input to fill password: rockcut2026
4. Click login/submit button
5. Wait 2 seconds
6. Verify redirect to / by checking for nav sidebar or page heading
```

### Recipe: UAT handoff

```
1. Run prerequisites health check (above) — start any servers that aren't running
2. Verify the key page(s) load in browser (navigate + wait + screenshot)
3. Add a "UAT Ready" section to the stepwise result document:
   - URLs to visit: http://localhost:5174/<page> (list each relevant page)
   - What to look for: (brief checklist of visual/functional items)
   - Login: matt@rockcut.com / rockcut2026
4. Notify lead/CD that UAT is ready
5. Team stays alive until CD signs off or requests changes
```

**Why this matters:** CD should open a browser and verify immediately — no friction, no "start the server first." The handoff should be seamless. Servers must be confirmed running at handoff time, not just during automated tests.

---

## D7 Test Results Summary

### Dev Harness (Task #7) — ALL PASS

| Test | Result | Details |
|------|--------|---------|
| Grid renders | PASS | All 6 rows, all columns visible |
| Heading visible | PASS | "DataGrid Extended — Formula Engine Demo" |
| Arithmetic formula (Scaled ×2.5) | PASS | All 6 rows correct (25, 2.5, 3.75, 1.25, 2.5, 20) |
| ROUND builtin (kg conversion) | PASS | All 6 rows correct (4.5, 0.5, 0.7, 0.2, 0.5, 3.6) |
| SUM aggregate (Total Qty) | PASS | All rows show 22 (10+1+1.5+0.5+1+8) |
| IF conditional (Level) | PASS | High for qty>5 (rows 1,6), Low for others |
| Remote function (In Stock) | PASS | Values: 250, 80, 12, 6, 3, 45 |
| Error state (Fails) | PASS | "Error" text + icon with aria-label "Simulated remote failure" |
| remoteValueGetter (Lookup) | PASS | LOT-100 through LOT-600 |
| Computed cell styling (italic) | PASS | fontStyle: italic on computed cells |
| Column header fx indicator | PASS | "fx" text and "Computed column" aria-label |
| Loading states | N/A | Resolved too fast (500ms) to capture |

### Rockcut End-to-End (Task #8) — ALL PASS

| Test | Result | Details |
|------|--------|---------|
| Login / auth | PASS | Already authenticated session; login page redirected correctly |
| Ingredients page loads | PASS | 20 ingredients displayed across all categories |
| Name column | PASS | Ingredient names correct, normal font style |
| Category column | PASS | Category names correct (Hop, Sugar, Grain, Adjunct, Yeast) |
| Notes column | PASS | Descriptive text, normal font style |
| On Hand formula column values | PASS | INVENTORY_ON_HAND(id) resolves — shows 0 and 1 values from D6 backend |
| On Hand header fx indicator | PASS | "On Hand fx" with aria-label "Computed column" |
| On Hand italic styling | PASS | fontStyle: italic on formula cells, normal on data cells |
| No error states | PASS | Zero error indicators — all 20 rows resolved successfully |
| Non-formula columns normal | PASS | No wrapper divs, no italic, no fx indicators |

**Rockcut-specific element patterns:**
- Formula column is the 4th column (index 3) in the Ingredients grid
- Formula cells have a `MuiBox-root` wrapper div with italic styling; data cells have plain text
- The `INVENTORY_ON_HAND` formula calls POST `/api/formulas/execute` with `{calls: [{function: "inventory_on_hand", args: {ingredient_id: N}}]}`
- Backend returns small integers (0, 1) — values vary per ingredient, confirming dynamic calculation

---

## Changelog

| Deliverable | What was added |
|-------------|---------------|
| D7 | Initial version: element discovery patterns for MUI DataGrid, timing guidelines, tool quirks, 5 reusable recipes, dev harness + rockcut e2e test results |
| D7 post-mortem | Added: prerequisites health check recipe, computed style verification recipe, UAT handoff recipe. Updated key lessons with DOM≠visual and server-check lessons. Root cause: FxBadge invisible (color==bgcolor+low opacity), formula 500s (API server not running at UAT time). |
