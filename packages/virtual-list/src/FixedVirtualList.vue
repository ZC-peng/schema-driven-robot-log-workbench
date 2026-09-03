<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  clampScrollOffset,
  getFixedVisibleRange,
  getRangeTranslateOffset,
  getScrollOffsetForIndex,
  getTotalHeight,
} from './fixed'
import type {
  FixedVirtualListProps,
  FixedVirtualListSlotProps,
  ScrollAlignment,
  VirtualListController,
  VisibleRange,
} from './types'

defineOptions({ name: 'FixedVirtualList' })

const props = withDefaults(defineProps<FixedVirtualListProps>(), {
  overscan: 4,
  selectedIndex: null,
  initialScrollOffset: 0,
  testId: 'fixed-virtual-list',
})

defineSlots<{
  default(props: FixedVirtualListSlotProps): unknown
}>()

const emit = defineEmits<{
  scrollOffsetChange: [offset: number]
}>()

const viewportElement = ref<HTMLElement | null>(null)
const viewportHeight = ref(0)
const scrollTop = ref(0)
let resizeObserver: ResizeObserver | undefined

const geometry = computed(() => ({
  itemCount: props.itemCount,
  itemHeight: props.itemHeight,
  viewportHeight: viewportHeight.value,
}))

const totalHeight = computed(() =>
  getTotalHeight(props.itemCount, props.itemHeight),
)

const visibleRange = computed(() =>
  getFixedVisibleRange({
    ...geometry.value,
    scrollTop: scrollTop.value,
    overscan: props.overscan,
  }),
)

const translateOffset = computed(() =>
  getRangeTranslateOffset(visibleRange.value, props.itemHeight),
)

const renderedIndexes = computed(() => {
  const { start, end } = visibleRange.value
  return Array.from({ length: end - start }, (_, offset) => start + offset)
})

function itemKey(index: number): string | number {
  return props.itemKey?.(index) ?? index
}

function isSelected(index: number): boolean {
  return props.selectedIndex === index
}

function applyScrollOffset(offset: number): void {
  const nextOffset = clampScrollOffset(offset, geometry.value)
  const changed = scrollTop.value !== nextOffset
  scrollTop.value = nextOffset

  const element = viewportElement.value
  if (element !== null && element.scrollTop !== nextOffset) {
    element.scrollTop = nextOffset
  }
  if (changed) emit('scrollOffsetChange', nextOffset)
}

function measureViewport(): void {
  const element = viewportElement.value
  if (element === null) return

  viewportHeight.value = element.clientHeight
  applyScrollOffset(element.scrollTop)
}

function handleScroll(event: Event): void {
  const element = event.currentTarget
  if (!(element instanceof HTMLElement)) return
  const nextOffset = clampScrollOffset(element.scrollTop, geometry.value)
  if (scrollTop.value === nextOffset) return
  scrollTop.value = nextOffset
  emit('scrollOffsetChange', nextOffset)
}

function scrollToOffset(offset: number): void {
  applyScrollOffset(offset)
}

function scrollToIndex(index: number, align: ScrollAlignment = 'auto'): void {
  applyScrollOffset(
    getScrollOffsetForIndex({
      ...geometry.value,
      index,
      currentScrollTop: scrollTop.value,
      align,
    }),
  )
}

function getVisibleRange(): VisibleRange {
  const { start, end } = visibleRange.value
  return { start, end }
}

const controller: VirtualListController = {
  scrollToIndex,
  scrollToOffset,
  getVisibleRange,
}

defineExpose(controller)

watch(
  () => [props.itemCount, props.itemHeight] as const,
  async () => {
    await nextTick()
    applyScrollOffset(scrollTop.value)
  },
  { flush: 'post' },
)

onMounted(() => {
  measureViewport()
  applyScrollOffset(props.initialScrollOffset)

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(measureViewport)
    const element = viewportElement.value
    if (element !== null) resizeObserver.observe(element)
  } else {
    window.addEventListener('resize', measureViewport)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measureViewport)
})
</script>

<template>
  <div
    ref="viewportElement"
    class="fixed-virtual-list"
    :aria-label="ariaLabel"
    :data-rendered-count="renderedIndexes.length"
    :data-testid="testId"
    :data-visible-end="visibleRange.end"
    :data-visible-start="visibleRange.start"
    role="listbox"
    tabindex="0"
    @scroll="handleScroll"
  >
    <div
      class="fixed-virtual-list__spacer"
      :style="{ height: `${totalHeight}px` }"
    >
      <div
        class="fixed-virtual-list__items"
        :style="{ transform: `translate3d(0, ${translateOffset}px, 0)` }"
      >
        <div
          v-for="index in renderedIndexes"
          :key="itemKey(index)"
          class="fixed-virtual-list__item"
          :class="{ 'fixed-virtual-list__item--selected': isSelected(index) }"
          :aria-selected="isSelected(index)"
          :data-index="index"
          :data-selected="isSelected(index)"
          data-testid="virtual-list-item"
          role="option"
          :style="{ height: `${itemHeight}px` }"
        >
          <slot :index="index" :selected="isSelected(index)" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fixed-virtual-list {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
  contain: strict;
}

.fixed-virtual-list__spacer {
  position: relative;
  width: 100%;
  pointer-events: none;
}

.fixed-virtual-list__items {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  will-change: transform;
}

.fixed-virtual-list__item {
  box-sizing: border-box;
  min-height: 0;
  max-height: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: auto;
}

.fixed-virtual-list__item--selected {
  background: var(--fixed-virtual-list-selected-background, rgb(64 158 255 / 14%));
}
</style>
