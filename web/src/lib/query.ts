import { useCallback, useEffect, useRef, useState } from 'react';

interface Entry {
  data: unknown;
  error: Error | null;
  updatedAt: number;
  promise: Promise<unknown> | null;
  listeners: Set<() => void>;
}

const store = new Map<string, Entry>();

function getEntry(key: string): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = { data: undefined, error: null, updatedAt: 0, promise: null, listeners: new Set() };
    store.set(key, entry);
  }
  return entry;
}

function notify(entry: Entry) {
  entry.listeners.forEach((listener) => listener());
}

export function setQueryData<T>(key: string, data: T) {
  const entry = getEntry(key);
  entry.data = data;
  entry.error = null;
  entry.updatedAt = Date.now();
  notify(entry);
}

export function setQueryError(key: string, error: Error) {
  const entry = getEntry(key);
  entry.error = error;
  notify(entry);
}

export function getQueryData<T>(key: string): T | undefined {
  return store.get(key)?.data as T | undefined;
}

export function invalidateQuery(key: string) {
  const entry = store.get(key);
  if (!entry) return;
  entry.updatedAt = 0;
  notify(entry);
}

export function invalidateQueriesWithPrefix(prefix: string) {
  for (const key of store.keys()) {
    if (key === prefix || key.startsWith(prefix)) {
      invalidateQuery(key);
    }
  }
}

/** Fill a cache key without marking it fresh, so useQuery can paint immediately and still refetch. */
export function seedQueryData<T>(key: string, data: T) {
  const entry = getEntry(key);
  if (entry.data !== undefined) return;
  entry.data = data;
  entry.error = null;
  notify(entry);
}

export function invalidateAllQueries() {
  for (const key of store.keys()) {
    invalidateQuery(key);
  }
}

const refreshListeners = new Set<() => void>();

export function subscribeQueryRefresh(listener: () => void) {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/** Stale every cached query and ping non-query pages so the current view refetches in place. */
export function refreshVisibleQueries() {
  invalidateAllQueries();
  refreshListeners.forEach((listener) => listener());
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts?: { staleTime?: number; enabled?: boolean },
) {
  const staleTime = opts?.staleTime ?? 15_000;
  const enabled = opts?.enabled ?? true;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [, bump] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    const entry = getEntry(key);
    const listener = () => {
      bump((n) => n + 1);
      setTick((n) => n + 1);
    };
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
    };
  }, [key]);

  useEffect(() => {
    if (!key || !enabled) return;
    const entry = getEntry(key);
    const fresh = entry.data !== undefined && Date.now() - entry.updatedAt < staleTime;
    if (fresh || entry.promise) return;
    entry.promise = fetcherRef.current()
      .then((data) => {
        entry.data = data;
        entry.error = null;
        entry.updatedAt = Date.now();
        entry.promise = null;
        notify(entry);
        return data;
      })
      .catch((err) => {
        entry.error = err instanceof Error ? err : new Error(String(err));
        entry.promise = null;
        notify(entry);
      });
  }, [key, enabled, staleTime, tick]);

  const entry = key ? store.get(key) : undefined;
  const refetch = useCallback(() => {
    if (!key) return;
    invalidateQuery(key);
    bump((n) => n + 1);
  }, [key]);

  return {
    data: (entry?.data as T | undefined),
    error: entry?.error ?? null,
    loading: Boolean(key && enabled && entry?.data === undefined && !entry?.error),
    refetch,
  };
}
