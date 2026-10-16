# D43 lead decisions 2 (after Task 2, 2026-10-15)

1. **Theme select in the device row**: yes. The edit form is owner-only and
   managers must reach it (S147); the row sends only `color_mode`.
2. **No reload on a theme change**: right (plan). Spec S144 updated to "changes
   in place".
3. **Hours label "8 hr · 8 hr draft"**: accepted (spec §1.9 updated).
4. **Position filter unchanged** (flat list, no groups): accepted (spec §1.13
   updated).
5. **S148 with a `[TEST-TEMP]` person**: fine; Task 4's spec should do the same
   (create, use, deactivate), never the seed password.
6. **Task 3**: go. Include the two problems seen in S148 (unselected toggle
   buttons, the bright personal-session banner) and the conflict banner.
