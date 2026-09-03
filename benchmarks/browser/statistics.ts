export function roundMilliseconds(value: number): number {
  return Number(value.toFixed(3))
}

export function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  if (values.length === 0) {
    throw new RangeError('Cannot calculate a percentile from an empty sample')
  }
  if (percentileValue < 0 || percentileValue > 1) {
    throw new RangeError('percentileValue must be between zero and one')
  }

  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  const value = sorted[index]
  if (value === undefined) {
    throw new RangeError('Percentile index did not resolve to a sample')
  }
  return roundMilliseconds(value)
}
