export type ScrollAlignment = 'start' | 'center' | 'end' | 'auto'

export interface VisibleRange {
  /** First rendered item index (inclusive). */
  start: number
  /** Last rendered item index (exclusive). */
  end: number
}

export interface VirtualListController {
  scrollToIndex(index: number, align?: ScrollAlignment): void
  scrollToOffset(offset: number): void
  getVisibleRange(): VisibleRange
}

export interface FixedVirtualListGeometry {
  itemCount: number
  itemHeight: number
  viewportHeight: number
}

export interface FixedVirtualListOptions extends FixedVirtualListGeometry {
  scrollTop: number
  overscan: number
}

export interface FixedScrollToIndexOptions extends FixedVirtualListGeometry {
  index: number
  currentScrollTop: number
  align?: ScrollAlignment
}

export interface FixedVirtualListProps {
  itemCount: number
  itemHeight: number
  overscan?: number
  itemKey?: (index: number) => string | number
  selectedIndex?: number | null
  initialScrollOffset?: number
  ariaLabel?: string
  testId?: string
}

export interface FixedVirtualListSlotProps {
  index: number
  selected: boolean
}
