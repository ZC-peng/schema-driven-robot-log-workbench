import type {
  FixedScrollToIndexOptions,
  FixedVirtualListGeometry,
  FixedVirtualListOptions,
  ScrollAlignment,
  VisibleRange,
} from './types'

function assertItemCount(itemCount: number): void {
  if (!Number.isSafeInteger(itemCount) || itemCount < 0) {
    throw new RangeError('itemCount must be a non-negative safe integer')
  }
}

function assertItemHeight(itemHeight: number): void {
  if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
    throw new RangeError('itemHeight must be a finite number greater than zero')
  }
}

function assertViewportHeight(viewportHeight: number): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight < 0) {
    throw new RangeError('viewportHeight must be a finite non-negative number')
  }
}

function assertOverscan(overscan: number): void {
  if (!Number.isSafeInteger(overscan) || overscan < 0) {
    throw new RangeError('overscan must be a non-negative safe integer')
  }
}

function assertGeometry(options: FixedVirtualListGeometry): void {
  assertItemCount(options.itemCount)
  assertItemHeight(options.itemHeight)
  assertViewportHeight(options.viewportHeight)
}

function normalizeOffset(offset: number, maximum: number): number {
  if (Number.isNaN(offset) || offset <= 0) return 0
  if (offset >= maximum) return maximum
  return offset
}

export function getTotalHeight(itemCount: number, itemHeight: number): number {
  assertItemCount(itemCount)
  assertItemHeight(itemHeight)

  const totalHeight = itemCount * itemHeight
  if (!Number.isFinite(totalHeight)) {
    throw new RangeError('total list height must be finite')
  }
  return totalHeight
}

export function getMaxScrollOffset(options: FixedVirtualListGeometry): number {
  assertGeometry(options)
  return Math.max(
    0,
    getTotalHeight(options.itemCount, options.itemHeight) - options.viewportHeight,
  )
}

/** Clamp an arbitrary scroll offset to the scrollable extent of the list. */
export function clampScrollOffset(
  offset: number,
  options: FixedVirtualListGeometry,
): number {
  const maximum = getMaxScrollOffset(options)
  return normalizeOffset(offset, maximum)
}

/** Clamp and integer-normalize an item index. Empty lists use -1 as the sentinel. */
export function clampItemIndex(index: number, itemCount: number): number {
  assertItemCount(itemCount)
  if (itemCount === 0) return -1
  if (Number.isNaN(index) || index <= 0) return 0
  if (index >= itemCount - 1) return itemCount - 1
  return Math.floor(index)
}

/** Return the fixed-height item at an offset, or -1 for an empty list. */
export function getIndexForScrollOffset(
  offset: number,
  itemCount: number,
  itemHeight: number,
): number {
  assertItemCount(itemCount)
  assertItemHeight(itemHeight)
  if (itemCount === 0) return -1

  const normalizedOffset = normalizeOffset(
    offset,
    getTotalHeight(itemCount, itemHeight),
  )
  return Math.min(itemCount - 1, Math.floor(normalizedOffset / itemHeight))
}

/**
 * Calculate the rendered (visible + overscan) range for a fixed-height list.
 * The returned `end` is exclusive.
 */
export function getFixedVisibleRange(
  options: FixedVirtualListOptions,
): VisibleRange {
  assertGeometry(options)
  assertOverscan(options.overscan)

  if (options.itemCount === 0 || options.viewportHeight === 0) {
    return { start: 0, end: 0 }
  }

  const scrollTop = clampScrollOffset(options.scrollTop, options)
  const firstVisible = Math.floor(scrollTop / options.itemHeight)
  // Using the lower viewport edge also includes a partially visible final row.
  const visibleEnd = Math.ceil(
    (scrollTop + options.viewportHeight) / options.itemHeight,
  )

  return {
    start: Math.max(0, firstVisible - options.overscan),
    end: Math.min(options.itemCount, visibleEnd + options.overscan),
  }
}

export function getRangeTranslateOffset(
  range: VisibleRange,
  itemHeight: number,
): number {
  assertItemHeight(itemHeight)
  if (!Number.isSafeInteger(range.start) || range.start < 0) {
    throw new RangeError('range.start must be a non-negative safe integer')
  }
  if (!Number.isSafeInteger(range.end) || range.end < range.start) {
    throw new RangeError('range.end must be a safe integer at least range.start')
  }
  return range.start * itemHeight
}

function getAlignedOffset(
  itemTop: number,
  itemHeight: number,
  viewportHeight: number,
  currentScrollTop: number,
  align: ScrollAlignment,
): number {
  switch (align) {
    case 'start':
      return itemTop
    case 'center':
      return itemTop + itemHeight / 2 - viewportHeight / 2
    case 'end':
      return itemTop + itemHeight - viewportHeight
    case 'auto': {
      if (itemTop < currentScrollTop) return itemTop
      const itemBottom = itemTop + itemHeight
      const viewportBottom = currentScrollTop + viewportHeight
      if (itemBottom > viewportBottom) return itemBottom - viewportHeight
      return currentScrollTop
    }
  }
}

/** Calculate a clamped scroll offset for a fixed-height item. */
export function getScrollOffsetForIndex(
  options: FixedScrollToIndexOptions,
): number {
  assertGeometry(options)
  if (options.itemCount === 0) return 0

  const index = clampItemIndex(options.index, options.itemCount)
  const currentScrollTop = clampScrollOffset(options.currentScrollTop, options)
  const align = options.align ?? 'auto'
  const itemTop = index * options.itemHeight
  const alignedOffset = getAlignedOffset(
    itemTop,
    options.itemHeight,
    options.viewportHeight,
    currentScrollTop,
    align,
  )

  return clampScrollOffset(alignedOffset, options)
}
