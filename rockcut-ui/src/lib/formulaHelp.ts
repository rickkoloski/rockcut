import type { FormulaHelpContent } from 'datagrid-extended'

export const brewingFormulaHelp: FormulaHelpContent = {
  examples: [
    { formula: '=INVENTORY_ON_HAND(id)', description: 'Current stock level for this ingredient' },
    { formula: '=EST_IBU(recipe_id)', description: 'Estimated bitterness (IBU) for a recipe' },
    { formula: '=EST_OG(recipe_id)', description: 'Estimated original gravity for a recipe' },
    { formula: '=SUM(quantity)', description: 'Total quantity across all rows' },
    { formula: '=ROUND(amount * rate, 2)', description: 'Calculated cost rounded to 2 decimals' },
    { formula: '=IF(active, "Yes", "No")', description: 'Display active status as text' },
  ],
  tips: [
    'Formulas start with = (e.g. =SUM(quantity))',
    'Use column field names — they autocomplete as you type',
    'INVENTORY_ON_HAND, EST_IBU, and EST_OG call the server for live data',
    'Combine functions: =ROUND(EST_OG(recipe_id), 3)',
  ],
}
