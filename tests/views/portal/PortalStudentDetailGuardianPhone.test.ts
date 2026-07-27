/**
 * 學生個案頁的家長電話恆顯示「—」（bug-hunt 2026-07-27）。
 *
 * 後端 schemas/portal_students.StudentDetailGuardian 只回 `phone_masked`（遮罩後），
 * 但 PortalStudentDetailView 讀的是 `g.phone`。該檔的 Guardian interface 帶
 * `[key: string]: unknown` index signature，所以 vue-tsc 抓不到這個欄位名不符。
 *
 * 結果：header 的「主要家長：王小明（—）」與「家長」分頁每列「電話：—」恆為空，
 * 即使 DB 有電話（Email 有值），老師會以為園所沒建家長電話。
 *
 * 同 repo 的 PortalStudentDrawer.vue 對同一支端點讀的是 phone_masked（正確），
 * 可見是這支抄漏了。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: {}, query: {} }),
}))

vi.mock('@/api/portalStudentDetail', () => ({
  getStudentDetail: vi.fn(),
}))

import { getStudentDetail } from '@/api/portalStudentDetail'
import PortalStudentDetailView from '@/views/portal/PortalStudentDetailView.vue'

const MASKED = '0912-***-678'

function detailPayload() {
  return {
    id: 5,
    name: '王小明',
    classroom_name: '小班',
    lifecycle_status: 'enrolled',
    guardians: [
      {
        id: 1,
        name: '王媽媽',
        phone_masked: MASKED,
        email: 'mom@example.com',
        relation: '母',
        is_primary: true,
        is_emergency: false,
        can_pickup: true,
      },
    ],
    allergies: [],
    observations: [],
    assessments: [],
    contact_book: [],
  }
}

describe('學生個案頁的家長電話', () => {
  beforeEach(() => {
    vi.mocked(getStudentDetail).mockResolvedValue({ data: detailPayload() } as never)
  })

  it('顯示後端回的 phone_masked，而不是永遠的「—」', async () => {
    const wrapper = mount(PortalStudentDetailView, {
      global: { plugins: [ElementPlus] },
      props: { studentId: 5 },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(MASKED)
  })
})
