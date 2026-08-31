import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, watch } from 'vue'
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

// F-5: production 唯一載入路徑是 el-drawer 的 @open（modelValue 由 false 轉 true 時觸發）；
// 舊 stub 從不 emit open，導致這條路徑完全沒被測到。補上 emits + watch 還原真實 el-drawer 行為。
const ElDrawerStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['open'],
  setup(props, { slots, emit }) {
    watch(
      () => props.modelValue,
      (v, oldV) => { if (v && !oldV) emit('open') },
    )
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

  it('F-5: 初始關閉、父層開啟（modelValue false→true）→ 透過 @open 載入範本（production 唯一載入路徑）', async () => {
    const wrapper = mount(FeeTemplateManageDrawer, {
      props: { modelValue: false, schoolYear: 115, semester: 1, grades: [{ id: 2, name: '中班' }] },
      global: {
        stubs: {
          'el-drawer': ElDrawerStub,
          'el-table': ElTableStub,
          'el-table-column': ElTableColumnStub,
          FeeTemplateDialog: true,
        },
      },
    })
    await flushPromises(); await nextTick()
    // 初始 modelValue: false → el-drawer 內容不渲染，component 內的初始 fallback（if props.modelValue）不觸發
    expect(getFeeTemplates).not.toHaveBeenCalled()

    await wrapper.setProps({ modelValue: true })
    await flushPromises(); await nextTick()

    // 唯一觸發來源是 stub 模擬 el-drawer 真實行為送出的 @open
    expect(getFeeTemplates).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
  })

  it('把目前期別傳給 FeeTemplateDialog（新增模式不再固定 114-1）', async () => {
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    const dialog = wrapper.findComponent({ name: 'FeeTemplateDialog' })
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('defaultSchoolYear')).toBe(115)
    expect(dialog.props('defaultSemester')).toBe(1)
  })

  it('drawer 尺寸為響應式（窄幅不固定 720px 造成截斷）', async () => {
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    // size 以 CSS min() 收斂：桌面 720px、窄幅隨 viewport
    expect(wrapper.html()).toContain('min(720px')
  })
})
