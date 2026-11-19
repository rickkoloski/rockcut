# D61: Purchasing, malt contracts, reorder and totals — Spec

**Status:** APPROVED by Matt 2026-11-18 (scoped 2026-11-17 and 2026-11-18; A1–A5 confirmed)
**Backlog:** the D60 carry-over list (`stepwise_results/d60_grain_catalog_COMPLETE.md`), B8 fix
`0299732` on local branch `d61-carry`
**Concept:** 12_ingredients
**Series:** D60 grains + inventory (on prod `v2026.11.18`) → **D61 purchasing and contracts** → D62
hops, yeast and other ingredients → D63 recipes on maltster products, brew-day drawdown, planned
inventory, °Plato (4987), batch-log time (4986)

---

## 1. Why

D60 records what grain is on hand, but stock arrives only as a hand-entered "Received" movement,
and nothing tracks what was ordered, what a malt contract commits us to, when to reorder, or what
the grain on hand is worth.

D61 adds Silverston's **Agreement** (the malt contract), **Order** with its order items and
**receipt** (receiving an order creates the lot movements), a **reorder point** per maltster
product, and **totals** for inventory value and orders, on the D60 model.

## 2. Decisions (Matt)

Numbers continue the D60 scoping list.

**Contracts**
16. A contract tracks, per product per year, in sacks and $: the contract total, how much has been
    ordered, and what remains.
23. A contract is with **one supplier** and can cover several maltsters and products. It runs
    **Jan–Dec**. The negotiated price becomes that product's offer price for the year, recorded in
    price history. Sacks and $ count against the contract **when received**.
38. A contract shows **ordered (still open)**, **received**, and **remaining = contract − received**.
39. Terms are **sacks per maltster product** (e.g. 200 sacks of Rahr 2-Row at $42).
40. After the contract year the price **stays until someone changes it**.
41. Going over a contract is **shown, not refused**. An **end-of-year shortfall** view compares
    contracted with received per product.

**Orders and receiving**
17. An order is tracked when placed, then checked when received.
24. An order arrives in full, and the quantity is checked.
28. An order can be marked **off-contract**; its sacks and $ don't count against a contract.
29. The standard check-in is "received in full"; the receiver can record a different quantity.
    Inventory and contract totals use only what arrived. The order keeps both numbers.
42. An order has a supplier, order date, expected date, an **optional** PO / reference number, and
    lines (offer, sacks, price). **No draft step:** an order is placed when it's saved.
43. Each line goes into the **same lot as that product's previous lot** unless the brewer enters a
    lot number. One line can be split across **several lot numbers**.
44. A short delivery **closes the order**; no back-order.
45. Grain **can still be received without an order** (D60's Add lot / Received).
46. **Any Brewery employee** can change or cancel an order until it's marked received.
47. Invoices, payment and freight are out of scope.
48. Each supplier can have an **order target in sacks**, in multiples (BSG: 40). The order shows a
    running total of sacks and lb and progress to the next multiple ("36 of 40", "76 of 80").
    Shown, never refused. Sacks count the same whatever their size.
49. Receiving **adds to the inventory of the product's previous lot** (a Received movement on it)
    unless the brewer creates a new lot number. A topped-up lot keeps its first received date for
    Oldest first. The same lot number within a product is always the same lot.

**Reorder**
30. A **minimum on hand** per maltster product. **To order = future brews' need + minimum − on hand
    − already on order.** Future brews' need is added in D63 (Gantt batches have no recipe yet);
    D61 uses minimum − on hand − on order.
31. Defaults (approved): open orders subtract; set per maltster product; in **sacks**, rounded up to
    whole sacks; expired stock doesn't count as on hand; a **To order** list with "start an order",
    and a "below minimum" mark on the Grains list and product page; any Brewery employee sets
    minimums.

**Totals**
32. Inventory: grain on hand and its $ value, by product with a grand total; orders: sacks and $.
    Filters: supplier (both), maltster and category (inventory), status and date range (orders).
33. On-hand value at **what we paid**; lots with no recorded cost use the offer price, marked
    estimated.
34. Totals in **lb**, with sacks per product.
35. Order $ = line price × sacks ordered while open, × sacks received once received.
36. On screen in a form that **copies and pastes into a spreadsheet**: a plain table and a **Copy**
    button (tab-separated).
37. Inventory totals take an **"As of" date**, computed live. No saved quarter-ends.

**Who**
25. Contracts: **owners and Brewery managers**. Everything else (orders, receiving, minimums,
    totals): any Brewery employee. 26. The brewhouse device does none of it.

## 3. Data model

Working names for planning.

### 3.1 Contracts (Agreement)

- `supplier_contracts`: supplier (party with the supplier role), **year**, notes, who created it.
  One contract per supplier per year (assumption A1).
- `supplier_contract_lines`: contract, **maltster product**, **sacks**, **price per sack ($)**.
  One line per product per contract.
- Saving a line (or changing its price) adds a row to the price history of **that supplier's offer
  for that product**, effective **Jan 1 of the contract year, or today if later** (A2), note
  "Contract <year>". The line needs that offer to exist (422 "Add a <supplier> offer for <product>
  first"). After Dec 31 nothing changes the price (decision 40).
- Per line, computed: **contracted** sacks and $ (sacks × price); **on order** = sacks on open,
  on-contract order lines for that supplier and product with an order date in the year; **received**
  = sacks received on on-contract lines with a **received date** in the year, and $ at the line
  prices paid; **remaining** = contracted − received (negative = over, shown as "over by N").
- Only owners and Brewery managers create, change or delete contracts (`Authz` `:contracts`:
  owners, or `manages_department?` Brewery). A contract with received sacks can't be deleted (422);
  its lines can still change.

### 3.2 Orders (Order + Order Item)

- `purchase_orders`: supplier, **order date**, **expected date** (optional), **reference**
  (optional, PO number), **off_contract** (bool, default false), notes, **status** ∈ `open`,
  `received`, `cancelled`, received date, who created / received / cancelled it and when.
- `purchase_order_lines`: order, **supplier offer** (of the order's supplier), **sacks ordered**
  (whole sacks, ≥ 1), **price per sack** (default the offer's current price, editable; $0.00
  allowed), **sacks received** (set at receipt).
- **Open** orders can be edited (lines added, removed, changed; header changed) or **cancelled**
  by any Brewery member. **Received** and **cancelled** orders are read-only (409 "This order has
  already been received/cancelled").
- **Running total** on the order: sacks, lb (sacks × each offer's sack size), $; and, when the
  supplier has an **order target** (`parties.order_target_sacks`, shown on suppliers), progress to
  the next multiple: "36 of 40 sacks".

### 3.3 Receiving (receipt → lots and movements)

**Receive** on an open order, one dialog, all lines at once:

- **Received date** (default today, not after today).
- Per line: **sacks received**, default the sacks ordered ("received in full"); a different number
  can be entered (0 allowed: nothing came). The line shows "ordered 10, received 8" afterwards.
- Per line, **where it goes** (decision 43 / 49):
  - default: the product's **previous lot**: its most recently received lot that isn't Expired and
    has the **same sack size as the offer** (A3). The sacks are added to it as a **Received**
    movement; its received date (Oldest first) doesn't change.
  - **New lot number:** the brewer enters a lot #; a new lot is made (supplier and sack size from
    the offer, specs copied from the product's standard, editable as in D60 Add lot) with a
    Received movement. Entering a lot # that the product already has adds to that lot.
  - **Split:** "Add lot #" adds rows so one line's sacks go to several lots; the rows must add up
    to the line's sacks received.
  - With no previous lot (first delivery) a lot # is required.
- Saving marks the order **received** (also when short or 0: no back-order, decision 44), in one
  transaction with all its movements. Each Received movement records its **order line** and
  **cost per lb** (line price ÷ the offer's sack size).
- **Without an order** (decision 45): D60's Add lot and Received movement stay as they are. Those
  receipts have no cost.
- D60's rule that a product's lot numbers are unique follows: the API refuses a second lot with
  the same lot # on a product (422), and receiving into an existing number adds to it.

### 3.4 Lot cost and value

- A Received movement from an order carries `unit_cost_per_lb`. A lot's **cost per lb** is its
  **most recent** costed receipt's: a topped-up lot is valued at the latest price paid (Matt,
  2026-11-18, A4).
- **Value of a lot** = on hand × its cost per lb. A lot with **no costed receipt** (opening
  amounts, hand receipts, every D60 lot) uses the **current price of its supplier's offer** for the
  product ÷ sack size, and is marked **estimated**; with no offer price it has no value ("—") and
  is listed as unvalued.
- **As of a date** (decision 37): on hand = the lot's movements dated on or before it; cost = its
  most recent costed receipt dated on or before that date; the estimate uses the offer price in effect on that date.

### 3.5 Reorder (minimum on hand)

- `ingredient_products.min_on_hand_sacks` (whole sacks, nullable = no minimum). Set on the product
  page by any Brewery member.
- For each product with a minimum, using its **reorder offer** (the offer on its most recent order,
  else its first active offer; changeable on the To order list):
  - on hand = non-expired on-hand lb ÷ the reorder offer's sack size;
  - on order = sacks on open order lines for the product (any supplier);
  - **to order = ⌈minimum − on hand − on order⌉**, shown only when above 0.
- **Below minimum** (on hand < minimum) is marked on the Grains list and the product page.
- D63 adds future brews' need to the same calculation.

### 3.6 Totals

- **Inventory totals:** one row per maltster product with stock: grain, maltster, category,
  **lb on hand**, sacks (that product's lots' sack size; "—" when its lots differ), **$ value**,
  **$/lb**, estimated / unvalued marks; a **grand total** row of lb and $. **As of** date (default
  today, not after today). Filters: supplier (the lots' supplier), maltster, category. Expired stock
  is included and its lb shown in its own column.
- **Order totals:** one row per order line in the date range: order date, supplier, reference,
  product, status, sacks ordered, sacks received, lb, $ (decision 35); totals per supplier and a
  grand total. Filters: supplier, status (open / received / cancelled; cancelled excluded by
  default), date range (order date).
- Both are plain tables with a **Copy** button that puts the visible rows (with headers and the
  total row) on the clipboard as tab-separated text, numbers without units or thousands
  separators, so they paste as columns.

## 4. Screens

Under **Brewery → Ingredients** (Brewery members and owners), new tabs/pages:

1. **Orders:** list (open first, then recent received and cancelled; filter by supplier and
   status), **New order**, the order page (header, lines, running total and target progress,
   **Receive**, **Edit**, **Cancel**), the Receive dialog (§3.3).
2. **Contracts:** by year (default this year): one card per supplier with its lines (product,
   contracted, on order, received, remaining, $), **over** marked; **New contract** / edit for
   owners and Brewery managers only (others read). **Shortfall** view for a year: every product
   with contracted > received, sorted by shortfall.
3. **To order:** products below or near their minimum (§3.5) with on hand, minimum, on order, to
   order, reorder offer; select rows → **Start an order** makes one open order per supplier with
   those lines (sacks = to order, current price). Saving it places it.
4. **Totals:** Inventory and Orders (§3.6), each with its filters and Copy.
5. **Product page** (D60) gains: minimum on hand (edit), the below-minimum mark, the open orders
   for the product, and lot value in the lots table.
6. **Companies** (D60): suppliers get **order target (sacks)**.
7. **Phone width:** lists become cards; the order, Receive and contract dialogs full screen; the
   totals tables scroll inside their card (no page sideways scroll). Copy works on phones (copies
   text; paste happens elsewhere).

## 5. D60 carry-over

1. **B8 race:** cherry-pick `0299732` (the lot dialog reads the live lot; Delete disabled by either
   query; vitest; B8 hardened).
2. **Company and category Delete** disabled with the reason when in use (a company with roles in
   use, offers, lots, contracts or orders; a category with grains or children), as lots do; the API
   refusal stays.
3. **"On hand · X expired"** reads the same everywhere: on hand shown as usable + expired
   ("11 sacks 50 lb usable · 43 lb expired") in the header, list, Count and Record movement.
4. **Extra decimals** are refused with "Use at most N decimals" (N = the field's decimals: lb 2,
   extract 1, color 2, …), not rounded silently.
5. **Duplicate lot #** within a product refused (§3.3); the recipe lot picker leaves out expired
   lots (an expired lot already on a recipe line stays shown); **Add field** hidden on Grains and
   its children.
6. A price dated "today" late in the Colorado evening is current (a test at 23:30 Colorado = next
   UTC day).

## 6. Data and release

- New tables and columns are additive (§3); no data is copied. Existing lots have no cost (they
  value at the estimate).
- Rollback to `v2026.11.18` is image-only (the old code ignores the new tables and columns).
- No device, notification or schedule changes.

## 7. Assumptions (lead; confirmed by Matt 2026-11-18)

- **A1** One contract per supplier per year.
- **A2** A contract price is effective Jan 1 of its year, or the day it's entered if that's later
  (never backdated into price history).
- **A3** "Previous lot" = the product's most recently received non-expired lot with the offer's
  sack size; if the sack size differs, a new lot # is needed.
- **A4** ~~weighted average~~ → **decided (Matt, 2026-11-18):** a topped-up lot is valued at its most
  recent price paid.
- **A5** Contract "ordered" and "received" count by order date and received date within the
  contract year.

## 8. Persona scenarios

- As `breweryMgr`, create the 2027 BSG contract: Rahr 2-Row 200 sacks at $42.00, Weyermann
  Pilsner 40 sacks at $55.00. The BSG offers' price history shows $42.00 / $55.00 effective
  2027-01-01 "Contract 2027". As `brewer1`, the contract is visible but has no New/Edit.
- As `brewer1`, new BSG order: Rahr 2-Row 30 sacks, Weyermann Pilsner 6 sacks; prices default to
  the current offer prices; the running total says 36 sacks, 1,980 lb and "36 of 40 sacks"; add 4
  sacks → "40 of 40". Save: the order is open and the contract shows 30 / 6 on order.
- As `brewer2`, change the open order (Pilsner 6 → 8), then cancel another open order; a received
  order can't be edited or cancelled.
- As `brewer1`, **Receive** the order in full: Rahr goes into the product's previous lot (its
  received date unchanged), Pilsner into a new lot #W123 with specs from the standard. On hand rises
  by the received lb; the contract shows received 30 / 8, remaining 170 / 32; the lots carry cost.
- Receive another order short (ordered 10, received 8): the order is received and closed showing
  both numbers; inventory and the contract count 8.
- Split a received line across two lot numbers (6 + 4); the rows must add to the sacks received.
- An **off-contract** BSG order for Rahr 2-Row, received: inventory rises; the contract's received
  doesn't change.
- Received beyond the contract (210 of 200): shown "over by 10", nothing refused. The **shortfall**
  view for the year lists Pilsner (40 − 8 = 32 short).
- As `brewer2`, set Weyermann Pilsner's minimum to 3 sacks with 6 on hand and none on order: not
  below minimum; record use down to 2 sacks: the Grains list and product page mark it below
  minimum, and **To order** shows 1. With 4 sacks on an open order it shows nothing to order.
  **Start an order** from To order makes an open order for the reorder offer's supplier.
- **Inventory totals** as `owner`: rows per product in lb and $, the grand total; a D60 lot with no
  cost shows its value at the offer price, marked estimated. Filter by supplier BSG. Set **As of**
  to before the last receipt: on hand and value drop by it. **Copy** and paste into a spreadsheet:
  columns line up, numbers are plain.
- **Order totals**: filter by supplier and date range; open orders count sacks ordered, received
  ones sacks received.
- As `bartender1`, none of the new pages are in the nav and every new route is 403; as
  `breweryDevice`, every new route is 403.
- At 360 px (touch), the order page, Receive dialog, To order and totals have no sideways scroll;
  a slow-network double-click on Save in New order and Receive writes once.
- Carry-over: company in use → Delete disabled with the reason; `1.555` lb → "Use at most 2
  decimals"; on hand reads "usable · expired" the same in the header, Count and Record movement; a
  second lot with an existing lot # is refused; an expired lot isn't offered in the recipe lot
  picker.

## Amendments (Matt, 2026-11-18, local QA)

- **Open orders by expected year (gap 2, 2a):** an open on-contract order counts as **on order** on
  the contract of the year it's expected (its expected date, else its order date); once received it
  counts by received date (A5 otherwise unchanged).
- **Sack sizes on one line (gap 17, 17a):** a contract line counts every on-contract order and
  receipt of its product from its supplier, **converted by weight to the line's sack size**
  (525 lb against a 50 lb line = 10.5 sacks); figures may show half sacks; $ stay at line prices.
- **Totals remaining (gap 3):** a contract's total remaining is the sum of what's still owed per line
  (matches Shortfall); over-deliveries are shown separately, never netted.
- **Reorder offer (gap 4):** the offer chosen on To order is saved on the product.
- **Received date (gap 12):** can't be before the order date.
- **Contract delete (gap 18):** disabled with the reason once anything was received against it.

