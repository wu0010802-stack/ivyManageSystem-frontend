import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RegistrationReviewWizard from '../RegistrationReviewWizard.vue'
import type { ReviewRow } from '@/composables/useActivityReview'

// P3-2（第六輪 bug hunt）：逐筆審核精靈的「拒絕並下一筆」鈕缺少主列表拒絕鈕的
// paid_amount>0 預先 disable，實際點擊會被後端 409 擋下但 UX 不對稱。
// 修法：wizard 拒絕鈕綁 rejectDisabled（current.paid_amount>0），與主列表 canReject 對齊。
// el-dialog 內容在 jsdom 不掛載 footer DOM（同 RegistrationPaymentDialog 測試只讀 vm），
// 故驗證具名 computed rejectDisabled（template 直接 :disabled 綁定它）。

function mountWizard(current: ReviewRow | null) {
  const state = {
    visible: true,
    queue: current ? [current] : [],
    index: 0,
    searchQuery: '',
    candidates: [],
    selected: null,
    loading: false,
    submitting: false,
    done: { matched: 0, forced: 0, rejected: 0, skipped: 0 },
  }
  return mount(RegistrationReviewWizard, {
    props: {
      state,
      current,
      onSearch: () => {},
      onMatch: () => {},
      onForce: () => {},
      onReject: () => {},
      onSkip: () => {},
      onPrev: () => {},
      onClose: () => {},
    },
    global: { stubs: { teleport: true } },
  })
}

function rejectDisabled(wrapper: ReturnType<typeof mountWizard>): boolean {
  return (wrapper.vm as unknown as { rejectDisabled: boolean }).rejectDisabled
}

describe('RegistrationReviewWizard 拒絕鈕繳費守衛（P3-2）', () => {
  it('已繳費（paid_amount>0）：拒絕鈕 disabled', () => {
    expect(rejectDisabled(mountWizard({ id: 1, student_name: 'A', paid_amount: 500 }))).toBe(true)
  })

  it('未繳費（paid_amount=0）：拒絕鈕 enabled', () => {
    expect(rejectDisabled(mountWizard({ id: 1, student_name: 'B', paid_amount: 0 }))).toBe(false)
  })

  it('無 paid_amount 欄位（undefined）視為未繳費：enabled', () => {
    expect(rejectDisabled(mountWizard({ id: 1, student_name: 'C' }))).toBe(false)
  })

  it('current 為 null（佇列已空）：不 disable（避免卡住）', () => {
    expect(rejectDisabled(mountWizard(null))).toBe(false)
  })
})
