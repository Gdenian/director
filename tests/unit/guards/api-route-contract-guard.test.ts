import { describe, expect, it } from 'vitest'
import {
  API_HANDLER_ALLOWLIST,
  PUBLIC_ROUTE_ALLOWLIST,
  inspectRouteContract,
} from '../../../scripts/guards/api-route-contract-guard.mjs'

describe('api route contract guard', () => {
  it('allows explicit public and framework-managed exceptions', () => {
    expect(API_HANDLER_ALLOWLIST.has('src/app/api/auth/[...nextauth]/route.ts')).toBe(true)
    expect(PUBLIC_ROUTE_ALLOWLIST.has('src/app/api/system/boot-id/route.ts')).toBe(true)
    expect(
      inspectRouteContract(
        'src/app/api/system/boot-id/route.ts',
        'export async function GET() { return Response.json({ bootId: "x" }) }',
      ),
    ).toEqual([])
  })

  it('passes protected routes that use apiHandler and explicit auth', () => {
    const content = `
      import { requireUserAuth } from '@/lib/api-auth'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        await requireUserAuth()
        return Response.json({ ok: true })
      })
    `

    expect(inspectRouteContract('src/app/api/user/secure/route.ts', content)).toEqual([])
  })

  it('passes admin routes that use apiHandler and admin auth', () => {
    const adminContent = `
      import { requireAdminAuth } from '@/lib/api-auth'
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => {
        await requireAdminAuth()
        return Response.json({ ok: true })
      })
    `
    const ownerContent = `
      import { requireOwnerAuth } from '@/lib/api-auth'
      import { apiHandler } from '@/lib/api-errors'
      export const POST = apiHandler(async () => {
        await requireOwnerAuth()
        return Response.json({ ok: true })
      })
    `

    expect(inspectRouteContract('src/app/api/admin/overview/route.ts', adminContent)).toEqual([])
    expect(inspectRouteContract('src/app/api/admin/users/[userId]/route.ts', ownerContent)).toEqual([])
  })

  it('flags protected routes that skip apiHandler or auth', () => {
    const missingApiHandler = `
      import { requireUserAuth } from '@/lib/api-auth'
      export async function GET() {
        await requireUserAuth()
        return Response.json({ ok: true })
      }
    `
    const missingAuth = `
      import { apiHandler } from '@/lib/api-errors'
      export const GET = apiHandler(async () => Response.json({ ok: true }))
    `

    expect(inspectRouteContract('src/app/api/user/secure/route.ts', missingApiHandler)).toEqual([
      'src/app/api/user/secure/route.ts missing apiHandler wrapper',
    ])
    expect(inspectRouteContract('src/app/api/user/secure/route.ts', missingAuth)).toEqual([
      'src/app/api/user/secure/route.ts missing requireUserAuth/requireProjectAuth/requireProjectAuthLight/requireAdminAuth/requireOwnerAuth',
    ])
  })
})
