import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import CertificatesView from '@/views/admin/gov-reports/CertificatesView.vue'

vi.mock('@/api/govMoe', () => ({
  listCertificateHistory: vi.fn().mockResolvedValue({
    data: [{ id: 1, serial: 'EC-2026-0001', student_id: 7,
             issue_date: '2026-05-12', purpose: 'p', copies: 1 }],
  }),
}))

// 批次開立對話框本體有獨立測試（CertificateBatchDialog.spec.ts）；此處只驗證
// 查詢頁的入口按鈕/權限與 wiring，stub 掉子元件避免重複拉 classrooms/students mock。
// 元件定義內嵌在 factory 裡（vi.mock 會被 hoist 到檔案最上方，不能引用外部 top-level 變數）；
// 測試內要用時改用「import 該路徑」拿回被 mock 的 default export。
vi.mock('@/components/gov-reports/CertificateBatchDialog.vue', () => ({
  default: defineComponent({
    name: 'CertificateBatchDialog',
    props: ['modelValue'],
    emits: ['update:modelValue', 'generated'],
    setup(_, { slots }) { return () => h('div', { class: 'certificate-batch-dialog-stub' }, slots.default?.()) },
  }),
}))

const mockHasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args) => mockHasPermission(...args),
}))

import CertificateBatchDialogStub from '@/components/gov-reports/CertificateBatchDialog.vue'

// Minimal stubs for Element Plus components not registered in test env
const makeStub = (tag) =>
  defineComponent({ name: tag, setup(_, { slots }) { return () => h('div', slots.default?.()) } })

const ElTable = defineComponent({
  name: 'ElTable',
  props: ['data'],
  setup(props) {
    return () => h('div', { class: 'el-table' },
      (props.data || []).map((row) =>
        h('div', { class: 'el-table-row' }, [
          h('span', row.serial),
        ])
      )
    )
  },
})

const globalConfig = {
  components: {
    ElForm: makeStub('ElForm'),
    ElFormItem: makeStub('ElFormItem'),
    ElInput: makeStub('ElInput'),
    ElDatePicker: makeStub('ElDatePicker'),
    ElButton: makeStub('ElButton'),
    ElTable,
    ElTableColumn: makeStub('ElTableColumn'),
  },
}

describe('CertificatesView', () => {
  it('loads history rows on mount', async () => {
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('EC-2026-0001')
  })

  it('有 GOV_REPORTS_EXPORT 權限時顯示「批次開立」按鈕', async () => {
    mockHasPermission.mockReturnValue(true)
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).toContain('批次開立')
  })

  it('無權限時不顯示「批次開立」按鈕', async () => {
    mockHasPermission.mockReturnValue(false)
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    expect(w.text()).not.toContain('批次開立')
    mockHasPermission.mockReturnValue(true)
  })

  it('點擊「批次開立」開啟對話框', async () => {
    mockHasPermission.mockReturnValue(true)
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    const dialog = w.findComponent(CertificateBatchDialogStub)
    expect(dialog.props('modelValue')).toBe(false)

    // ElButton stub 是無 class 的裸 div；同文字的祖先 div（header-actions）也會命中，
    // 需鎖定「無子元素」的葉節點才是按鈕本體，避免點到外層 wrapper 無效果。
    const btn = w.findAll('div').find((n) => n.text() === '批次開立' && n.element.children.length === 0)
    await btn.trigger('click')
    expect(w.findComponent(CertificateBatchDialogStub).props('modelValue')).toBe(true)
  })

  it('對話框 emit generated → 重新查詢開立紀錄', async () => {
    const w = mount(CertificatesView, { global: globalConfig })
    await flushPromises()
    const { listCertificateHistory } = await import('@/api/govMoe')
    expect(listCertificateHistory).toHaveBeenCalledTimes(1)

    const dialog = w.findComponent(CertificateBatchDialogStub)
    await dialog.vm.$emit('generated')
    await flushPromises()
    expect(listCertificateHistory).toHaveBeenCalledTimes(2)
  })
})
