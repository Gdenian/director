import { describe, expect, it } from 'vitest'
import { chooseFailureCategory } from '@/lib/user-api/creative-engine-detection/failure-category'

describe('creative engine detection failure categories', () => {
  it('keeps actionable credential and quota failures ahead of unsupported endpoints', () => {
    expect(chooseFailureCategory(['interface-unsupported', 'key-invalid'])).toBe('key-invalid')
    expect(chooseFailureCategory(['service-unreachable', 'rate-limited'])).toBe('rate-limited')
    expect(chooseFailureCategory(['interface-unsupported', 'balance-insufficient'])).toBe('balance-insufficient')
  })

  it('returns undefined when no probe reported a failure category', () => {
    expect(chooseFailureCategory([undefined, undefined])).toBeUndefined()
  })
})
