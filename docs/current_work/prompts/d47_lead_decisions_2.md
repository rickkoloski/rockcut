# D47 lead decisions 2 (after Task 1, `ebe5b4e`)

Your calls in the Task 1 report, all **accepted**:
- The first Brew day is the batch's Brew day with the lowest id (the one copied from the template).
- "Following" stops at a finished step.
- A check-off date in the future is refused (`done_on_future`).
- The extra error codes are fine: `template_incomplete`, `tank_invalid`, `not_brewed`, `days_invalid`, `answer_invalid`, `not_done`, `assignee_invalid`.
- A missing brand, template, brew day or volume comes back as a field error.

**The old Batches page and the Brewery Dashboard's batches grid:** hide schedule batches there. Filter out batches that have `batch_vessels`. Those pages are on their way out, so a schedule batch with a blank number shouldn't show up in them. Do it in Task 2.
