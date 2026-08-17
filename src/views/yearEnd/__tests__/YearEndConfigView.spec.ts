import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import YearEndConfigView from '../YearEndConfigView.vue'
import TargetCrossRef from '@/views/appraisal/components/TargetCrossRef.vue'

// ---- Mock API modules ----
vi.mock('@/api/yearEnd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/yearEnd')>()
  return {
    ...actual,
    getOrgSettings: vi.fn(),
    postOrgSettings: vi.fn(),
    getClassTargets: vi.fn(),
    upsertClassTarget: vi.fn(),
    upsertClassTargetsBatch: vi.fn(),
    listYearEndCycles: vi.fn(),
  }
})

// Task B6：橋接考核週期目標——getAppraisalCyclesByYear 為新引入的依賴。
vi.mock('@/api/appraisal', () => ({
  getAppraisalCyclesByYear: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm') },
  }
})

const { routerPushMock, routerBackMock } = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  routerBackMock: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '5' }, query: {} }),
  useRouter: () => ({ push: routerPushMock, back: routerBackMock }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as yearEndApi from '@/api/yearEnd'
import * as appraisalApi from '@/api/appraisal'
import * as employeesApi from '@/api/employees'
import * as classroomsApi from '@/api/classrooms'
import { ElMessage } from 'element-plus'

// ---- Type helpers ----
type OrgRow = {
  id: number
  year_end_cycle_id: number
  semester_first: boolean
  enrollment_target: number
  enrollment_actual: number | null
  school_achievement_rate: string
  org_achievement_rate: string
  meeting_absence_deduction: string
}

type ClassRow = {
  id: number
  year_end_cycle_id: number
  semester_first: boolean
  classroom_id: number
  head_count_target: number
  head_teacher_employee_id: number | null
  assistant_employee_id: number | null
  returning_student_rate: string
  avg_monthly_enrollment: string
  class_performance_rate: string
}

function makeOrgRow(overrides: Partial<OrgRow> = {}): OrgRow {
  return {
    id: 1,
    year_end_cycle_id: 5,
    semester_first: true,
    enrollment_target: 160,
    enrollment_actual: 150,
    // Percentage form: school_achievement_rate = actual/target × 100 = 93.75
    school_achievement_rate: '93.75',
    // Percentage form: org_achievement_rate = e.g. 83.6 (same unit as importYearEndExcel default)
    org_achievement_rate: '83.6',
    meeting_absence_deduction: '1000',
    ...overrides,
  }
}

function makeYearEndCycle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    academic_year: 114,
    status: 'OPEN',
    start_date: '2025-08-01',
    end_date: '2026-07-31',
    bonus_calc_date: '2026-02-01',
    created_at: '2025-08-01T00:00:00Z',
    ...overrides,
  }
}

function makeClassRow(overrides: Partial<ClassRow> = {}): ClassRow {
  return {
    id: 10,
    year_end_cycle_id: 5,
    semester_first: true,
    classroom_id: 3,
    head_count_target: 25,
    head_teacher_employee_id: 7,
    assistant_employee_id: null,
    returning_student_rate: '0.800',
    avg_monthly_enrollment: '22.5',
    class_performance_rate: '0.900',
    ...overrides,
  }
}

function stubSupportApis() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [{ id: 7, name: '林老師' }],
  } as never)
  vi.mocked(classroomsApi.getClassrooms).mockResolvedValue({
    data: [{ id: 3, name: '大班A' }],
  } as never)
}

async function mountView() {
  const wrapper = mount(YearEndConfigView, {
    props: { cycleId: 5 },
    global: {
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-card': true,
        'el-alert': true,
        'el-divider': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-tooltip': true,
        'el-icon': true,
        'el-tag': true,
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

// Task B6：mountView() 的 el-card stub 為 VTU 自動生成 stub（不轉發 default slot），
// 故 TargetCrossRef（巢狀在 el-card 內）在 mountView() 底下永遠不會出現在渲染樹，
// 只是既有 14 個測試從未斷言 DOM、只讀 vm state 才沒踩到。B6 測試需要真的斷言
// TargetCrossRef 收到的 props，故不 stub el-card——el-card 未全域註冊會走 Vue
// 「resolveComponent 失敗→fallback 為原生標籤」路徑，此路徑會呼叫其（無參數解構的）
// default slot 函式並照常渲染子節點（el-table/el-table-column 等仍保持 stub，
// 避免其 scoped slot `{ row }` 解構在無 stub 時對 undefined 解構而炸掉）。
async function mountViewWithCrossRefVisible() {
  const wrapper = mount(YearEndConfigView, {
    props: { cycleId: 5 },
    global: {
      stubs: {
        'el-table': true,
        'el-table-column': true,
        'el-button': true,
        'el-alert': true,
        'el-divider': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        'el-tooltip': true,
        'el-icon': true,
        'el-tag': true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('YearEndConfigView', () => {
  beforeEach(() => vi.clearAllMocks())

  // Case 1: loads org_settings two semesters → vm has 2 rows with enrollment_target
  it('loads org_settings two semesters and exposes them with enrollment_target', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({
      data: [
        makeOrgRow({ semester_first: true, enrollment_target: 160 }),
        makeOrgRow({ id: 2, semester_first: false, enrollment_target: 155 }),
      ],
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      orgSettings: OrgRow[]
      orgEdits: Record<string, { enrollment_target: number; meeting_absence_deduction: number }>
      cycleId: number
    }

    expect(vm.orgSettings).toHaveLength(2)
    expect(vm.orgSettings[0].enrollment_target).toBe(160)
    expect(vm.orgSettings[1].enrollment_target).toBe(155)
    // Edit buffers seeded (org_achievement_rate is no longer in edits — it's read-only/echoed from row)
    expect(vm.orgEdits['true'].enrollment_target).toBe(160)
    expect(vm.orgEdits['false'].enrollment_target).toBe(155)
    expect(vm.cycleId).toBe(5)
    expect(yearEndApi.getOrgSettings).toHaveBeenCalledWith(5)
  })

  // Case 2: save org settings → postOrgSettings called with edited enrollment_target
  // and org_achievement_rate echoed from row (not editable — backend computes it)
  it('save org settings calls postOrgSettings with edited enrollment_target and echoed org_achievement_rate', async () => {
    const orgRow = makeOrgRow({ semester_first: true, enrollment_target: 160 })
    // Mock both calls: initial load + reload after save
    vi.mocked(yearEndApi.getOrgSettings)
      .mockResolvedValueOnce({ data: [orgRow] } as never)
      .mockResolvedValueOnce({ data: [{ ...orgRow, enrollment_target: 170 }] } as never)
    vi.mocked(yearEndApi.postOrgSettings).mockResolvedValue({
      data: { ...orgRow, enrollment_target: 170 },
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      orgEdits: Record<string, { enrollment_target: number; meeting_absence_deduction: number }>
      saveOrgSettings: (row: OrgRow) => Promise<void>
      orgSettings: OrgRow[]
    }

    // Edit the target in the buffer
    vm.orgEdits['true'].enrollment_target = 170
    await vm.saveOrgSettings(vm.orgSettings[0])
    await nextTick()

    expect(yearEndApi.postOrgSettings).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        semester_first: true,
        enrollment_target: 170,
        // school_achievement_rate echoed back as number: Number('93.75') = 93.75
        school_achievement_rate: 93.75,
        // org_achievement_rate echoed from row (read-only — backend computes from two school rates)
        org_achievement_rate: 83.6,
      }),
    )
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalledWith(
      expect.stringContaining('上學期'),
    )
  })

  // Case 3: loads class_targets → vm rows present
  it('loads class_targets and exposes them', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [
        makeClassRow({ id: 10, classroom_id: 3, head_count_target: 25 }),
        makeClassRow({ id: 11, semester_first: false, classroom_id: 4, head_count_target: 22 }),
      ],
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classTargets: ClassRow[]
      classEdits: Record<number, { head_count_target: number }>
      classroomMap: Record<number, string>
    }

    expect(vm.classTargets).toHaveLength(2)
    expect(vm.classTargets[0].head_count_target).toBe(25)
    // edit buffers seeded
    expect(vm.classEdits[10].head_count_target).toBe(25)
    expect(vm.classEdits[11].head_count_target).toBe(22)
    // classroom name resolved
    expect(vm.classroomMap[3]).toBe('大班A')
    expect(yearEndApi.getClassTargets).toHaveBeenCalledWith(5)
  })

  // Case 4: save a class target → upsertClassTarget called with head_count_target
  it('save class target calls upsertClassTarget with edited head_count_target', async () => {
    const classRow = makeClassRow({ id: 10, classroom_id: 3, head_count_target: 25 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [classRow],
    } as never)
    vi.mocked(yearEndApi.upsertClassTarget).mockResolvedValue({
      data: { ...classRow, head_count_target: 28 },
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classEdits: Record<number, { head_count_target: number; head_teacher_employee_id: number | null; returning_student_rate: number; assistant_employee_id: number | null }>
      saveClassTarget: (row: ClassRow) => Promise<void>
      classTargets: ClassRow[]
    }

    // Edit head count in buffer
    vm.classEdits[10].head_count_target = 28
    await vm.saveClassTarget(vm.classTargets[0])
    await nextTick()

    expect(yearEndApi.upsertClassTarget).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        semester_first: true,
        classroom_id: 3,
        head_count_target: 28,
        // assistant echoed back to avoid nulling it
        assistant_employee_id: null,
      }),
    )
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalled()
  })

  // Task 8：「全部儲存」一次送出當前所有班級列（緩衝值），走批次端點
  it('全部儲存呼叫 upsertClassTargetsBatch 帶當前所有列（含各列編輯後的值）', async () => {
    const row10 = makeClassRow({ id: 10, classroom_id: 3, semester_first: true, head_count_target: 25 })
    const row11 = makeClassRow({ id: 11, classroom_id: 4, semester_first: false, head_count_target: 22 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [row10, row11],
    } as never)
    vi.mocked(yearEndApi.upsertClassTargetsBatch).mockResolvedValue({
      data: { succeeded_count: 2, failed: [] },
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classEdits: Record<number, { head_count_target: number; head_teacher_employee_id: number | null; returning_student_rate: number; assistant_employee_id: number | null }>
      saveAllClassTargets: () => Promise<void>
    }

    // Edit both rows in the buffer
    vm.classEdits[10].head_count_target = 28
    vm.classEdits[11].head_count_target = 30
    await vm.saveAllClassTargets()
    await nextTick()

    expect(yearEndApi.upsertClassTargetsBatch).toHaveBeenCalledWith(
      5,
      expect.arrayContaining([
        expect.objectContaining({
          semester_first: true,
          classroom_id: 3,
          head_count_target: 28,
          assistant_employee_id: null,
        }),
        expect.objectContaining({
          semester_first: false,
          classroom_id: 4,
          head_count_target: 30,
          assistant_employee_id: null,
        }),
      ]),
    )
    const callArgs = vi.mocked(yearEndApi.upsertClassTargetsBatch).mock.calls[0]
    expect(callArgs[1]).toHaveLength(2)
    expect(vi.mocked(ElMessage.success)).toHaveBeenCalled()
  })

  it('全部儲存有 failed 項目時顯示 ElMessage.warning 含 classroom 名稱與 reason', async () => {
    const row10 = makeClassRow({ id: 10, classroom_id: 3, semester_first: true, head_count_target: 25 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [row10],
    } as never)
    vi.mocked(yearEndApi.upsertClassTargetsBatch).mockResolvedValue({
      data: { succeeded_count: 0, failed: [{ classroom_id: 3, semester_first: true, reason: '週期已鎖定' }] },
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classEdits: Record<number, { head_count_target: number }>
      saveAllClassTargets: () => Promise<void>
    }

    vm.classEdits[10].head_count_target = 28
    await vm.saveAllClassTargets()
    await nextTick()

    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalledWith(
      expect.stringContaining('大班A'),
    )
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalledWith(
      expect.stringContaining('週期已鎖定'),
    )
  })

  // 語意澄清（code review Important）：classEdits 由 loadClassTargets() 對每列無條件
  // seed，故「全部儲存」不是「只送手動改過的列」，而是送當前所有已載入列的緩衝值
  // （upsertClassTarget 為 upsert，對未變更列重寫同值屬 idempotent）。此測試証明：
  // 只手動改其中一列，另一列仍原封不動被一併送出。
  it('全部儲存送出當前所有載入的列（不論是否手動改過）', async () => {
    const row10 = makeClassRow({ id: 10, classroom_id: 3, semester_first: true, head_count_target: 25 })
    const row11 = makeClassRow({ id: 11, classroom_id: 4, semester_first: false, head_count_target: 22 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({
      data: [row10, row11],
    } as never)
    vi.mocked(yearEndApi.upsertClassTargetsBatch).mockResolvedValue({
      data: { succeeded_count: 2, failed: [] },
    } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      classEdits: Record<number, { head_count_target: number }>
      saveAllClassTargets: () => Promise<void>
    }

    // 只手動改其中一列（row 10）；row 11 維持載入時 seed 的緩衝值，未被使用者碰過
    vm.classEdits[10].head_count_target = 28
    await vm.saveAllClassTargets()
    await nextTick()

    const callArgs = vi.mocked(yearEndApi.upsertClassTargetsBatch).mock.calls[0]
    // 兩列都送出——證明「全部儲存」是送當前所有列，非僅送使用者手動改過的列
    expect(callArgs[1]).toHaveLength(2)
    expect(callArgs[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ classroom_id: 3, head_count_target: 28 }),
        expect.objectContaining({ classroom_id: 4, head_count_target: 22 }),
      ]),
    )
  })

  it('classTargets 為空陣列時「全部儲存」不呼叫批次端點（early return）', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { saveAllClassTargets: () => Promise<void> }

    await vm.saveAllClassTargets()
    await nextTick()

    expect(yearEndApi.upsertClassTargetsBatch).not.toHaveBeenCalled()
  })

  // 兩處寫死「儲存失敗」改用 apiError 讀後端 detail（LOCKED/CLOSED 拒絕時使用者要看得到原因）
  it('save org settings 失敗時顯示後端 detail（非寫死「儲存失敗」）', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({
      data: [makeOrgRow({ semester_first: true, enrollment_target: 160 })],
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()
    vi.mocked(yearEndApi.postOrgSettings).mockRejectedValue({
      response: { data: { detail: '週期已鎖定，無法修改全校設定' } },
    })

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      saveOrgSettings: (row: OrgRow) => Promise<void>
      orgSettings: OrgRow[]
    }

    await vm.saveOrgSettings(vm.orgSettings[0])
    await nextTick()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('週期已鎖定，無法修改全校設定')
  })

  it('save class target 失敗時顯示後端 detail（非寫死「班級設定儲存失敗」）', async () => {
    const classRow = makeClassRow({ id: 10, classroom_id: 3, head_count_target: 25 })
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [classRow] } as never)
    stubSupportApis()
    vi.mocked(yearEndApi.upsertClassTarget).mockRejectedValue({
      response: { data: { detail: '週期已封存，無法修改班級設定' } },
    })

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      saveClassTarget: (row: ClassRow) => Promise<void>
      classTargets: ClassRow[]
    }

    await vm.saveClassTarget(vm.classTargets[0])
    await nextTick()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('週期已封存，無法修改班級設定')
  })

  it('save org settings 失敗且無 detail 時 fallback 為「儲存失敗」', async () => {
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({
      data: [makeOrgRow({ semester_first: true, enrollment_target: 160 })],
    } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    stubSupportApis()
    vi.mocked(yearEndApi.postOrgSettings).mockRejectedValue(new Error('network error'))

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as {
      saveOrgSettings: (row: OrgRow) => Promise<void>
      orgSettings: OrgRow[]
    }

    await vm.saveOrgSettings(vm.orgSettings[0])
    await nextTick()

    expect(vi.mocked(ElMessage.error)).toHaveBeenCalledWith('儲存失敗')
  })

  it('全校設定載入失敗時標記 orgLoadError，重試成功後清除', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockRejectedValueOnce(new Error('network'))
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { orgLoadError: boolean; loadOrgSettings: () => Promise<void> }
    expect(vm.orgLoadError).toBe(true)

    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValueOnce({ data: [] } as never)
    await vm.loadOrgSettings()
    await nextTick()

    expect(vm.orgLoadError).toBe(false)
    expect(yearEndApi.getOrgSettings).toHaveBeenCalledTimes(2)
  })

  it('班級設定載入失敗時標記 classLoadError，重試成功後清除', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockRejectedValueOnce(new Error('network'))

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { classLoadError: boolean; loadClassTargets: () => Promise<void> }
    expect(vm.classLoadError).toBe(true)

    vi.mocked(yearEndApi.getClassTargets).mockResolvedValueOnce({ data: [] } as never)
    await vm.loadClassTargets()
    await nextTick()

    expect(vm.classLoadError).toBe(false)
    expect(yearEndApi.getClassTargets).toHaveBeenCalledTimes(2)
  })

  // Task 15：「前往年終規則設定」改直達巢狀路由（非舊 query 相容層）；
  // 「← 返回」按鈕移除（shell 麵包屑已提供導航）。
  describe('跳轉路徑更新（Task 15）', () => {
    beforeEach(() => {
      vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
      stubSupportApis()
    })

    it('goToYearEndRules() 導向新巢狀路徑 /appraisal-year-end/rules/year-end-rules（非舊 query 形式）', async () => {
      const wrapper = await mountView()
      const vm = wrapper.vm as unknown as { goToYearEndRules: () => void }

      vm.goToYearEndRules()

      expect(routerPushMock).toHaveBeenCalledWith('/appraisal-year-end/rules/year-end-rules')
    })

    it('不再渲染「← 返回」按鈕（shell 麵包屑已提供導航）', async () => {
      // el-button 在 mountView() 被 auto-stub（true）不渲染 default slot，
      // wrapper.text() 驗證不出按鈕是否存在，故直接檢查原始碼才是有效回歸鎖。
      const filePath = path.resolve(process.cwd(), 'src/views/yearEnd/YearEndConfigView.vue')
      const source = readFileSync(filePath, 'utf-8')

      expect(source).not.toContain('← 返回')
      expect(source).not.toContain('router.back()')

      // 確保沒有殘留路徑會意外觸發 back（即使測試沒點按鈕，也守住實作面）
      await mountView()
      expect(routerBackMock).not.toHaveBeenCalled()
    })
  })

  describe('百分比收斂至 fmtPct 單一格式（終審 Important-2）', () => {
    beforeEach(() => {
      vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
      stubSupportApis()
    })

    it('pctNum/pctRatio 雙軌已移除，ratio 欄位改綁 fmtPct 帶 isRatio', async () => {
      const wrapper = await mountView()
      const vm = wrapper.vm as unknown as Record<string, unknown>
      expect(vm.pctNum).toBeUndefined()
      expect(vm.pctRatio).toBeUndefined()

      // el-table 被 auto-stub 不渲染 cell，wrapper.text() 驗不到欄位輸出，
      // 故以源碼綁定斷言守住：ratio 欄（0–1 比值）必帶 isRatio、雙軌零殘留。
      const filePath = path.resolve(process.cwd(), 'src/views/yearEnd/YearEndConfigView.vue')
      const source = readFileSync(filePath, 'utf-8')
      expect(source).toContain('fmtPct(row.returning_student_rate, { isRatio: true })')
      expect(source).not.toMatch(/pctNum\(|pctRatio\(/)
    })
  })

  // Task B6 code review Important：TargetCrossRef 原本兩宿主各只傳 3 值中的 2 個，
  // 「不一致警示」永遠不會觸發。本頁橋接 cycleId → academic_year（listYearEndCycles）
  // → getAppraisalCyclesByYear(academic_year) → 依 semester 相符取得
  // AppraisalCycle.enrollment_target，讓三處對照真正有意義。
  describe('Task B6：橋接考核週期目標（cycleTarget）', () => {
    beforeEach(() => {
      vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({
        data: [makeOrgRow({ semester_first: true, enrollment_target: 160 })],
      } as never)
      vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
      stubSupportApis()
    })

    it('橋接成功且與年終設定目標不同時，TargetCrossRef 收到真實 cycleTarget 並觸發不一致警示', async () => {
      vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
        data: [makeYearEndCycle({ id: 5, academic_year: 114 })],
      } as never)
      vi.mocked(appraisalApi.getAppraisalCyclesByYear).mockResolvedValue({
        data: [{ id: 1, semester: 'FIRST', enrollment_target: 170 }],
      } as never)

      const wrapper = await mountViewWithCrossRefVisible()

      expect(appraisalApi.getAppraisalCyclesByYear).toHaveBeenCalledWith(114)

      const crossRef = wrapper.findComponent(TargetCrossRef)
      expect(crossRef.exists()).toBe(true)
      // 橋接來的真實考核週期目標（170），非寫死 null
      expect(crossRef.props('cycleTarget')).toBe(170)
      // 年終設定目標（org_settings.enrollment_target = 160）與 170 不同 → 三值齊全且不一致
      expect(crossRef.props('orgSettingTarget')).toBe(160)
      expect(wrapper.find('[data-test="target-mismatch"]').exists()).toBe(true)
    })

    it('getAppraisalCyclesByYear 失敗時 cycleTarget 回退 null、不 crash', async () => {
      vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
        data: [makeYearEndCycle({ id: 5, academic_year: 114 })],
      } as never)
      vi.mocked(appraisalApi.getAppraisalCyclesByYear).mockRejectedValue(new Error('network error'))

      const wrapper = await mountViewWithCrossRefVisible()

      const crossRef = wrapper.findComponent(TargetCrossRef)
      expect(crossRef.exists()).toBe(true)
      expect(crossRef.props('cycleTarget')).toBeNull()
      // 失敗降級不炸頁：其餘核心資料（年終設定目標）仍正常顯示
      expect(crossRef.props('orgSettingTarget')).toBe(160)
    })

    it('查無相符 year_end_cycle（listYearEndCycles 找不到本頁 cycleId）時 cycleTarget 回退 null、不 crash', async () => {
      vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
        data: [makeYearEndCycle({ id: 999, academic_year: 114 })],
      } as never)
      vi.mocked(appraisalApi.getAppraisalCyclesByYear).mockResolvedValue({
        data: [{ id: 1, semester: 'FIRST', enrollment_target: 170 }],
      } as never)

      const wrapper = await mountViewWithCrossRefVisible()

      expect(appraisalApi.getAppraisalCyclesByYear).not.toHaveBeenCalled()
      const crossRef = wrapper.findComponent(TargetCrossRef)
      expect(crossRef.props('cycleTarget')).toBeNull()
    })
  })

  // Batch 12：canWrite 疊加週期狀態守衛，對齊後端 assert_cycle_writable
  describe('週期狀態守衛（Batch 12）', () => {
    it('週期非 OPEN 時 canWrite 為 false（依 listYearEndCycles 帶回的 status）', async () => {
      stubSupportApis()
      vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
        data: [makeYearEndCycle({ id: 5, status: 'LOCKED' })],
      } as never)

      const wrapper = await mountView()
      const vm = wrapper.vm as unknown as { canWrite: boolean }
      expect(vm.canWrite).toBe(false)
    })

    it('週期為 OPEN 時 canWrite 依權限判斷（不受本次改動影響的既有行為）', async () => {
      stubSupportApis()
      vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
      vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
        data: [makeYearEndCycle({ id: 5, status: 'OPEN' })],
      } as never)

      const wrapper = await mountView()
      const vm = wrapper.vm as unknown as { canWrite: boolean }
      expect(vm.canWrite).toBe(true)
    })
  })
})
