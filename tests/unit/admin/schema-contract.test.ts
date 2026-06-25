import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('admin operations schema contract', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')

  function modelBlock(modelName: string) {
    const lines = schema.split('\n')
    const start = lines.findIndex(line => line.trim() === `model ${modelName} {`)
    if (start === -1) throw new Error(`model ${modelName} not found`)
    const end = lines.findIndex((line, index) => index > start && line.trim() === '}')
    if (end === -1) throw new Error(`model ${modelName} end not found`)
    return lines.slice(start, end + 1).join('\n')
  }

  it('stores user operation fields needed for access and grouping', () => {
    const user = modelBlock('User')
    expect(user).toContain('adminGroupKey  String?')
    expect(user).toContain('adminNote      String?')
    expect(user).toContain('sessionVersion Int')
    expect(user).toContain('lastLoginAt    DateTime?')
    expect(user).toContain('lastLoginIp    String?')
    expect(user).toContain('@@index([adminGroupKey])')
    expect(user).toContain('@@index([sessionVersion])')
  })

  it('stores real commercial and model governance records', () => {
    expect(schema).toContain('model AdminRedeemRedemption')
    expect(schema).toContain('model AdminCommercialOrder')
    expect(schema).toContain('model AdminModelChannel')
    expect(schema).toContain('model AdminTaskIncident')
    expect(schema).toContain('model AdminHealthCheckSnapshot')
  })

  it('keeps redeem and order idempotency enforceable by database', () => {
    const redemption = modelBlock('AdminRedeemRedemption')
    const order = modelBlock('AdminCommercialOrder')
    const redeemCode = modelBlock('AdminRedeemCode')

    expect(redemption).toContain('idempotencyKey String')
    expect(redemption).toContain('@@unique([code, userId, idempotencyKey])')
    expect(order).toContain('idempotencyKey  String')
    expect(order).toContain('@@unique([userId, packageKey, idempotencyKey])')
    expect(redeemCode).toContain('singleUserLimit Int')
  })
})
