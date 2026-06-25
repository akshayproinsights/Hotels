import { useQuery } from '@tanstack/react-query'
import { getInventory } from '../api/inventory'

export function useInventory(dateStr: string) {
  return useQuery({
    queryKey: ['inventory', dateStr],
    queryFn: () => getInventory(dateStr),
    refetchInterval: 30000, // Auto-refresh every 30 seconds for real-time dashboard feel
  })
}
