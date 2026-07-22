import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

vi.mock('@/api/appraisal', () => ({
  listAppraisalBonusRates: vi.fn(),
  createAppraisalBonusRate: vi.fn(),
}))

// 權限矩陣鐵律：mockHasPermission 依測試案例可調，禁止單一 () => true 帶過。
const mockHasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (name: string) => mockHasPermission(name),
}))

const confirmWithReasonMock = vi.fn()
vi.mock('../confirmWithReason', () => ({
  confirmWithReason: (...args: unknown[]) => confirmWithReasonMock(...args),
  RULE_CHANGE_REASON_TEMPLATES: ['年度政策調整', '主管裁示', '校正錯誤設定', '配合法規更新'],
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { listAppraisalBonusRates, createAppraisalBonusRate } from '@/api/appraisal'
import BonusRatesPanel from '../components/BonusRatesPanel.vue'

const ElButtonStub = defineComponent({
  name: 'ElButtonStub',
  props: ['loading', 'disabled'],
  emits: ['click'],
  inheritAttrs: false,
  setup(props, { attrs, emit, slots }) {
    const dataAttrs = Object.fromEntries(
      Object.entries(attrs).filter(([k]) => k.startsWith('data-')),
    )
    return () =>
      h(
        'button',
        {
          ...dataAttrs,
          ...(props.disabled ? { disabled: 'disabled' } : {}),
          onClick: () => emit('click'),
        },
        slots.default?.(),
      )
  },
})

const GLOBAL_STUBS = {
  'el-button': ElButtonStub,
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div><slot :row="{}" /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-icon': { template: '<span />' },
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-dialog': { template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>', props: ['modelValue'] },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-date-picker': { template: '<input />' },
  'el-select': { template: '<select><slot /></select>' },
  'el-option': true,
  'el-input-number': { template: '<input />' },
}

const directives = { loading: () => {} }

function makeRates() {
  return [
    { effective_from: '2026-08-01', role_group: 'HEAD_TEACHER', grade: 'GOOD', base_amount: 3000 },
  ]
}

async function mountPanel({ canWrite = true } = {}) {
  mockHasPermission.mockImplementation((name: string) => name === 'APPRAISAL_FINALIZE' && canWrite)
  vi.mocked(listAppraisalBonusRates).mockResolvedValue({ data: makeRates() } as never)
  const wrapper = mount(BonusRatesPanel, {
    global: { stubs: GLOBAL_STUBS, directives },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BonusRatesPanel', () => {
  describe('權限 gate（對齊後端 POST /appraisal/bonus_rates = APPRAISAL_FINALIZE）', () => {
    it('canWrite=true：新增版本按鈕可用', async () => {
      const wrapper = await mountPanel({ canWrite: true })
      const btn = wrapper.find('[data-test="open-create-btn"]')
      expect(btn.exists()).toBe(true)
      expect(btn.attributes('disabled')).toBeUndefined()
    })

    it('canWrite=false：新增版本按鈕 disabled', async () => {
      const wrapper = await mountPanel({ canWrite: false })
      const btn = wrapper.find('[data-test="open-create-btn"]')
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('canWrite=false：直接呼叫 openCreate() 也不開啟 dialog（防止繞過 disabled）', async () => {
      const wrapper = await mountPanel({ canWrite: false })
      const vm = wrapper.vm as unknown as { openCreate: () => void; dialogVisible: boolean }
      vm.openCreate()
      await flushPromises()
      expect(vm.dialogVisible).toBe(false)
    })

    it('canWrite=false：直接呼叫 submitForm() 也不送出（防止繞過 disabled）', async () => {
      const wrapper = await mountPanel({ canWrite: false })
      const vm = wrapper.vm as unknown as { submitForm: () => Promise<void> }
      await vm.submitForm()
      expect(confirmWithReasonMock).not.toHaveBeenCalled()
      expect(createAppraisalBonusRate).not.toHaveBeenCalled()
    })

    // Task B7：面板頂部唯讀徽章，對齊 canWrite（APPRAISAL_FINALIZE，非 APPRAISAL_RULE_WRITE）。
    it('canWrite=false：面板頂部顯示唯讀徽章（考核核定）', async () => {
      const wrapper = await mountPanel({ canWrite: false })
      const badge = wrapper.find('[data-test="readonly-badge"]')
      expect(badge.exists()).toBe(true)
      expect(badge.text()).toContain('考核核定')
    })

    it('canWrite=true：面板頂部不顯示唯讀徽章', async () => {
      const wrapper = await mountPanel({ canWrite: true })
      expect(wrapper.find('[data-test="readonly-badge"]').exists()).toBe(false)
    })
  })

  describe('新版本確認＋原因（confirmWithReason）', () => {
    it('表單合法時，送出前呼叫 confirmWithReason；使用者確認後才呼叫 createAppraisalBonusRate', async () => {
      confirmWithReasonMock.mockResolvedValue('年度政策調整：調升主教甲等基數')
      vi.mocked(createAppraisalBonusRate).mockResolvedValue({ data: {} } as never)

      const wrapper = await mountPanel({ canWrite: true })
      const vm = wrapper.vm as unknown as {
        form: { effective_from: string | null; role_group: string; grade: string; base_amount: number }
        submitForm: () => Promise<void>
      }
      vm.form.effective_from = '2026-08-01'
      vm.form.base_amount = 3200
      await vm.submitForm()
      await flushPromises()

      expect(confirmWithReasonMock).toHaveBeenCalledTimes(1)
      const opts = confirmWithReasonMock.mock.calls[0][0] as { minLength?: number; title?: string }
      expect(opts.minLength).toBe(10)
      expect(opts.title).toBe('新增獎金率版本')
      expect(createAppraisalBonusRate).toHaveBeenCalledTimes(1)
      expect(createAppraisalBonusRate).toHaveBeenCalledWith({
        effective_from: '2026-08-01',
        role_group: 'HEAD_TEACHER',
        grade: 'GOOD',
        base_amount: 3200,
      })
    })

    it('使用者取消原因輸入（confirmWithReason 回 null）→ 不呼叫 createAppraisalBonusRate', async () => {
      confirmWithReasonMock.mockResolvedValue(null)

      const wrapper = await mountPanel({ canWrite: true })
      const vm = wrapper.vm as unknown as {
        form: { effective_from: string | null; base_amount: number }
        submitForm: () => Promise<void>
      }
      vm.form.effective_from = '2026-08-01'
      vm.form.base_amount = 3200
      await vm.submitForm()
      await flushPromises()

      expect(confirmWithReasonMock).toHaveBeenCalledTimes(1)
      expect(createAppraisalBonusRate).not.toHaveBeenCalled()
    })

    it('表單驗證失敗（未選生效日）時，不呼叫 confirmWithReason', async () => {
      const wrapper = await mountPanel({ canWrite: true })
      const vm = wrapper.vm as unknown as { submitForm: () => Promise<void> }
      await vm.submitForm()
      await flushPromises()

      expect(confirmWithReasonMock).not.toHaveBeenCalled()
      expect(createAppraisalBonusRate).not.toHaveBeenCalled()
    })
  })
})
