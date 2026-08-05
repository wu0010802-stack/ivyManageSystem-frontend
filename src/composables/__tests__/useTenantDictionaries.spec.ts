/**
 * per-tenant 職稱對照（CT-FIX-09 / P32b）。
 *
 * 核心承諾：**API 尚未載入 / 失敗時必須退回 `constants/employee.ts` 的常數**，
 * 讓行為與改造前逐字相同——這是「灰度不變式」在字典這條路徑上的表現。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetPositionMapping = vi.fn()
vi.mock('@/api/config', () => ({
  getPositionMapping: (...a: unknown[]) => mockGetPositionMapping(...a),
}))

beforeEach(async () => {
  mockGetPositionMapping.mockReset()
  const m = await import('@/composables/useTenantDictionaries')
  m._resetTenantDictionariesForTests()
})

afterEach(() => {
  vi.resetModules()
})

describe('fallback 到常數', () => {
  it('尚未載入 → 回 TITLE_TO_GRADE / POSITION_SALARY_KEY', async () => {
    const m = await import('@/composables/useTenantDictionaries')
    expect(m.getTitleToGrade()['幼兒園教師']).toBe('A')
    expect(m.getPositionSalaryKey()['行政']).toBe('admin_staff')
  })

  it('API 失敗 → 仍回常數，不 throw', async () => {
    mockGetPositionMapping.mockRejectedValue(new Error('boom'))
    const m = await import('@/composables/useTenantDictionaries')
    await m.loadPositionMapping()
    expect(m.getTitleToGrade()['幼兒園教師']).toBe('A')
  })
})

describe('載入成功後改用 API 值', () => {
  it('B 校的職稱對照完全取代常數（不是合併）', async () => {
    mockGetPositionMapping.mockResolvedValue({
      data: { title_to_grade: { K1導師: 'B' }, position_salary_key: { 保健室: 'nurse' } },
    })
    const m = await import('@/composables/useTenantDictionaries')
    await m.loadPositionMapping()
    expect(m.getTitleToGrade()).toEqual({ K1導師: 'B' })
    // 刻意不合併：合併會讓 A 校的「幼兒園教師→A」在 B 校復活，那正是要修的 bug
    expect(m.getTitleToGrade()['幼兒園教師']).toBeUndefined()
    expect(m.getPositionSalaryKey()).toEqual({ 保健室: 'nurse' })
  })

  it('併發呼叫只發一次請求', async () => {
    mockGetPositionMapping.mockResolvedValue({ data: { title_to_grade: {}, position_salary_key: {} } })
    const m = await import('@/composables/useTenantDictionaries')
    await Promise.all([m.loadPositionMapping(), m.loadPositionMapping(), m.loadPositionMapping()])
    expect(mockGetPositionMapping).toHaveBeenCalledTimes(1)
  })

  it('非字串值被濾掉（防後端回髒資料污染表單）', async () => {
    mockGetPositionMapping.mockResolvedValue({
      data: { title_to_grade: { a: 'A', b: 123, c: null }, position_salary_key: null },
    })
    const m = await import('@/composables/useTenantDictionaries')
    await m.loadPositionMapping()
    expect(m.getTitleToGrade()).toEqual({ a: 'A' })
    expect(m.getPositionSalaryKey()).toEqual({})
  })
})

describe('身分/acting tenant 切換失效', () => {
  it('advanceAdminSession() 後重新載入（A 校字典不得留在 B 校畫面）', async () => {
    mockGetPositionMapping.mockResolvedValue({
      data: { title_to_grade: { A校職稱: 'A' }, position_salary_key: {} },
    })
    const m = await import('@/composables/useTenantDictionaries')
    await m.loadPositionMapping()
    expect(m.getTitleToGrade()).toEqual({ A校職稱: 'A' })

    const { advanceAdminSession } = await import('@/utils/adminSession')
    advanceAdminSession()
    expect(m.getTitleToGrade()['幼兒園教師']).toBe('A')   // 已回落 fallback

    mockGetPositionMapping.mockResolvedValue({
      data: { title_to_grade: { B校職稱: 'C' }, position_salary_key: {} },
    })
    await m.loadPositionMapping()
    expect(m.getTitleToGrade()).toEqual({ B校職稱: 'C' })
  })
})
