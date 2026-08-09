import { useEffect, useState } from 'react';
import { api } from '../api/client';

let cachedName: string | null = null;

export function useCurrencyName() {
  const [name, setName] = useState(cachedName || 'Family Cash');

  useEffect(() => {
    if (cachedName) return;
    api.get<Record<string, string>>('/api/settings').then((s) => {
      const resolved = s.currency_name_resolved || 'Family Cash';
      cachedName = resolved;
      setName(resolved);
    }).catch(() => {});
  }, []);

  return name;
}

export function invalidateCurrencyNameCache() {
  cachedName = null;
}
