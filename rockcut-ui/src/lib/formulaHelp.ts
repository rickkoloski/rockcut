import type { FormulaHelpContent } from 'datagrid-extended'

export const brewingFormulaHelp: FormulaHelpContent = {
  examples: [
    { formula: '=INVENTORY_ON_HAND(id)', description: 'Current stock level for this ingredient' },
    { formula: '=EST_IBU(recipe_id)', description: 'Estimated bitterness (IBU) for a recipe' },
    { formula: '=EST_OG(recipe_id)', description: 'Estimated original gravity for a recipe' },
    { formula: '=EST_FG(recipe_id)', description: 'Estimated final gravity for a recipe' },
    { formula: '=EST_ABV(recipe_id)', description: 'Estimated alcohol by volume (%) for a recipe' },
    { formula: '=EST_SRM(recipe_id)', description: 'Estimated color (SRM) for a recipe' },
    { formula: '=EST_CALORIES(recipe_id)', description: 'Estimated calories per 12 oz serving' },
    { formula: '=ROUND(EST_ABV(recipe_id), 1)', description: 'ABV rounded to 1 decimal' },
    { formula: '=IF(INVENTORY_ON_HAND(id) > 0, "In Stock", "Out")', description: 'Stock status as text' },
  ],
  tips: [
    'Formulas start with = (e.g. =SUM(quantity))',
    'Use column field names — they autocomplete as you type',
    'EST_IBU, EST_OG, EST_FG, EST_ABV, EST_SRM, and EST_CALORIES call the server for live data',
    'INVENTORY_ON_HAND checks current stock levels from inventory',
    'Combine functions: =ROUND(EST_OG(recipe_id), 3)',
  ],
}
