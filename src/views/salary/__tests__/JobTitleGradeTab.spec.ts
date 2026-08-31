import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, reactive, type VNode } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import JobTitleGradeTab from '@/views/salary/components/JobTitleGradeTab.vue'

/**
 * 「職稱等級對應」tab（薪資設定 → 獎金設定）。
 *
 * 三條缺陷的回歸鎖（2026-08-28）：
 *
 * 1. 清空等級（el-select clearable）沒有任何警告。清空後該職稱從 grade_map 消失，
 *    後端 get_festival_bonus_base 會 fallback 成 C 級（班導 2000 → 1500），
 *    而且員工個別指定的 bonus_grade 覆蓋要反查代表職稱，也會一起失效。
 * 2. 存檔後不重抓，UI 與 DB 可能不一致；後端回傳的
 *    salary_records_marked_stale（被標記待重算的未封存薪資筆數）也被丟掉。
 * 3. 說明欄的獎金金額原本寫死 2000/1200/1500。基數其實是隔壁「節慶獎金」tab
 *    可改的 DB 設定，且 A/B 級自 festab01（2026-08-28）起可分開設定，硬編碼必漂移。
 */

const getTitles = vi.fn()
const updateTitle = vi.fn()

vi.mock('@/api/config', () => ({
  getTitles: (...a: unknown[]) => getTitles(...a),
  updateTitle: (...a: unknown[]) => updateTitle(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── 會把 data 傳進欄位、讓 #default="scope" 拿得到 row 的 table stubs ──────────
const ElTableColumnStub = defineComponent({
  name: 'ElTableColumnStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        {},
        (props.data as Record<string, unknown>[]).map((row, index) =>
          h('div', { key: index }, slots.default ? slots.default({ row }) : []),
        ),
      )
  },
})

const ElTableStub = defineComponent({
  name: 'ElTableStub',
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { class: 'el-table' },
        (slots.default?.() || []).map((vnode: VNode, index: number) =>
          h(
            vnode.type as string,
            { ...vnode.props, data: props.data, key: index },
            vnode.children as never,
          ),
        ),
      )
  },
})

const ElSelectStub = defineComponent({
  name: 'ElSelectStub',
  props: { modelValue: { type: String, default: undefined } },
  emits: ['update:modelValue', 'change'],
  setup(_props, { slots }) {
    return () => h('div', { class: 'grade-select' }, slots.default ? slots.default() : [])
  },
})

const STUBS = {
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
  'el-select': ElSelectStub,
  'el-option': { template: '<option><slot /></option>' },
}

const BONUS_CONFIG = () =>
  reactive({
    head_teacher_a: 2200,
    head_teacher_b: 2000,
    head_teacher_c: 1500,
    assistant_teacher_a: 1400,
    assistant_teacher_b: 1200,
    assistant_teacher_c: 1100,
    art_teacher_festival: 2000,
  })

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

const mountTab = async () => {
  const wrapper = mount(JobTitleGradeTab, {
    props: { bonusConfig: BONUS_CONFIG() },
    global: { stubs: STUBS },
  })
  await flush()
  await wrapper.vm.$nextTick()
  return wrapper
}

/** 模擬 el-select：v-model 先寫入新值，再觸發 change（EP 清空時 valueOnClear 為 undefined）。 */
const pickGrade = async (wrapper: ReturnType<typeof mount>, rowIndex: number, value?: string) => {
  const select = wrapper.findAllComponents(ElSelectStub)[rowIndex]
  select.vm.$emit('update:modelValue', value)
  await wrapper.vm.$nextTick()
  select.vm.$emit('change', value)
  await flush()
}

beforeEach(() => {
  vi.clearAllMocks()
  getTitles.mockResolvedValue({
    data: [
      { id: 2, name: '幼兒園教師', bonus_grade: 'A' },
      { id: 6, name: '廚工', bonus_grade: null },
    ],
  })
  updateTitle.mockResolvedValue({ data: { salary_records_marked_stale: 0 } })
})

describe('JobTitleGradeTab — 清空等級的防呆', () => {
  it('清空既有等級會先跳確認，取消則不送出、值還原', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockRejectedValue('cancel')
    const wrapper = await mountTab()

    await pickGrade(wrapper, 0, undefined)

    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(updateTitle).not.toHaveBeenCalled()
    expect(wrapper.findAllComponents(ElSelectStub)[0].props('modelValue')).toBe('A')
  })

  it('確認清空後才送出 bonus_grade: null', async () => {
    ;(ElMessageBox.confirm as ReturnType<typeof vi.fn>).mockResolvedValue('confirm')
    const wrapper = await mountTab()

    await pickGrade(wrapper, 0, undefined)

    expect(updateTitle).toHaveBeenCalledWith(2, { name: '幼兒園教師', bonus_grade: null })
  })

  it('改成別的等級不跳確認，直接送出', async () => {
    const wrapper = await mountTab()

    await pickGrade(wrapper, 0, 'C')

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(updateTitle).toHaveBeenCalledWith(2, { name: '幼兒園教師', bonus_grade: 'C' })
  })

  it('原本就沒等級的職稱選成空值不跳確認（沒有東西可清）', async () => {
    const wrapper = await mountTab()

    await pickGrade(wrapper, 1, undefined)

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })
})

describe('JobTitleGradeTab — 存檔後的一致性', () => {
  it('成功後重抓職稱清單，避免 UI 與 DB 分歧', async () => {
    const wrapper = await mountTab()
    expect(getTitles).toHaveBeenCalledTimes(1)

    await pickGrade(wrapper, 0, 'B')

    expect(getTitles).toHaveBeenCalledTimes(2)
  })

  it('成功訊息帶出被標記待重算的薪資筆數', async () => {
    updateTitle.mockResolvedValue({ data: { salary_records_marked_stale: 3 } })
    const wrapper = await mountTab()

    await pickGrade(wrapper, 0, 'B')

    expect((ElMessage.success as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('3')
  })
})

describe('JobTitleGradeTab — 說明欄', () => {
  it('金額取自實際獎金設定而非硬編碼（A/B 級已可分開設定）', async () => {
    const wrapper = await mountTab()

    const text = wrapper.text()
    expect(text).toContain('2200')
    expect(text).toContain('1400')
    expect(text).not.toContain('2000 / 副班導 1200')
  })

  it('DB 存小寫等級也要正確顯示為已設定', async () => {
    getTitles.mockResolvedValue({
      data: [{ id: 3, name: '教保員', bonus_grade: 'b' }],
    })
    const wrapper = await mountTab()

    expect(wrapper.findAllComponents(ElSelectStub)[0].props('modelValue')).toBe('B')
  })
})
