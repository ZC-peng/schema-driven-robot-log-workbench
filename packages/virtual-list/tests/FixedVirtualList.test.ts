// @vitest-environment happy-dom

import { mount, type VueWrapper } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FixedVirtualList from '../src/FixedVirtualList.vue'
import type { VirtualListController } from '../src'

let resizeCallback: ResizeObserverCallback | undefined

class ResizeObserverStub {
  public constructor(callback: ResizeObserverCallback) {
    resizeCallback = callback
  }

  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}

async function setViewportHeight(
  wrapper: VueWrapper,
  height: number,
): Promise<HTMLElement> {
  const element = wrapper.get('[data-testid="fixed-virtual-list"]').element
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('virtual-list root must be an HTMLElement')
  }

  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: height,
  })
  resizeCallback?.([], {} as ResizeObserver)
  await nextTick()
  return element
}

function mountList(
  itemCount: number,
  extraProps: Record<string, unknown> = {},
): VueWrapper {
  return mount(FixedVirtualList, {
    props: {
      itemCount,
      itemHeight: 20,
      overscan: 2,
      ...extraProps,
    },
    slots: {
      default: ({ index, selected }: { index: number; selected: boolean }) =>
        h('span', { 'data-slot-selected': selected }, `row ${index}`),
    },
  })
}

function controller(wrapper: VueWrapper): VirtualListController {
  return wrapper.vm as unknown as VirtualListController
}

beforeEach(() => {
  resizeCallback = undefined
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FixedVirtualList', () => {
  it.each([0, 1, 5])('renders the bounded range for %i items', async (count) => {
    const wrapper = mountList(count)
    await setViewportHeight(wrapper, 100)

    expect(wrapper.findAll('[data-testid="virtual-list-item"]')).toHaveLength(
      count,
    )
    expect(wrapper.attributes('data-rendered-count')).toBe(String(count))
    wrapper.unmount()
  })

  it.each([30_000, 100_000])(
    'does not create one DOM row per item for %,d rows',
    async (count) => {
      const wrapper = mountList(count)
      const element = await setViewportHeight(wrapper, 100)

      expect(wrapper.findAll('[data-testid="virtual-list-item"]')).toHaveLength(7)
      expect(element.style.overflow).not.toBe('visible')
      expect(wrapper.get('.fixed-virtual-list__spacer').attributes('style')).toContain(
        `height: ${count * 20}px`,
      )
      wrapper.unmount()
    },
  )

  it('keeps the DOM bounded at top, middle, and bottom', async () => {
    const wrapper = mountList(100_000)
    const element = await setViewportHeight(wrapper, 100)

    const assertBounded = (): void => {
      expect(wrapper.findAll('[data-testid="virtual-list-item"]').length).toBeLessThanOrEqual(
        9,
      )
    }

    assertBounded()
    element.scrollTop = 1_000_000
    element.dispatchEvent(new Event('scroll'))
    await nextTick()
    assertBounded()
    expect(controller(wrapper).getVisibleRange()).toEqual({
      start: 49_998,
      end: 50_007,
    })

    element.scrollTop = 1_999_900
    element.dispatchEvent(new Event('scroll'))
    await nextTick()
    assertBounded()
    expect(controller(wrapper).getVisibleRange()).toEqual({
      start: 99_993,
      end: 100_000,
    })
    wrapper.unmount()
  })

  it('settles on the final range after rapid scrolling', async () => {
    const wrapper = mountList(100_000)
    const element = await setViewportHeight(wrapper, 100)

    for (const offset of [50, 5_000, 100_000, 999_999, 1_500_000]) {
      element.scrollTop = offset
      element.dispatchEvent(new Event('scroll'))
    }
    await nextTick()

    expect(controller(wrapper).getVisibleRange()).toEqual({
      start: 74_998,
      end: 75_007,
    })
    expect(wrapper.attributes('data-rendered-count')).toBe('9')
    wrapper.unmount()
  })

  it('exposes clamped offset and all index alignments', async () => {
    const wrapper = mountList(100)
    const element = await setViewportHeight(wrapper, 100)
    const list = controller(wrapper)

    list.scrollToIndex(20, 'start')
    expect(element.scrollTop).toBe(400)
    list.scrollToIndex(20, 'center')
    expect(element.scrollTop).toBe(360)
    list.scrollToIndex(20, 'end')
    expect(element.scrollTop).toBe(320)

    list.scrollToOffset(320)
    list.scrollToIndex(18, 'auto')
    expect(element.scrollTop).toBe(320)
    list.scrollToIndex(15, 'auto')
    expect(element.scrollTop).toBe(300)
    list.scrollToOffset(320)
    list.scrollToIndex(25, 'auto')
    expect(element.scrollTop).toBe(420)

    list.scrollToOffset(-1)
    expect(element.scrollTop).toBe(0)
    list.scrollToOffset(Number.POSITIVE_INFINITY)
    expect(element.scrollTop).toBe(1_900)
    wrapper.unmount()
  })

  it('uses ResizeObserver updates and marks the selected slot row', async () => {
    const wrapper = mountList(100, { selectedIndex: 3 })
    await setViewportHeight(wrapper, 100)

    const selected = wrapper.get('[data-index="3"]')
    expect(selected.attributes('data-selected')).toBe('true')
    expect(selected.attributes('aria-selected')).toBe('true')
    expect(selected.classes()).toContain('fixed-virtual-list__item--selected')
    expect(selected.get('span').attributes('data-slot-selected')).toBe('true')

    await setViewportHeight(wrapper, 200)
    expect(wrapper.findAll('[data-testid="virtual-list-item"]')).toHaveLength(12)
    wrapper.unmount()
  })
})
