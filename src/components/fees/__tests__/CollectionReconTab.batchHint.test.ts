/**
 * SPEC-022 §4.1：匯入成功後在清單頂端顯示可批次筆數提示條，點「批次媒合」
 * 開啟批次抽屜。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import CollectionReconTab from '../CollectionReconTab.vue'

const apiMocks = vi.hoisted(() => ({
  previewCollectionImport: vi.fn(),
  confirmCollectionImport: vi.fn(() =>
    Promise.resolve({ id: 12, row_count: 187, created: true }),
  ),
  getCollectionPayments: vi.fn(() => Promise.resolve({ items: [], total: 0 })),
  getCollectionCandidates: vi.fn(),
  allocateCollectionPayment: vi.fn(),
  reverseCollectionPayment: vi.fn(),
  reconcileCollectionCoverage: vi.fn(),
  batchCollectionCandidates: vi.fn(() =>
    Promise.resolve({
      items: [], auto_high_count: 142, needs_review_count: 45,
      unmatched_count: 0, auto_high_total: 1532400, truncated: false,
    }),
  ),
  batchAllocateCollectionPayments: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { prompt: vi.fn(), confirm: vi.fn() },
}))

// 與 CollectionReconTab.test.ts 同一份（該檔第 33-60 行），另補新元件 stub
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h('div', { 'data-testid': 'table' },
        props.data.length === 0 ? [slots.empty?.()] : [slots.default?.()])
  },
})
const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': { template: '<span />' },
  'el-upload': { template: '<div><slot /></div>' },
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-date-picker': { template: '<input v-bind="$attrs" />' },
  'el-descriptions': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-descriptions-item': {
    props: ['label'],
    template: '<div><span>{{ label }}</span><slot /></div>',
  },
  'el-alert': { template: '<div v-bind="$attrs" />' },
  'el-tag': { template: '<span v-bind="$attrs"><slot /></span>' },
  'el-pagination': { template: '<div />' },
  'el-dialog': { template: '<div v-bind="$attrs"><slot /><slot name="footer" /></div>' },
  CollectionAllocationDialog: true,
  // 本任務新增：批次抽屜在本測試不需渲染內容，只斷言收到的 prop
  CollectionBatchDrawer: {
    props: ['visible', 'importId'],
    template: '<div data-test="batch-drawer-stub" :data-visible="visible" />',
  },
  EmptyState: {
    props: ['title', 'description'],
    template:
      '<div data-testid="empty-state"><p>{{ title }}</p><p>{{ description }}</p><slot name="action" /></div>',
  },
}

/** 選檔 → 預覽 → 確認匯入，驅動元件自身方法（與 CollectionReconTab.test.ts 同一手法） */
async function triggerImport(wrapper: ReturnType<typeof mount>) {
  const vm = wrapper.vm as unknown as {
    pickedFile: File | null
    runPreview: () => Promise<void>
    runImport: () => Promise<void>
  }
  vm.pickedFile = new File(['x'], 'CS_1.csv')
  await vm.runPreview()
  await vm.runImport()
  await nextTick()
  await nextTick()
}

describe('CollectionReconTab 批次提示條', () => {
  it('匯入成功後顯示可一鍵入帳筆數', async () => {
    const wrapper = mount(CollectionReconTab, { global: { stubs: STUBS } })
    await nextTick()
    await triggerImport(wrapper)
    expect(wrapper.find('[data-test="batch-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('142')
  })

  it('點「批次媒合」開啟批次抽屜', async () => {
    const wrapper = mount(CollectionReconTab, { global: { stubs: STUBS } })
    await nextTick()
    await triggerImport(wrapper)

    const drawerBefore = wrapper.find('[data-test="batch-drawer-stub"]')
    expect(drawerBefore.attributes('data-visible')).toBe('false')

    await wrapper.find('[data-test="open-batch"]').trigger('click')
    await nextTick()

    const drawerAfter = wrapper.find('[data-test="batch-drawer-stub"]')
    expect(drawerAfter.attributes('data-visible')).toBe('true')
  })
})
