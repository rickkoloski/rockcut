# D15 Manual Testing Walkthrough — Meeting with Matt

**Date:** 2026-03-19
**Prerequisites:** Both servers running (Phoenix on 4002, Vite on 5173)
**Login:** matthewheiser@gmail.com / rockcut2026
**Branch:** `feature/d15-brewing-calculations`

---

## Pre-flight: Start Servers

```bash
# Terminal 1 — API
cd ~/src/apps/rockcut/rockcut_api && mix phx.server

# Terminal 2 — UI
cd ~/src/apps/rockcut/rockcut-ui && pnpm dev
```

Open browser to http://localhost:5173

---

## Demo 1: Login & Navigation Baseline

**Purpose:** Confirm the app is healthy before showing new features.

1. Navigate to http://localhost:5173/login
2. Enter email: `matthewheiser@gmail.com`, password: `rockcut2026`
3. Click **Sign In**
4. Verify: app shell loads, left nav shows **Home**, **Brands & Recipes**, **Ingredient Library**, **Batches**, **Settings**, **Users**

Quick nav check:
- Click **Home** — dashboard loads
- Click **Brands & Recipes** — brand list with grid
- Click **Ingredient Library** — ingredient list with grid
- Click **Settings** — settings page loads

rak: confirmed

---

## Demo 2: Brewhouse Settings (Baseline for Matt's Feedback)

**Purpose:** Show Matt the current state of Brewhouse settings so he can see what we'll be changing per his doc.

1. Click **Settings** in the nav
2. Click **Brewhouses** tab
3. Click the **Production** row to open the detail page

**Point out to Matt:**

| Section | What Matt will see now | What his doc asks for |
|---------|----------------------|----------------------|
| Section header | "UOM Preferences" | Rename to "Default Units of Measurement" |
| Temperature Unit | "F" | Should be "ºF" |
| Density Unit | "sg" | Should be "SG" |
| Density Calc Method | "ppg" | Should be "PPG", add "FGDB" and "Lº/kg" |
| IBU Calc Method | "tinseth" | Should be "Tinseth", add "Tinseth-modified" |
| Liquid Volume Unit | "bbls" | Should be "bbl", capitalize L in "hL", "L" |

rak: Matt is asking for Gallons in addition to BBLs. 

| Kettle Turn Size | Shows as plain number | Should show unit: "Kettle Turn Size (bbl)" |
| Evaporation Rate | Shows as plain number | Should show: "Evaporation Rate (bbl per hr)" |

**Talking point:** "These display label changes are scoped for the next tranche. We focused this session on the calculation engine underneath."

4. Click **Edit** (pencil icon in toolbar)
5. Show the current dropdown options — Matt can see the current enum values
6. **Cancel** the edit (don't change anything on Production)

rak: NOTE for backlog - let's make these fields edit in place.

---

## Demo 3: New Formula Columns on Recipe Grid

**Purpose:** Show Matt the 4 new brewing calculations working live.

1. Click **Brands & Recipes** in the nav
2. Click any brand that has recipes (e.g., a brand with at least one recipe)
   - If no brands exist, create a quick test brand first

3. In the **Recipes** grid, verify you can see:
   - **Est. IBU** column (should show a computed value in italics)
   - **Est. OG** column (should show a computed value in italics)

4. **Show hidden columns:** Click the column visibility toggle button (grid toolbar, eye icon or columns icon)
5. Enable these columns:
   - **Est. FG** — Estimated Final Gravity
   - **Est. ABV** — Estimated Alcohol By Volume
   - **Est. SRM** — Estimated Color
   - **Est. Cal** — Estimated Calories per 12oz

   rak: confirmed

6. Verify all 6 formula columns show computed values (italic text, no error icons)

**Talking points for Matt:**
- "These all compute from the recipe's actual ingredients — not hardcoded"
- "FG uses a default 75% attenuation since we haven't added the attenuation field to brands yet — that's in your Brand UI doc"
- "SRM uses the Morey equation against lovibond values from ingredient lots"
- "Calories factor in both alcohol and residual sugar"

rak: in addition to italics, let's do something with background colors (matt uses blue to denote editable)

**If a column shows an error icon:** Hover over it to see the error message. Most likely cause is missing ingredient data (no lots with color_lovibond values for SRM, or no hop lots with alpha_acid for IBU).

rak: taking on faith for now, but let's make sure that absence of data is reported in a user-friendly and instructive manner.

---

## Demo 4: Extract Auto-Calc on Ingredient Form (New Pattern)

**Purpose:** Show Matt the form-level reactive calculation pattern for grain extract conversions.

1. Click **Ingredient Library** in the nav
2. Click **Add Ingredient** button
3. In the **Category** dropdown, select **Grain**

**Watch the form expand.** Two new sections appear:

### Extract Properties Section

4. **Extract Measurement** dropdown — defaults to one of: CGAI / FGDB / PPG / L°/kg
   - Select **CGAI**

5. **Moisture** field — enter `4.0` (this means 4%)

6. **Extract CGAI** field (the editable one) — enter `80.5`

7. **Watch the auto-calc:** The three read-only fields should immediately show:
   - FGDB ≈ 83.72
   - PPG ≈ 37.03
   - L°/kg ≈ 309.0

8. **Change the measurement type** to **PPG**
   - The PPG field becomes editable (pre-filled with the converted value)
   - CGAI, FGDB, L°/kg become read-only and show auto-calculated values

9. **Change PPG value** to `37` — watch the others update

### Grain Characteristics Section

10. **Color** field — enter `1.8` (suffix shows "° Lov")
11. **Diastatic Power** field — enter `140` (suffix shows "° Lintner")

**Talking points for Matt:**
- "This is your exact conversion chain: CGAI as the hub, all paths through it"
- "The formulas match your doc: PPG = CGAI × 46, FGDB = CGAI × (1 + Moisture), Lº/kg = PPG × 8.345"
- "These fields are UI-only right now — we need to add them to the backend schema. Does this interaction pattern feel right before we wire up persistence?"
- **Ask about "Linter" vs "Lintner"** — the UI currently shows "Lintner"

rak: UI is correct

12. Click **Cancel** (don't save — backend can't persist these fields yet)

---

## Demo 5: Formula Engine Architecture (Whiteboard Discussion)

**Purpose:** Explain the calculation architecture so Matt understands what's possible.

No UI steps — this is a talking-point section.

**Three types of calculations in the system:**

| Type | Example | How it works |
|------|---------|-------------|
| **Remote formula** (server-side) | Est. IBU, Est. OG, Est. FG, Est. ABV, Est. SRM, Est. Calories | Grid column calls backend, backend queries recipe data, computes result, returns to cell |
| **Row-field math** (client-side) | `=amount * extract * efficiency` | Formula parser evaluates against row data directly, no server call |
| **Form auto-calc** (client-side) | Extract conversions | React hook recomputes on every input change, pure math |

**New capability we built today:**

- Formula columns can now **reference other formula columns**
- Example: Column A = `=amount * extract * efficiency`, Column B = `=SUM(A)` — this now works
- Also added **SUMIF**: `=SUMIF(amount, use, "Mash")` — sum only mash ingredients
- This makes the full Fermentables table feasible

**Ask Matt:** "Your Fermentables table has 17 columns including Extract Expected, Color MCUs, Mash Weight %, Extract Weight %. We can now compute all of these. Ready to tackle that next?"

rak: Yes, please do this and we'll review the initial result

---

## Demo 6: Walk Through Questions Doc

**Purpose:** Get Matt's answers to the 15 open questions.

Open the questions doc: `docs/spec/matt-docs-questions.md`

### Quick-fire typo confirmations:
1. "Linter" or "Lintner" for diastatic power? → YES
2. "Ferementer" → "Fermenter" — correct? → YES
3. Q2 in the gravity formula should be VC — correct? → YES
4. "Brite" or "Bright" for the tank? → Brite

### Missing specs needed:
5. BA/BJCP style lists — when? Format? → https://github.com/ascholer/bjcp-styleview/blob/main/styles.json
6. Other ingredient categories (Hop, Yeast, Spice, etc.) — when? → forthcoming
7. IBU calculation — use standard Tinseth or does he have a specific formula? → Let's use standard Tinseth, but make the formula pluggable. 
8. Calorie formula — OK to use standard? → use the standard
9. SRM conversion — OK to use Morey equation? → yes

rak: in all cases above, please add rows to the formula sheet (7-9 above)

### Clarifications:
10. Moisture field — displayed as % but formula uses decimal, correct? → correct
11. "Tinseth-modified" — what's the modification? → future consideration
12. Ingredient density for volume-based ingredients — where from? → Matt will provide data on densities for sugars and fruits, but he's working on that for now.
13. Extract column in Fermentables — which value to show? → Ask Rick about portablemind gantt saved views functionality, but for now, the default will be CGAI
14. Preboil vs OG volume — confirm the volume chain → Matt is working on an answer for this. See RC chat for progress
15. Duplicate = deep copy? → correct

---

## Demo 7: Backend Tests (Optional — If Matt Is Curious)

**Purpose:** Show Matt the test coverage behind the calculations.

```bash
cd ~/src/apps/rockcut/rockcut_api && mix test
```

Expected output: **83 tests, 0 failures**

Highlight:
- 41 tests for BrewingConversions (extract chain, gravity, alcohol, volume)
- Tests for each new formula function (est_fg, est_abv, est_srm, est_calories)
- Round-trip accuracy tests (convert one way, convert back, verify match)

---

## After the Meeting

### Capture decisions
Update `docs/spec/matt-docs-questions.md` with Matt's answers.

### Next tranche candidates (based on Matt's priorities):
- [ ] Display label/capitalization fixes (Tranche A from original plan)
- [ ] Fermentables table redesign (now feasible with two-phase evaluation)
- [ ] Ingredient backend schema (persist extract/color/diastatic fields)
- [ ] Brand new fields (OG, attenuation, batch size, mash efficiency)
- [ ] Process Profile dynamic fields (mash types, crash types)
- [ ] Duplicate actions (brewhouse, process profile)
