import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { YeastStrainType } from '../lib/types'

export interface StrainTypesReply {
  data: YeastStrainType[]
  /** Brewery managers and owners change the list; everyone else reads it. */
  can_manage: boolean
}

export const STRAIN_TYPES_KEY = ['yeast_strain_types']

/** D64 (A13): the Strain Type list with whether this person may change it. */
export function useStrainTypes() {
  return useQuery<StrainTypesReply>({
    queryKey: STRAIN_TYPES_KEY,
    queryFn: async () => (await api.get<StrainTypesReply>('/api/yeast/strain_types')).data,
  })
}
