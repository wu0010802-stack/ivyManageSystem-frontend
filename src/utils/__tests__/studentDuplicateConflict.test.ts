import { describe, it, expect, vi } from 'vitest'
import {
  parseDuplicateStudentConflict,
  submitStudentCreateWithDuplicateConfirm,
  StudentDuplicateCreateCancelled,
} from '@/utils/studentDuplicateConflict'

// 後端 detail 真實形狀（api/students.py create_student，架構評估 D4）：
// 純文字（非結構化 JSON），格式固定含 "allow_duplicate=true" 字樣。
// 範例取自後端原始碼字面值，避免憑感覺 mock 出假形狀。
const DUPLICATE_DETAIL =
  '已有同名同生日的既有學生（id=42, classroom_id=3, lifecycle_status=enrolled），' +
  '可能為重複建檔。如確認為不同學生，請帶 allow_duplicate=true 覆寫。'

function makeAxiosError(status: number, detail: unknown) {
  return {
    isAxiosError: true,
    response: { status, data: { detail } },
  }
}

describe('parseDuplicateStudentConflict', () => {
  it('409 + detail 含 allow_duplicate=true 字樣 → 解析出 message', () => {
    const err = makeAxiosError(409, DUPLICATE_DETAIL)
    const result = parseDuplicateStudentConflict(err)
    expect(result).toEqual({ message: DUPLICATE_DETAIL })
  })

  it('409 但 detail 是其他文字（如學號配發衝突）→ null（不誤判）', () => {
    const err = makeAxiosError(409, '學號配發衝突，請重試')
    expect(parseDuplicateStudentConflict(err)).toBeNull()
  })

  it('409 但 detail 是陣列（FastAPI 驗證錯誤形狀）→ null', () => {
    const err = makeAxiosError(409, [{ msg: 'x' }])
    expect(parseDuplicateStudentConflict(err)).toBeNull()
  })

  it('非 409（如 422）→ null', () => {
    const err = makeAxiosError(422, DUPLICATE_DETAIL)
    expect(parseDuplicateStudentConflict(err)).toBeNull()
  })

  it('無 response（網路錯誤）→ null', () => {
    expect(parseDuplicateStudentConflict(new Error('network'))).toBeNull()
  })

  it('null/undefined error → null', () => {
    expect(parseDuplicateStudentConflict(null)).toBeNull()
    expect(parseDuplicateStudentConflict(undefined)).toBeNull()
  })
})

describe('submitStudentCreateWithDuplicateConfirm', () => {
  const payload = { name: '王小明', birthday: '2020-01-01' }

  it('首次送出成功（無重複）→ 直接回傳結果，不彈確認', async () => {
    const submit = vi.fn().mockResolvedValue({ data: { id: 1 } })
    const confirm = vi.fn()
    const result = await submitStudentCreateWithDuplicateConfirm(submit, payload, confirm)
    expect(result).toEqual({ data: { id: 1 } })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(payload)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('命中重複 409 → 彈確認，使用者確認後帶 allow_duplicate=true 重送同 payload', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(makeAxiosError(409, DUPLICATE_DETAIL))
      .mockResolvedValueOnce({ data: { id: 99 } })
    const confirm = vi.fn().mockResolvedValue(true)

    const result = await submitStudentCreateWithDuplicateConfirm(submit, payload, confirm)

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(DUPLICATE_DETAIL)
    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenNthCalledWith(1, payload)
    expect(submit).toHaveBeenNthCalledWith(2, { ...payload, allow_duplicate: true })
    expect(result).toEqual({ data: { id: 99 } })
  })

  it('命中重複 409 → 使用者取消 → 拋出 StudentDuplicateCreateCancelled，不重送', async () => {
    const submit = vi.fn().mockRejectedValueOnce(makeAxiosError(409, DUPLICATE_DETAIL))
    const confirm = vi.fn().mockResolvedValue(false)

    await expect(
      submitStudentCreateWithDuplicateConfirm(submit, payload, confirm),
    ).rejects.toBeInstanceOf(StudentDuplicateCreateCancelled)

    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('StudentDuplicateCreateCancelled.silent === true（供 isSilentError 辨識靜默）', () => {
    expect(new StudentDuplicateCreateCancelled().silent).toBe(true)
  })

  it('非重複建檔錯誤（如學號配發衝突 409）→ 原樣拋出，不彈確認', async () => {
    const conflictErr = makeAxiosError(409, '學號配發衝突，請重試')
    const submit = vi.fn().mockRejectedValueOnce(conflictErr)
    const confirm = vi.fn()

    await expect(
      submitStudentCreateWithDuplicateConfirm(submit, payload, confirm),
    ).rejects.toBe(conflictErr)
    expect(confirm).not.toHaveBeenCalled()
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('其他錯誤（如 500）→ 原樣拋出', async () => {
    const serverErr = makeAxiosError(500, '服務暫時無法使用')
    const submit = vi.fn().mockRejectedValueOnce(serverErr)
    const confirm = vi.fn()

    await expect(
      submitStudentCreateWithDuplicateConfirm(submit, payload, confirm),
    ).rejects.toBe(serverErr)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('重送（allow_duplicate=true）仍失敗 → 原樣拋出重送的錯誤', async () => {
    const retryErr = makeAxiosError(500, '重送失敗')
    const submit = vi
      .fn()
      .mockRejectedValueOnce(makeAxiosError(409, DUPLICATE_DETAIL))
      .mockRejectedValueOnce(retryErr)
    const confirm = vi.fn().mockResolvedValue(true)

    await expect(
      submitStudentCreateWithDuplicateConfirm(submit, payload, confirm),
    ).rejects.toBe(retryErr)
  })
})
