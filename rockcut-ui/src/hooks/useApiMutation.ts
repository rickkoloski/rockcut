import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
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

export function useApiDelete(pathFn: (id: number) => string, config: MutationConfig<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await api.delete(pathFn(id))
    },
    onSuccess: () => {
      config.invalidateKeys.forEach((key) => qc.invalidateQueries({ queryKey: key }))
      config.onSuccess?.()
    },
  })
}
