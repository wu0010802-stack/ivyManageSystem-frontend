/**
 * ShiftTypesPanel 回歸（排班重設計 P0；2026-10 自「設定 › 輪班別管理」搬進排班與出勤「班別設定」頁籤）。
 *
 * 鎖定：
 * - 列表以 include_usage 取得使用數；跨日 tag 與預估工時（跨度−休息）正確
 * - 表單具備 break_minutes／color／（編輯時）is_active 停用開關
 * - 表單走 FormDialog（standardNarrow、label-top、建立班別／儲存）；必填與休息分鐘上限走 rules，
 *   驗證失敗不打 API；dirty 時關閉會先詢問捨棄
 * - 「被引用筆數」欄（usage.total＝排班／調班／換班紀錄筆數，不是人數）
 * - 列內「刪除」與「停用」同級（不常駐紅字），破壞性確認在確認框（確認鈕 danger）
 * - 使用中班別刪除 → 引導改停用（updateShiftType is_active=false），絕不 hard delete
 * - 未使用班別可刪除
 * - 班別異動成功才 emit changed（同頁常駐的班表核對靠它重抓班別選單）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, type PropType } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import AsyncValidator, { type Rules } from 'async-validator'

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

vi.mock('@/utils/auth', () => ({
  hasPermission: (permission: string) => permission === 'SCHEDULE',
}))

import ShiftTypesPanel from '../ShiftTypesPanel.vue'

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

// ⚠ vitest 下 Element Plus 的 ElForm.validate() 對任何輸入都回 true（async-validator 的 CJS/ESM interop 問題），
// 所以以 ValidatingForm 取代 el-form：用經 vite 載入（interop 正常）的 async-validator 對 model／rules 做真驗證。
// 它不看 prop 綁定，prop 是否接上由下方 data-prop 斷言補。EP 交給 async-validator 前會去掉 trigger，這裡照做。
const stripTrigger = (rules: Rules): Rules => Object.fromEntries(
  Object.entries(rules).map(([field, rule]) => [
    field,
    (Array.isArray(rule) ? rule : [rule]).map(({ trigger: _t, ...rest }: Record<string, unknown>) => rest),
  ]),
) as Rules

const ValidatingForm = defineComponent({
  name: 'ValidatingForm',
  props: {
    model: { type: Object as PropType<Record<string, unknown>>, required: true },
    rules: { type: Object as PropType<Rules>, default: () => ({}) },
    labelPosition: { type: String, default: 'right' },
  },
  setup(props, { slots, expose }) {
    expose({
      validate: async () => {
        try {
          await new AsyncValidator(stripTrigger(props.rules)).validate({ ...props.model })
          return true
        } catch {
          return false
        }
      },
    })
    return () => h('form', {}, slots.default?.())
  },
})

const globalConfig = {
  stubs: {
    'el-table': ElTableStub,
    'el-table-column': ElTableColumnStub,
    'el-button': {
      props: ['type', 'link', 'loading', 'disabled', 'icon'],
      emits: ['click'],
      template:
        '<button :data-type="type" :data-link="link" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
    },
    'el-tag': { props: ['type', 'size'], template: '<span class="tag"><slot /></span>' },
    'el-dialog': {
      props: ['modelValue', 'title', 'width'],
      template:
        '<div v-if="modelValue" class="dlg" :data-title="title" :data-width="width"><slot /><slot name="footer" /></div>',
    },
    'el-form': ValidatingForm,
    'el-form-item': {
      props: ['label', 'required', 'prop'],
      template: '<div :data-label="label" :data-prop="prop"><slot /></div>',
    },
    'el-input': {
      props: ['modelValue', 'placeholder', 'maxlength'],
      emits: ['update:modelValue'],
      template:
        '<input class="inp" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    },
    'el-input-number': {
      props: ['modelValue', 'min', 'max', 'step', 'controlsPosition'],
      emits: ['update:modelValue'],
      template:
        '<input class="num" type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
    },
    'el-time-select': {
      props: ['modelValue', 'start', 'end', 'step', 'placeholder'],
      emits: ['update:modelValue'],
      template:
        '<input class="time" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
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
  const wrapper = mount(ShiftTypesPanel, { global: globalConfig })
  await flushPromises()
  return wrapper
}

const SUBMIT = '[data-test="form-dialog-submit"]'
const CANCEL = '[data-test="form-dialog-cancel"]'

describe('ShiftTypesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetShiftTypes.mockResolvedValue({ data: ROWS })
    mockCreate.mockResolvedValue({ data: {} })
    mockUpdate.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('以 include_usage 取列表，渲染被引用筆數／跨日 tag／預估工時', async () => {
    const wrapper = await mountTab()
    expect(mockGetShiftTypes).toHaveBeenCalledWith({ include_usage: true })
    const text = wrapper.text()
    expect(text).toContain('早值')
    expect(text).toContain('5') // usage.total
    expect(text).toContain('跨日') // 22:00-06:00
    expect(text).toContain('8.0h') // 08:00-17:00 − 60 分休息
  })

  it('usage 欄名是「被引用筆數」（數的是紀錄筆數不是人數），hover 顯示三類明細', async () => {
    const wrapper = await mountTab()
    const labels = wrapper.findAll('.col').map((c) => c.attributes('data-label'))
    expect(labels).toContain('被引用筆數')
    expect(labels).not.toContain('使用中')
    const cell = wrapper.find('.col[data-label="被引用筆數"] .cell span')
    expect(cell.text()).toBe('5')
    expect(cell.attributes('title')).toBe('每週排班 3、每日調班 1、換班申請 1')
  })

  it('新增入口是 AdminCreateButton（primary＋Plus＋「新增班別」）', async () => {
    const wrapper = await mountTab()
    const btn = wrapper.get('[data-test="admin-create-button"]')
    expect(btn.text()).toBe('新增班別')
    expect(btn.attributes('data-type')).toBe('primary')
  })

  it('新增：FormDialog standardNarrow、主鈕「建立班別」、label-top 且不帶 label-width', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    const dlg = wrapper.get('.dlg')
    expect(dlg.classes()).toContain('ivy-form-dialog--standardNarrow')
    expect(dlg.attributes('data-width')).toBe('760px')
    expect(dlg.attributes('data-title')).toBe('新增班別')
    expect(dlg.get(SUBMIT).text()).toBe('建立班別')
    expect(wrapper.findComponent(ValidatingForm).props('labelPosition')).toBe('top')
    expect(wrapper.html()).not.toContain('label-width')
  })

  it('編輯：標題「編輯班別」、主鈕「儲存」', async () => {
    const wrapper = await mountTab()
    await wrapper.findAll('button').find((b) => b.text() === '編輯')!.trigger('click')
    const dlg = wrapper.get('.dlg')
    expect(dlg.attributes('data-title')).toBe('編輯班別')
    expect(dlg.get(SUBMIT).text()).toBe('儲存')
  })

  it('必填欄位都接上 form-item prop（與 rules 一一對應）', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    const bound = wrapper.findAll('.dlg [data-prop]').map((n) => n.attributes('data-prop'))
    const ruleKeys = Object.keys(wrapper.findComponent(ValidatingForm).props('rules') as Rules)
    expect(ruleKeys.sort()).toEqual(['break_minutes', 'name', 'work_end', 'work_start'])
    for (const key of ruleKeys) expect(bound).toContain(key)
  })

  it('新增：空名稱擋下，不打 API', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    await wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await flushPromises()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('新增：只有空白的名稱也擋下', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    await wrapper.get('.dlg input.inp').setValue('   ')
    await wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await flushPromises()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('休息分鐘大於等於班別時間跨度：擋下，不打 API', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    await wrapper.get('.dlg input.inp').setValue('短班')
    await wrapper.get('.dlg [data-label="下班時間"] input.time').setValue('09:00') // 08:00-09:00＝60 分
    await wrapper.get('.dlg [data-label="休息分鐘"] input.num').setValue(60)
    await wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await flushPromises()
    expect(mockCreate).not.toHaveBeenCalled()

    await wrapper.get('.dlg [data-label="休息分鐘"] input.num').setValue(30)
    await wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await flushPromises()
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ name: '短班', work_end: '09:00', break_minutes: 30 })
  })

  it('新增：payload 含 break_minutes／color，且不含 is_active（新建預設啟用）', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    const dlg = wrapper.get('.dlg')
    await dlg.get('input.inp').setValue('新班別')
    await dlg.get(SUBMIT).trigger('click')
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
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    expect(wrapper.find('[data-test="active-switch"]').exists()).toBe(false)
    // 編輯模式（第一列的「編輯」）
    const editBtn = wrapper.findAll('button').find((b) => b.text() === '編輯')
    await editBtn!.trigger('click')
    expect(wrapper.find('[data-test="active-switch"]').exists()).toBe(true)
  })

  describe('未儲存保護', () => {
    it('沒改任何欄位：取消直接關閉，不詢問', async () => {
      const wrapper = await mountTab()
      await wrapper.get('[data-test="admin-create-button"]').trigger('click')
      await wrapper.get(`.dlg ${CANCEL}`).trigger('click')
      await flushPromises()
      expect(mockConfirm).not.toHaveBeenCalled()
      expect(wrapper.find('.dlg').exists()).toBe(false)
    })

    it('改過欄位：取消先詢問捨棄；選留下則 dialog 不關', async () => {
      mockConfirm.mockRejectedValue('cancel')
      const wrapper = await mountTab()
      await wrapper.get('[data-test="admin-create-button"]').trigger('click')
      await wrapper.get('.dlg input.inp').setValue('寫到一半')
      await wrapper.get(`.dlg ${CANCEL}`).trigger('click')
      await flushPromises()
      expect(mockConfirm).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.dlg').exists()).toBe(true)
    })

    it('改過欄位：選捨棄才關閉；重開新增時 dirty 已重置', async () => {
      mockConfirm.mockResolvedValueOnce('confirm')
      const wrapper = await mountTab()
      await wrapper.get('[data-test="admin-create-button"]').trigger('click')
      await wrapper.get('.dlg input.inp').setValue('寫到一半')
      await wrapper.get(`.dlg ${CANCEL}`).trigger('click')
      await flushPromises()
      expect(wrapper.find('.dlg').exists()).toBe(false)

      mockConfirm.mockClear()
      await wrapper.get('[data-test="admin-create-button"]').trigger('click')
      await wrapper.get(`.dlg ${CANCEL}`).trigger('click')
      await flushPromises()
      expect(mockConfirm).not.toHaveBeenCalled()
    })
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

  it('未使用班別可刪除；確認框的確認鈕是 danger', async () => {
    mockConfirm.mockResolvedValue('confirm')
    const wrapper = await mountTab()
    const deleteBtns = wrapper.findAll('button').filter((b) => b.text() === '刪除')
    await deleteBtns[1].trigger('click') // 夜班 usage.total=0
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith(2)
    expect(mockUpdate).not.toHaveBeenCalled()
    const options = mockConfirm.mock.calls[0][2]
    expect(options.confirmButtonText).toBe('刪除')
    expect(options.confirmButtonClass).toContain('el-button--danger')
  })

  it('列內「刪除」與「停用」同級：都是 link、都不常駐紅字', async () => {
    const wrapper = await mountTab()
    const del = wrapper.findAll('button').find((b) => b.text() === '刪除')!
    const toggle = wrapper.get('[data-test="toggle-active"]')
    expect(del.attributes('data-link')).toBeDefined()
    expect(del.attributes('data-type')).toBeUndefined()
    expect(toggle.attributes('data-type')).toBeUndefined()
    expect(wrapper.findAll('button').some((b) => b.attributes('data-type') === 'danger')).toBe(false)
  })

  it('列表一鍵停用走 updateShiftType', async () => {
    const wrapper = await mountTab()
    const toggle = wrapper.findAll('[data-test="toggle-active"]')[0]
    await toggle.trigger('click')
    await flushPromises()
    expect(mockUpdate).toHaveBeenCalledWith(1, { is_active: false })
  })

  it('已在排班與出勤頁內：不再有「前往排班與出勤」按鈕', async () => {
    const wrapper = await mountTab()
    expect(wrapper.find('[data-test="go-schedule"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('前往排班與出勤')
  })

  it('新增、停用、刪除成功後各 emit 一次 changed', async () => {
    mockConfirm.mockResolvedValue('confirm')
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    await wrapper.get('.dlg input.inp').setValue('新班別')
    await wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(1)

    await wrapper.findAll('[data-test="toggle-active"]')[0].trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(2)

    await wrapper.findAll('button').filter((b) => b.text() === '刪除')[1].trigger('click')
    await flushPromises()
    expect(wrapper.emitted('changed')).toHaveLength(3)
  })

  it('驗證擋下或 API 失敗時不 emit changed', async () => {
    const wrapper = await mountTab()
    await wrapper.get('[data-test="admin-create-button"]').trigger('click')
    const save = () => wrapper.get(`.dlg ${SUBMIT}`).trigger('click')
    await save() // 空名稱
    await flushPromises()
    mockCreate.mockRejectedValueOnce(new Error('boom'))
    await wrapper.get('.dlg input.inp').setValue('新班別')
    await save()
    await flushPromises()
    expect(mockMessage.error).toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toBeUndefined()
  })
})
