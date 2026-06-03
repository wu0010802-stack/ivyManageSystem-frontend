import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/vendorPayment', async () => {
  const actual = await vi.importActual('@/api/vendorPayment')
  return {
    ...actual,
    listVendorPayments: vi.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            payment_date: '2026-05-15',
            vendor_name: '清潔用品行',
            amount: 1200,
            payment_method: 'cash',
            description: '5 月清潔用品',
            invoice_number: 'AB-001',
            notes: null,
            attachments: [],
            status: 'pending',
            signer_id: null,
            signer_name: null,
            signed_at: null,
            signature_kind: null,
            has_signature: false,
            created_by_id: 1,
            created_by_name: 'admin',
            created_at: '2026-05-15T10:00:00',
            updated_at: '2026-05-15T10:00:00',
          },
          {
            id: 2,
            payment_date: '2026-05-10',
            vendor_name: '食材廠商',
            amount: 8800,
            payment_method: 'bank_transfer',
            description: '5 月伙食',
            invoice_number: null,
            notes: '已對帳',
            attachments: [],
            status: 'signed',
            signer_id: 7,
            signer_name: '林主任',
            signed_at: '2026-05-11T09:30:00',
            signature_kind: 'drawn',
            has_signature: true,
            created_by_id: 1,
            created_by_name: 'admin',
            created_at: '2026-05-10T10:00:00',
            updated_at: '2026-05-11T09:30:00',
          },
        ],
        total: 2,
        page: 1,
        page_size: 20,
      },
    }),
    getVendorPaymentSummary: vi.fn().mockResolvedValue({
      data: {
        total_count: 2,
        total_amount: 10000,
        pending_count: 1,
        pending_amount: 1200,
        signed_count: 1,
        signed_amount: 8800,
      },
    }),
    createVendorPayment: vi.fn().mockResolvedValue({ data: { id: 99 } }),
    updateVendorPayment: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
    deleteVendorPayment: vi.fn().mockResolvedValue({ data: { message: 'ok' } }),
  }
})

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
  PERMISSION_NAMES: {
    VENDOR_PAYMENT_READ: 'VENDOR_PAYMENT_READ',
    VENDOR_PAYMENT_WRITE: 'VENDOR_PAYMENT_WRITE',
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue(true) },
}))

import {
  listVendorPayments,
  getVendorPaymentSummary,
  createVendorPayment,
  deleteVendorPayment,
  PAYMENT_METHOD_OPTIONS,
  paymentMethodLabel,
} from '@/api/vendorPayment'
import { hasPermission } from '@/utils/auth'
import { ElMessageBox } from 'element-plus'
import VendorPaymentView from '../VendorPaymentView.vue'

const globalStubs = {
  'el-button': { template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>' },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-input-number': { template: '<input type="number" />', props: ['modelValue'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option><slot /></option>' },
  'el-date-picker': { template: '<input type="date" />', props: ['modelValue'] },
  // 不渲染 el-table 內部 slot（避免 row scoped slot 解構錯誤），只露出 data 數量
  'el-table': {
    template: '<table data-test="vp-table"><tbody><tr v-for="r in data" :key="r.id"><td>{{ r.vendor_name }}</td></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-tag': { template: '<span class="el-tag"><slot /></span>', props: ['type'] },
  'el-dialog': {
    template: '<div v-if="modelValue" class="el-dialog-stub"><slot /><slot name="footer" /></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div class="el-form-item"><slot /></div>' },
  'el-pagination': { template: '<div class="el-pagination" />' },
  'el-upload': { template: '<div class="el-upload"><slot /></div>' },
  'el-radio-group': { template: '<div class="el-radio-group"><slot /></div>', props: ['modelValue'] },
  'el-radio-button': { template: '<label class="el-radio-button"><slot /></label>', props: ['value'] },
  'el-skeleton': { template: '<div class="el-skeleton" />' },
  'el-dropdown': { template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div class="el-dropdown-item"><slot /></div>', props: ['command'] },
  VendorPaymentSignDialog: { template: '<div class="sign-dialog-stub" />' },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

describe('VendorPaymentView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermission.mockReturnValue(true)
  })

  it('mounts and loads list on mount', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(listVendorPayments).toHaveBeenCalled()
    expect(wrapper.text()).toContain('廠商付款簽收')
    expect(wrapper.text()).toContain('清潔用品行')
    expect(wrapper.text()).toContain('食材廠商')
  })

  it('loads summary on mount and renders KPI cards', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(getVendorPaymentSummary).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('本期付款總額')
    expect(text).toContain('待廠商簽收')
    expect(text).toContain('已簽收')
    // 待簽收筆數（pending_count = 1）渲染
    expect(text).toContain('1 筆等待回簽')
  })

  it('summary follows range filter but not status (status only reloads list)', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    getVendorPaymentSummary.mockClear()
    listVendorPayments.mockClear()
    // 只改 status → 只刷列表，彙總不重抓
    wrapper.vm.filters.status = 'pending'
    await wrapper.vm.fetchList()
    expect(listVendorPayments).toHaveBeenCalled()
    expect(getVendorPaymentSummary).not.toHaveBeenCalled()
  })

  it('hides write actions when user has no VENDOR_PAYMENT_WRITE', async () => {
    hasPermission.mockReturnValue(false)
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    // 新增按鈕應隱藏
    const text = wrapper.text()
    expect(text).not.toContain('新增付款')
  })

  it('shows 新增 button when WRITE perm', async () => {
    hasPermission.mockReturnValue(true)
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('新增付款')
  })

  it('PAYMENT_METHOD_OPTIONS exposes 5 methods', () => {
    expect(PAYMENT_METHOD_OPTIONS).toHaveLength(5)
    expect(PAYMENT_METHOD_OPTIONS.map((o) => o.value)).toEqual([
      'cash',
      'bank_transfer',
      'check',
      'linepay',
      'other',
    ])
  })

  it('paymentMethodLabel maps known values to zh-TW label', () => {
    expect(paymentMethodLabel('cash')).toBe('現金')
    expect(paymentMethodLabel('bank_transfer')).toBe('銀行匯款')
    expect(paymentMethodLabel('check')).toBe('支票')
    expect(paymentMethodLabel('linepay')).toBe('LINE Pay')
    expect(paymentMethodLabel('other')).toBe('其他')
    // fallback returns input
    expect(paymentMethodLabel('未知')).toBe('未知')
  })

  it('delete confirms and calls API', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    // 模擬呼叫 handleDelete
    await wrapper.vm.handleDelete({ id: 1, vendor_name: '清潔用品行' })
    expect(ElMessageBox.confirm).toHaveBeenCalled()
    expect(deleteVendorPayment).toHaveBeenCalledWith(1)
  })

  it('openCreate resets form and opens dialog', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    wrapper.vm.openCreate()
    await flushPromises()
    expect(wrapper.vm.editingId).toBeNull()
    expect(wrapper.vm.dialogVisible).toBe(true)
    expect(wrapper.vm.form.payment_method).toBe('cash')
    expect(wrapper.vm.form.amount).toBe(0)
  })

  it('handleSave POST when no editingId', async () => {
    const wrapper = mount(VendorPaymentView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    wrapper.vm.openCreate()
    wrapper.vm.form.vendor_name = '測試廠商'
    wrapper.vm.form.amount = 500
    await wrapper.vm.handleSave()
    expect(createVendorPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor_name: '測試廠商',
        amount: 500,
        payment_method: 'cash',
      })
    )
  })
})
