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

/**
 * D52 (task 4063): a list endpoint. Anything but an array in the reply
 * (`{"data": null}`, an object) reads as an empty list, so a bad reply leaves
 * the page empty instead of crashing it to the full-screen error.
 */
export function useApiList<T>(
  queryKey: unknown[],
  path: string,
  params?: Record<string, string | number>,
  options?: Omit<UseQueryOptions<T[]>, 'queryKey' | 'queryFn' | 'select'>
) {
  return useApiQuery<T[]>(queryKey, path, params, { ...options, select: asList })
}

const asList = <T,>(data: T[]): T[] => (Array.isArray(data) ? data : [])
