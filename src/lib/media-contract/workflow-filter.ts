import { mediaCapabilityStatusKey } from './status'
import type { MediaCapability, MediaContract } from './types'

type ModelOptionWithMediaContract = {
  mediaContract?: MediaContract
}

type WorkflowFilterOptions = {
  includeUnverified?: boolean
}

type UnverifiedOption<T> = T & { unverified: true }

export function filterModelOptionsForWorkflowCapability<T extends ModelOptionWithMediaContract>(
  options: T[],
  capability: MediaCapability,
  filterOptions: WorkflowFilterOptions = {},
): Array<T | UnverifiedOption<T>> {
  const statusKey = mediaCapabilityStatusKey(capability)

  return options.flatMap((option) => {
    const contract = option.mediaContract
    if (!contract) {
      return filterOptions.includeUnverified
        ? [{ ...option, unverified: true as const }]
        : []
    }

    if (!contract.capabilities.includes(capability)) return []
    if (contract.executor === 'official-adapter') return [option]
    return contract.testStatus?.[statusKey] === 'passed' ? [option] : []
  })
}
