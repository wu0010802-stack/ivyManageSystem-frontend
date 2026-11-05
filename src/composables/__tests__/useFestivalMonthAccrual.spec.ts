import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/salary', () => ({ getFestivalBonusPreview: vi.fn() }))
vi.mock('@/api/festivalCarry', () => ({ getFestivalPayoutSettings: vi.fn() }))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn().mockReturnValue(true) }))

import { getFestivalBonusPreview } from '@/api/salary'
import { getFestivalPayoutSettings } from '@/api/festivalCarry'
import { useFestivalMonthAccrual } from '../useFestivalMonthAccrual'

const preview = vi.mocked(getFestivalBonusPreview)
const settings = vi.mocked(getFestivalPayoutSettings)

const ok = <T>(data: T) => Promise.resolve({ data }) as never
const previewRow = (employeeId: number, festivalBonus: number) => ({
    employeeId,
    category: '帶班老師',
    bonusBase: 4000,
    targetEnrollment: 27,
    currentEnrollment: 25,
    ratio: 0.93,
    festivalBonus,
    remark: '',
})

beforeEach(() => {
    vi.clearAllMocks()
    settings.mockReturnValue(ok({ early_payout_from_ym: null }))
})

describe('useFestivalMonthAccrual', () => {
    it('非發放月：載入本月應計，依員工編號取值；併入 12 月發', async () => {
        preview.mockReturnValue(ok([previewRow(7, 3704)]))
        const acc = useFestivalMonthAccrual(() => ({ year: 2026, month: 10 }))
        await acc.load()

        expect(preview).toHaveBeenCalledWith({ year: 2026, month: 10 })
        expect(acc.visible.value).toBe(true)
        expect(acc.payout.value).toEqual([2026, 12])
        expect(acc.paidThisMonth.value).toBe(false)
        expect(acc.of(7)?.amount).toBe(3704)
        expect(acc.of('7')?.amount).toBe(3704) // 名冊 employee_id 型別為 string | number
        expect(acc.of(99)).toBeUndefined()
    })

    it('標準口徑的發放月（12 月）本月應計併入次年 2 月 → 仍顯示，且標示本月為發放月', async () => {
        preview.mockReturnValue(ok([previewRow(7, 3704)]))
        const acc = useFestivalMonthAccrual(() => ({ year: 2026, month: 12 }))
        await acc.load()
        expect(acc.visible.value).toBe(true)
        expect(acc.payout.value).toEqual([2027, 2])
        expect(acc.paidThisMonth.value).toBe(true)
    })

    it('前移口徑下本月應計當月就發（11 月）→ 不顯示、也不打預覽', async () => {
        settings.mockReturnValue(ok({ early_payout_from_ym: '2026-08' }))
        const acc = useFestivalMonthAccrual(() => ({ year: 2026, month: 11 }))
        await acc.load()
        expect(acc.visible.value).toBe(false)
        expect(preview).not.toHaveBeenCalled()
    })

    it('預覽失敗：標記 failed、清空資料，不丟例外', async () => {
        preview.mockReturnValue(Promise.reject(new Error('500')) as never)
        const acc = useFestivalMonthAccrual(() => ({ year: 2026, month: 10 }))
        await acc.load()
        expect(acc.failed.value).toBe(true)
        expect(acc.loading.value).toBe(false)
        expect(acc.of(7)).toBeUndefined()
    })

    it('切換月份時舊回應晚到不得覆蓋新月份資料', async () => {
        const period = reactive({ year: 2026, month: 9 })
        let resolveOld: (v: unknown) => void = () => {}
        preview
            .mockReturnValueOnce(new Promise((r) => { resolveOld = r }) as never)
            .mockReturnValueOnce(ok([previewRow(7, 1111)]))
        const acc = useFestivalMonthAccrual(() => ({ year: period.year, month: period.month }))

        const first = acc.load()
        await flushPromises()
        period.month = 10
        await acc.load()
        resolveOld({ data: [previewRow(7, 9999)] })
        await first

        expect(acc.of(7)?.amount).toBe(1111)
        expect(acc.loading.value).toBe(false)
    })
})
