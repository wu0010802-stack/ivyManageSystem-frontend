import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import FeeTemplateManageDrawer from '@/components/fees/FeeTemplateManageDrawer.vue'

const getFeeTemplates = vi.fn(() => Promise.resolve([
  { id: 7, grade_id: 2, school_year: 115, semester: 1, fee_type: 'monthly', name: '中班月費', amount: 9000, is_active: true },
]))
const deleteFeeTemplate = vi.fn(() => Promise.resolve({}))
vi.mock('@/api/fees', () => ({
  getFeeTemplates: (...args: unknown[]) => getFeeTemplates(...args),
  deleteFeeTemplate: (...args: unknown[]) => deleteFeeTemplate(...args),
  createFeeTemplate: vi.fn(),
  updateFeeTemplate: vi.fn(),
}))

const ElDrawerStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, slots.default?.()) : null)
  },
})
// 與 tests/unit/views/AnnouncementView.test.js 相同的 table stub 模式：
// table 把 data 灌給 column stub，column stub 逐 row 呼叫 default slot
const ElTableColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as Record<string, unknown>[]).map(
      (row, index) => h('div', { key: index }, slots.default ? slots.default({ row }) : []),
    ))
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (slots.default?.() || []).map(
      (vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
    ))
  },
})

const flushPromises = async () => { await Promise.resolve(); await Promise.resolve() }

const mountDrawer = () => mount(FeeTemplateManageDrawer, {
  props: { modelValue: true, schoolYear: 115, semester: 1, grades: [{ id: 2, name: '中班' }] },
  global: { stubs: { 'el-drawer': ElDrawerStub, 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub, FeeTemplateDialog: true } },
})

describe('FeeTemplateManageDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('開啟時以 props 年期載入範本並渲染列表', async () => {
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    expect(getFeeTemplates).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    expect(wrapper.text()).toContain('中班月費')
  })

  it('停用需 confirm，確認後呼叫 deleteFeeTemplate 並 emit changed', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm')
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('停用'))!.trigger('click')
    await flushPromises()
    expect(deleteFeeTemplate).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })
})
