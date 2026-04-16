'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface InfiniteListPage<T> {
  items: T[];
  total: number;
}

export interface UseInfiniteListOptions<T> {
  /** Page size (rows per network request). */
  pageSize?: number;
  /** Fetch a page — return `{ items, total }`. Called with 1-based page number. */
  fetchPage: (page: number, pageSize: number) => Promise<InfiniteListPage<T>>;
  /** Any value that, when changed, resets the list (e.g. filters). */
  deps?: unknown[];
}

export interface InfiniteListState<T> {
  items: T[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  /** Load the next page. Safe to call multiple times — will coalesce. */
  loadMore: () => Promise<void>;
  /** Reload from page 1. */
  refresh: () => Promise<void>;
  /** Optimistically mutate the local items array. */
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
}

/**
 * Generic "infinite scroll" list manager: fetches pages on demand, keeps
 * a running `items[]` and `total`, and exposes `loadMore()` which callers
 * can wire into a scroll-near-bottom trigger.
 *
 * Resets whenever any value in `deps` changes (e.g. filters / search).
 */
export function useInfiniteList<T>({
  pageSize = 50,
  fetchPage,
  deps = [],
}: UseInfiniteListOptions<T>): InfiniteListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Guards against overlapping fetches and stale-closure bugs.
  const inflight = useRef<Promise<void> | null>(null);
  const pageRef = useRef(0);
  const totalRef = useRef(0);

  const hasMore = items.length < total || page === 0;

  const loadPage = useCallback(
    async (target: number, replace = false) => {
      if (inflight.current) return inflight.current;
      const isFirst = target === 1;
      if (isFirst) setLoading(true);
      else setLoadingMore(true);

      const p = (async () => {
        try {
          const res = await fetchPage(target, pageSize);
          setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
          setTotal(res.total);
          totalRef.current = res.total;
          setPage(target);
          pageRef.current = target;
          setError(null);
        } catch (err) {
          setError(err as Error);
        } finally {
          if (isFirst) setLoading(false);
          else setLoadingMore(false);
          inflight.current = null;
        }
      })();
      inflight.current = p;
      return p;
    },
    [fetchPage, pageSize],
  );

  const refresh = useCallback(() => loadPage(1, true), [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore) return;
    const loaded = items.length;
    if (loaded >= totalRef.current && pageRef.current > 0) return;
    await loadPage(pageRef.current + 1);
  }, [items.length, loading, loadingMore, loadPage]);

  // Initial + deps-driven reload.
  useEffect(() => {
    pageRef.current = 0;
    totalRef.current = 0;
    setItems([]);
    setTotal(0);
    setPage(0);
    void loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    setItems,
  };
}
