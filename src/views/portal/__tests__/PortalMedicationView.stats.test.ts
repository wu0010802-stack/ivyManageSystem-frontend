import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

/**
 * 今日用藥頁班級統計文案（2026-10-12 UI/UX 審查）。
 *
 * 原本「待 N／已 N／略 N」是看不懂的縮寫（待什麼？已什麼？），改成完整動詞：
 * 「待給藥 N・已給藥 N・略過 N」。另外用藥卡片原本靠 4px 彩色左側色條區分狀態，
 * 改為淡底 + 完整邊框，狀態文字標籤（待執行／已執行／已略過）維持。
 */

vi.mock('@/api/portalMedications', () => ({
  listToday: vi.fn(),
  administer: vi.fn(),
  skipLog: vi.fn(),
}))

import { listToday } from '@/api/portalMedications'
import PortalMedicationView from '@/views/portal/PortalMedicationView.vue'

function item(logId: number, status: string) {
  return {
    log_id: logId,
    student_name: `學生${logId}`,
    medication_name: '退燒藥',
    dose: '5ml',
    scheduled_time: '12:00',
    status,
  }
}

async function mountView() {
  vi.mocked(listToday).mockResolvedValue({
    data: {
      date: '2026-10-12',
      groups: [
        {
          classroom_id: 1,
          classroom_name: '小班',
          stats: { pending: 2, administered: 1, skipped: 3 },
          items: [item(1, 'pending'), item(2, 'administered'), item(3, 'skipped')],
        },
      ],
    },
  } as never)
  const wrapper = mount(PortalMedicationView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return wrapper
}

describe('PortalMedicationView 統計與狀態', () => {
  beforeEach(() => {
    vi.mocked(listToday).mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('班級統計用完整詞「待給藥／已給藥／略過」，不再是「待／已／略」縮寫', async () => {
    const wrapper = await mountView()

    expect(wrapper.get('.stat.pending').text()).toBe('待給藥 2')
    expect(wrapper.get('.stat.done').text()).toBe('已給藥 1')
    expect(wrapper.get('.stat.skip').text()).toBe('略過 3')
  })

  it('每張用藥卡片都有狀態文字標籤，不只靠顏色', async () => {
    const wrapper = await mountView()

    const cards = wrapper.findAll('.med-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].get('.status-tag').text()).toBe('待執行')
    expect(cards[1].get('.status-tag').text()).toBe('已執行')
    expect(cards[2].get('.status-tag').text()).toBe('已略過')
  })
})
