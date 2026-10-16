import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, type PropType } from 'vue'
import AsyncValidator, { type Rules } from 'async-validator'
import ElementPlus, { ElMessage } from 'element-plus'
import ClassroomView from '@/views/ClassroomView.vue'
import FormDialog from '@/components/common/FormDialog.vue'

// 2026-10-08 班級管理第二輪 Task 4：編輯／新增班級對話框改用 FormDialog。
// 本檔以「真的 Element Plus 表單元件」驗證契約（欄位組成、容量下限、diff payload、名冊入口），
// 只 stub el-dialog（teleport 在 happy-dom 下難斷言）與重型子元件。
//
// ⚠ 唯一例外是 el-form：vitest 下 Element Plus 的表單驗證是「無聲失效」的——EP 原生 ESM 載入
// async-validator 的 CJS 版，default 匯出變成 { default: Schema }，form-item 內 new AsyncValidator 拋
// TypeError 被吞成 reject(undefined)，form.validate() 對任何輸入都回 true。所以這裡用 ValidatingForm
// 取代 el-form：以經 vite 載入（interop 正常）的 async-validator 對 model／rules 做真驗證，
// 並暴露與 el-form 相同的 validate(callback)。

const mocks = vi.hoisted(() => ({
  perms: new Set<string>(),
  getClassrooms: vi.fn(),
  getClassroom: vi.fn(),
  getGrades: vi.fn(),
  getTeacherOptions: vi.fn(),
  createClassroom: vi.fn(),
  updateClassroom: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
  onBeforeRouteLeave: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: (name: string) => mocks.perms.has(name) }))
vi.mock('@/api/classrooms', () => ({
  createClassroom: (...a: unknown[]) => mocks.createClassroom(...a),
  deleteClassroom: vi.fn(),
  getClassroom: (...a: unknown[]) => mocks.getClassroom(...a),
  getClassrooms: (...a: unknown[]) => mocks.getClassrooms(...a),
  getGrades: (...a: unknown[]) => mocks.getGrades(...a),
  getTeacherOptions: (...a: unknown[]) => mocks.getTeacherOptions(...a),
  updateClassroom: (...a: unknown[]) => mocks.updateClassroom(...a),
}))
vi.mock('@/api/recruitmentIntake', () => ({
  getIntakePlan: vi.fn(() => Promise.resolve({ data: { rows: [] } })),
}))
vi.mock('@/stores/classroom', () => ({
  useClassroomStore: () => ({ refresh: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 115, semester: 1 }),
}))

const detail = {
  id: 7,
  name: '天堂鳥',
  class_code: '大1',
  school_year: 115,
  semester: 1,
  semester_label: '115學年度上學期',
  grade_id: 3,
  grade_name: '大班',
  capacity: 30,
  current_count: 27,
  is_active: true,
  head_teacher_id: 11,
  assistant_teacher_id: 12,
  english_teacher_id: 13,
  students: [],
}

// EP 的 form-item 在交給 async-validator 前會去掉 trigger（多一個 key，{required} 就不再走純必填路徑，
// 數值欄位會被當 string 型別擋下），這裡照做才與瀏覽器行為一致。
const stripTrigger = (rules: Rules): Rules => Object.fromEntries(
  Object.entries(rules).map(([field, rule]) => [
    field,
    (Array.isArray(rule) ? rule : [rule]).map(({ trigger: _t, ...rest }: Record<string, unknown>) => rest),
  ]),
) as Rules

/** 以單一欄位的 rules 驗證一個值，回第一則錯誤文案（通過回 null） */
const firstError = (rules: Rules, field: string, value: unknown) => (
  new AsyncValidator(stripTrigger({ [field]: rules[field] }))
    .validate({ [field]: value })
    .then(() => null, (e: { errors: { message: string }[] }) => e.errors[0].message)
)

const ValidatingForm = defineComponent({
  name: 'ValidatingForm',
  props: {
    model: { type: Object as PropType<Record<string, unknown>>, required: true },
    rules: { type: Object as PropType<Rules>, default: () => ({}) },
    labelPosition: { type: String, default: 'right' },
  },
  setup(props, { slots, expose }) {
    expose({
      validate: async (cb: (valid: boolean) => unknown) => {
        try {
          await new AsyncValidator(stripTrigger(props.rules)).validate({ ...props.model })
          await cb(true)
        } catch {
          await cb(false)
        }
      },
    })
    return () => h('form', {}, slots.default?.())
  },
})

const stubs = {
  'el-form': ValidatingForm,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  PlanStatusCard: true,
  ClassroomStudentDrawer: true,
  ClassroomChangeLogDrawer: true,
  EnrollmentRosterDialog: true,
}

interface SetupState {
  form: Record<string, unknown>
  isEdit: boolean
  dialogVisible: boolean
  rules: Rules
  openEdit: (c: { id: number }) => Promise<void>
  openCreate: () => Promise<void>
}

async function mountView() {
  const wrapper = mount(ClassroomView, {
    global: { plugins: [ElementPlus], stubs },
  })
  await flushPromises()
  const ss = wrapper.vm.$.setupState as unknown as SetupState
  return { wrapper, ss }
}

const openEditMode = async () => {
  const ctx = await mountView()
  await ctx.ss.openEdit({ id: 7 })
  await flushPromises()
  return ctx
}

const clickSubmit = async (wrapper: ReturnType<typeof mount>) => {
  await wrapper.find('[data-test="form-dialog-submit"]').trigger('click')
  await flushPromises()
}

describe('ClassroomView 編輯／新增班級對話框（FormDialog）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.perms.clear()
    mocks.perms.add('CLASSROOMS_WRITE')
    mocks.perms.add('STUDENTS_READ')
    mocks.getClassrooms.mockResolvedValue({ data: [] })
    mocks.getClassroom.mockResolvedValue({ data: { ...detail } })
    mocks.getGrades.mockResolvedValue({ data: [{ id: 3, name: '大班', sort_order: 3 }] })
    mocks.getTeacherOptions.mockResolvedValue({
      data: [
        { id: 11, name: '陳怡君', employee_id: 'T021', position: '班導師' },
        { id: 12, name: '林雅婷', employee_id: 'T018', position: '教保員' },
        { id: 13, name: '張書豪', employee_id: 'T032', position: '才藝老師' },
      ],
    })
    mocks.updateClassroom.mockResolvedValue({ data: {} })
    mocks.createClassroom.mockResolvedValue({ data: {} })
  })

  describe('殼層', () => {
    it('編輯模式：FormDialog standard 寬、送出鈕「儲存變更」、標題「編輯班級」', async () => {
      const { wrapper } = await openEditMode()
      const dlg = wrapper.findComponent(FormDialog)
      expect(dlg.exists()).toBe(true)
      expect(dlg.props('size')).toBe('standard')
      expect(dlg.props('submitText')).toBe('儲存變更')
      expect(dlg.props('title')).toBe('編輯班級')
    })

    it('新增模式：送出鈕「建立班級」、標題「新增班級」', async () => {
      const { wrapper, ss } = await mountView()
      await ss.openCreate()
      await flushPromises()
      const dlg = wrapper.findComponent(FormDialog)
      expect(dlg.props('submitText')).toBe('建立班級')
      expect(dlg.props('title')).toBe('新增班級')
    })

    it('開啟後未改動為 clean；改任一欄位即 dirty（關閉前才會跳捨棄確認）', async () => {
      const { wrapper, ss } = await openEditMode()
      expect(wrapper.findComponent(FormDialog).props('dirty')).toBe(false)
      ss.form.name = '改名'
      await nextTick()
      expect(wrapper.findComponent(FormDialog).props('dirty')).toBe(true)
    })

    it('沒有班級寫入權限：送出鈕 disabled', async () => {
      mocks.perms.delete('CLASSROOMS_WRITE')
      const { wrapper } = await openEditMode()
      expect(wrapper.findComponent(FormDialog).props('disabled')).toBe(true)
    })
  })

  describe('學年度／學期', () => {
    it('編輯模式：唯讀顯示「115學年度 上學期」，且沒有學年度／學期選單', async () => {
      const { wrapper } = await openEditMode()
      const ro = wrapper.find('[data-test="term-readonly"]')
      expect(ro.exists()).toBe(true)
      expect(ro.text()).toContain('115學年度 上學期')
      expect(wrapper.find('[data-test="field-school-year"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="field-semester"]').exists()).toBe(false)
      // 說明：學期在建立時決定，下一學年請走預編班
      expect(wrapper.text()).toContain('下一學年的班級請用「新學年預編班」產生')
    })

    it('新增模式：保留學年度與學期兩個可選欄位，沒有唯讀區', async () => {
      const { wrapper, ss } = await mountView()
      await ss.openCreate()
      await flushPromises()
      expect(wrapper.find('[data-test="field-school-year"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="field-semester"]').exists()).toBe(true)
      expect(wrapper.find('[data-test="term-readonly"]').exists()).toBe(false)
    })
  })

  describe('欄位組成', () => {
    it('不再有「啟用狀態」開關，也不再有 descriptions／學生 tag 名單', async () => {
      const { wrapper } = await openEditMode()
      const body = wrapper.find('[data-test="form-dialog-body"]')
      expect(body.text()).not.toContain('啟用狀態')
      expect(body.find('.el-switch').exists()).toBe(false)
      expect(body.find('.el-descriptions').exists()).toBe(false)
      expect(body.find('.student-tag').exists()).toBe(false)
      expect(body.text()).not.toContain('學生名單')
    })

    it('el-form 為 label-top 的 form-grid，且不帶 label-width', async () => {
      const { wrapper } = await openEditMode()
      const form = wrapper.findComponent(ValidatingForm)
      expect(form.props('labelPosition')).toBe('top')
      expect(form.classes()).toContain('form-grid')
      expect(form.attributes()).not.toHaveProperty('label-width')
      // 各欄 el-form-item 也不得單獨帶 label-width（舊版教師欄寫過 90px）
      expect(wrapper.html()).not.toContain('label-width')
    })

    it('編輯模式顯示容量與班級代號的就地說明', async () => {
      const { wrapper } = await openEditMode()
      const text = wrapper.find('[data-test="form-dialog-body"]').text()
      expect(text).toContain('名冊、在籍記錄表的欄位代號都使用這個值')
      expect(text).toContain('目前在學 27 人')
    })
  })

  describe('容量下限', () => {
    it('容量調低到小於在學人數：驗證失敗、不送出', async () => {
      const { wrapper, ss } = await openEditMode()
      ss.form.capacity = 20
      await nextTick()
      await clickSubmit(wrapper)
      expect(mocks.updateClassroom).not.toHaveBeenCalled()
    })

    it('容量規則的錯誤文案：目前在學 N 人，容量不可低於 N', async () => {
      const { ss } = await openEditMode()
      ss.form.capacity = 20
      expect(await firstError(ss.rules, 'capacity', ss.form.capacity)).toBe('目前在學 27 人，容量不可低於 27')
    })

    it('必填規則文案沿用 @/validators/rules（輸入類「請輸入」、選擇類「請選擇」）', async () => {
      const { ss } = await mountView()
      expect(await firstError(ss.rules, 'name', '')).toBe('請輸入班級名稱')
      expect(await firstError(ss.rules, 'grade_id', null)).toBe('請選擇年級')
      expect(await firstError(ss.rules, 'capacity', undefined)).toBe('請輸入班級容量')
    })

    it('容量未變動（即使既有容量已低於在學人數）：通過驗證', async () => {
      mocks.getClassroom.mockResolvedValue({ data: { ...detail, capacity: 25, current_count: 27 } })
      const { wrapper, ss } = await openEditMode()
      ss.form.name = '改名'
      await nextTick()
      await clickSubmit(wrapper)
      expect(mocks.updateClassroom).toHaveBeenCalledTimes(1)
    })

    it('容量改成剛好等於在學人數：通過', async () => {
      const { wrapper, ss } = await openEditMode()
      ss.form.capacity = 27
      await nextTick()
      await clickSubmit(wrapper)
      expect(mocks.updateClassroom).toHaveBeenCalledTimes(1)
      expect(mocks.updateClassroom.mock.calls[0][1]).toEqual({ capacity: 27 })
    })

    it('新增模式沒有在學人數，不套容量下限', async () => {
      const { wrapper, ss } = await mountView()
      await ss.openCreate()
      await flushPromises()
      Object.assign(ss.form, { name: '新班', grade_id: 3, capacity: 5 })
      await nextTick()
      await clickSubmit(wrapper)
      expect(mocks.createClassroom).toHaveBeenCalledTimes(1)
    })
  })

  describe('只送有變動的欄位', () => {
    it('只改老師：payload 只含被改的老師欄位，不含 capacity、is_active、name', async () => {
      const { wrapper, ss } = await openEditMode()
      ss.form.head_teacher_id = 12
      ss.form.assistant_teacher_id = null
      await nextTick()
      await clickSubmit(wrapper)
      expect(mocks.updateClassroom).toHaveBeenCalledTimes(1)
      const [id, payload] = mocks.updateClassroom.mock.calls[0] as [number, Record<string, unknown>]
      expect(id).toBe(7)
      expect(payload).toEqual({ head_teacher_id: 12, assistant_teacher_id: null })
      expect(payload).not.toHaveProperty('capacity')
      expect(payload).not.toHaveProperty('is_active')
    })

    it('後端 400 的 detail 會原文顯示給使用者（容量低於在學人數）', async () => {
      const detailMsg = '班級容量不可低於目前在學人數（27 人）'
      mocks.updateClassroom.mockRejectedValue({ response: { status: 400, data: { detail: detailMsg } } })
      const errSpy = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: () => {} }) as never)
      const { wrapper, ss } = await openEditMode()
      ss.form.capacity = 28
      await nextTick()
      await clickSubmit(wrapper)
      expect(errSpy).toHaveBeenCalledWith(detailMsg)
    })
  })

  describe('教師異動提示', () => {
    it('老師與初值相同時不顯示；任一老師異動後顯示薪資重算提示', async () => {
      const { wrapper, ss } = await openEditMode()
      expect(wrapper.find('[data-test="teacher-change-warning"]').exists()).toBe(false)
      ss.form.english_teacher_id = null
      await nextTick()
      const warn = wrapper.find('[data-test="teacher-change-warning"]')
      expect(warn.exists()).toBe(true)
      expect(warn.text()).toContain('變更教師指派後，相關教師本月薪資會標記為需要重新計算。')
    })

    it('新增模式不顯示該提示', async () => {
      const { wrapper, ss } = await mountView()
      await ss.openCreate()
      await flushPromises()
      ss.form.head_teacher_id = 11
      await nextTick()
      expect(wrapper.find('[data-test="teacher-change-warning"]').exists()).toBe(false)
    })
  })

  describe('名冊入口', () => {
    it('編輯模式顯示「班級學生：N 人在學」與「開啟名冊」', async () => {
      const { wrapper } = await openEditMode()
      const row = wrapper.find('[data-test="roster-row"]')
      expect(row.exists()).toBe(true)
      expect(row.text()).toContain('27 人在學')
      expect(wrapper.find('[data-test="open-roster"]').text()).toContain('開啟名冊')
    })

    it('新增模式沒有名冊列', async () => {
      const { wrapper, ss } = await mountView()
      await ss.openCreate()
      await flushPromises()
      expect(wrapper.find('[data-test="roster-row"]').exists()).toBe(false)
    })

    it('沒有 STUDENTS_READ：不顯示「開啟名冊」', async () => {
      mocks.perms.delete('STUDENTS_READ')
      const { wrapper } = await openEditMode()
      expect(wrapper.find('[data-test="open-roster"]').exists()).toBe(false)
    })

    it('表單有未儲存變更：開啟名冊鈕 disabled 並提示先儲存或取消', async () => {
      const { wrapper, ss } = await openEditMode()
      ss.form.name = '改名'
      await nextTick()
      const btn = wrapper.find('[data-test="open-roster"]')
      expect(btn.attributes('disabled')).toBeDefined()
      expect(btn.attributes('title')).toBe('請先儲存或取消變更')
    })

    it('乾淨時點擊：先關閉編輯對話框，再開學生名冊抽屜', async () => {
      const { wrapper, ss } = await openEditMode()
      expect(ss.dialogVisible).toBe(true)
      mocks.getClassroom.mockClear()
      await wrapper.find('[data-test="open-roster"]').trigger('click')
      await flushPromises()
      expect(ss.dialogVisible).toBe(false)
      // openStudentDrawer 自行以 id 取班級詳情
      expect(mocks.getClassroom).toHaveBeenCalledWith(7)
    })
  })
})
