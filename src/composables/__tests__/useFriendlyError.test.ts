/**
 * useFriendlyError — 從 axios error 對應到 friendly message + nextStep。
 */
import { describe, it, expect } from 'vitest'
import { useFriendlyError } from '@/composables/useFriendlyError'

const { getFriendly } = useFriendlyError()

describe('useFriendlyError.getFriendly', () => {
  it('已知 code → message + nextStep + level', () => {
    const err = {
      errorDetail: { code: 'BIND_CODE_INVALID', message: '綁定碼無效或已過期' },
      displayMessage: '綁定碼無效或已過期',
    }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('綁定碼無效或已過期')
    expect(f.nextStep).toMatch(/LINE 主選單/)
    expect(f.level).toBe('warning')
  })

  it('已知 code 但後端 detail.message 為空 → 用 registry 預設 message', () => {
    const err = {
      errorDetail: { code: 'BIND_CODE_EXPIRED' },
      displayMessage: '',
    }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('綁定碼已過期')
    expect(f.nextStep).toBeTruthy()
  })

  it('未知 code → fallback 到 displayMessage', () => {
    const err = {
      errorDetail: { code: 'UNKNOWN_X' },
      displayMessage: '其他錯誤',
    }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('其他錯誤')
    expect(f.nextStep).toBeUndefined()
    expect(f.level).toBe('error')
  })

  it('無 errorDetail 但有 displayMessage', () => {
    const err = { displayMessage: '網路連線異常' }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('網路連線異常')
    expect(f.nextStep).toBeUndefined()
    expect(f.level).toBe('error')
  })

  it('完全空 error → 通用 fallback', () => {
    const f = getFriendly(undefined)
    expect(f.message).toBeTruthy()
    expect(f.level).toBe('error')
  })

  it('null error → 通用 fallback', () => {
    const f = getFriendly(null)
    expect(f.message).toBeTruthy()
    expect(f.level).toBe('error')
  })

  it('errorDetail 為 null（HTTPException 純字串 detail）→ fallback', () => {
    const err = { errorDetail: null, displayMessage: '伺服器錯誤' }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('伺服器錯誤')
  })

  it('errorDetail.code 為非字串 → 視為未知 code', () => {
    const err = {
      errorDetail: { code: 123, message: '怪錯誤' },
      displayMessage: '怪錯誤',
    }
    const f = getFriendly(err as unknown)
    expect(f.message).toBe('怪錯誤')
    expect(f.nextStep).toBeUndefined()
  })

  it('已知 code STUDENT_NOT_LINKED_TO_PARENT → level=error', () => {
    const err = {
      errorDetail: { code: 'STUDENT_NOT_LINKED_TO_PARENT' },
      displayMessage: '您無權存取此學生資料',
    }
    const f = getFriendly(err as unknown)
    expect(f.level).toBe('error')
    expect(f.nextStep).toMatch(/聯絡園所/)
  })

  it('CONTACT_BOOK_NOT_PUBLISHED → level=info（非紅色焦慮）', () => {
    const err = {
      errorDetail: { code: 'CONTACT_BOOK_NOT_PUBLISHED' },
      displayMessage: '今日聯絡簿尚未發布',
    }
    const f = getFriendly(err as unknown)
    expect(f.level).toBe('info')
  })
})
