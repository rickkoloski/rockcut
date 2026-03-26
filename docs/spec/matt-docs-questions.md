# Questions for Matt — March 2026 Document Review

> Generated from analysis of Matt's three documents received 2026-03-15:
> "Brewhouse & Process Profiles", "Ingredient Changes", "Brand & Recipe UI"
>
> Full analysis: `docs/spec/brewing-units-and-process-reference.md`

---

## Typos to Confirm

1. **"Linter" → "Lintner"?** (Ingredient Changes doc)
   - Standard spelling is "Lintner" (named after Karl Josef Lintner)
   - Used for Diastatic Power unit: `º Lintner`
   - Which spelling does Matt want in the UI?

2. **"Ferementer" → "Fermenter"** (Brand & Recipe UI doc)
   - Appears in the Use column options: Mash / Kettle / Fermenter / Brite
   - Assuming this is a typo — will use "Fermenter" unless told otherwise

3. **"Q2" → "VC" in gravity formula** (Brand & Recipe UI doc)
   - In the VF variable: `VF = (Q2 + SQRT(-4×VB³ + Q2²))^(1/3)`
   - Q2 is not defined anywhere. VC is defined on the line above and fits mathematically (Ferrari's method for solving the cubic polynomial)
   - Confirm this should be VC

4. **"Brite" spelling** (Brand & Recipe UI doc)
   - Industry uses both "Brite" and "Bright" (as in bright tank)
   - Which does Matt prefer for the UI?

---

## Missing Specs / Pending Items

5. **BA and BJCP style lists**
   - Matt said "I'll provide the lists later"
   - Need: list of BA styles (with year), list of BJCP styles (with year), and guideline descriptions for pop-up display
   - Are these available as structured data (CSV, JSON) or will they need to be transcribed?

6. **Other ingredient category specs**
   - Ingredient Changes doc lists stubs for: Sugar, Fruit, Hop, Spice, Yeast, Other Adjunct, Other Consumables
   - No field details provided for any of these yet
   - When can we expect those? Hops in particular will need fields for alpha acid %, form (pellet/whole/extract), etc.

7. **IBU calculation formulas**
   - Brand & Recipe UI lists IBU as a required calculated value
   - No formula provided in these docs (Tinseth/Tinseth-modified referenced in Brewhouse doc but not the actual math)
   - Is this coming in a separate doc, or should we implement standard Tinseth?

8. **Calorie estimation formula**
   - Listed as a required calculation in the Recipe UI
   - No formula provided
   - Should we use the standard brewing formula? (calories from alcohol + calories from residual carbohydrates)

9. **Color SRM calculation**
   - The Fermentables table computes Color MCUs (weight × Lovibond)
   - The MCU→SRM conversion isn't specified
   - Should we use Morey's equation? `SRM = 1.4922 × MCU^0.6859` (industry standard)

---

## Clarification Questions

10. **Moisture field — percentage or decimal?**
    - The extract conversion formulas use `(1 + Moisture)`
    - If Moisture is entered as 4 (percent), the factor would be 1.04 — but the formula as written would give 5
    - Confirm: the UI field shows "Moisture %" but the formula needs `Moisture / 100` internally, correct?

11. **"Tinseth-modified" — what's the modification?**
    - Standard Tinseth is well-defined, but "modified" varies by brewery
    - Does Matt have a specific modification in mind? (e.g., adjusted utilization for whirlpool hops, different bigness/boiltime factors)
    - Or is this a placeholder for a future customizable formula?

12. **Fermentables table — volume-based ingredients**
    - The weight note says: if Amount is a volume, use `Amount × density`
    - Where does ingredient density come from? Is this a new field on ingredient records, or looked up by category?

13. **Extract column in Fermentables table — which value?**
    - "Display the extract value using the CGAI/PPG number as selected in brewhouse standards"
    - But the Density Calc Method has 4 options (CGAI, FGDB, PPG, Lº/kg)
    - Should we show whichever one matches the brewhouse setting, or always show CGAI for CGAI/FGDB and PPG for PPG/Lº/kg?

14. **Preboil vs OG volume**
    - The gravity formulas reference "volume of the wort at that point"
    - Preboil volume = kettle turn size from brewhouse settings?
    - OG volume = preboil volume - (evaporation rate × boil duration) - kettle loss?
    - Confirm the volume chain Matt has in mind

15. **Duplicate actions — deep copy?**
    - Brewhouse duplicate and Process Profile duplicate — do these create independent copies (deep copy), or linked clones?
    - For brewhouse: copy all settings?
    - For process: copy all tabs (mash steps, boil, fermentation, cold crash, packaging)?
