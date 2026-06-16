// src/components/attendance/__tests__/DetailColumn.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { AnomalyItem } from '@/composables/useAttendanceWorkspace'

// ── hoisted mocks ─────────────────────────────────────────────────────────────
const { mockUpsertRecord, mockBatchConfirm, mockGetRecords, mockNotify } = vi.hoisted(() => ({
  mockUpsertRecord: vi.fn().mockResolvedValue({ data: {} }),
  mockBatchConfirm: vi.fn().mockResolvedValue({ data: {} }),
  mockGetRecords: vi.fn().mockResolvedValue({ data: [] }),
  mockNotify: vi.fn(),
}))

// ── mock api ───────────────────────────────────────────────────────────────────
vi.mock('@/api/attendance', () => ({
  upsertRecord: mockUpsertRecord,
  batchConfirmAnomalies: mockBatchConfirm,
  getRecords: mockGetRecords,
}))

// ── mock useErrorNotify ────────────────────────────────────────────────────────
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: mockNotify }),
}))

// ── mock ElMessage ─────────────────────────────────────────────────────────────
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import DetailColumn from '../DetailColumn.vue'

const mockElMessageSuccess = ElMessage.success as ReturnType<typeof vi.fn>

// ── fixture data ───────────────────────────────────────────────────────────────
const anomalyItem: AnomalyItem = {
  id: 42,
  employee_name: '陳測試',
  employee_number: 'E007',
  date: '2026-06-10',
  weekday: '三',
  type: 'late',
  type_label: '遲到',
  detail: '遲到 10 分',
  estimated_deduction: 200,
  confirmed_action: null,
}

const defaultContext = {
  punch_in: '08:10',
  punch_out: '17:00',
  has_leave: false,
  estimated_deduction: 200,
}

const missingContext = {
  punch_in: null,
  punch_out: null,
  has_leave: false,
  estimated_deduction: 0,
}

// ── stubs ──────────────────────────────────────────────────────────────────────
// ResolveCard stub that exposes a way to emit 'resolve' and 'navigate'
const ResolveCardStub = {
  name: 'ResolveCard',
  props: ['item', 'index', 'total', 'context'],
  emits: ['resolve', 'navigate'],
  template: `
    <div class="resolve-card-stub">
      <button class="btn-admin-accept" @click="$emit('resolve', { action: 'admin_accept' })">接受</button>
      <button class="btn-admin-waive" @click="$emit('resolve', { action: 'admin_waive' })">豁免</button>
      <button class="btn-punch" @click="$emit('resolve', { action: 'punch', punch_in: '09:00', punch_out: '18:00' })">補打卡</button>
      <button class="btn-navigate" @click="$emit('navigate', 1)">下一筆</button>
    </div>
  `,
}

const EmployeeMonthPanelStub = {
  name: 'EmployeeMonthPanel',
  props: ['employeeId', 'year', 'month'],
  emits: ['updated'],
  template: `<div class="emp-month-panel-stub"><button class="btn-updated" @click="$emit('updated')">updated</button></div>`,
}

const ElButton = {
  props: ['type', 'disabled', 'plain', 'size'],
  emits: ['click'],
  template: `<button class="el-button" :disabled="disabled" @click="!disabled && $emit('click')"><slot /></button>`,
}

const stubs = {
  ResolveCard: ResolveCardStub,
  EmployeeMonthPanel: EmployeeMonthPanelStub,
  ElButton,
}

// ── mount helper ───────────────────────────────────────────────────────────────
function mountDetail(overrides: {
  mode?: 'resolve' | 'month'
  anomaly?: AnomalyItem | null
  anomalyIndex?: number
  anomalyTotal?: number
  context?: typeof defaultContext | typeof missingContext
  employeeId?: number | null
  year?: number
  month?: number
}) {
  return mount(DetailColumn, {
    props: {
      mode: overrides.mode ?? 'resolve',
      anomaly: overrides.anomaly !== undefined ? overrides.anomaly : anomalyItem,
      anomalyIndex: overrides.anomalyIndex ?? 0,
      anomalyTotal: overrides.anomalyTotal ?? 3,
      context: overrides.context ?? defaultContext,
      employeeId: overrides.employeeId !== undefined ? overrides.employeeId : 99,
      year: overrides.year ?? 2026,
      month: overrides.month ?? 6,
    },
    global: {
      stubs,
    },
  })
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('DetailColumn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpsertRecord.mockResolvedValue({ data: {} })
    mockBatchConfirm.mockResolvedValue({ data: {} })
  })

  // ── mode=resolve + anomaly 非 null ──────────────────────────────────────────
  describe('mode=resolve, anomaly present', () => {
    it('renders ResolveCard stub', () => {
      const wrapper = mountDetail({})
      expect(wrapper.find('.resolve-card-stub').exists()).toBe(true)
    })

    it('does NOT render EmployeeMonthPanel in resolve mode', () => {
      const wrapper = mountDetail({})
      expect(wrapper.find('.emp-month-panel-stub').exists()).toBe(false)
    })

    it('has a "看整月" button that emits switchMode("month")', async () => {
      const wrapper = mountDetail({})
      const btns = wrapper.findAll('button')
      const btn = btns.find((b) => b.text().includes('整月'))
      expect(btn).toBeTruthy()
      await btn!.trigger('click')
      const emitted = wrapper.emitted('switchMode')
      expect(emitted).toBeTruthy()
      expect(emitted![0][0]).toBe('month')
    })
  })

  // ── mode=resolve + anomaly=null → 空狀態 ────────────────────────────────────
  describe('mode=resolve, anomaly=null', () => {
    it('shows 異常已清空 empty state', () => {
      const wrapper = mountDetail({ anomaly: null })
      expect(wrapper.text()).toContain('異常已清空')
    })

    it('does NOT render ResolveCard when anomaly is null', () => {
      const wrapper = mountDetail({ anomaly: null })
      expect(wrapper.find('.resolve-card-stub').exists()).toBe(false)
    })
  })

  // ── mode=month ────────────────────────────────────────────────────────────────
  describe('mode=month', () => {
    it('renders EmployeeMonthPanel in month mode', () => {
      const wrapper = mountDetail({ mode: 'month' })
      expect(wrapper.find('.emp-month-panel-stub').exists()).toBe(true)
    })

    it('does NOT render ResolveCard in month mode', () => {
      const wrapper = mountDetail({ mode: 'month' })
      expect(wrapper.find('.resolve-card-stub').exists()).toBe(false)
    })

    it('has a "回佇列" button that emits switchMode("resolve")', async () => {
      const wrapper = mountDetail({ mode: 'month' })
      const btns = wrapper.findAll('button')
      const btn = btns.find((b) => b.text().includes('回佇列'))
      expect(btn).toBeTruthy()
      await btn!.trigger('click')
      const emitted = wrapper.emitted('switchMode')
      expect(emitted).toBeTruthy()
      expect(emitted![0][0]).toBe('resolve')
    })
  })

  // ── onResolve: admin_accept ────────────────────────────────────────────────
  describe('onResolve admin_accept', () => {
    it('calls batchConfirmAnomalies with correct payload', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'admin_accept' })
      await nextTick()
      await nextTick()
      expect(mockBatchConfirm).toHaveBeenCalledWith({
        attendance_ids: [anomalyItem.id],
        action: 'admin_accept',
      })
    })

    it('emits resolved + navigate(1) on success', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'admin_accept' })
      await nextTick()
      await nextTick()
      expect(wrapper.emitted('resolved')).toBeTruthy()
      expect(wrapper.emitted('navigate')).toBeTruthy()
      expect(wrapper.emitted('navigate')![0][0]).toBe(1)
    })

    it('shows ElMessage.success on success', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'admin_accept' })
      await nextTick()
      await nextTick()
      expect(mockElMessageSuccess).toHaveBeenCalledWith('已處理')
    })

    it('calls notify and does NOT emit navigate on failure', async () => {
      const err = new Error('server error')
      mockBatchConfirm.mockRejectedValueOnce(err)
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'admin_accept' })
      await nextTick()
      await nextTick()
      expect(mockNotify).toHaveBeenCalledWith(
        err,
        'DetailColumn.resolve',
        null,
        expect.objectContaining({ prefix: '處理失敗' }),
      )
      expect(wrapper.emitted('navigate')).toBeFalsy()
    })
  })

  // ── onResolve: admin_waive ─────────────────────────────────────────────────
  describe('onResolve admin_waive', () => {
    it('calls batchConfirmAnomalies with action admin_waive', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'admin_waive' })
      await nextTick()
      await nextTick()
      expect(mockBatchConfirm).toHaveBeenCalledWith({
        attendance_ids: [anomalyItem.id],
        action: 'admin_waive',
      })
    })
  })

  // ── onResolve: punch ────────────────────────────────────────────────────────
  describe('onResolve punch', () => {
    it('calls upsertRecord with employee_id, date, punch_in, punch_out', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'punch', punch_in: '09:00', punch_out: '18:00' })
      await nextTick()
      await nextTick()
      expect(mockUpsertRecord).toHaveBeenCalledWith({
        employee_id: 99,
        date: anomalyItem.date,
        punch_in: '09:00',
        punch_out: '18:00',
      })
    })

    it('emits resolved + navigate(1) on punch success', async () => {
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'punch', punch_in: '09:00', punch_out: '18:00' })
      await nextTick()
      await nextTick()
      expect(wrapper.emitted('resolved')).toBeTruthy()
      expect(wrapper.emitted('navigate')![0][0]).toBe(1)
    })

    it('calls notify and does NOT emit navigate on punch failure', async () => {
      const err = new Error('punch failed')
      mockUpsertRecord.mockRejectedValueOnce(err)
      const wrapper = mountDetail({})
      const card = wrapper.findComponent(ResolveCardStub)
      await card.vm.$emit('resolve', { action: 'punch', punch_in: '09:00', punch_out: '18:00' })
      await nextTick()
      await nextTick()
      expect(mockNotify).toHaveBeenCalled()
      expect(wrapper.emitted('navigate')).toBeFalsy()
    })
  })

  // ── navigate forwarding ─────────────────────────────────────────────────────
  it('forwards navigate event from ResolveCard', async () => {
    const wrapper = mountDetail({})
    const card = wrapper.findComponent(ResolveCardStub)
    await card.vm.$emit('navigate', 1)
    await nextTick()
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')![0][0]).toBe(1)
  })
})
