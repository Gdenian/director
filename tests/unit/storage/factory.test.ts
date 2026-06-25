import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorageProvider } from '@/lib/storage/factory'
import { StorageConfigError, StorageProviderNotImplementedError } from '@/lib/storage/errors'

describe('storage factory', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('creates local provider when STORAGE_TYPE=local', () => {
    const provider = createStorageProvider({ storageType: 'local' })
    expect(provider.kind).toBe('local')
  })

  it('creates minio provider when STORAGE_TYPE=minio', () => {
    process.env.MINIO_ENDPOINT = 'http://127.0.0.1:9000'
    process.env.MINIO_REGION = 'us-east-1'
    process.env.MINIO_BUCKET = 'director'
    process.env.MINIO_ACCESS_KEY = 'minioadmin'
    process.env.MINIO_SECRET_KEY = 'minioadmin'
    process.env.MINIO_FORCE_PATH_STYLE = 'true'

    const provider = createStorageProvider({ storageType: 'minio' })
    expect(provider.kind).toBe('minio')
  })

  it('throws explicit not-implemented error when STORAGE_TYPE=cos', () => {
    expect(() => createStorageProvider({ storageType: 'cos' })).toThrow(StorageProviderNotImplementedError)
  })

  it('throws config error on unknown storage type', () => {
    expect(() => createStorageProvider({ storageType: 'unknown' })).toThrow(StorageConfigError)
  })

  it('checks local storage health without creating the upload directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'director-storage-health-'))
    const missingUploadDir = path.join(root, 'missing-uploads')
    vi.stubEnv('STORAGE_TYPE', 'local')
    vi.stubEnv('UPLOAD_DIR', missingUploadDir)
    vi.resetModules()
    const { checkStorageHealth } = await import('@/lib/storage')

    await expect(checkStorageHealth()).rejects.toThrow()
    await expect(fs.stat(missingUploadDir)).rejects.toThrow()
  })
})
