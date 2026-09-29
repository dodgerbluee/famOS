import { api } from '../api/client';
import { useQuery } from '../lib/query';

export function useCurrencyName() {
  const { data: settings } = useQuery<Record<string, string>>(
    '/api/settings',
    () => api.get<Record<string, string>>('/api/settings'),
    { staleTime: 60_000 },
  );
  return settings?.currency_name_resolved || 'Family Cash';
}

export function invalidateCurrencyNameCache() {
  // query cache is the source of truth
}
