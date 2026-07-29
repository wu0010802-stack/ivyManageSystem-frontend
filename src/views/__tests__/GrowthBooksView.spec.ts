import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// 班級清單：src/api/classrooms.ts 實際 export 名為 getClassrooms，回傳陣列（非 {items:[...]}）
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() =>
    Promise.resolve({ data: [{ id: 1, name: '小熊班' }] })),
}))

const getGrowthBookBatchStatus = vi.fn(() =>
  Promise.resolve({
    data: {
      period_label: '114學年度成長冊',
      items: [
        { student_id: 1, student_name: '王小明', status: 'none', report_id: null,
          line_sent_at: null,
          material_summary: { observations: 4, work_samples: 2, photos: 10 } },
        { student_id: 2, student_name: '李小華', status: 'ready', report_id: 7,
          line_sent_at: null,
          material_summary: { observations: 1, work_samples: 0, photos: 3 } },
      ],
    },
  }))
const createGrowthBook = vi.fn(() => Promise.resolve({ data: { id: 8 } }))
// 成長報告族沿用既有 @/api/studentGrowthReports（Task 9 審查後定案），本檔 mock 對應調整
vi.mock('@/api/growthBooks', () => ({
  getGrowthBookBatchStatus: (...a: unknown[]) => getGrowthBookBatchStatus(...a),
  createGrowthBook: (...a: unknown[]) => createGrowthBook(...a),
  draftGrowthBook: vi.fn(),
}))

const sendGrowthReportToLine = vi.fn(() => Promise.resolve({ data: { sent_count: 1 } }))
const downloadGrowthReportUrl = (s: number, r: number) => `/dl/${s}/${r}`
vi.mock('@/api/studentGrowthReports', () => ({
  sendGrowthReportToLine: (...a: unknown[]) => sendGrowthReportToLine(...a),
  downloadGrowthReportUrl: (s: number, r: number) => downloadGrowthReportUrl(s, r),
  listGrowthReports: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// 生成／推播動作對齊後端 Permission.PORTFOLIO_PUBLISH 守衛；測試環境無登入 session，
// 需顯式 stub 為 true 才能渲染出這些操作按鈕（比照 WorkSamplesSection.spec.ts 慣例）。
vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn(() => true),
}))

import GrowthBooksView from '../GrowthBooksView.vue'

type VM = {
  classroomId: number | null
  academicYear: number
  load: () => Promise<void>
}

describe('GrowthBooksView', () => {
  it('選班級後列出每生冊況', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    expect(w.text()).toContain('王小明')
    expect(w.text()).toContain('尚未建立')
    expect(w.text()).toContain('可下載')
  })

  it('顯示素材摘要與已推播標記', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    expect(w.text()).toContain('觀察 4')
    expect(w.text()).toContain('作品 2')
    expect(w.text()).toContain('照片 10')
  })

  it('下載按鈕開啟後端下載網址（noopener）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const downloadBtn = w.findAll('button').find((b) => b.text().includes('下載'))
    expect(downloadBtn).toBeTruthy()
    await downloadBtn!.trigger('click')
    expect(openSpy).toHaveBeenCalledWith('/dl/2/7', '_blank', 'noopener')
    openSpy.mockRestore()
  })

  it('一鍵生成呼叫 createGrowthBook 並於完成後重新載入', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    getGrowthBookBatchStatus.mockClear()
    const genBtn = w.findAll('button').find((b) => b.text().trim() === '一鍵生成')
    expect(genBtn).toBeTruthy()
    await genBtn!.trigger('click')
    await flushPromises()
    expect(createGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
    expect(getGrowthBookBatchStatus).toHaveBeenCalledTimes(1)
  })

  it('推播 LINE 成功顯示成功訊息', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const pushBtn = w.findAll('button').find((b) => b.text().trim() === '推播 LINE')
    expect(pushBtn).toBeTruthy()
    await pushBtn!.trigger('click')
    await flushPromises()
    expect(sendGrowthReportToLine).toHaveBeenCalledWith(2, 7)
  })

  it('建立失敗（409）顯示後端 detail 訊息', async () => {
    createGrowthBook.mockImplementationOnce(() =>
      Promise.reject({
        response: { status: 409, data: { detail: '同學年已有成長冊（report_id=99, status=ready）' } },
      }))
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const genBtn = w.findAll('button').find((b) => b.text().trim() === '一鍵生成')
    await genBtn!.trigger('click')
    await flushPromises()
    // 不拋出未捕捉例外即代表走了 catch 分支；訊息內容透過 ElMessage 呈現（元件測試不斷言 DOM toast)
    expect(createGrowthBook).toHaveBeenCalled()
  })

  it('全班一鍵生成依序 await 每位 status=none 的學生', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    createGrowthBook.mockClear()
    getGrowthBookBatchStatus.mockClear()
    const batchBtn = w.findAll('button').find((b) => b.text().includes('全班一鍵生成'))
    expect(batchBtn).toBeTruthy()
    await batchBtn!.trigger('click')
    await flushPromises()
    // 只有 1 位 status=none（王小明），2 號已是 ready 不該被生成
    expect(createGrowthBook).toHaveBeenCalledTimes(1)
    expect(createGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
    expect(getGrowthBookBatchStatus).toHaveBeenCalledTimes(1)
  })
})
