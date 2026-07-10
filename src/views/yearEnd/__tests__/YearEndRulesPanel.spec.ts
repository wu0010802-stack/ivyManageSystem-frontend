import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import YearEndRulesPanel from '../YearEndRulesPanel.vue'

vi.mock('@/api/config', () => ({
  getBonusConfig: vi.fn(),
  updateBonusConfig: vi.fn(),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    ElMessageBox: { prompt: vi.fn() },
  }
})

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

import * as configApi from '@/api/config'
import * as employeesApi from '@/api/employees'
import * as authApi from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'

type PanelVm = {
  afterClassAwardRows: { className: string; price: number }[]
  artTeacherEmployeeIds: number[]
  employeeOptions: { id: number; name: unknown }[]
  rules: Record<string, unknown>
  gradeThresholdPercents: Record<string, number | null>
  dividendActivityMinSessions: number | null
  teachingExtraUnitPrice: number | null
  teachingExtraSessionsPerUnit: number | null
  clearAllGradeThresholds: () => void
  addAfterClassAwardRow: () => void
  removeAfterClassAwardRow: (i: number) => void
  saveRules: () => Promise<void>
}

// 完整 GET /config/bonus 回應形狀，逐欄位對齊 ivy-backend api/config/bonus.py
// get_bonus_config 的 literal dict（避免 mock 形狀憑感覺瞎猜、造成假綠燈）。
const FULL_BONUS_CONFIG_RESPONSE = {
  id: 1,
  config_year: 2026,
  head_teacher_ab: 3000,
  head_teacher_c: 2500,
  assistant_teacher_ab: 2000,
  assistant_teacher_c: 1500,
  principal_festival: 5000,
  director_festival: 4000,
  leader_festival: 3000,
  driver_festival: 2000,
  designer_festival: 2000,
  admin_festival: 2000,
  principal_dividend: 3000,
  director_dividend: 2000,
  leader_dividend: 1000,
  vice_leader_dividend: 800,
  overtime_head_normal: 500,
  overtime_head_baby: 600,
  overtime_assistant_normal: 400,
  overtime_assistant_baby: 500,
  school_wide_target: 300,
  enrollment_count_mode: 'month_end',
  meeting_default_hours: 2,
  meeting_absence_penalty: 100,
  art_teacher_festival: 2000,
  art_teacher_unit_price: 30,
  dividend_returning_threshold: 0.96,
  dividend_returning_amount: 500,
  dividend_activity_threshold: 0.8,
  dividend_activity_amount: 1000,
  dividend_activity_grade_thresholds: { 大班: 1.0, 中班: 0.9, 小班: 0.8, 幼幼班: 0.7 },
  dividend_activity_min_sessions: 16,
  teaching_extra_unit_price: 70,
  teaching_extra_sessions_per_unit: 5,
  late_deduction_per_time: 50,
  missing_punch_deduction_per_time: 50,
  personal_leave_deduction_per_day: 500,
  sick_leave_deduction_per_day: 500,
  after_class_award_unit_price: {},
  art_teacher_employee_ids: [],
}

function stubEmployees() {
  vi.mocked(employeesApi.getEmployees).mockResolvedValue({
    data: [
      { id: 7, name: '林老師' },
      { id: 9, name: '王老師' },
    ],
  } as never)
}

async function mountPanel() {
  const wrapper = mount(YearEndRulesPanel, {
    global: {
      stubs: {
        'el-button': {
          props: ['disabled'],
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
        },
        'el-card': true,
        'el-alert': true,
        'el-divider': true,
        'el-empty': true,
        'el-row': true,
        'el-col': true,
        'el-form-item': true,
        'el-input': true,
        'el-input-number': true,
        'el-select': true,
        'el-option': true,
        // 明確 template（非 true auto-stub）：VTU renderStubDefaultSlot 預設 false，
        // auto-stub 不會渲染 default slot，儲存按鈕（被 el-tooltip 包住）會消失於 DOM。
        'el-tooltip': { template: '<span><slot /></span>' },
      },
    },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('YearEndRulesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authApi.hasPermission).mockReturnValue(true)
  })

  it('load: dict → afterClassAwardRows，list → artTeacherEmployeeIds', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: {
        art_teacher_unit_price: 30,
        after_class_award_unit_price: { 美術班: 50, 律動班: 40 },
        art_teacher_employee_ids: [7, 9],
        dividend_returning_threshold: 0.8,
        late_deduction_per_time: 50,
      },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([
      { className: '美術班', price: 50 },
      { className: '律動班', price: 40 },
    ])
    expect(vm.artTeacherEmployeeIds).toEqual([7, 9])
    expect(vm.rules.art_teacher_unit_price).toBe(30)
    expect(vm.rules.dividend_returning_threshold).toBe(0.8)
    expect(vm.employeeOptions).toHaveLength(2)
  })

  it('load: 缺 JSON 欄位時 graceful 退成空（不炸）', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { art_teacher_unit_price: 0 },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toEqual([])
    expect(vm.artTeacherEmployeeIds).toEqual([])
  })

  it('save: afterClassAwardRows → dict（略過空班名）、ids → list，並帶 reason', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: {}, art_teacher_employee_ids: [] },
    } as never)
    stubEmployees()
    vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    vm.afterClassAwardRows.push({ className: '美術班', price: 60 })
    vm.afterClassAwardRows.push({ className: '   ', price: 99 }) // 空白班名應略過
    vm.artTeacherEmployeeIds.push(7)
    await nextTick()

    await vm.saveRules()

    expect(configApi.updateBonusConfig).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(payload.after_class_award_unit_price).toEqual({ 美術班: 60 })
    expect(payload.art_teacher_employee_ids).toEqual([7])
    expect(payload.reason).toBe('年終規則設定調整測試')
    // 確認只送年終欄位、不帶超額/節慶/底薪（後端部分更新會保留）
    expect(payload.overtime_head_normal).toBeUndefined()
    expect(payload.principal_festival).toBeUndefined()
  })

  it('add / remove afterClassAwardRow', async () => {
    vi.mocked(configApi.getBonusConfig).mockResolvedValue({
      data: { after_class_award_unit_price: { 美術班: 50 } },
    } as never)
    stubEmployees()

    const wrapper = await mountPanel()
    const vm = wrapper.vm as unknown as PanelVm

    expect(vm.afterClassAwardRows).toHaveLength(1)
    vm.addAfterClassAwardRow()
    expect(vm.afterClassAwardRows).toHaveLength(2)
    vm.removeAfterClassAwardRow(0)
    expect(vm.afterClassAwardRows).toEqual([{ className: '', price: 0 }])
  })

  // G15（園方福利辦法 115.01.01）：逐年級才藝門檻 + 堂數條件
  describe('G15 逐年級門檻 / 堂數條件', () => {
    it('load: 後端 dict → gradeThresholdPercents 換算為百分比；min_sessions 直接帶入', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.gradeThresholdPercents).toEqual({
        大班: 100,
        中班: 90,
        小班: 80,
        幼幼班: 70,
      })
      expect(vm.dividendActivityMinSessions).toBe(16)
    })

    it('load: 兩新欄位缺失（模擬舊後端）→ 容錯回退 null，不炸', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: { art_teacher_unit_price: 0 },
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.gradeThresholdPercents).toEqual({
        大班: null,
        中班: null,
        小班: null,
        幼幼班: null,
      })
      expect(vm.dividendActivityMinSessions).toBeNull()
    })

    it('load: 兩新欄位明確為 null（新後端但未設定）→ 維持 null', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: {
          ...FULL_BONUS_CONFIG_RESPONSE,
          dividend_activity_grade_thresholds: null,
          dividend_activity_min_sessions: null,
        },
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.gradeThresholdPercents).toEqual({
        大班: null,
        中班: null,
        小班: null,
        幼幼班: null,
      })
      expect(vm.dividendActivityMinSessions).toBeNull()
    })

    it('save: gradeThresholdPercents 換算回 fraction dict、min sessions 隨 payload 送出', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      await vm.saveRules()

      const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(payload.dividend_activity_grade_thresholds).toEqual({
        大班: 1,
        中班: 0.9,
        小班: 0.8,
        幼幼班: 0.7,
      })
      expect(payload.dividend_activity_min_sessions).toBe(16)
    })

    it('save: 整組清空年級門檻（clearAllGradeThresholds）→ payload 送 null（回退單一門檻）', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      vm.clearAllGradeThresholds()
      await nextTick()
      await vm.saveRules()

      const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(payload.dividend_activity_grade_thresholds).toBeNull()
    })

    it('save: 堂數條件清空為 null → payload 送 null（停用堂數條件）', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      vm.dividendActivityMinSessions = null
      await nextTick()
      await vm.saveRules()

      const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(payload.dividend_activity_min_sessions).toBeNull()
    })
  })

  // G8（年終批次2）：教課獎勵金——每滿 N 堂計 1 次 × 單價
  describe('G8 教課獎勵單價 / 每次堂數', () => {
    it('load: 後端回傳數值 → 直接帶入', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.teachingExtraUnitPrice).toBe(70)
      expect(vm.teachingExtraSessionsPerUnit).toBe(5)
    })

    it('load: 舊後端缺欄位（undefined）→ 容錯回退 null，不炸', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: { art_teacher_unit_price: 0 },
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.teachingExtraUnitPrice).toBeNull()
      expect(vm.teachingExtraSessionsPerUnit).toBeNull()
    })

    it('load: 新後端明確為 null（未設定，沿用預設）→ 維持 null', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: {
          ...FULL_BONUS_CONFIG_RESPONSE,
          teaching_extra_unit_price: null,
          teaching_extra_sessions_per_unit: null,
        },
      } as never)
      stubEmployees()

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      expect(vm.teachingExtraUnitPrice).toBeNull()
      expect(vm.teachingExtraSessionsPerUnit).toBeNull()
    })

    it('save: 兩欄隨 payload 送出（round-trip）', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      await vm.saveRules()

      const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(payload.teaching_extra_unit_price).toBe(70)
      expect(payload.teaching_extra_sessions_per_unit).toBe(5)
    })

    it('save: 清空為 null → payload 送 null（沿用預設 65/4）', async () => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const vm = wrapper.vm as unknown as PanelVm

      vm.teachingExtraUnitPrice = null
      vm.teachingExtraSessionsPerUnit = null
      await nextTick()
      await vm.saveRules()

      const payload = vi.mocked(configApi.updateBonusConfig).mock.calls[0][0] as Record<
        string,
        unknown
      >
      expect(payload.teaching_extra_unit_price).toBeNull()
      expect(payload.teaching_extra_sessions_per_unit).toBeNull()
    })
  })

  // 薪資模組稽核 P2：saveRules 送到 PUT /config/bonus，後端除 SETTINGS_WRITE 外
  // 還額外要求 ACTIVITY_PAYMENT_APPROVE（見 ivy-backend api/config/bonus.py
  // update_bonus_config）。前端 gate 需對齊，唯讀使用者不應能填完整張表、
  // 過完異動原因提示才吃 403。
  describe('儲存按鈕權限 gate（對齊 PUT /config/bonus）', () => {
    beforeEach(() => {
      vi.mocked(configApi.getBonusConfig).mockResolvedValue({
        data: FULL_BONUS_CONFIG_RESPONSE,
      } as never)
      stubEmployees()
      vi.mocked(configApi.updateBonusConfig).mockResolvedValue({ data: {} } as never)
    })

    it('只有 SETTINGS_READ（無 WRITE/APPROVE）：儲存按鈕 disabled，直接呼叫 saveRules 也不送出', async () => {
      vi.mocked(authApi.hasPermission).mockImplementation((p: string) => p === 'SETTINGS_READ')

      const wrapper = await mountPanel()
      const button = wrapper.findAll('button').find((b) => b.text().includes('儲存年終規則'))
      expect(button).toBeTruthy()
      expect(button!.attributes('disabled')).toBeDefined()

      const vm = wrapper.vm as unknown as PanelVm
      await vm.saveRules()

      expect(configApi.updateBonusConfig).not.toHaveBeenCalled()
      expect(ElMessage.warning).toHaveBeenCalled()
    })

    it('只有 SETTINGS_WRITE（缺 ACTIVITY_PAYMENT_APPROVE）：儲存按鈕仍 disabled', async () => {
      vi.mocked(authApi.hasPermission).mockImplementation(
        (p: string) => p === 'SETTINGS_READ' || p === 'SETTINGS_WRITE',
      )

      const wrapper = await mountPanel()
      const button = wrapper.findAll('button').find((b) => b.text().includes('儲存年終規則'))
      expect(button!.attributes('disabled')).toBeDefined()
    })

    it('具 SETTINGS_WRITE + ACTIVITY_PAYMENT_APPROVE：儲存按鈕可用且可正常送出', async () => {
      vi.mocked(authApi.hasPermission).mockReturnValue(true)
      vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '年終規則設定調整測試' } as never)

      const wrapper = await mountPanel()
      const button = wrapper.findAll('button').find((b) => b.text().includes('儲存年終規則'))
      expect(button!.attributes('disabled')).toBeUndefined()

      const vm = wrapper.vm as unknown as PanelVm
      await vm.saveRules()

      expect(configApi.updateBonusConfig).toHaveBeenCalled()
    })
  })
})
