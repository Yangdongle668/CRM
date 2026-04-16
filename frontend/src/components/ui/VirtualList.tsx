'use client';

import React, { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

export interface VirtualListProps<T> {
  /** Items currently loaded. */
  items: T[];
  /** Row height in px (fixed). Use `estimateSize` for variable heights. */
  rowHeight?: number;
  /** Alternative to rowHeight: per-row size estimator (for variable rows). */
  estimateSize?: (index: number) => number;
  /** How many extra rows to render above/below the viewport. */
  overscan?: number;
  /** Container max-height (css). Defaults to 70vh. */
  maxHeight?: number | string;
  /** Render a row. Receives the item and its index in `items`. */
  renderRow: (item: T, index: number) => React.ReactNode;
  /** Called when the user scrolls near the bottom. Debounced by the hook. */
  onEndReached?: () => void;
  /** Trigger endReached when within this many pixels of the bottom. */
  endReachedThreshold?: number;
  /** Optional empty state. */
  empty?: React.ReactNode;
  /** Optional footer (e.g. "loading more…"). Rendered inside the scroll container. */
  footer?: React.ReactNode;
  /** Key extractor (defaults to index). */
  getKey?: (item: T, index: number) => string | number;
  /** Optional className for the scroll container. */
  className?: string;
}

/**
 * Windowed virtual list. Only the rows within the viewport (+ overscan)
 * are actually rendered, so the DOM stays small even for 10k+ rows.
 *
 * Pairs with `useInfiniteList` for "infinite scroll": pass `onEndReached`
 * -> `loadMore`.
 */
export function VirtualList<T>({
  items,
  rowHeight = 52,
  estimateSize,
  overscan = 8,
  maxHeight = '70vh',
  renderRow,
  onEndReached,
  endReachedThreshold = 400,
  empty,
  footer,
  getKey,
  className = '',
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: estimateSize ?? (() => rowHeight),
    overscan,
  });

  // "Near bottom" trigger — fires once per crossing.
  const lastTriggerRef = useRef(0);
  useEffect(() => {
    const el = parentRef.current;
    if (!el || !onEndReached) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < endReachedThreshold) {
        const now = Date.now();
        if (now - lastTriggerRef.current > 250) {
          lastTriggerRef.current = now;
          onEndReached();
        }
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onEndReached, endReachedThreshold]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  if (items.length === 0 && empty) {
    return <>{empty}</>;
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
      style={{ maxHeight }}
    >
      <div
        style={{
          height: totalSize,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((vi) => {
          const item = items[vi.index];
          if (item == null) return null;
          return (
            <div
              key={getKey ? getKey(item, vi.index) : vi.index}
              data-index={vi.index}
              ref={estimateSize ? virtualizer.measureElement : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
                // fixed-height fast path
                height: estimateSize ? undefined : rowHeight,
              }}
            >
              {renderRow(item, vi.index)}
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

export default VirtualList;
