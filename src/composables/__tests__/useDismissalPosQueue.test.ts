import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, ref } from 'vue'
import { useDismissalPosQueue, type PosDispatchStudent } from '../useDismissalPosQueue'
import { createDismissalCall, cancelDismissalCall } from '@/api/dismissalCalls'
import { confirmVisualMatch } from '@/api/pickupAuthorizations'
import { ElMessage } from 'element-plus'
import type { DismissalCallView } from '../useDismissalUrgency'

vi.mock('@/api/dismissalCalls', () => ({
  createDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
  cancelDismissalCall: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('@/api/pickupAuthorizations', () => ({
  confirmVisualMatch: vi.fn().mockResolvedValue({ data: {} }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

// 在 effectScope 內跑 composable，回傳 API + stop（讓 onScopeDispose 可被觸發，比照既有 useFormDraft.test.ts 慣例）。
function run<T>(fn: () => T): { api: T; stop: () => void } {
  const scope = effectScope()
  let api!: T
  scope.run(() => { api = fn() })
  return { api, stop: () => scope.stop() }
}

const student: PosDispatchStudent = {
  id: 1,
  name: '王小明',
  classroomId: 13,
  classroomName: '天堂鳥',
}

describe('useDismissalPosQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('addToQueue(student) 後立即出現在合併清單中（狀態=staging）', () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)

    expect(api.queue.value).toHaveLength(1)
    expect(api.queue.value[0].phase).toBe('staging')
    expect(api.queue.value[0].studentId).toBe(1)
    expect(api.queue.value[0].countdown).not.toBeNull()
    stop()
  })

  it('同一學生倒數中重複 addToQueue 不重複發起', () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    api.addToQueue(student)

    expect(api.queue.value).toHaveLength(1)
    stop()
  })

  it('5000ms 後 staging 項目轉為 active 且持續顯示（不等 activeCalls／WS 更新），createDismissalCall 恰被呼叫一次且參數正確', async () => {
    vi.mocked(createDismissalCall).mockResolvedValueOnce({
      data: {
        id: 200,
        student_id: 1,
        student_name: '王小明',
        classroom_id: 13,
        classroom_name: '天堂鳥',
        status: 'pending',
        requested_at: '2026-08-21T08:00:00+08:00',
        request_source: 'staff',
      },
    })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    expect(api.queue.value).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5000)

    expect(createDismissalCall).toHaveBeenCalledTimes(1)
    expect(createDismissalCall).toHaveBeenCalledWith({ student_id: 1, classroom_id: 13 })
    // 送出成功後不能整個消失：activeCalls 模擬 WS 尚未追上（仍是空陣列），
    // 但這筆通知要用 createDismissalCall 的 response 直接持續顯示在右欄，
    // 不能只靠外部 activeCalls／WS 才補回來。
    expect(api.queue.value).toHaveLength(1)
    expect(api.queue.value[0].phase).toBe('active')
    expect(api.queue.value[0].id).toBe(200)
    stop()
  })

  it('createDismissalCall 成功但 response 缺 id（後端回應形狀跑掉，型別上是 unknown）時不建立本地樂觀項目、不噴錯', async () => {
    vi.mocked(createDismissalCall).mockResolvedValueOnce({ data: { message: 'ok' } })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    await vi.advanceTimersByTimeAsync(5000)

    // fail-safe：不塞畸形資料進佇列，靜默交回 WS/輪詢（原本 D2/D5 依賴的路徑）。
    expect(api.queue.value).toHaveLength(0)
    expect(ElMessage.error).not.toHaveBeenCalled()
    stop()
  })

  it('本地樂觀 active 項目在 activeCalls 追上（該 id 出現，不論狀態）後改用外部版本，不重複渲染也不資料漂移', async () => {
    vi.mocked(createDismissalCall).mockResolvedValueOnce({
      data: { id: 200, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'pending' },
    })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    await vi.advanceTimersByTimeAsync(5000)
    expect(api.queue.value).toHaveLength(1)

    // WS/輪詢追上：同一 id 狀態已變 acknowledged（老師已確認）
    activeCalls.value = [
      { id: 200, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'acknowledged' },
    ]

    expect(api.queue.value.filter(i => i.id === 200)).toHaveLength(1)
    stop()
  })

  it('cancel 本地樂觀 active 項目（activeCalls 尚未追上）會呼叫 cancelDismissalCall 並讓卡片消失，不會卡死在右欄', async () => {
    vi.mocked(createDismissalCall).mockResolvedValueOnce({
      data: { id: 201, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'pending' },
    })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    await vi.advanceTimersByTimeAsync(5000)
    const item = api.queue.value.find(i => i.id === 201)
    expect(item).toBeTruthy()

    await api.cancel(item!)

    expect(cancelDismissalCall).toHaveBeenCalledWith(201)
    // POS active 檢視下「已取消」是直接從 calls.value 濾除、不是 upsert（見
    // DismissalQueueView.vue handleWsEvent），activeCalls 可能永遠不會再出現
    // 這個 id——若沒主動清 localActiveCalls，卡片會卡死在右欄。
    expect(api.queue.value.filter(i => i.id === 201)).toHaveLength(0)
    stop()
  })

  it('倒數中呼叫 cancel(item) 不會呼叫任何後端 API', () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    const item = api.queue.value[0]
    void api.cancel(item)

    expect(createDismissalCall).not.toHaveBeenCalled()
    expect(cancelDismissalCall).not.toHaveBeenCalled()
    expect(api.queue.value).toHaveLength(0)
    stop()
  })

  it('倒數中 cancel 後就算等滿 5000ms 也不會再呼叫 createDismissalCall（timer 已清除）', async () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    void api.cancel(api.queue.value[0])
    await vi.advanceTimersByTimeAsync(5000)

    expect(createDismissalCall).not.toHaveBeenCalled()
    stop()
  })

  it('已是 backend active call 的項目呼叫 cancel(item) 會呼叫 cancelDismissalCall(id) 恰一次', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      {
        id: 99,
        student_name: '李小美',
        classroom_name: '向日葵',
        status: 'pending',
        requested_at: '2026-08-21T08:00:00+08:00',
      },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    const item = api.queue.value.find(i => i.phase === 'active')
    expect(item).toBeTruthy()
    await api.cancel(item!)

    expect(cancelDismissalCall).toHaveBeenCalledTimes(1)
    expect(cancelDismissalCall).toHaveBeenCalledWith(99)
    expect(createDismissalCall).not.toHaveBeenCalled()
    stop()
  })

  it('active call 的 cancel 失敗時用 ElMessage 呈現錯誤，不會靜默失敗', async () => {
    vi.mocked(cancelDismissalCall).mockRejectedValueOnce({
      response: { data: { detail: '此通知狀態已變更' } },
    })
    const activeCalls = ref<DismissalCallView[]>([
      {
        id: 99,
        student_id: 5,
        student_name: '李小美',
        classroom_name: '向日葵',
        status: 'pending',
        requested_at: '2026-08-21T08:00:00+08:00',
      },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    const item = api.queue.value.find(i => i.phase === 'active')
    await api.cancel(item!)

    expect(ElMessage.error).toHaveBeenCalledWith('此通知狀態已變更')
    stop()
  })

  it('同一學生短暫同時存在 staging 與 active（WS 推播比 createDismissalCall 回應更早抵達）時，queue 只顯示 active 版本，不重複渲染', async () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student) // 產生 staging entry（studentId=1）
    expect(api.queue.value.filter(i => i.studentId === 1)).toHaveLength(1)

    // 模擬 WS 已經把同一學生的 active call 推進來，但 staging 尚未被 submit() 的 finally 清掉
    activeCalls.value = [
      { id: 88, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'pending' },
    ]

    const matches = api.queue.value.filter(i => i.studentId === 1)
    expect(matches).toHaveLength(1)
    expect(matches[0].phase).toBe('active')
    stop()
  })

  it('activeCalls 混入 completed/cancelled 記錄時（D5：呼叫端可能為了徽章一起傳入），右欄佇列只顯示 pending/acknowledged，不會誤畫成「等待確認」', () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 1, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'completed' },
      { id: 2, student_id: 2, student_name: '李小美', classroom_name: '向日葵', status: 'cancelled' },
      { id: 3, student_id: 3, student_name: '陳大文', classroom_name: '星星班', status: 'pending' },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    expect(api.queue.value).toHaveLength(1)
    expect(api.queue.value[0].studentId).toBe(3)
    expect(api.queue.value[0].phase).toBe('active')
    stop()
  })

  it('request_source=proxy 的後端 active call 轉出 source=proxy 的 PosQueueItem，並帶出代理人/取件碼資訊（T-021）', () => {
    const activeCalls = ref<DismissalCallView[]>([
      {
        id: 60,
        student_id: 7,
        student_name: '陳小華',
        classroom_name: '彩虹班',
        status: 'pending',
        request_source: 'proxy',
        requested_at: '2026-08-23T08:00:00+08:00',
        expected_arrival_at: '2026-08-23T08:00:00+08:00',
        person_name: '王小明',
        person_relation: '阿姨',
        pickup_code: '482913',
      },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    expect(api.queue.value).toHaveLength(1)
    const item = api.queue.value[0]
    expect(item.phase).toBe('active')
    expect(item.source).toBe('proxy')
    expect(item.call?.person_name).toBe('王小明')
    expect(item.call?.person_relation).toBe('阿姨')
    expect(item.call?.pickup_code).toBe('482913')
    stop()
  })

  it('元件卸載（effectScope.stop）時清除所有未到期的 timer，不留殭屍呼叫', async () => {
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    stop() // 模擬元件卸載

    await vi.advanceTimersByTimeAsync(5000)

    expect(createDismissalCall).not.toHaveBeenCalled()
  })

  it('createDismissalCall 失敗（非 409）時顯示錯誤訊息，staging 項目仍會移除（不卡死佇列）', async () => {
    vi.mocked(createDismissalCall).mockRejectedValueOnce({
      response: { status: 500, data: { detail: '伺服器錯誤' } },
    })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    await vi.advanceTimersByTimeAsync(5000)

    expect(createDismissalCall).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).toHaveBeenCalledWith('伺服器錯誤')
    expect(ElMessage.info).not.toHaveBeenCalled()
    // 失敗也要移除 staging，否則卡片永遠停在「已送出」的假狀態，使用者無法重試
    expect(api.queue.value).toHaveLength(0)
    stop()
  })

  it('createDismissalCall 回 409（該生已有進行中通知）時顯示 info 提示，不是 error', async () => {
    vi.mocked(createDismissalCall).mockRejectedValueOnce({
      response: { status: 409 },
    })
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    await vi.advanceTimersByTimeAsync(5000)

    expect(ElMessage.info).toHaveBeenCalledWith('王小明 已有進行中的接送通知')
    expect(ElMessage.error).not.toHaveBeenCalled()
    stop()
  })

  it('addToQueue 時該生已有後端 active（pending）通知則忽略，不開始倒數、不呼叫 API', async () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 50, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'pending' },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student) // student.id === 1，與上面 active call 的 student_id 相同
    expect(api.queue.value).toHaveLength(1)
    expect(api.queue.value[0].phase).toBe('active') // 只有原本的 active 項目，沒有新增 staging

    await vi.advanceTimersByTimeAsync(5000)
    expect(createDismissalCall).not.toHaveBeenCalled()
    stop()
  })

  it('addToQueue 時該生已有後端 active（acknowledged）通知也會被忽略', () => {
    const activeCalls = ref<DismissalCallView[]>([
      { id: 51, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'acknowledged' },
    ])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student)
    expect(api.queue.value.filter(i => i.phase === 'staging')).toHaveLength(0)
    stop()
  })

  it('createDismissalCall 呼叫期間（await 尚未結束）若使用者 cancel 又重新 addToQueue，不會誤刪替換後的新倒數卡', async () => {
    // 手動控制 createDismissalCall 的 resolve 時機，模擬「API 呼叫進行中」的窗口。
    let resolveCreate!: () => void
    vi.mocked(createDismissalCall).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveCreate = () => resolve({
          data: { id: 300, student_id: 1, student_name: '王小明', classroom_name: '天堂鳥', status: 'pending' },
        })
      }),
    )
    const activeCalls = ref<DismissalCallView[]>([])
    const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

    api.addToQueue(student) // E1
    await vi.advanceTimersByTimeAsync(5000) // 觸發 submit()，createDismissalCall 進行中、尚未 resolve

    // 這時 E1 仍在 staging（本次修復刻意延後刪除），使用者 swipe 取消該卡
    const stagingItem = api.queue.value.find(i => i.phase === 'staging')
    expect(stagingItem).toBeTruthy()
    await api.cancel(stagingItem!) // E1 從 map 移除

    // 立刻重新點擊同一學生 → 產生新的 E2
    api.addToQueue(student)
    expect(api.queue.value.filter(i => i.phase === 'staging')).toHaveLength(1)

    // 現在才讓 E1 的 createDismissalCall 完成——E1 實際上已在後端建立成功，
    // 本地樂觀 active 項目（id 300）會出現；E2 與它是同一學生，此刻在合併
    // 清單中被暫時併入 E1 的 active 顯示（避免同一學生同時出現 staging + active
    // 兩張卡，見 queue computed 的 activeStudentIds dedup），但這只影響「畫面
    // 上顯示哪一張卡」，E2 底層的 staging entry 沒有被誤刪。
    resolveCreate()
    await Promise.resolve()
    await Promise.resolve()
    expect(createDismissalCall).toHaveBeenCalledTimes(1)

    // 驗證 E2 沒有被誤刪的關鍵證據：等它自己的 5000ms 到，仍會照常呼叫
    // createDismissalCall 第二次（若被誤刪，timer 早已被 clearTimeout，不會再呼叫）。
    await vi.advanceTimersByTimeAsync(5000)
    expect(createDismissalCall).toHaveBeenCalledTimes(2)
    stop()
  })

  describe('confirmProxyPickup（T-022，目視比對一鍵確認接送）', () => {
    function proxyActiveCalls(): DismissalCallView[] {
      return [
        {
          id: 70,
          student_id: 7,
          student_name: '陳小華',
          classroom_name: '彩虹班',
          status: 'pending',
          request_source: 'proxy',
          requested_at: '2026-08-23T08:00:00+08:00',
          expected_arrival_at: '2026-08-23T08:00:00+08:00',
          person_name: '王小明',
          person_relation: '阿姨',
          pickup_code: '482913',
          pickup_authorization_id: 900,
        },
      ]
    }

    it('確認成功呼叫 confirm-visual-match 恰一次（帶 pickup_authorization_id），並立即從佇列移除該卡片', async () => {
      const activeCalls = ref<DismissalCallView[]>(proxyActiveCalls())
      const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

      const item = api.queue.value.find(i => i.id === 70)
      expect(item).toBeTruthy()

      await api.confirmProxyPickup(item!)

      expect(confirmVisualMatch).toHaveBeenCalledTimes(1)
      expect(confirmVisualMatch).toHaveBeenCalledWith(900)
      expect(api.queue.value.filter(i => i.id === 70)).toHaveLength(0)
      expect(ElMessage.error).not.toHaveBeenCalled()
      stop()
    })

    it('確認失敗（例如已被其他人員搶先核銷，409）時顯示明確錯誤訊息，卡片保留在佇列不誤刪', async () => {
      vi.mocked(confirmVisualMatch).mockRejectedValueOnce({
        response: { data: { detail: '此授權已被核銷' } },
      })
      const activeCalls = ref<DismissalCallView[]>(proxyActiveCalls())
      const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

      const item = api.queue.value.find(i => i.id === 70)
      await api.confirmProxyPickup(item!)

      expect(ElMessage.error).toHaveBeenCalledWith('此授權已被核銷')
      expect(api.queue.value.filter(i => i.id === 70)).toHaveLength(1)
      stop()
    })

    it('外部 activeCalls 追上（該 id 狀態不再是 pending/acknowledged）後才清掉隱藏標記，不會無界成長', async () => {
      const activeCalls = ref<DismissalCallView[]>(proxyActiveCalls())
      const { api, stop } = run(() => useDismissalPosQueue(activeCalls))

      const item = api.queue.value.find(i => i.id === 70)
      await api.confirmProxyPickup(item!)
      expect(api.queue.value.filter(i => i.id === 70)).toHaveLength(0)

      // WS/輪詢追上：狀態變 completed，仍不應該重新出現在右欄
      activeCalls.value = [{ ...proxyActiveCalls()[0], status: 'completed' }]
      expect(api.queue.value.filter(i => i.id === 70)).toHaveLength(0)
      stop()
    })
  })
})
