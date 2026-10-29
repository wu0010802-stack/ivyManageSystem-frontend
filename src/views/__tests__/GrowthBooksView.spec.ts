import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'

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
const deleteGrowthReport = vi.fn(() => Promise.resolve({ data: null }))
const downloadGrowthReportUrl = (s: number, r: number) => `/dl/${s}/${r}`
vi.mock('@/api/studentGrowthReports', () => ({
  sendGrowthReportToLine: (...a: unknown[]) => sendGrowthReportToLine(...a),
  deleteGrowthReport: (...a: unknown[]) => deleteGrowthReport(...a),
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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('GrowthBooksView', () => {
  // 推播 LINE 前一律確認（家長立即收到、無法收回）；既有測試預設使用者按「確定」。
  let confirmSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    sendGrowthReportToLine.mockClear()
  })
  afterEach(() => {
    confirmSpy.mockRestore()
  })

  async function mountLoaded() {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    return w
  }

  it('單筆推播 LINE 先確認並帶出學生姓名；取消則不推播', async () => {
    confirmSpy.mockRejectedValueOnce('cancel')
    const w = await mountLoaded()
    const pushBtn = w.findAll('button').find((b) => b.text().trim() === '推播 LINE')
    await pushBtn!.trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(String(confirmSpy.mock.calls[0][0])).toContain('李小華')
    expect(sendGrowthReportToLine).not.toHaveBeenCalled()
  })

  it('全班推播先確認並帶出人數；取消則一筆都不推', async () => {
    confirmSpy.mockRejectedValueOnce('cancel')
    const w = await mountLoaded()
    const batchBtn = w.findAll('button').find((b) => b.text().includes('全班推播'))
    await batchBtn!.trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(String(confirmSpy.mock.calls[0][0])).toContain('1 位')
    expect(sendGrowthReportToLine).not.toHaveBeenCalled()
  })

  it('全班推播確認後依序推播', async () => {
    const w = await mountLoaded()
    const batchBtn = w.findAll('button').find((b) => b.text().includes('全班推播'))
    await batchBtn!.trigger('click')
    await flushPromises()
    expect(sendGrowthReportToLine).toHaveBeenCalledWith(2, 7)
  })

  it('切班或輪詢重疊時，舊班的慢回應不得覆蓋目前班級名單', async () => {
    type BatchStatusResult = Awaited<ReturnType<typeof getGrowthBookBatchStatus>>
    const oldClass = deferred<BatchStatusResult>()
    const currentClass = deferred<BatchStatusResult>()
    getGrowthBookBatchStatus
      .mockReturnValueOnce(oldClass.promise)
      .mockReturnValueOnce(currentClass.promise)

    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM & { items: Array<{ student_id: number; student_name: string }> }
    vm.classroomId = 1
    const oldLoad = vm.load()
    vm.classroomId = 2
    const currentLoad = vm.load()

    currentClass.resolve({
      data: {
        period_label: '目前班級',
        items: [{ student_id: 20, student_name: '新班幼生', status: 'ready', report_id: 20, line_sent_at: null, material_summary: { observations: 0, work_samples: 0, photos: 0 } }],
      },
    })
    await currentLoad
    oldClass.resolve({
      data: {
        period_label: '舊班級',
        items: [{ student_id: 10, student_name: '舊班幼生', status: 'ready', report_id: 10, line_sent_at: null, material_summary: { observations: 0, work_samples: 0, photos: 0 } }],
      },
    })
    await oldLoad
    await flushPromises()

    expect(vm.items.map((item) => item.student_id)).toEqual([20])
    expect(w.text()).toContain('新班幼生')
    expect(w.text()).not.toContain('舊班幼生')
  })

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

  it('建立失敗（409 同學年已有成長冊）改顯示白話訊息，不外露 report_id／status 代碼', async () => {
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
    expect(errorSpy).toHaveBeenCalledWith(
      '這位幼生本學年已有成長冊（或正在生成中），請重新整理確認目前狀態',
    )
    expect(errorSpy).not.toHaveBeenCalledWith(detail)
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

  it('點擊「挑選內容」開啟挑選抽屜並帶入該生 id／姓名', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const curationBtn = w.findAll('button').find((b) => b.text().trim() === '挑選內容')
    expect(curationBtn).toBeTruthy()
    await curationBtn!.trigger('click')
    await flushPromises()
    expect(draftGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
    expect(w.text()).toContain('挑選成長冊內容：王小明')
  })

  it('無 PORTFOLIO_PUBLISH 權限（READ-only 帳號）不應看到「挑選內容」按鈕', async () => {
    // 審查發現：挑選內容（原「策展」）按鈕原本只看 row.status，READ-only 帳號點開會 403 死路抽屜。
    // 比照同檔其他動作按鈕（一鍵生成／推播 LINE）補上 canPublish gate。
    hasPermission.mockReturnValueOnce(false)
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as VM
    vm.classroomId = 1
    await vm.load()
    await flushPromises()
    const curationBtn = w.findAll('button').find((b) => b.text().trim() === '挑選內容')
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
  // ---------- 2026-10 UI/UX：頁首、四態、錯誤可見、重新製作 ----------

  it('有頁首標題，且未選班級時顯示引導而不是空表格', async () => {
    const w = mount(GrowthBooksView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('h2').text()).toBe('成長冊工作台')
    expect(w.find('[data-test="pick-classroom"]').exists()).toBe(true)
    expect(w.text()).toContain('請先選擇班級')
    expect(w.find('.el-table').exists()).toBe(false)
  })

  it('首次載入失敗：顯示錯誤態與重新載入，不當成沒有資料；重試成功後恢復列表', async () => {
    const errorSpy = vi.spyOn(ElMessage, 'error')
    getGrowthBookBatchStatus.mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const w = await mountLoaded()
    expect(w.find('[data-test="load-error"]').exists()).toBe(true)
    expect(w.text()).toContain('成長冊狀態載入失敗')
    expect(w.text()).not.toContain('這個班級目前沒有在學的幼生')
    expect(w.find('.el-table').exists()).toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('讀取成長冊狀態失敗')

    await w.find('[data-test="load-error"] button').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="load-error"]').exists()).toBe(false)
    expect(w.text()).toContain('王小明')
    errorSpy.mockRestore()
  })

  it('班級沒有在學幼生：顯示空狀態而不是空表格', async () => {
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({ data: { period_label: '114學年度成長冊', items: [] } }))
    const w = await mountLoaded()
    expect(w.find('[data-test="empty-class"]').exists()).toBe(true)
    expect(w.text()).toContain('這個班級目前沒有在學的幼生')
    expect(w.find('[data-test="load-error"]').exists()).toBe(false)
  })

  it('已有資料時重新載入失敗：保留舊列並提示可能不是最新，且鎖住全班動作', async () => {
    const w = await mountLoaded()
    const vm = w.vm as unknown as VM
    getGrowthBookBatchStatus.mockImplementationOnce(() => Promise.reject(new Error('net')))
    await vm.load()
    await flushPromises()
    expect(w.find('[data-test="stale-warning"]').exists()).toBe(true)
    expect(w.find('[data-test="load-error"]').exists()).toBe(false)
    expect(w.text()).toContain('王小明')
    const batch = w.find('[data-test="batch-generate"]')
    expect(batch.attributes('disabled')).not.toBeUndefined()
  })

  it('背景輪詢失敗後停止輪詢，不會每 5 秒重複彈出錯誤', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      getGrowthBookBatchStatus.mockImplementationOnce(() =>
        Promise.resolve({
          data: {
            period_label: '114學年度成長冊',
            items: [{ student_id: 1, student_name: '王小明', status: 'generating', report_id: 5,
              line_sent_at: null,
              material_summary: { observations: 1, work_samples: 0, photos: 0 } }],
          },
        }))
      const w = await mountLoaded()
      getGrowthBookBatchStatus.mockClear()
      getGrowthBookBatchStatus.mockImplementationOnce(() => Promise.reject(new Error('net')))

      vi.advanceTimersByTime(5000)
      await flushPromises()
      expect(getGrowthBookBatchStatus).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(20000)
      await flushPromises()
      expect(getGrowthBookBatchStatus).toHaveBeenCalledTimes(1)
      expect(w.find('[data-test="stale-warning"]').exists()).toBe(true)
      w.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('單筆推播失敗要有可見錯誤，並帶出學生姓名與後端原因', async () => {
    const errorSpy = vi.spyOn(ElMessage, 'error')
    sendGrowthReportToLine.mockImplementationOnce(() => Promise.reject({
      response: { status: 409, data: { detail: '該學生家長未綁定 LINE' } },
    }))
    const w = await mountLoaded()
    const pushBtn = w.findAll('button').find((b) => b.text().trim() === '推播 LINE')
    await pushBtn!.trigger('click')
    await flushPromises()
    expect(errorSpy).toHaveBeenCalledWith('李小華推播失敗：該學生家長未綁定 LINE')
    errorSpy.mockRestore()
  })

  it('批次生成部分失敗：頁面上留下失敗名單與原因，並彈出摘要而非逐筆 toast', async () => {
    const errorSpy = vi.spyOn(ElMessage, 'error')
    const warnSpy = vi.spyOn(ElMessage, 'warning')
    errorSpy.mockClear()
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [
            { student_id: 1, student_name: '王小明', status: 'none', report_id: null, line_sent_at: null,
              material_summary: { observations: 0, work_samples: 0, photos: 0 } },
            { student_id: 3, student_name: '陳小美', status: 'none', report_id: null, line_sent_at: null,
              material_summary: { observations: 2, work_samples: 1, photos: 5 } },
          ],
        },
      }))
    createGrowthBook.mockImplementationOnce(() => Promise.reject({
      response: { status: 422, data: { detail: '該學年沒有任何可用素材' } },
    }))
    const w = await mountLoaded()
    await w.find('[data-test="batch-generate"]').trigger('click')
    await flushPromises()

    const alert = w.find('[data-test="batch-failures"]')
    expect(alert.exists()).toBe(true)
    expect(alert.text()).toContain('生成失敗 1 位')
    expect(alert.text()).toContain('王小明：該學年沒有任何可用素材')
    expect(alert.text()).not.toContain('陳小美')
    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 位失敗'))
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('批次推播部分失敗：頁面上列出推播失敗的學生與原因', async () => {
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [
            { student_id: 2, student_name: '李小華', status: 'ready', report_id: 7, line_sent_at: null,
              material_summary: { observations: 1, work_samples: 0, photos: 3 } },
            { student_id: 4, student_name: '張小花', status: 'ready', report_id: 9, line_sent_at: null,
              material_summary: { observations: 1, work_samples: 0, photos: 3 } },
          ],
        },
      }))
    sendGrowthReportToLine.mockImplementationOnce(() => Promise.reject({
      response: { status: 409, data: { detail: '該學生家長未綁定 LINE' } },
    }))
    const w = await mountLoaded()
    await w.find('[data-test="batch-send"]').trigger('click')
    await flushPromises()
    expect(sendGrowthReportToLine).toHaveBeenCalledTimes(2)
    const alert = w.find('[data-test="batch-failures"]')
    expect(alert.text()).toContain('推播失敗 1 位')
    expect(alert.text()).toContain('李小華：該學生家長未綁定 LINE')
    expect(alert.text()).not.toContain('張小花')
  })

  it('一頁一個主要動作：還有人沒生成時「全班一鍵生成」為主要按鈕，全部生成後換成「全班推播」', async () => {
    const w = await mountLoaded()
    expect(w.find('[data-test="batch-generate"]').classes()).toContain('el-button--primary')
    expect(w.find('[data-test="batch-send"]').classes()).not.toContain('el-button--primary')

    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [{ student_id: 2, student_name: '李小華', status: 'ready', report_id: 7, line_sent_at: null,
            material_summary: { observations: 1, work_samples: 0, photos: 3 } }],
        },
      }))
    await (w.vm as unknown as VM).load()
    await flushPromises()
    expect(w.find('[data-test="batch-generate"]').classes()).not.toContain('el-button--primary')
    expect(w.find('[data-test="batch-generate"]').attributes('disabled')).not.toBeUndefined()
    expect(w.find('[data-test="batch-send"]').classes()).toContain('el-button--primary')
  })

  it('已推播過的學生：按鈕改稱「再次推播」，已推播標記帶推播時間', async () => {
    getGrowthBookBatchStatus.mockImplementationOnce(() =>
      Promise.resolve({
        data: {
          period_label: '114學年度成長冊',
          items: [{ student_id: 2, student_name: '李小華', status: 'ready', report_id: 7,
            line_sent_at: '2026-07-20T10:00:00+08:00',
            material_summary: { observations: 1, work_samples: 0, photos: 3 } }],
        },
      }))
    const w = await mountLoaded()
    expect(w.findAll('button').some((b) => b.text().trim() === '再次推播')).toBe(true)
    expect(w.findAll('button').some((b) => b.text().trim() === '推播 LINE')).toBe(false)
    expect(w.find('.pushed-tag').attributes('title')).toContain('已推播給家長')
  })

  it('「重新製作」先確認；取消則不刪除', async () => {
    confirmSpy.mockRejectedValueOnce('cancel')
    deleteGrowthReport.mockClear()
    const w = await mountLoaded()
    const btn = w.findAll('button').find((b) => b.text().trim() === '重新製作')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledTimes(1)
    expect(String(confirmSpy.mock.calls[0][0])).toContain('李小華')
    expect(deleteGrowthReport).not.toHaveBeenCalled()
  })

  it('「重新製作」確認後刪除舊冊、重新載入並開啟挑選內容抽屜', async () => {
    deleteGrowthReport.mockClear()
    draftGrowthBook.mockClear()
    const w = await mountLoaded()
    getGrowthBookBatchStatus.mockClear()
    const btn = w.findAll('button').find((b) => b.text().trim() === '重新製作')
    await btn!.trigger('click')
    await flushPromises()
    expect(deleteGrowthReport).toHaveBeenCalledWith(2, 7)
    expect(getGrowthBookBatchStatus).toHaveBeenCalledTimes(1)
    expect(draftGrowthBook).toHaveBeenCalledWith(2, { academic_year: expect.any(Number) })
    expect(w.text()).toContain('挑選成長冊內容：李小華')
  })

  it('「重新製作」刪除失敗：顯示錯誤、不開抽屜', async () => {
    const errorSpy = vi.spyOn(ElMessage, 'error')
    deleteGrowthReport.mockImplementationOnce(() => Promise.reject({
      response: { status: 403, data: { detail: '無權限' } },
    }))
    draftGrowthBook.mockClear()
    const w = await mountLoaded()
    const btn = w.findAll('button').find((b) => b.text().trim() === '重新製作')
    await btn!.trigger('click')
    await flushPromises()
    expect(errorSpy).toHaveBeenCalledWith('刪除李小華的舊成長冊失敗：無權限')
    expect(draftGrowthBook).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('無 PORTFOLIO_PUBLISH 權限：不顯示全班動作、推播與重新製作，但仍可下載', async () => {
    hasPermission.mockReturnValueOnce(false)
    const w = await mountLoaded()
    expect(w.find('[data-test="batch-generate"]').exists()).toBe(false)
    expect(w.find('[data-test="batch-send"]').exists()).toBe(false)
    const labels = w.findAll('button').map((b) => b.text().trim())
    expect(labels).not.toContain('重新製作')
    expect(labels).not.toContain('推播 LINE')
    expect(labels).toContain('下載')
  })

  it('學年度欄被清空時退回本學年度，不會送 null 給後端', async () => {
    const w = await mountLoaded()
    const vm = w.vm as unknown as VM
    getGrowthBookBatchStatus.mockClear()
    vm.academicYear = null as unknown as number
    const input = w.findComponent({ name: 'ElInputNumber' })
    input.vm.$emit('change', undefined, 114)
    await flushPromises()
    expect(typeof vm.academicYear).toBe('number')
    expect(getGrowthBookBatchStatus).toHaveBeenCalledWith({
      classroom_id: 1,
      academic_year: vm.academicYear,
    })
  })

  it('手機寬度改用卡片列表，操作按鈕仍可用且帶學生姓名', async () => {
    const mq = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList)
    try {
      const w = await mountLoaded()
      expect(w.find('.el-table').exists()).toBe(false)
      const cards = w.findAll('.alc-card')
      expect(cards.length).toBe(2)
      expect(cards[0].text()).toContain('王小明')
      const gen = cards[0].findAll('button').find((b) => b.text().trim() === '一鍵生成')
      expect(gen).toBeTruthy()
      expect(gen!.attributes('aria-label')).toBe('一鍵生成：王小明')
      createGrowthBook.mockClear()
      await gen!.trigger('click')
      await flushPromises()
      expect(createGrowthBook).toHaveBeenCalledWith(1, { academic_year: expect.any(Number) })
    } finally {
      mq.mockRestore()
    }
  })
})
