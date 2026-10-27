import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import FestivalSuspensionPanel from '../FestivalSuspensionPanel.vue'

// 節慶停課月登記（義華 2026-10-27，第七篇第七條 3／4）：管理頁籤。
vi.mock('@/api/salary', () => ({
  listFestivalSuspensions: vi.fn(),
  getFestivalSuspensionDecision: vi.fn(),
  createFestivalSuspension: vi.fn(),
  updateFestivalSuspension: vi.fn(),
  deleteFestivalSuspension: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
  }
})

vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({
    classrooms: [
      { id: 3, name: '向日葵班' },
      { id: 4, name: '小熊班' },
    ],
    fetchClassrooms: vi.fn().mockResolvedValue(undefined),
  }),
}))

const { permState } = vi.hoisted(() => ({ permState: { perms: new Set<string>() } }))
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => permState.perms.has(name),
}))

import * as api from '@/api/salary'
import { ElMessage, ElMessageBox } from 'element-plus'

const ITEM_CLASS = {
  id: 11,
  year: 2026,
  month: 9,
  classroom_id: 3,
  classroom_name: '向日葵班',
  suspended_days: 12,
  reason: '颱風停課公告 115-09',
  triggers_suspension: true,
  created_by: 'hr01',
  updated_at: '2026-10-27T15:30:00',
}
const ITEM_SCHOOL = {
  id: 12,
  year: 2026,
  month: 9,
  classroom_id: null,
  classroom_name: '全園',
  suspended_days: 3,
  reason: null,
  triggers_suspension: false,
  created_by: 'hr01',
  updated_at: null,
}
const ITEM_SMALL = {
  id: 13,
  year: 2026,
  month: 9,
  classroom_id: 4,
  classroom_name: '小熊班',
  suspended_days: 3,
  reason: null,
  triggers_suspension: false,
  created_by: 'hr01',
  updated_at: null,
}
const GOOD_REASON = '颱風停課公告 115-09 號'
const DECISION = {
  year: 2026,
  month: 9,
  rule_enabled: true,
  school_reason: null,
  classes: [{ classroom_id: 3, classroom_name: '向日葵班', reason: '停課 12 日（含假日）達 10 日' }],
  warnings: ['2026-09 沒有月費單，未判定繳費率，只依登記的停課日數'],
}
const NO_STALE = { salary_records: 0, year_end_settlements: [], appraisal_summaries: [] }

// el-table / el-table-column 需要真的執行 scoped #default slot；沒有 slot 的欄位退回顯示 row[prop]
const ColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] }, prop: { type: String, default: '' } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'col-stub' },
        (props.data as Record<string, unknown>[]).map((row, i) =>
          h('div', { key: i }, slots.default ? slots.default({ row }) : String(row[props.prop] ?? '')),
        ),
      )
  },
})
const TableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table' },
        (slots.default?.() || []).map((vnode, i) => h(vnode.type, { ...vnode.props, data: props.data, key: i }, vnode.children)),
      )
  },
})
const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-')))
    return () => h('button', { ...dataAttrs, onClick: () => emit('click') }, slots.default?.())
  },
})
const FormDialogStub = defineComponent({
  props: { modelValue: Boolean, title: { type: String, default: '' } },
  emits: ['update:modelValue', 'submit'],
  setup(props, { emit, slots }) {
    return () =>
      props.modelValue
        ? h('div', { 'data-test': 'dialog' }, [
            h('h4', props.title),
            slots.default?.(),
            h('button', { 'data-test': 'dialog-submit', onClick: () => emit('submit') }, '送出'),
          ])
        : null
  },
})
const AlertStub = defineComponent({
  props: { title: { type: String, default: '' }, type: { type: String, default: '' } },
  setup(props, { attrs }) {
    return () => h('div', { ...attrs, class: `alert alert--${props.type}` }, props.title)
  },
})

type PanelVm = {
  year: number
  month: number
  items: unknown[]
  headline: { type: string; text: string } | null
  loadError: boolean
  form: { scope: number | string | null; suspended_days: number | null; reason: string }
  formError: string
  dialogVisible: boolean
  editingId: number | null
  classroomOptions: { value: number | string; label: string; disabled: boolean }[]
  openCreate: () => void
  openEdit: (row: typeof ITEM_CLASS) => void
  submit: () => Promise<void>
  remove: (row: typeof ITEM_CLASS) => Promise<void>
}

async function mountPanel(perms = ['SALARY_READ', 'SALARY_WRITE']) {
  permState.perms = new Set(perms)
  const wrapper = mount(FestivalSuspensionPanel, {
    global: {
      stubs: {
        'el-card': defineComponent({ setup: (_, { slots }) => () => h('div', [slots.header?.(), slots.default?.()]) }),
        'el-table': TableStub,
        'el-table-column': ColumnStub,
        'el-button': ButtonStub,
        'el-alert': AlertStub,
        'el-tag': { template: '<span class="tag"><slot /></span>' },
        'el-select': true,
        'el-option': true,
        'el-form': { template: '<form><slot /></form>' },
        'el-form-item': { template: '<div><slot /></div>' },
        'el-input': true,
        'el-input-number': true,
        FormDialog: FormDialogStub,
      },
      directives: { loading: () => {} },
    },
  })
  await flushPromises()
  return { wrapper, vm: wrapper.vm as unknown as PanelVm }
}

describe('FestivalSuspensionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.listFestivalSuspensions).mockResolvedValue({ data: { items: [ITEM_CLASS, ITEM_SCHOOL] } } as never)
    vi.mocked(api.getFestivalSuspensionDecision).mockResolvedValue({ data: DECISION } as never)
  })

  it('掛載時以目前年月載入登記列表與停發判定', async () => {
    const { vm } = await mountPanel()

    expect(api.listFestivalSuspensions).toHaveBeenCalledWith({ year: vm.year, month: vm.month })
    expect(api.getFestivalSuspensionDecision).toHaveBeenCalledWith({ year: vm.year, month: vm.month })
  })

  it('登記列表：班級、停課日數、原因、登記者；只有達門檻的列標「達停發門檻」', async () => {
    const { wrapper } = await mountPanel()
    const table = wrapper.find('[data-test="items-table"]')
    const text = table.text()

    expect(text).toContain('向日葵班')
    expect(text).toContain('全園')
    expect(text).toContain('12 日')
    expect(text).toContain('颱風停課公告 115-09')
    expect(text).toContain('hr01')
    expect(text).toContain('2026-10-27 15:30')
    expect(wrapper.findAll('[data-test="trigger-tag"]')).toHaveLength(1)
  })

  it('判定預覽：結論、會停發的班級與原因、無月費單警告', async () => {
    const { wrapper } = await mountPanel()

    expect(wrapper.find('[data-test="decision-headline"]').text()).toBe('1 個班級會停發節慶獎金')
    const classes = wrapper.find('[data-test="decision-classes"]').text()
    expect(classes).toContain('向日葵班')
    expect(classes).toContain('停課 12 日（含假日）達 10 日')
    expect(wrapper.find('[data-test="decision-warning"]').text()).toContain('沒有月費單')
  })

  it('全園停發：結論點出原因', async () => {
    vi.mocked(api.getFestivalSuspensionDecision).mockResolvedValue({
      data: { ...DECISION, school_reason: '全園停課 15 日', classes: [] },
    } as never)
    const { wrapper } = await mountPanel()

    expect(wrapper.find('[data-test="decision-headline"]').text()).toBe('全園停發：全園停課 15 日')
  })

  it('停發規則未開啟：明講登記不影響節慶獎金', async () => {
    vi.mocked(api.getFestivalSuspensionDecision).mockResolvedValue({
      data: { ...DECISION, rule_enabled: false },
    } as never)
    const { wrapper } = await mountPanel()

    const status = wrapper.find('[data-test="rule-status"]')
    expect(status.text()).toContain('尚未開啟')
    expect(status.text()).toContain('不會影響節慶獎金')
  })

  it('只有 SALARY_READ：看得到資料，沒有新增、編輯、刪除入口', async () => {
    const { wrapper } = await mountPanel(['SALARY_READ'])

    expect(wrapper.find('[data-test="items-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="create-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="edit-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="delete-11"]').exists()).toBe(false)
  })

  it('有 SALARY_WRITE：每列有編輯與刪除，頂部有新增', async () => {
    const { wrapper } = await mountPanel()

    expect(wrapper.find('[data-test="create-button"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="edit-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="delete-12"]').exists()).toBe(true)
  })

  it('沒有 SALARY_READ：不打 API，只顯示權限說明', async () => {
    const { wrapper } = await mountPanel([])

    expect(api.listFestivalSuspensions).not.toHaveBeenCalled()
    expect(api.getFestivalSuspensionDecision).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="items-table"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('薪資檢視')
  })

  it('切換月份：以新年月重新載入', async () => {
    const { vm } = await mountPanel()

    vm.month = vm.month === 1 ? 2 : 1
    await flushPromises()

    expect(api.listFestivalSuspensions).toHaveBeenLastCalledWith({ year: vm.year, month: vm.month })
    expect(api.getFestivalSuspensionDecision).toHaveBeenLastCalledWith({ year: vm.year, month: vm.month })
  })

  it('載入失敗：清掉舊資料、顯示重試，不假裝這個月沒有登記', async () => {
    vi.mocked(api.listFestivalSuspensions).mockRejectedValue(new Error('boom'))
    const { wrapper, vm } = await mountPanel()

    expect(vm.loadError).toBe(true)
    expect(vm.items).toEqual([])
    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="items-table"]').exists()).toBe(false)
    expect(ElMessage.error).toHaveBeenCalled()

    vi.mocked(api.listFestivalSuspensions).mockResolvedValue({ data: { items: [ITEM_CLASS] } } as never)
    await wrapper.find('[data-test="retry-button"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="load-error"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="items-table"]').exists()).toBe(true)
  })

  describe('新增', () => {
    it('登記班級：送出年月、班級、日數與原因，成功後重新載入', async () => {
      vi.mocked(api.createFestivalSuspension).mockResolvedValue({
        data: { message: '已登記', item: ITEM_CLASS, stale: NO_STALE },
      } as never)
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 4
      vm.form.suspended_days = 12
      vm.form.reason = `  ${GOOD_REASON}  `

      await vm.submit()
      await flushPromises()

      expect(api.createFestivalSuspension).toHaveBeenCalledWith({
        year: vm.year,
        month: vm.month,
        classroom_id: 4,
        suspended_days: 12,
        reason: GOOD_REASON,
      })
      expect(ElMessage.success).toHaveBeenCalledWith('已登記')
      expect(vm.dialogVisible).toBe(false)
      expect(api.listFestivalSuspensions).toHaveBeenCalledTimes(2)
    })

    it('登記全園：classroom_id 送 null，原因必填', async () => {
      vi.mocked(api.createFestivalSuspension).mockResolvedValue({
        data: { message: '已登記', item: ITEM_SCHOOL, stale: NO_STALE },
      } as never)
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 'school'
      vm.form.suspended_days = 5
      vm.form.reason = GOOD_REASON

      await vm.submit()

      expect(api.createFestivalSuspension).toHaveBeenCalledWith(
        expect.objectContaining({ classroom_id: null, suspended_days: 5, reason: GOOD_REASON }),
      )
    })

    it('登記未達門檻的班級：原因可以不填，空白原因送 null', async () => {
      vi.mocked(api.createFestivalSuspension).mockResolvedValue({
        data: { message: '已登記', item: ITEM_SMALL, stale: NO_STALE },
      } as never)
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 4
      vm.form.suspended_days = 9
      vm.form.reason = '   '
      expect(vm.reasonRequired).toBe(false)

      await vm.submit()

      expect(api.createFestivalSuspension).toHaveBeenCalledWith(
        expect.objectContaining({ classroom_id: 4, suspended_days: 9, reason: null }),
      )
    })

    it('全園或班級日數 >=10：原因必填，畫面標必填並說明；不足 10 字擋下不打 API', async () => {
      const { wrapper, vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 4
      vm.form.suspended_days = 10
      await flushPromises()

      expect(vm.reasonRequired).toBe(true)
      expect(wrapper.find('[data-test="reason-required-hint"]').text()).toContain('至少 10 字')

      for (const bad of ['', '   ', '颱風停課', '一二三四五六七八九', '  一二三四五  ']) {
        vm.form.reason = bad
        await vm.submit()
        expect(vm.formError).toContain('至少 10 字')
        expect(vm.formError).toContain('登記')
      }
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()

      vm.form.scope = 'school'
      vm.form.suspended_days = 0
      expect(vm.reasonRequired).toBe(true)
      vm.form.reason = ''
      await vm.submit()
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()
    })

    it('日數降到 <10 的班級登記，不再顯示必填說明', async () => {
      const { wrapper, vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 4
      vm.form.suspended_days = 9
      await flushPromises()

      expect(vm.reasonRequired).toBe(false)
      expect(wrapper.find('[data-test="reason-required-hint"]').exists()).toBe(false)
    })

    it('後端 422（例如原因被判不足）：顯示後端訊息、對話框保留', async () => {
      vi.mocked(api.createFestivalSuspension).mockRejectedValue({
        response: {
          status: 422,
          data: { detail: '全園停課或停課日數達 10 日以上會影響節慶獎金，登記須填寫原因／公告依據（去除空白後至少 10 字）' },
        },
      })
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 3
      vm.form.suspended_days = 12
      vm.form.reason = GOOD_REASON

      await vm.submit()
      await flushPromises()

      expect(vi.mocked(ElMessage.error).mock.calls[0][0] as string).toContain('須填寫原因')
      expect(vm.dialogVisible).toBe(true)
    })

    it('規則已開啟、有薪資被標待重算：另外警告要重算，並講年終草稿編號', async () => {
      vi.mocked(api.createFestivalSuspension).mockResolvedValue({
        data: {
          message: '已登記',
          item: ITEM_CLASS,
          stale: { salary_records: 7, year_end_settlements: [31], appraisal_summaries: [] },
        },
      } as never)
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 3
      vm.form.suspended_days = 12
      vm.form.reason = GOOD_REASON

      await vm.submit()

      const warning = vi.mocked(ElMessage.warning).mock.calls[0][0] as { message: string }
      expect(warning.message).toContain('7 筆未封存薪資')
      expect(warning.message).toContain('編號 31')
    })

    it('沒選班級也沒選全園：擋下並說明，不打 API', async () => {
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.suspended_days = 12

      await vm.submit()

      expect(vm.formError).toContain('班級')
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()
    })

    it('停課日數超過當月天數：擋下並說明，不打 API', async () => {
      const { vm } = await mountPanel()
      vm.year = 2026
      vm.month = 2
      await flushPromises()
      vm.openCreate()
      vm.form.scope = 3
      vm.form.suspended_days = 30
      vm.form.reason = GOOD_REASON

      await vm.submit()

      expect(vm.formError).toContain('2026-02')
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()
    })

    it('日數沒填：擋下', async () => {
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 3

      await vm.submit()

      expect(vm.formError).not.toBe('')
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()
    })

    it('後端 409（例如薪資已封存）：顯示後端訊息、對話框保留讓使用者看到，不重新載入', async () => {
      vi.mocked(api.createFestivalSuspension).mockRejectedValue({
        response: { status: 409, data: { detail: '2026 年 10 月薪資已封存，無法異動節慶停課登記' } },
      })
      const { vm } = await mountPanel()
      vm.openCreate()
      vm.form.scope = 3
      vm.form.suspended_days = 12
      vm.form.reason = GOOD_REASON

      await vm.submit()
      await flushPromises()

      const message = vi.mocked(ElMessage.error).mock.calls[0][0] as string
      expect(message).toContain('薪資已封存')
      expect(vm.dialogVisible).toBe(true)
      expect(api.listFestivalSuspensions).toHaveBeenCalledTimes(1)
    })

    it('本月已登記的班級與全園在選單中停用，避免必定 409 的重複登記', async () => {
      const { vm } = await mountPanel()

      const byValue = Object.fromEntries(vm.classroomOptions.map((o) => [String(o.value), o]))
      expect(byValue['3'].disabled).toBe(true)
      expect(byValue['3'].label).toContain('本月已登記')
      expect(byValue['4'].disabled).toBe(false)
      expect(byValue.school.disabled).toBe(true)
    })
  })

  describe('編輯', () => {
    it('帶入既有值；不能改班級；送出只含日數與原因', async () => {
      vi.mocked(api.updateFestivalSuspension).mockResolvedValue({
        data: { message: '已更新', item: ITEM_CLASS, stale: NO_STALE },
      } as never)
      const { wrapper, vm } = await mountPanel()

      vm.openEdit(ITEM_CLASS)
      await flushPromises()
      expect(vm.editingId).toBe(11)
      expect(vm.form.suspended_days).toBe(12)
      expect(vm.form.reason).toBe('颱風停課公告 115-09')
      expect(wrapper.find('[data-test="scope-select"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="dialog"]').text()).toContain('向日葵班')

      vm.form.suspended_days = 14
      vm.form.reason = '  颱風延長停課，公告 115-09-2  '
      await vm.submit()
      await flushPromises()

      expect(api.updateFestivalSuspension).toHaveBeenCalledWith(11, {
        suspended_days: 14,
        reason: '颱風延長停課，公告 115-09-2',
      })
      expect(api.createFestivalSuspension).not.toHaveBeenCalled()
      expect(ElMessage.success).toHaveBeenCalledWith('已更新')
    })

    it('原本 >=10 日改成 <10：改前會停發，仍要寫原因（恢復發放也要留依據）', async () => {
      const { vm } = await mountPanel()
      vm.openEdit(ITEM_CLASS)
      vm.form.suspended_days = 5
      vm.form.reason = ''

      expect(vm.reasonRequired).toBe(true)
      await vm.submit()

      expect(vm.formError).toContain('修改')
      expect(vm.formError).toContain('至少 10 字')
      expect(api.updateFestivalSuspension).not.toHaveBeenCalled()
    })

    it('原本 <10 日改成 >=10：改後會停發，要寫原因', async () => {
      const { vm } = await mountPanel()
      vm.openEdit(ITEM_SMALL as unknown as typeof ITEM_CLASS)
      expect(vm.reasonRequired).toBe(false)
      vm.form.suspended_days = 10

      expect(vm.reasonRequired).toBe(true)
      await vm.submit()
      expect(api.updateFestivalSuspension).not.toHaveBeenCalled()
    })

    it('前後都 <10 的班級：原因可空，空白送 null', async () => {
      vi.mocked(api.updateFestivalSuspension).mockResolvedValue({
        data: { message: '已更新', item: ITEM_SMALL, stale: NO_STALE },
      } as never)
      const { vm } = await mountPanel()
      vm.openEdit(ITEM_SMALL as unknown as typeof ITEM_CLASS)
      vm.form.suspended_days = 5
      vm.form.reason = ''

      await vm.submit()

      expect(api.updateFestivalSuspension).toHaveBeenCalledWith(13, { suspended_days: 5, reason: null })
    })

    it('全園列編輯時，scope 帶回全園，原因一律必填', async () => {
      const { vm } = await mountPanel()

      vm.openEdit(ITEM_SCHOOL as unknown as typeof ITEM_CLASS)

      expect(vm.form.scope).toBe('school')
      expect(vm.reasonRequired).toBe(true)
    })
  })

  describe('刪除', () => {
    const DELETED = { data: { message: '已刪除', item: null, stale: NO_STALE } }

    it('刪除 >=10 日的班級登記：先問原因（至少 10 字），原因隨 DELETE 送出並重新載入', async () => {
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: `  ${GOOD_REASON}  `, action: 'confirm' } as never)
      vi.mocked(api.deleteFestivalSuspension).mockResolvedValue(DELETED as never)
      const { vm } = await mountPanel()

      await vm.remove(ITEM_CLASS)
      await flushPromises()

      const message = vi.mocked(ElMessageBox.prompt).mock.calls[0][0] as string
      expect(message).toContain('向日葵班')
      expect(message).toContain('12 日')
      expect(message).toContain('恢復發放')
      expect(ElMessageBox.confirm).not.toHaveBeenCalled()
      expect(api.deleteFestivalSuspension).toHaveBeenCalledWith(11, GOOD_REASON)
      expect(ElMessage.success).toHaveBeenCalledWith('已刪除')
      expect(api.listFestivalSuspensions).toHaveBeenCalledTimes(2)
    })

    it('刪除全園登記（即使只有 3 日）也要問原因', async () => {
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: GOOD_REASON, action: 'confirm' } as never)
      vi.mocked(api.deleteFestivalSuspension).mockResolvedValue(DELETED as never)
      const { vm } = await mountPanel()

      await vm.remove(ITEM_SCHOOL)
      await flushPromises()

      expect(ElMessageBox.prompt).toHaveBeenCalled()
      expect(api.deleteFestivalSuspension).toHaveBeenCalledWith(12, GOOD_REASON)
    })

    it('原因輸入框的驗證與後端一致：不足 10 字回說明、足夠通過', async () => {
      vi.mocked(ElMessageBox.prompt).mockRejectedValue('cancel')
      const { vm } = await mountPanel()

      await vm.remove(ITEM_CLASS)

      const options = vi.mocked(ElMessageBox.prompt).mock.calls[0][2] as {
        inputValidator: (v: string) => string | boolean
      }
      expect(options.inputValidator('颱風停課')).toContain('至少 10 字')
      expect(options.inputValidator('   ')).toContain('至少 10 字')
      expect(options.inputValidator(GOOD_REASON)).toBe(true)
    })

    it('未達門檻的班級登記：單純確認，不問原因、DELETE 不帶 reason', async () => {
      vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
      vi.mocked(api.deleteFestivalSuspension).mockResolvedValue(DELETED as never)
      const { vm } = await mountPanel()

      await vm.remove(ITEM_SMALL as unknown as typeof ITEM_CLASS)
      await flushPromises()

      expect(ElMessageBox.prompt).not.toHaveBeenCalled()
      expect(vi.mocked(ElMessageBox.confirm).mock.calls[0][0] as string).toContain('小熊班')
      expect(api.deleteFestivalSuspension).toHaveBeenCalledWith(13, undefined)
    })

    it('按取消：不刪除', async () => {
      vi.mocked(ElMessageBox.prompt).mockRejectedValue('cancel')
      const { vm } = await mountPanel()

      await vm.remove(ITEM_CLASS)

      expect(api.deleteFestivalSuspension).not.toHaveBeenCalled()
    })

    it('後端 409：顯示後端訊息，不重新載入', async () => {
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: GOOD_REASON, action: 'confirm' } as never)
      vi.mocked(api.deleteFestivalSuspension).mockRejectedValue({
        response: { status: 409, data: { detail: '薪資正在批次計算中，請稍後再試' } },
      })
      const { vm } = await mountPanel()

      await vm.remove(ITEM_CLASS)
      await flushPromises()

      expect(vi.mocked(ElMessage.error).mock.calls[0][0] as string).toContain('批次計算中')
      expect(api.listFestivalSuspensions).toHaveBeenCalledTimes(1)
    })

    it('後端 422：顯示後端訊息', async () => {
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: GOOD_REASON, action: 'confirm' } as never)
      vi.mocked(api.deleteFestivalSuspension).mockRejectedValue({
        response: { status: 422, data: { detail: '全園停課或停課日數達 10 日以上會影響節慶獎金，刪除須填寫原因／公告依據（去除空白後至少 10 字）' } },
      })
      const { vm } = await mountPanel()

      await vm.remove(ITEM_CLASS)
      await flushPromises()

      expect(vi.mocked(ElMessage.error).mock.calls[0][0] as string).toContain('刪除須填寫原因')
    })
  })
})
