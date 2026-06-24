import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('novel promotion episode schema', () => {
  it('stores episode novel text as long text', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8')

    expect(schema).toMatch(/novelText\s+String\?\s+@db\.LongText/)
  })
})
