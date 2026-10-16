export const LLM_SPEED_OPTIONS = [0.7, 0.8, 0.9, 1.0, 1.1] as const

export type LlmSpeed = (typeof LLM_SPEED_OPTIONS)[number]

export const DEFAULT_LLM_SPEED: LlmSpeed = 0.9

export function normalizeLlmSpeed(value: unknown): LlmSpeed {
  // 注意：Number(null) === 0、Number('') === 0、Number([]) === 0 都是有限数，
  // 若只判断 Number.isFinite 会把它们误当成语速 0 并就近归一化到 0.7。
  // 因此这里必须先排除 null / undefined / 空字符串 / 非数字类型。
  if (value === null || value === undefined) {
    return DEFAULT_LLM_SPEED
  }
  if (typeof value === 'string' && value.trim() === '') {
    return DEFAULT_LLM_SPEED
  }
  if (typeof value !== 'number' && typeof value !== 'string') {
    return DEFAULT_LLM_SPEED
  }

  const speed = Number(value)
  if (!Number.isFinite(speed)) {
    return DEFAULT_LLM_SPEED
  }

  return LLM_SPEED_OPTIONS.reduce((closest, option) => {
    return Math.abs(option - speed) < Math.abs(closest - speed) ? option : closest
  }, DEFAULT_LLM_SPEED)
}
