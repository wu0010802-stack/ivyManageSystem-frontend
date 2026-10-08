/**
 * 教師端「略過／未執行」用藥送錯欄位名（bug-hunt 2026-07-27，P0）。
 *
 * 後端 api/student_health.py 的 SkipPayload 只收 `skipped_reason`（必填，min_length=1），
 * 但教師端兩個呼叫端都送 `{ reason }` → 必定 422。老師填了原因也送不出去，
 * 該筆用藥永遠停在「待執行」，幼兒用藥紀錄留白（照護紀錄缺漏）。
 * 管理端 src/views/MedicationTodayView.vue 送的是正確欄位，只有 portal 兩處寫錯。
 *
 * 型別層已於 src/api/portalMedications.ts 收緊（skipLog 改吃 OpenAPI 產生型別），
 * 本檔額外釘住執行期真正送出的 payload。
 *
 * SPEC-024：原本掛在「今日班級工作台」的用藥抽屜 ClassHubMedicationSheet 已移除，
 * /portal/medications 獨立頁是唯一入口，本守衛跟著功能搬家改指向 PortalMedicationView，
 * 斷言不變。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/portalMedications', () => ({
  listToday: vi.fn().mockResolvedValue({
    data: {
      date: '2026-09-11',
      groups: [
        {
          classroom_id: 1,
          classroom_name: '小班',
          stats: { pending: 1, administered: 0, skipped: 0 },
          items: [
            {
              log_id: 7,
              student_name: '王小明',
              medication_name: '退燒藥',
              dose: '5ml',
              scheduled_time: '12:00',
              status: 'pending',
            },
          ],
        },
      ],
    },
  }),
  administer: vi.fn().mockResolvedValue({ data: {} }),
  skipLog: vi.fn().mockResolvedValue({ data: {} }),
  correctLog: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
    ElMessageBox: { prompt: vi.fn().mockResolvedValue({ value: '家長取消' }) },
  }
})

import { skipLog } from '@/api/portalMedications'
import PortalMedicationView from '@/views/portal/PortalMedicationView.vue'

describe('教師端略過用藥送出的 payload', () => {
  beforeEach(() => {
    vi.mocked(skipLog).mockClear()
  })

  it('用藥獨立頁送 skipped_reason，而非後端不認得的 reason', async () => {
    const wrapper = mount(PortalMedicationView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()

    const skipBtn = wrapper.findAll('button').find((b) => b.text().includes('略過'))
    expect(skipBtn, '找不到「略過」按鈕，測試前提已失效').toBeTruthy()

    await skipBtn!.trigger('click')
    await flushPromises()

    expect(skipLog).toHaveBeenCalledTimes(1)
    const [logId, payload] = vi.mocked(skipLog).mock.calls[0]
    expect(logId).toBe(7)
    expect(payload).toEqual({ skipped_reason: '家長取消' })
  })
})
