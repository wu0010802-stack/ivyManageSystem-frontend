import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SuccessSummaryModal from '../SuccessSummaryModal.vue'

function makeSummary(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    message: '報名資料已送出',
    studentName: '王小明',
    parentPhone: '0912345678',
    selectedCourses: [{ name: '圍棋', price: 1000 }],
    selectedSupplies: [],
    totalAmount: 1000,
    queryToken: 'tok_ABC',
    editUrl: 'https://ivy.example.tw/public.html#/activity/query?token=tok_ABC',
    copyHint: '',
    ...overrides,
  }
}

const stubs = {}

describe('SuccessSummaryModal email 提示', () => {
  it('neutral response 只列本次選擇，不宣稱已錄取或候補', () => {
    const wrapper = mount(SuccessSummaryModal, {
      props: { summary: makeSummary() },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('本次選擇課程')
    expect(wrapper.text()).not.toContain('已報名課程')
    expect(wrapper.text()).not.toContain('候補課程')
    expect(wrapper.text()).toContain('錄取／候補')
  })

  it('summary.email 有值時以條件語氣說明通知信（不可承諾必定寄出）', () => {
    const wrapper = mount(SuccessSummaryModal, {
      props: { summary: makeSummary({ email: 'parent@example.com' }) },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('若本次報名資料成功建立')
    expect(wrapper.text()).toContain('parent@example.com')
    expect(wrapper.text()).toContain('未收到請檢查垃圾郵件匣')
    expect(wrapper.text()).not.toContain('已寄送')
  })

  it('summary.email 無值時不顯示提示', () => {
    const wrapper = mount(SuccessSummaryModal, {
      props: { summary: makeSummary() },
      global: { stubs },
    })
    expect(wrapper.text()).not.toContain('將寄至')
  })

  it('不允許點背景誤關，完成按鈕清楚說明需先保存', async () => {
    const wrapper = mount(SuccessSummaryModal, {
      props: { summary: makeSummary() },
      global: { stubs },
    })

    await wrapper.get('.modal-overlay').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('.btn-block').text()).toContain('我已保存')
  })
})

// ActivityPublicView 整頁 mount 成本高（bootstrap/輪詢需大量 mock），
// 依 repo 慣例（CLAUDE.md：元件渲染/API 整合可後補）以原始碼斷言守關鍵契約
// （同 tests/unit/no-adhoc-breakpoints.test.ts 的檔案掃描模式）。
describe('ActivityPublicView email 接線（原始碼斷言）', () => {
  const viewSrc = readFileSync(
    resolve(__dirname, '../../ActivityPublicView.vue'),
    'utf-8',
  )

  it('報名頁含 email 欄位 label 與 hint 文案', () => {
    expect(viewSrc).toContain('聯絡 Email（選填）')
    expect(viewSrc).toContain(
      '填寫後，報名成功將寄送報名資訊、查詢碼與修改連結到此信箱。',
    )
  })

  it('payload 空值不帶 email key（與後端 normalize 相容）', () => {
    expect(viewSrc).toContain('...(email ? { email } : {})')
  })
})
