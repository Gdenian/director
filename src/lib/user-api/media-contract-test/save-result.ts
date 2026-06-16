import { prisma } from '@/lib/prisma'
import { parseCreativeModels } from '@/lib/creative-engine/persisted-config'
import { mediaCapabilityStatusKey } from '@/lib/media-contract/status'
import type { MediaContract } from '@/lib/media-contract/types'
import type { SaveMediaContractTestResultInput, SaveMediaContractTestResultOutput } from './types'
import { assertMediaContractTestCapability } from './validate'

export async function saveMediaContractTestResult(
  input: SaveMediaContractTestResultInput,
): Promise<SaveMediaContractTestResultOutput> {
  const pref = await prisma.userPreference.findUnique({
    where: { userId: input.userId },
    select: {
      customModels: true,
      customProviders: true,
    },
  })
  const models = parseCreativeModels(pref?.customModels)
  const index = models.findIndex((model) => model.modelKey === input.modelKey)
  if (index < 0) {
    throw new Error('MEDIA_TEST_MODEL_NOT_FOUND')
  }

  const model = models[index]
  if (!model?.mediaContract) {
    throw new Error('MEDIA_TEST_MODEL_NOT_FOUND')
  }
  assertMediaContractTestCapability(model.mediaContract, input.capability)

  const checkedAt = new Date().toISOString()
  const statusKey = mediaCapabilityStatusKey(input.capability)
  const mediaContract: MediaContract = {
    ...model.mediaContract,
    testStatus: {
      ...(model.mediaContract.testStatus || {}),
      [statusKey]: input.status,
    },
    checkedAt,
  }
  const nextModels = models.map((item, itemIndex) => itemIndex === index
    ? {
      ...item,
      mediaContract,
      mediaContractCheckedAt: checkedAt,
    }
    : item)

  await prisma.userPreference.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      customProviders: pref?.customProviders || JSON.stringify([]),
      customModels: JSON.stringify(nextModels),
    },
    update: {
      customModels: JSON.stringify(nextModels),
    },
  })

  return {
    mediaContract,
    mediaContractCheckedAt: checkedAt,
    ...(model.mediaContractSource ? { mediaContractSource: model.mediaContractSource } : {}),
  }
}
