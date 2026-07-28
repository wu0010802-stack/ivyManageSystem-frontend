/**
 * 教育部類子頁 — 錯誤路徑與匯出行為
 *
 * 原狀況：CertificatesView / SubsidiesView 的 load() 只有 try/finally 沒有 catch，
 * API 失敗時只是 spinner 消失、畫面留白，使用者得不到任何訊息；SubsidiesView 的
 * 送審/核准/撥款/退回/匯出五個 action 同樣裸奔。
 *
 * 併驗匯出改走 saveBlobResponse —— 後端已於 Content-Disposition 組好中文檔名，
 * 原本各頁自行 createObjectURL + 硬編前端檔名會把它丟掉。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const { elMessage, elMessageBox, saveBlobResponse } = vi.hoisted(() => ({
  elMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  elMessageBox: { confirm: vi.fn(() => Promise.resolve()) },
  saveBlobResponse: vi.fn(),
}))

vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: elMessageBox,
}))

vi.mock('@/utils/download', () => ({ saveBlobResponse }))

vi.mock('@/api/govMoe', () => ({
  listCertificateHistory: vi.fn(),
  listSubsidies: vi.fn(),
  createSubsidy: vi.fn(),
  submitSubsidy: vi.fn(),
  approveSubsidy: vi.fn(),
  markSubsidyPaid: vi.fn(),
  rejectSubsidy: vi.fn(),
  exportSubsidies: vi.fn(),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() =>
    Promise.resolve({ data: { items: [{ id: 7, name: '陳小美' }], total: 1 } }),
  ),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: { items: [{ id: 3, name: '李老師' }] } })),
}))

import {
  listCertificateHistory,
  listSubsidies,
  exportSubsidies,
  submitSubsidy,
} from '@/api/govMoe'
import CertificatesView from '@/views/admin/gov-reports/CertificatesView.vue'
import SubsidiesView from '@/views/admin/gov-reports/SubsidiesView.vue'

const stubs = {
  PageHeader: { template: '<div><slot name="actions"/><slot name="filters"/></div>' },
  'el-select': { template: '<div><slot/></div>' },
  'el-option': { template: '<div/>' },
  'el-tag': { template: '<span><slot/></span>' },
  'el-button': {
    template: '<button :disabled="$attrs.disabled"><slot/></button>',
    inheritAttrs: true,
  },
  'el-form': { template: '<div><slot/></div>' },
  'el-form-item': { template: '<div><slot/></div>' },
  'el-input': { template: '<input/>' },
  'el-input-number': { template: '<input/>' },
  'el-date-picker': { template: '<input/>' },
  'el-dialog': { template: '<div><slot/></div>' },
  'el-card': { template: '<div><slot/></div>' },
  'el-empty': { props: ['description'], template: '<div>{{ description }}</div>' },
  // 渲染 data 的 stub：需要斷言「資料真的有進到表格」而非只看有沒有報錯
  'el-table': {
    props: ['data'],
    template:
      '<div><div v-for="(row, i) in data" :key="i" class="stub-row">{{ row.serial }}</div><slot/></div>',
  },
  'el-table-column': { template: '<div/>' },
}

const mountOptions = { global: { stubs, directives: { loading: {} } } }

const findButton = (w, label) =>
  w.findAll('button').find((b) => b.text().includes(label))

describe('CertificatesView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('查詢失敗時顯示錯誤訊息，不再靜默留白', async () => {
    vi.mocked(listCertificateHistory).mockRejectedValue({ response: { status: 500 } })
    mount(CertificatesView, mountOptions)
    await flushPromises()

    expect(elMessage.error).toHaveBeenCalled()
  })

  it('學生對照表載入失敗不影響主查詢', async () => {
    const { getStudents } = await import('@/api/students')
    vi.mocked(getStudents).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(listCertificateHistory).mockResolvedValue({
      data: [{ id: 1, serial: 'EC-2026-0001', student_id: 7, issue_date: '2026-05-12' }],
    })
    const w = mount(CertificatesView, mountOptions)
    await flushPromises()

    expect(elMessage.error).not.toHaveBeenCalled()
    expect(w.text()).toContain('EC-2026-0001')
  })
})

describe('SubsidiesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listSubsidies).mockResolvedValue({ data: [] })
  })

  it('查詢失敗時顯示錯誤訊息', async () => {
    vi.mocked(listSubsidies).mockRejectedValue({ response: { status: 500 } })
    mount(SubsidiesView, mountOptions)
    await flushPromises()

    expect(elMessage.error).toHaveBeenCalled()
  })

  it('匯出走 saveBlobResponse 以沿用後端 Content-Disposition 檔名', async () => {
    const resp = { data: new Blob(['x']), headers: {} }
    vi.mocked(exportSubsidies).mockResolvedValue(resp)
    const w = mount(SubsidiesView, mountOptions)
    await flushPromises()

    await findButton(w, '匯出 Excel').trigger('click')
    await flushPromises()

    expect(saveBlobResponse).toHaveBeenCalledWith(resp, expect.any(String))
  })

  it('匯出失敗時顯示錯誤訊息', async () => {
    vi.mocked(exportSubsidies).mockRejectedValue({ response: { status: 500 } })
    const w = mount(SubsidiesView, mountOptions)
    await flushPromises()

    await findButton(w, '匯出 Excel').trigger('click')
    await flushPromises()

    expect(elMessage.error).toHaveBeenCalled()
    expect(saveBlobResponse).not.toHaveBeenCalled()
  })

  it('送審失敗時顯示錯誤訊息而非未處理的 rejection', async () => {
    vi.mocked(listSubsidies).mockResolvedValue({
      data: [
        {
          id: 5,
          subsidy_type: 'teacher_extra',
          employee_id: 3,
          period_start: '2026-07-01',
          period_end: '2026-07-31',
          amount_requested: 1000,
          status: 'draft',
        },
      ],
    })
    vi.mocked(submitSubsidy).mockRejectedValue({ response: { status: 409 } })
    const w = mount(SubsidiesView, mountOptions)
    await flushPromises()

    // el-table 以 stub 呈現時不渲染 scoped slot 的動作按鈕，直接呼叫元件方法驗證錯誤處理
    await w.vm.onSubmit({ id: 5 })
    await flushPromises()

    expect(elMessage.error).toHaveBeenCalled()
  })
})
