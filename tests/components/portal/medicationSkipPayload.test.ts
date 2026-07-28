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
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/portalMedications', () => ({
  listToday: vi.fn().mockResolvedValue({
    data: {
      groups: [
        {
          classroom_name: '小班',
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
import ClassHubMedicationSheet from '@/components/portal/class-hub/ClassHubMedicationSheet.vue'

describe('教師端略過用藥送出的 payload', () => {
  beforeEach(() => {
    vi.mocked(skipLog).mockClear()
  })

  it('工作台用藥抽屜送 skipped_reason，而非後端不認得的 reason', async () => {
    const wrapper = mount(ClassHubMedicationSheet, {
      global: { plugins: [ElementPlus] },
      props: { show: true },
      attachTo: document.body,
    })
    // el-drawer 的 @open 由 transition 觸發，jsdom 不會跑；直接發事件模擬抽屜開啟
    wrapper.findComponent({ name: 'ElDrawer' }).vm.$emit('open')
    await flushPromises()

    // 抽屜內容 teleport 到 body，不在 wrapper 的子樹裡
    const skipBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('未執行'),
    )
    expect(skipBtn, '找不到「未執行」按鈕，測試前提已失效').toBeTruthy()

    skipBtn!.click()
    await flushPromises()

    expect(skipLog).toHaveBeenCalledTimes(1)
    const [logId, payload] = vi.mocked(skipLog).mock.calls[0]
    expect(logId).toBe(7)
    expect(payload).toEqual({ skipped_reason: '家長取消' })
  })
})
