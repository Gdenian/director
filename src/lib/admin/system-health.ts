import { readAllLogs } from '@/lib/logging/file-writer'
import { prisma } from '@/lib/prisma'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { status: 'ok' as const }
  } catch (error) {
    return { status: 'error' as const, message: errorMessage(error) }
  }
}

async function checkLogs() {
  try {
    const logs = await readAllLogs()
    return logs.length > 0
      ? { status: 'ok' as const }
      : { status: 'empty' as const }
  } catch (error) {
    return { status: 'error' as const, message: errorMessage(error) }
  }
}

export async function getAdminSystemHealth() {
  const [database, logs] = await Promise.all([
    checkDatabase(),
    checkLogs(),
  ])

  return {
    database,
    logs,
    checkedAt: new Date().toISOString(),
  }
}
