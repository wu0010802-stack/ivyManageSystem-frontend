/**
 * errorCodeRegistry — 與後端 utils/error_codes.py ErrorCode enum 對齊（15 條）。
 *
 * 同步來源：ivy-backend `utils/error_codes.py`（FE-C / BE-C 對齊）
 */
import { describe, it, expect } from 'vitest'
import { ERROR_CODE_REGISTRY, type FriendlyError } from '@/utils/errorCodeRegistry'

describe('errorCodeRegistry', () => {
  it('家長綁定 codes 全列（含 BIND_CODE_NOT_FOUND / BIND_CODE_USED 補登）', () => {
    expect(ERROR_CODE_REGISTRY.BIND_CODE_INVALID).toBeDefined()
    expect(ERROR_CODE_REGISTRY.BIND_CODE_EXPIRED).toBeDefined()
    expect(ERROR_CODE_REGISTRY.BIND_CODE_ALREADY_USED).toBeDefined()
    expect(ERROR_CODE_REGISTRY.BIND_CODE_NOT_FOUND).toBeDefined()
    expect(ERROR_CODE_REGISTRY.BIND_CODE_USED).toBeDefined()

    expect(ERROR_CODE_REGISTRY.BIND_CODE_INVALID.nextStep).toBeTruthy()
    expect(ERROR_CODE_REGISTRY.BIND_CODE_EXPIRED.nextStep).toBeTruthy()
  })

  it('LIFF 認證 codes 全列', () => {
    expect(ERROR_CODE_REGISTRY.LINE_BINDING_EXPIRED.nextStep).toBeTruthy()
    expect(ERROR_CODE_REGISTRY.LINE_BINDING_NOT_FOUND).toBeDefined()
    expect(ERROR_CODE_REGISTRY.LINE_PROFILE_FETCH_FAILED).toBeDefined()
  })

  it('家長存取資源 codes 全列', () => {
    expect(ERROR_CODE_REGISTRY.STUDENT_NOT_FOUND.message).toBeTruthy()
    expect(ERROR_CODE_REGISTRY.STUDENT_NOT_LINKED_TO_PARENT).toBeDefined()
    expect(ERROR_CODE_REGISTRY.PORTAL_DATA_UNAVAILABLE).toBeDefined()
    expect(ERROR_CODE_REGISTRY.CONTACT_BOOK_NOT_PUBLISHED).toBeDefined()
  })

  it('家長端通用 codes 全列', () => {
    expect(ERROR_CODE_REGISTRY.CONSENT_REQUIRED).toBeDefined()
    expect(ERROR_CODE_REGISTRY.DSR_REQUEST_INVALID).toBeDefined()
    expect(ERROR_CODE_REGISTRY.PARENT_NOT_AUTHORIZED).toBeDefined()
  })

  it('剛好 15 條，與 BE-C ErrorCode enum 對齊', () => {
    const codes = Object.keys(ERROR_CODE_REGISTRY)
    expect(codes).toHaveLength(15)
  })

  it('每條 entry 必有 message 與 level', () => {
    for (const code of Object.keys(ERROR_CODE_REGISTRY)) {
      const entry: FriendlyError = ERROR_CODE_REGISTRY[code]!
      expect(entry.message, `${code} 需有 message`).toBeTruthy()
      expect(['error', 'warning', 'info']).toContain(entry.level)
    }
  })
})
