/**
 * tests/unit/views/GovReportsView.test.js
 *
 * 政府申報匯出頁：
 * - 期間預設值（月報表＝上個月、扣繳憑單＝去年）
 * - 雇主基本資料 localStorage 記憶
 * - 統編 8 碼驗證擋下下載
 * - 扣繳單位未填時沿用統一編號
 * - blob 錯誤回應解析出後端 detail
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { mockLabor, mockHealth, mockWithholding, mockPension } = vi.hoisted(() => ({
  mockLabor: vi.fn(),
  mockHealth: vi.fn(),
  mockWithholding: vi.fn(),
  mockPension: vi.fn(),
}))

vi.mock('@/api/govReports', () => ({
  getLaborInsurance: mockLabor,
  getHealthInsurance: mockHealth,
  getWithholding: mockWithholding,
  getPension: mockPension,
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

import { ElMessage } from 'element-plus'
import GovReportsView from '@/views/GovReportsView.vue'

const STORAGE_KEY = 'gov-reports.employer'

const mountOptions = {
  global: {
    stubs: {
      'el-card': { template: '<div><slot name="header"/><slot/></div>' },
      'el-form': { template: '<form><slot/></form>' },
      'el-form-item': { template: '<div><slot/></div>' },
      'el-input': {
        props: ['modelValue'],
        emits: ['update:modelValue'],
        template:
          '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      },
      'el-tabs': { template: '<div><slot/></div>' },
      'el-tab-pane': { template: '<div><slot/></div>' },
      'el-date-picker': {
        props: ['modelValue'],
        emits: ['update:modelValue'],
        template: '<input class="date-picker" :value="modelValue" />',
      },
      'el-radio-group': { template: '<div><slot/></div>' },
      'el-radio': { template: '<label><slot/></label>' },
      'el-button': {
        props: ['disabled', 'loading', 'type'],
        emits: ['click'],
        template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>',
      },
      'el-icon': { template: '<span/>' },
      'el-alert': { template: '<div><slot/></div>' },
    },
  },
}

function lastMonthPeriod() {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const downloadButtons = (wrapper) =>
  wrapper.findAll('button').filter((b) => b.text().includes('下載申報表'))

let anchorClickSpy

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // jsdom 未實作 createObjectURL；_triggerDownload 需要
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
  anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  anchorClickSpy.mockRestore()
})

describe('GovReportsView — 期間預設值', () => {
  it('月報表預設上個月、扣繳憑單預設去年', () => {
    const wrapper = mount(GovReportsView, mountOptions)
    const pickers = wrapper.findAll('.date-picker')
    // 順序：勞保、健保、扣繳（年度）、勞退
    expect(pickers).toHaveLength(4)
    expect(pickers[0].element.value).toBe(lastMonthPeriod())
    expect(pickers[1].element.value).toBe(lastMonthPeriod())
    expect(pickers[2].element.value).toBe(String(new Date().getFullYear() - 1))
    expect(pickers[3].element.value).toBe(lastMonthPeriod())
  })
})

describe('GovReportsView — 雇主資料記憶', () => {
  it('進頁時從 localStorage 帶回雇主資料', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '常春藤幼兒園', code: '12345678' }))
    const wrapper = mount(GovReportsView, mountOptions)
    const inputs = wrapper.findAll('input')
    expect(inputs[0].element.value).toBe('常春藤幼兒園')
    expect(inputs[1].element.value).toBe('12345678')
  })

  it('localStorage 內容損毀時視同未儲存，不炸頁', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json')
    const wrapper = mount(GovReportsView, mountOptions)
    expect(wrapper.findAll('input')[0].element.value).toBe('')
  })

  it('修改雇主資料會寫回 localStorage', async () => {
    const wrapper = mount(GovReportsView, mountOptions)
    await wrapper.findAll('input')[0].setValue('小太陽幼兒園')
    await flushPromises()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).name).toBe('小太陽幼兒園')
  })
})

describe('GovReportsView — 統編驗證', () => {
  it('統一編號非 8 位數字時擋下下載並提示', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '', code: '123' }))
    const wrapper = mount(GovReportsView, mountOptions)
    await downloadButtons(wrapper)[0].trigger('click')
    expect(ElMessage.warning).toHaveBeenCalledWith('統一編號需為 8 位數字')
    expect(mockLabor).not.toHaveBeenCalled()
  })
})

describe('GovReportsView — 下載流程', () => {
  it('勞保下載帶預設年月與雇主參數，成功後提示', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '常春藤', code: '12345678' }))
    mockLabor.mockResolvedValue({ data: new Blob(['x']) })
    const wrapper = mount(GovReportsView, mountOptions)
    await downloadButtons(wrapper)[0].trigger('click')
    await flushPromises()
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    expect(mockLabor).toHaveBeenCalledWith({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      fmt: 'xlsx',
      employer_name: '常春藤',
      employer_code: '12345678',
    })
    expect(anchorClickSpy).toHaveBeenCalled()
    expect(ElMessage.success).toHaveBeenCalledWith('下載成功')
  })

  it('扣繳憑單未填扣繳單位時沿用統一編號', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '', code: '87654321' }))
    mockWithholding.mockResolvedValue({ data: new Blob(['x']) })
    const wrapper = mount(GovReportsView, mountOptions)
    await downloadButtons(wrapper)[2].trigger('click')
    await flushPromises()
    expect(mockWithholding).toHaveBeenCalledWith({
      year: new Date().getFullYear() - 1,
      employer_name: undefined,
      employer_id: '87654321',
    })
  })

  it('後端 4xx 的 JSON detail 會被解出顯示', async () => {
    mockLabor.mockRejectedValue({
      response: {
        status: 409,
        data: new Blob([JSON.stringify({ detail: '該月份薪資尚未封存，無法匯出' })], {
          type: 'application/json',
        }),
      },
    })
    const wrapper = mount(GovReportsView, mountOptions)
    await downloadButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(ElMessage.error).toHaveBeenCalledWith('該月份薪資尚未封存，無法匯出')
  })

  it('429 顯示頻率限制提示', async () => {
    mockLabor.mockRejectedValue({ response: { status: 429 } })
    const wrapper = mount(GovReportsView, mountOptions)
    await downloadButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(ElMessage.warning).toHaveBeenCalledWith('匯出過於頻繁，請稍後再試')
  })
})
