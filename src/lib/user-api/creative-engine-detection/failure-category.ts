import type { DetectionFailureCategory } from './types'

const FAILURE_PRIORITY: Record<DetectionFailureCategory, number> = {
  'key-invalid': 100,
  'balance-insufficient': 90,
  'rate-limited': 80,
  'provider-error': 70,
  'service-unreachable': 60,
  'partial-compatibility': 50,
  'interface-unsupported': 10,
}

export function chooseFailureCategory(
  categories: Array<DetectionFailureCategory | undefined>,
): DetectionFailureCategory | undefined {
  let selected: DetectionFailureCategory | undefined
  for (const category of categories) {
    if (!category) continue
    if (!selected || FAILURE_PRIORITY[category] > FAILURE_PRIORITY[selected]) {
      selected = category
    }
  }
  return selected
}
