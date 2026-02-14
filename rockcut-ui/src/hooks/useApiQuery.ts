import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import api from '../lib/api'
import type { ApiResponse } from '../lib/types'

export function useApiQuery<T>(
  queryKey: unknown[],
  path: string,
  params?: Record<string, string | number>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<T>>(path, { params })
      return data.data
    },
    ...options,
  })
}
