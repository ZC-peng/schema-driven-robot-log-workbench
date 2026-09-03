import { describe, expect, it } from 'vitest'
import {
  clampItemIndex,
  clampScrollOffset,
  getFixedVisibleRange,
  getIndexForScrollOffset,
  getMaxScrollOffset,
  getRangeTranslateOffset,
  getScrollOffsetForIndex,
  getTotalHeight,
  type FixedVirtualListOptions,
} from '../src'

function range(
  overrides: Partial<FixedVirtualListOptions> = {},
): ReturnType<typeof getFixedVisibleRange> {
  return getFixedVisibleRange({
    itemCount: 100,
    itemHeight: 20,
    viewportHeight: 100,
    scrollTop: 0,
    overscan: 2,
    ...overrides,
  })
}

describe('getFixedVisibleRange', () => {
  it('handles empty, one-item, and viewport-sized lists', () => {
    expect(range({ itemCount: 0 })).toEqual({ start: 0, end: 0 })
    expect(range({ itemCount: 1 })).toEqual({ start: 0, end: 1 })
    expect(range({ itemCount: 5 })).toEqual({ start: 0, end: 5 })
    expect(range({ viewportHeight: 0 })).toEqual({ start: 0, end: 0 })
  })

  it('returns bounded overscan ranges at the top, middle, and bottom', () => {
    expect(range()).toEqual({ start: 0, end: 7 })
    expect(range({ scrollTop: 500 })).toEqual({ start: 23, end: 32 })
    expect(range({ scrollTop: 1_900 })).toEqual({ start: 93, end: 100 })
    expect(range({ scrollTop: 100_000 })).toEqual({ start: 93, end: 100 })
  })

  it('includes both rows at fractional viewport boundaries', () => {
    expect(range({ scrollTop: 1, overscan: 0 })).toEqual({ start: 0, end: 6 })
    expect(
      range({ scrollTop: 19, viewportHeight: 21, overscan: 0 }),
    ).toEqual({ start: 0, end: 2 })
  })

  it.each([30_000, 100_000])(
    'keeps the range bounded for %,d items',
    (itemCount) => {
      const result = range({
        itemCount,
        scrollTop: Math.floor(itemCount / 2) * 20,
        overscan: 4,
      })
      expect(result.end - result.start).toBeLessThanOrEqual(13)
      expect(result.start).toBeGreaterThan(0)
      expect(result.end).toBeLessThan(itemCount)
    },
  )

  it('rejects invalid fixed-list geometry', () => {
    expect(() => range({ itemCount: -1 })).toThrow(RangeError)
    expect(() => range({ itemCount: 1.5 })).toThrow(RangeError)
    expect(() => range({ itemHeight: 0 })).toThrow(RangeError)
    expect(() => range({ viewportHeight: -1 })).toThrow(RangeError)
    expect(() => range({ overscan: -1 })).toThrow(RangeError)
    expect(() => range({ overscan: 0.5 })).toThrow(RangeError)
  })
})

describe('fixed geometry helpers', () => {
  const geometry = {
    itemCount: 100,
    itemHeight: 20,
    viewportHeight: 100,
  }

  it('calculates total height, max offset, and translate offset', () => {
    expect(getTotalHeight(100_000, 24)).toBe(2_400_000)
    expect(getMaxScrollOffset(geometry)).toBe(1_900)
    expect(getRangeTranslateOffset({ start: 25, end: 30 }, 20)).toBe(500)
  })

  it('clamps offsets and indices at both ends', () => {
    expect(clampScrollOffset(-100, geometry)).toBe(0)
    expect(clampScrollOffset(Number.NaN, geometry)).toBe(0)
    expect(clampScrollOffset(240, geometry)).toBe(240)
    expect(clampScrollOffset(Number.POSITIVE_INFINITY, geometry)).toBe(1_900)
    expect(clampItemIndex(-1, 100)).toBe(0)
    expect(clampItemIndex(24.9, 100)).toBe(24)
    expect(clampItemIndex(100, 100)).toBe(99)
    expect(clampItemIndex(0, 0)).toBe(-1)
  })

  it('maps offsets to clamped fixed-height indices', () => {
    expect(getIndexForScrollOffset(0, 100, 20)).toBe(0)
    expect(getIndexForScrollOffset(19.9, 100, 20)).toBe(0)
    expect(getIndexForScrollOffset(20, 100, 20)).toBe(1)
    expect(getIndexForScrollOffset(100_000, 100, 20)).toBe(99)
    expect(getIndexForScrollOffset(0, 0, 20)).toBe(-1)
  })
})

describe('getScrollOffsetForIndex', () => {
  const base = {
    itemCount: 100,
    itemHeight: 20,
    viewportHeight: 100,
    currentScrollTop: 0,
    index: 20,
  }

  it('supports start, center, and end alignment', () => {
    expect(getScrollOffsetForIndex({ ...base, align: 'start' })).toBe(400)
    expect(getScrollOffsetForIndex({ ...base, align: 'center' })).toBe(360)
    expect(getScrollOffsetForIndex({ ...base, align: 'end' })).toBe(320)
  })

  it('uses the smallest movement needed for auto alignment', () => {
    expect(
      getScrollOffsetForIndex({
        ...base,
        index: 18,
        currentScrollTop: 320,
        align: 'auto',
      }),
    ).toBe(320)
    expect(
      getScrollOffsetForIndex({
        ...base,
        index: 15,
        currentScrollTop: 320,
        align: 'auto',
      }),
    ).toBe(300)
    expect(
      getScrollOffsetForIndex({
        ...base,
        index: 25,
        currentScrollTop: 320,
        align: 'auto',
      }),
    ).toBe(420)
  })

  it('clamps target indices and resulting offsets', () => {
    expect(
      getScrollOffsetForIndex({ ...base, index: -10, align: 'center' }),
    ).toBe(0)
    expect(
      getScrollOffsetForIndex({ ...base, index: 10_000, align: 'start' }),
    ).toBe(1_900)
    expect(
      getScrollOffsetForIndex({ ...base, itemCount: 0, align: 'end' }),
    ).toBe(0)
  })
})
