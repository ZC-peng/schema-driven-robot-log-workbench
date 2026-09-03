export { default as FixedVirtualList } from './FixedVirtualList.vue'
export {
  clampItemIndex,
  clampScrollOffset,
  getFixedVisibleRange,
  getIndexForScrollOffset,
  getMaxScrollOffset,
  getRangeTranslateOffset,
  getScrollOffsetForIndex,
  getTotalHeight,
} from './fixed'
export type {
  FixedScrollToIndexOptions,
  FixedVirtualListGeometry,
  FixedVirtualListOptions,
  FixedVirtualListProps,
  FixedVirtualListSlotProps,
  ScrollAlignment,
  VirtualListController,
  VisibleRange,
} from './types'
