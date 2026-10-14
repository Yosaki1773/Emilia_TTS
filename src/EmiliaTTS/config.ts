export const LLM_SPEED_OPTIONS = [0.7, 0.8, 0.9, 1.0, 1.1] as const

export type LlmSpeed = (typeof LLM_SPEED_OPTIONS)[number]

export const DEFAULT_LLM_SPEED: LlmSpeed = 0.9

export function normalizeLlmSpeed(value: unknown): LlmSpeed {
  const speed = Number(value)
  if (!Number.isFinite(speed)) {
    return DEFAULT_LLM_SPEED
  }

  return LLM_SPEED_OPTIONS.reduce((closest, option) => {
    return Math.abs(option - speed) < Math.abs(closest - speed) ? option : closest
  }, DEFAULT_LLM_SPEED)
}
