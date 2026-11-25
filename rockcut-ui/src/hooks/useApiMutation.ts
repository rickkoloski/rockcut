import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { dropWhenLeft } from '../lib/dropWhenLeft'
import type { ApiResponse } from '../lib/types'

interface MutationConfig<T> {
  invalidateKeys: unknown[][]
  onSuccess?: (data: T) => void
}

export function useApiCreate<T>(path: string, config: MutationConfig<T>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.post<ApiResponse<T>>(path, body)
      return data.data
    },
    onSuccess: (data) => {
      config.invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      config.onSuccess?.(data)
    },
  })
}

export function useApiUpdate<T>(pathFn: (id: number) => string, config: MutationConfig<T>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      const { data } = await api.put<ApiResponse<T>>(pathFn(id), body)
      return data.data
    },
    onSuccess: (data) => {
      config.invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      config.onSuccess?.(data)
    },
  })
}

interface DeleteConfig extends MutationConfig<void> {
  /**
   * The deleted row's own detail query, on the page a delete leaves: the page
   * isn't refetched (a 404) on its way out, and once it's left the row is
   * forgotten, so Back says "not found" (D63, local QA gap 3).
   */
  rowKey?: (id: number) => unknown[]
}

export function useApiDelete(pathFn: (id: number) => string, config: DeleteConfig) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(pathFn(id))
    },
    onSuccess: (_data, id) => {
      const row = config.rowKey?.(id)
      const rowHash = row && hashKey(row)
      config.invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key, predicate: (q) => q.queryHash !== rowHash }))
      if (row) dropWhenLeft(qc, row)
      config.onSuccess?.()
    },
  })
}
