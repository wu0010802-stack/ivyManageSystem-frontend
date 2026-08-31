/**
 * SettingsShiftTab 回歸（排班重設計 P0）。
 *
 * 鎖定：
 * - 列表以 include_usage 取得使用數；跨日 tag 與預估工時（跨度−休息）正確
 * - 表單具備 break_minutes／color／（編輯時）is_active 停用開關
 * - 空名稱擋下、不打 API
 * - 使用中班別刪除 → 引導改停用（updateShiftType is_active=false），絕不 hard delete
 * - 未使用班別可刪除
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockGetShiftTypes, mockCreate, mockUpdate, mockDelete } = vi.hoisted(() => ({
  mockGetShiftTypes: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/shifts', () => ({
  getShiftTypes: mockGetShiftTypes,
  createShiftType: mockCreate,
  updateShiftType: mockUpdate,
  deleteShiftType: mockDelete,
}))

const { mockMessage, mockConfirm } = vi.hoisted(() => ({
  mockMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  mockConfirm: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: mockMessage,
  ElMessageBox: { confirm: mockConfirm },
}))

const storeRefresh = vi.fn()
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({ refresh: storeRefresh }),
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

import SettingsShiftTab from '../SettingsShiftTab.vue'

// ── el-table / el-table-column scoped-slot stub：讓 cell 模板真的渲染 ──
const ElTableStub = {
  props: ['data'],
  provide() {
    return { getRows: () => (this as unknown as { data: unknown[] }).data }
  },
  template: '<div class="tbl"><slot /></div>',
}
const ElTableColumnStub = {
  props: ['label', 'prop', 'width', 'align', 'sortable', 'minWidth'],
  inject: ['getRows'],
  template: `
    <div class="col" :data-label="label">
      <div v-for="(row, i) in getRows()" :key="i" class="cell">
        <slot :row="row" :$index="i">{{ prop ? row[prop] : '' }}</slot>
      </div>
    </div>`,
}

const globalConfig = {
  stubs: {
    'el-table': ElTableStub,
    'el-table-column': ElTableColumnStub,
    'el-button': {
      props: ['type', 'link', 'loading'],
      emits: ['click'],
      template: '<button @click="$emit(\'click\')"><slot /></button>',
    },
    'el-tag': { props: ['type', 'size'], template: '<span class="tag"><slot /></span>' },
    'el-dialog': {
      props: ['modelValue', 'title', 'width'],
      template:
        '<div v-if="modelValue" class="dlg" :data-title="title"><slot /><slot name="footer" /></div>',
    },
    'el-form': { props: ['model', 'labelWidth'], template: '<form><slot /></form>' },
    'el-form-item': { props: ['label', 'required'], template: '<div :data-label="label"><slot /></div>' },
    'el-input': {
      props: ['modelValue', 'placeholder', 'maxlength'],
      emits: ['update:modelValue'],
      template:
        '<input class="inp" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
    'el-input-number': {
      props: ['modelValue', 'min', 'max', 'step'],
      emits: ['update:modelValue'],
      template: '<input class="num" type="number" :value="modelValue" />',
    },
    'el-time-select': {
      props: ['modelValue', 'start', 'end', 'step', 'placeholder'],
      emits: ['update:modelValue'],
      template: '<input class="time" :value="modelValue" />',
    },
    'el-switch': {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<input type="checkbox" :checked="modelValue" />',
    },
    'el-color-picker': {
      props: ['modelValue', 'predefine'],
      emits: ['update:modelValue'],
      template: '<div class="color-picker" />',
    },
  },
}

const ROWS = [
  {
    id: 1,
    name: '早值',
    work_start: '08:00',
    work_end: '17:00',
    break_minutes: 60,
    color: '#4EB87A',
    sort_order: 1,
    is_active: true,
    usage: { assignments: 3, daily: 1, swaps: 1, total: 5 },
  },
  {
    id: 2,
    name: '夜班',
    work_start: '22:00',
    work_end: '06:00',
    break_minutes: 0,
    color: null,
    sort_order: 2,
    is_active: true,
    usage: { assignments: 0, daily: 0, swaps: 0, total: 0 },
  },
]

const mountTab = async () => {
  const wrapper = mount(SettingsShiftTab, { global: globalConfig })
  await flushPromises()
  return wrapper
}

describe('SettingsShiftTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShiftTypes.mockResolvedValue({ data: ROWS })
    mockCreate.mockResolvedValue({ data: {} })
    mockUpdate.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('以 include_usage 取列表，渲染使用數／跨日 tag／預估工時', async () => {
    const wrapper = await mountTab()
    expect(mockGetShiftTypes).toHaveBeenCalledWith({ include_usage: true })
    const text = wrapper.text()
    expect(text).toContain('早值')
    expect(text).toContain('5') // usage.total
    expect(text).toContain('跨日') // 22:00-06:00
    expect(text).toContain('8.0h') // 08:00-17:00 − 60 分休息
    expect(text).toContain('8.0h')
  })

  it('新增：空名稱擋下，不打 API', async () => {
    const wrapper = await mountTab()
    await wrapper.find('button').trigger('click') // 新增班別
    const dlg = wrapper.find('.dlg')
    expect(dlg.exists()).toBe(true)
    const saveBtn = dlg.findAll('button').find((b) => b.text() === '儲存')
    await saveBtn!.trigger('click')
    expect(mockMessage.warning).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('新增：payload 含 break_minutes／color，且不含 is_active（新建預設啟用）', async () => {
    const wrapper = await mountTab()
    await wrapper.find('button').trigger('click')
    const dlg = wrapper.find('.dlg')
    await dlg.find('input.inp').setValue('新班別')
    const saveBtn = dlg.findAll('button').find((b) => b.text() === '儲存')
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.name).toBe('新班別')
    expect(payload).toHaveProperty('break_minutes', 0)
    expect(payload).toHaveProperty('color', null)
    expect(payload).not.toHaveProperty('is_active')
  })

  it('編輯 dialog 有停用開關；新增模式沒有', async () => {
    const wrapper = await mountTab()
    // 新增模式
    await wrapper.find('button').trigger('click')
    expect(wrapper.find('[data-test="active-switch"]').exists()).toBe(false)
    // 編輯模式（第一列的「編輯」）
    const editBtn = wrapper.findAll('button').find((b) => b.text() === '編輯')
    await editBtn!.trigger('click')
    expect(wrapper.find('[data-test="active-switch"]').exists()).toBe(true)
  })

  it('使用中班別刪除 → 引導改停用，絕不 hard delete', async () => {
    mockConfirm.mockResolvedValue('confirm')
    const wrapper = await mountTab()
    const deleteBtns = wrapper.findAll('button').filter((b) => b.text() === '刪除')
    await deleteBtns[0].trigger('click') // 早值 usage.total=5
    await flushPromises()
    expect(mockConfirm).toHaveBeenCalled()
    expect(String(mockConfirm.mock.calls[0][0])).toContain('停用')
    expect(mockUpdate).toHaveBeenCalledWith(1, { is_active: false })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('未使用班別可刪除', async () => {
    mockConfirm.mockResolvedValue('confirm')
    const wrapper = await mountTab()
    const deleteBtns = wrapper.findAll('button').filter((b) => b.text() === '刪除')
    await deleteBtns[1].trigger('click') // 夜班 usage.total=0
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith(2)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('列表一鍵停用走 updateShiftType', async () => {
    const wrapper = await mountTab()
    const toggle = wrapper.findAll('[data-test="toggle-active"]')[0]
    await toggle.trigger('click')
    await flushPromises()
    expect(mockUpdate).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('前往排班管理', async () => {
    const wrapper = await mountTab()
    await wrapper.find('[data-test="go-schedule"]').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/schedule')
  })
})
