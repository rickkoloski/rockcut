import type { RemoteFunctions } from 'datagrid-extended'
import api from '../lib/api'

const FORMULAS_BASE = '/api/formulas'

export function useFormulaFunctions() {
  const remoteFunctions: RemoteFunctions = {
    INVENTORY_ON_HAND: async (ingredientId: number) => {
      const { data } = await api.post(`${FORMULAS_BASE}/execute`, {
        calls: [{ function: 'inventory_on_hand', args: { ingredient_id: ingredientId } }],
      })
      const result = data.results[0]
      if (result.status === 'error') throw new Error(result.message)
      return result.value
    },

    EST_IBU: async (recipeId: number) => {
      const { data } = await api.post(`${FORMULAS_BASE}/execute`, {
        calls: [{ function: 'est_ibu', args: { recipe_id: recipeId } }],
      })
      const result = data.results[0]
      if (result.status === 'error') throw new Error(result.message)
      return result.value
    },

    EST_OG: async (recipeId: number) => {
      const { data } = await api.post(`${FORMULAS_BASE}/execute`, {
        calls: [{ function: 'est_og', args: { recipe_id: recipeId } }],
      })
      const result = data.results[0]
      if (result.status === 'error') throw new Error(result.message)
      return result.value
    },
  }

  return { remoteFunctions }
}
