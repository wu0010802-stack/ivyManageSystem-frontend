import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage } from 'element-plus'

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
// Task 13：策展抽屜（GrowthBookCurationDrawer）開啟即呼叫 draftGrowthBook，需回傳
// 可解析的 shape（即使本檔測試多半不主動點開抽屜）避免真的點開時掛掉。
const draftGrowthBook = vi.fn(() => Promise.resolve({
  data: {
    manifest: {
      version: 1, cover_attachment_id: null, observation_ids: [],
      work_sample_ids: [], collage_attachment_ids: [], milestone_ids: [],
      include_measurements: false,
    },
    candidates: {
      observations: [], work_samples: [], collage_pool: [], milestones: [],
      measurement_count: 0,
    },
    period: { start: '2025-08-01', end: '2026-07-31', label: '114學年度成長冊' },
  },
}))
// 成長報告族沿用既有 @/api/studentGrowthReports（Task 9 審查後定案），本檔 mock 對應調整
vi.mock('@/api/growthBooks', () => ({
  getGrowthBookBatchStatus: (...a: unknown[]) => getGrowthBookBatchStatus(...a),
  createGrowthBook: (...a: unknown[]) => createGrowthBook(...a),
  draftGrowthBook: (...a: unknown[]) => draftGrowthBook(...a),
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

// 生成／推播（含策展，Task 13 審查後補上 canPublish gate）動作對齊後端
// Permission.PORTFOLIO_PUBLISH 守衛；測試環境無登入 session，需顯式 stub 為 true
// 才能渲染出這些操作按鈕（比照 WorkSamplesSection.spec.ts 慣例）。宣告成具名
// const 而非直接 inline 在 factory 內，讓個別測試可用 mockReturnValueOnce
// 覆寫成 false 模擬 READ-only 帳號。
const hasPermission = vi.fn(() => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (...a: unknown[]) => hasPermission(...a),
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

  it('顯示素材摘要與已推播標記（僅已推播的學生出現「已推播」tag）', async () => {
    // 覆寫本測試專用資料：李小華（student_id=2）已推播，王小明（student_id=1）未推播，
    // 確保「已推播」tag 只在有 line_sent_at 的列出現，另一列不該有。
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [
            { student_id: 1, student_name: '王小明', status: 'none', report_id: null,
              line_sent_at: null,
              material_summary: { observations: 4, work_samples: 2, photos: 10 } },
            { student_id: 2, student_name: '李小華', status: 'ready', report_id: 7,
              line_sent_at: '2026-07-20T10:00:00+08:00',
              material_summary: { observations: 1, work_samples: 0, photos: 3 } },
          ],
        },
      }))
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    expect(w.text()).toContain('觀察 4')
    expect(w.text()).toContain('作品 2')
    expect(w.text()).toContain('照片 10')

    const rows = w.findAll('.el-table__row')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('王小明')
    expect(rows[0].text()).not.toContain('已推播')
    expect(rows[1].text()).toContain('李小華')
    expect(rows[1].text()).toContain('已推播')
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
    const errorSpy = vi.spyOn(ElMessage, 'error')
    const detail = '同學年已有成長冊（report_id=99, status=ready）'
    createGrowthBook.mockImplementationOnce(() =>
      Promise.reject({
        response: { status: 409, data: { detail } },
      }))
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const genBtn = w.findAll('button').find((b) => b.text().trim() === '一鍵生成')
    await genBtn!.trigger('click')
    await flushPromises()
    expect(createGrowthBook).toHaveBeenCalled()
    // 後端 409 detail 是純字串，apiError() 應直接透傳給 ElMessage.error 顯示
    expect(errorSpy).toHaveBeenCalledWith(detail)
    errorSpy.mockRestore()
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

  it('status=failed 的學生列仍可點「一鍵生成」，且會被全班一鍵生成涵蓋', async () => {
    // 審查發現：failed 狀態原本被生成/策展/批次生成三處 gate 排除，卡死無法重試。
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [
            { student_id: 1, student_name: '王小明', status: 'failed', report_id: null,
              line_sent_at: null,
              material_summary: { observations: 4, work_samples: 2, photos: 10 } },
            { student_id: 2, student_name: '李小華', status: 'ready', report_id: 7,
              line_sent_at: null,
              material_summary: { observations: 1, work_samples: 0, photos: 3 } },
          ],
        },
      }))
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()

    const genBtn = w.findAll('button').find((b) => b.text().trim() === '一鍵生成')
    expect(genBtn).toBeTruthy()
    expect(genBtn!.attributes('disabled')).toBeUndefined()

    createGrowthBook.mockClear()
    getGrowthBookBatchStatus.mockClear()
    const batchBtn = w.findAll('button').find((b) => b.text().includes('全班一鍵生成'))
    expect(batchBtn).toBeTruthy()
    await batchBtn!.trigger('click')
    await flushPromises()
    // failed 的王小明應被批次生成涵蓋（ready 的李小華不該被生成）
    expect(createGrowthBook).toHaveBeenCalledTimes(1)
    expect(createGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
  })

  it('點擊「策展」開啟策展抽屜並帶入該生 id／姓名', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const curationBtn = w.findAll('button').find((b) => b.text().trim() === '策展')
    expect(curationBtn).toBeTruthy()
    await curationBtn!.trigger('click')
    await flushPromises()
    expect(draftGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
    expect(w.text()).toContain('策展：王小明')
  })

  it('無 PORTFOLIO_PUBLISH 權限（READ-only 帳號）不應看到「策展」按鈕', async () => {
    // 審查發現：策展按鈕原本只看 row.status，READ-only 帳號點開會 403 死路抽屜。
    // 比照同檔其他動作按鈕（一鍵生成／推播 LINE）補上 canPublish gate。
    hasPermission.mockReturnValueOnce(false)
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const curationBtn = w.findAll('button').find((b) => b.text().trim() === '策展')
    expect(curationBtn).toBeUndefined()
  })

  it('批次生成進行中，尚未輪到的學生列按鈕鎖住防止重複送出', async () => {
    // 3 位學生：2 位 status=none（王小明、陳小美，會被批次生成排入序列）＋ 1 位 ready（李小華，
    // 用來確認「推播 LINE」列按鈕也一併鎖住，不限於同一動作類型）。
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [
            { student_id: 1, student_name: '王小明', status: 'none', report_id: null,
              line_sent_at: null,
              material_summary: { observations: 4, work_samples: 2, photos: 10 } },
            { student_id: 3, student_name: '陳小美', status: 'none', report_id: null,
              line_sent_at: null,
              material_summary: { observations: 2, work_samples: 1, photos: 5 } },
            { student_id: 2, student_name: '李小華', status: 'ready', report_id: 7,
              line_sent_at: null,
              material_summary: { observations: 1, work_samples: 0, photos: 3 } },
          ],
        },
      }))
    // 批次序列第一筆卡住不 resolve，模擬「跑到一半」；之後手動釋放。
    let releaseFirst: (() => void) | null = null
    createGrowthBook.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseFirst = () => resolve({ data: { id: 99 } })
      }),
    )

    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()

    const batchBtn = w.findAll('button').find((b) => b.text().includes('全班一鍵生成'))
    expect(batchBtn).toBeTruthy()
    await batchBtn!.trigger('click')
    await flushPromises()

    // 批次跑到一半（第一筆卡在 pending）：兩位 status=none 的「一鍵生成」與
    // ready 學生的「推播 LINE」都應該被鎖住，不能手動點擊搶跑。
    const genBtns = w.findAll('button').filter((b) => b.text().trim() === '一鍵生成')
    const pushBtns = w.findAll('button').filter((b) => b.text().trim() === '推播 LINE')
    expect(genBtns.length).toBe(2)
    expect(pushBtns.length).toBe(1)
    for (const b of [...genBtns, ...pushBtns]) {
      expect(b.attributes('disabled')).not.toBeUndefined()
    }

    releaseFirst?.()
    await flushPromises()
  })
})
