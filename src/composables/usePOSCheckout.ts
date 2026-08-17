import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSReceiptPdf,
  getPOSRecentTransactions,
  getRefundSuggestion,
  getRegistrations,
  posCheckout,
} from '@/api/activity'
import { openPdfInNewTab } from '@/utils/printPdfWindow'
import { readBlobErrorDetail } from '@/utils/blobErrorDetail'
import {
  CASH_METHOD,
  LARGE_AMOUNT_THRESHOLD,
  REFUND_APPROVAL_THRESHOLD,
  computeOwed,
  formatTWD,
} from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import type { ApiResponse, ApiBody } from '@/api/_generated/typed'

type CheckoutBody = ApiBody<'/activity/pos/checkout', 'post'>

/**
 * POS 收銀狀態機：搜尋 → 選擇單筆 → 送出（可選列印） → 重置。
 * 單筆模式：同時間只允許選取一筆報名，點選第二筆會直接取代前一筆。
 * 一次繳清定位：不處理實收/找零，只記錄「收款金額」。
 * 有意不放 Pinia store：POS 狀態頁面級且短暫，不跨路由共享。
 *
 * 安全保護：
 * - idempotency_key：同一次送出嘗試固定一把 key，網路逾時/5xx 重試沿用同 key
 *   避免重複結帳；成功或 4xx（含後端內容守衛回 409）後才釋放，下次送出換新 key。
 *   後端 /pos/checkout 對同 key 不同內容（金額/項目/類型/日期）回 409，杜絕改了
 *   金額卻收到舊收據的錯帳。
 * - payment_date 不再由前端決定（2026-08-15 code review P2-06）：收銀電腦的時區／
 *   時鐘偏差會寫出錯誤日期的收據，而日期是日結簽核與現金對帳的分界。改為省略欄位，
 *   由後端以台北時區當日填入（單一權威來源）。
 * - scope dispose 時清除 searchTimer
 */

/**
 * 今日交易列表取回上限。與「POS 日結簽核」頁一致，避免同一天的張數在兩頁對不起來。
 * 後端另回 total / truncated，UI 據此顯示「顯示 N／共 M 張」。
 */
const RECENT_TRANSACTIONS_LIMIT = 100

/** 產生冪等 key（優先 crypto.randomUUID，否則 fallback） */
function makeIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }
  // Fallback：時間戳 + 隨機字串
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function usePOSCheckout() {
  const termStore = useAcademicTermStore()

  // ── 模式與搜尋 ────────────────────────────────────────────────────
  const mode = ref('by-student') // 'by-student' | 'by-registration'
  const searchQuery = ref('')
  const classroomFilter = ref('') // 班級下拉選單：'' = 全部
  const overdueOnly = ref(false) // 逾期過濾（僅繳費模式有意義）
  const searching = ref(false)
  const searchGroups = ref<Record<string, unknown>[]>([])
  const searchRegistrations = ref<Record<string, unknown>[]>([])
  // searchError：搜尋失敗旗標（P3-06）。runSearch 失敗時 fail-closed 清空清單，但空
  // 清單同時也是「本來就沒有未結清報名」的正常結果——兩者長得一模一樣。少了這個旗標，
  // 空狀態只能寫「目前沒有未結清的報名」，櫃台會把載入失敗讀成「全部繳清」而漏收款。
  // 命名比照 dailySummary.error / recentTransactions.error 的 fail-visible 慣例。
  const searchError = ref(false)
  // 截斷狀態：後端 outstanding-by-student 有 2000 筆防爆上限、依日期模式每狀態
  // /registrations 上限 200。超限時清單/日曆/金額會不完整，必須讓 UI 提示櫃台縮小
  // 搜尋範圍，否則靜默漏掉待收/待退款（code review P1/P2）。
  const searchTruncation = reactive({ truncated: false, total: 0 })
  let searchSeq = 0
  let searchTimer: ReturnType<typeof setTimeout> | null = null

  // ── 單筆選取（取代購物車） ───────────────────────────────────────
  // null = 尚未選取；物件結構同以往 cart 行項目
  const selectedItem = ref<{ id: unknown; student_name: string; class_name: string; total_amount: number; paid_amount: number; owed: number; amount_applied: number; courses: unknown[]; supplies: unknown[] } | null>(null)

  // ── 交易類型（繳費 or 退費） ─────────────────────────────────────
  const checkoutType = ref('payment') // 'payment' | 'refund'
  const isRefundMode = computed(() => checkoutType.value === 'refund')

  // ── 退費建議值載入（按出席比例，避免預填全額已繳超退；P2-B）─────────
  const refundSuggestionLoading = ref(false)
  let refundSuggestionSeq = 0
  let refundSuggestionGeneration = 0

  function invalidateRefundSuggestion() {
    refundSuggestionGeneration += 1
    refundSuggestionLoading.value = false
  }

  // ── 收款 ────────────────────────────────────────────────────────
  // 永遠是現金（spec 2026-05-06-pos-cash-only）；保留 ref 以便未來擴充時最小改動
  const paymentMethod = ref(CASH_METHOD)
  const notes = ref('')
  const submitting = ref(false)

  // ── 冪等 key（送出當下產生，成功後清除） ────────────────────────
  // payment_date 已改由後端決定（P2-06），前端不再凍結日期；跨午夜重試時後端
  // 冪等內容簽章仍可能不符而回 409，該情形由下方 409 分支的阻斷式提示接手處理
  // （刷新交易列表 → 讓已入帳的那筆現形 → 由櫃台決定是否重收）。
  let pendingIdempotencyKey: string | null = null

  function releasePendingTransaction() {
    pendingIdempotencyKey = null
  }

  // ── 最後收據與日結 ─────────────────────────────────────────────
  const lastReceipt = ref<Record<string, unknown> | null>(null)
  const receiptDialogVisible = ref(false)

  // error：刷新失敗旗標（P3-05）。失敗時不可續留舊值——結帳成功後刷新失敗的話，
  // 彙總條會顯示**不含本筆**的舊金額，櫃台據此點鈔會少算。
  const dailySummary = reactive({
    data: null as ApiResponse<'/activity/pos/daily-summary', 'get'> | null,
    loading: false,
    error: false,
  })

  // ── 今日交易明細（可重印） ─────────────────────────────────────
  // total / truncated：後端回的「當日收據總張數（截斷前）」與是否被上限截斷，
  // 供 UI 顯示「顯示 N／共 M 張」，避免櫃台把顯示筆數當成當日總張數對帳。
  const recentTransactions = reactive({
    items: [] as NonNullable<ApiResponse<'/activity/pos/recent-transactions', 'get'>['transactions']>,
    loading: false,
    total: 0,
    truncated: false,
    error: false,
  })

  // ── 計算屬性 ──────────────────────────────────────────────────
  const itemTotal = computed(() =>
    selectedItem.value ? Number(selectedItem.value.amount_applied) || 0 : 0
  )

  // 退費簽核權限：與後端 REFUND_APPROVAL_THRESHOLD 對齊；無權限時 UI 直接 disable 送出按鈕
  const canApproveRefund = computed(() => hasPermission('ACTIVITY_PAYMENT_APPROVE'))

  // 給 UI 顯示「需主管簽核」提示用：退費 + 金額超門檻 + 沒權限
  const refundApprovalBlocked = computed(
    () =>
      isRefundMode.value &&
      itemTotal.value > REFUND_APPROVAL_THRESHOLD &&
      !canApproveRefund.value
  )

  const canSubmit = computed(() => {
    if (submitting.value || searching.value) return false
    const item = selectedItem.value
    if (!item) return false
    const applied = Number(item.amount_applied) || 0
    if (applied <= 0) return false
    // 退費模式：金額不得超過已繳；備註原因 ≥ 15 字（與後端 MIN_REFUND_REASON_LENGTH 一致）
    if (isRefundMode.value) {
      // 建議值載入中先擋送出，避免於 async 覆寫前盲送 buildSelection 的全額預填（P2-B）
      if (refundSuggestionLoading.value) return false
      if (applied > (item.paid_amount || 0)) return false
      if ((notes.value || '').trim().length < 15) return false
      // 大於門檻必須有 ACTIVITY_PAYMENT_APPROVE，否則後端會 403
      if (applied > REFUND_APPROVAL_THRESHOLD && !canApproveRefund.value) return false
    }
    return true
  })

  // 切換繳費 / 退費時：清空選取（兩模式邏輯不同，避免混淆）
  watch(checkoutType, (next, prev) => {
    if (next === prev) return
    invalidateRefundSuggestion()
    selectedItem.value = null
    notes.value = ''
    // 退費試算覆蓋付款金額競態修復：切模式當下使任何進行中的 applyRefundSuggestion
    // 請求失效（stillCurrent() 靠 seq 比對擋下落地），並復位 loading 旗標，避免
    // 「退費模式選學生 → 試算 in-flight → 切回繳費 → 重選同一筆」時，舊試算
    // resolve 後把繳費金額覆寫成退費建議值。
    refundSuggestionSeq++
    refundSuggestionLoading.value = false
    // 搜尋結果也重新拉（退費模式要看已繳金額 > 0 的）
    // 空搜尋代表「全部」而非「尚未搜尋」；首次載入後從收款切退款時也必須重抓，
    // 否則會繼續顯示收款模式的未繳名單。
    runSearch()
  })

  // ── 搜尋 ──────────────────────────────────────────────────────
  function triggerSearch() {
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      searchTimer = null
      runSearch()
    }, 300)
  }

  async function runSearch() {
    invalidateRefundSuggestion()
    const q = (searchQuery.value || '').trim()
    const classroom = (classroomFilter.value || '').trim()
    const seq = ++searchSeq
    searching.value = true
    // fail-closed：新條件／新學期請求開始後，不保留上一批可操作資料。若請求失敗，
    // 清單維持空白，避免櫃台對上一學期的報名收款或退款。
    searchGroups.value = []
    searchRegistrations.value = []
    selectedItem.value = null
    // 重置截斷旗標；取回資料後再依當次回應重新判定（seq 守衛擋下過期寫入）
    searchTruncation.truncated = false
    searchTruncation.total = 0
    try {
      if (mode.value === 'by-student') {
        const opts: Record<string, unknown> = {
          filter: isRefundMode.value ? 'refundable' : 'outstanding',
          school_year: termStore.school_year,
          semester: termStore.semester,
        }
        if (classroom) opts.classroom = classroom
        if (overdueOnly.value && !isRefundMode.value) opts.overdue_only = true
        const res = await getPOSOutstandingByStudent(q, 100, opts)
        if (seq !== searchSeq) return
        searchGroups.value = res.data?.groups || []
        // 後端標記截斷（active/可退費母體超過 2000 上限）→ 清單可能漏掉排在後面的學生
        searchTruncation.truncated = res.data?.truncated ?? false
        searchTruncation.total = res.data?.total_active ?? 0
      } else {
        const statuses = isRefundMode.value
          ? ['paid', 'partial', 'overpaid']
          : ['partial', 'unpaid']
        const baseParams: Record<string, unknown> = {
          payment_status: undefined,
          limit: 200,
          school_year: termStore.school_year,
          semester: termStore.semester,
        }
        if (q) baseParams.search = q
        if (classroom) baseParams.classroom_name = classroom
        const calls = statuses.map((s) =>
          getRegistrations({ ...baseParams, payment_status: s })
        )
        const results = await Promise.all(calls)
        if (seq !== searchSeq) return
        // 截斷偵測：/registrations 每狀態上限 200，後端回 total。total 超過實際抓回
        // 筆數即代表此狀態尚有未載入交易，日曆與金額會少算（code review P2）。各狀態
        // payment_status 互斥（一筆只屬一狀態），total 直接相加為符合條件母體上界。
        let dateTruncated = false
        let dateTotal = 0
        for (const r of results) {
          const d = r.data as { items?: unknown[]; total?: number }
          const shown = d?.items?.length ?? 0
          const tot = Number(d?.total ?? shown)
          dateTotal += tot
          if (tot > shown) dateTruncated = true
        }
        searchTruncation.truncated = dateTruncated
        searchTruncation.total = dateTotal
        const items = results.flatMap((r) => (r.data as { items?: Record<string, unknown>[] })?.items || [])
        const seen = new Set()
        const merged = []
        for (const item of items) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          // 過濾依模式而異（code review P1）：
          // - 收款模式：丟掉空報名（total<=0，無 enrolled 課程且無用品），避免後端
          //   unpaid=paid_amount==0 漏擋。
          // - 退款模式：保留 paid>0（與後端 refundable 口徑一致）。total==0 && paid>0 的
          //   超繳報名（後端 _derive_payment_status 歸 overpaid）必須留下，否則櫃台在退款
          //   模式看不到 → 漏退。
          const total = Number(item.total_amount || 0)
          const paid = Number(item.paid_amount || 0)
          if (isRefundMode.value) {
            if (paid <= 0) continue
          } else if (total <= 0) {
            continue
          }
          merged.push(item)
        }
        merged.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        searchRegistrations.value = merged
      }
      // 走到這裡代表本次是最新一輪且已成功寫入結果（兩個分支都在 seq 不符時提早
      // return），可以把失敗旗標放掉。
      searchError.value = false
    } catch (e) {
      if (seq === searchSeq) {
        const err = e as { response?: { data?: { detail?: string } } }
        ElMessage.error(err?.response?.data?.detail || '搜尋失敗')
        // fail-visible：toast 幾秒就消失，清單卻會一直空著。留下旗標讓空狀態
        // 能講「讀取失敗」而不是「目前沒有未結清的報名」（P3-06）。
        searchError.value = true
      }
    } finally {
      if (seq === searchSeq) searching.value = false
    }
  }

  function switchMode(next: string) {
    if (mode.value === next) return
    mode.value = next
    searchGroups.value = []
    searchRegistrations.value = []
    runSearch()
  }

  // 班級 / 逾期 filter 變動時立即重搜
  watch([classroomFilter, overdueOnly], () => {
    runSearch()
  })

  // 切換 mode（依學生 / 依日期）時清掉對側資料並重新拉對應資料
  watch(mode, (next, prev) => {
    if (next === prev) return
    if (next === 'by-student') searchRegistrations.value = []
    else searchGroups.value = []
    selectedItem.value = null
    runSearch()
  })

  // ── 選取（單筆） ─────────────────────────────────────────────
  function buildSelection(row: Record<string, unknown>, studentName: string) {
    const paid = Number(row.paid_amount || 0)
    const owed = Number(row.owed ?? computeOwed(row.total_amount, paid))
    // 繳費：預填欠費；退費：預填已繳金額
    const defaultAmount = isRefundMode.value ? paid : owed
    return {
      id: row.id,
      student_name: String(row.student_name || studentName || ''),
      class_name: String(row.class_name || ''),
      total_amount: Number(row.total_amount || 0),
      paid_amount: paid,
      owed,
      amount_applied: defaultAmount,
      courses: (row.courses || []) as unknown[],
      supplies: (row.supplies || []) as unknown[],
    }
  }

  /**
   * 退費模式：以後端「剩餘建議額」（remaining_suggested_amount = 按出席比例建議總額
   * 扣已退、夾 0）覆寫 buildSelection 的全額預填，避免簽核者盲簽「全額已繳」造成超退
   * （2026-06-29 audit P2-B）；多次退費時不會把累積建議總額重複預填（audit F1）。
   * seq + 操作世代守衛防快速切換模式／選取／搜尋時舊建議覆寫。
   * fail-closed（audit F2）：載入失敗或回應缺 remaining_suggested_amount 時，不再保留
   * buildSelection 的全額 paid fallback，改歸 0 + 警告，強制人工輸入金額（amount_applied
   * <=0 時 canSubmit 為 false，送出鈕被擋）。
   * 競態修復：stillCurrent() 額外檢查 isRefundMode，避免「試算 in-flight 時切回繳費
   * 模式」的邊界情形——即便 seq 因某種原因未變（例如切模式與重選同一筆之間沒有其他
   * applyRefundSuggestion 呼叫），只要目前已不在退費模式就不得套用退費建議覆寫繳費金額。
   */
  async function applyRefundSuggestion(registrationId: unknown) {
    const seq = ++refundSuggestionSeq
    const generation = refundSuggestionGeneration
    const selection = selectedItem.value
    refundSuggestionLoading.value = true
    // 仍是發出請求時的退款模式／操作世代／選取物件，且無較新請求才套用。
    // 僅比 registration id 不足：切回收款後可能重選同一筆，舊退款回應仍會撞 ID。
    const stillCurrent = () =>
      seq === refundSuggestionSeq &&
      generation === refundSuggestionGeneration &&
      checkoutType.value === 'refund' &&
      !!selection &&
      selectedItem.value === selection &&
      Number(selectedItem.value.id) === Number(registrationId)
    const failClosed = () => {
      if (!stillCurrent()) return
      selectedItem.value = { ...selectedItem.value!, amount_applied: 0 }
      ElMessage.warning('退費建議載入失敗，請手動確認退費金額')
    }
    try {
      const res = await getRefundSuggestion(Number(registrationId))
      if (!stillCurrent()) return
      const remaining = (res.data as { remaining_suggested_amount?: number })
        ?.remaining_suggested_amount
      if (typeof remaining === 'number' && Number.isFinite(remaining)) {
        selectedItem.value = { ...selectedItem.value!, amount_applied: remaining }
      } else {
        failClosed()
      }
    } catch {
      failClosed()
    } finally {
      if (
        seq === refundSuggestionSeq &&
        generation === refundSuggestionGeneration
      ) {
        refundSuggestionLoading.value = false
      }
    }
  }

  /** 點擊搜尋結果：同 id 再點 → 取消；不同 id → 取代 */
  function selectItem(row: Record<string, unknown>, studentName: string) {
    if (!row) return
    invalidateRefundSuggestion()
    if (selectedItem.value && selectedItem.value.id === row.id) {
      selectedItem.value = null
      return
    }
    selectedItem.value = buildSelection(row, studentName)
    if (isRefundMode.value) {
      // 非同步覆寫為建議值（buildSelection 已先放 paid 作 fallback）
      applyRefundSuggestion(row.id)
    }
  }

  function clearSelection() {
    invalidateRefundSuggestion()
    selectedItem.value = null
  }

  function updateSelectedAmount(amount: number) {
    if (!selectedItem.value) return
    selectedItem.value = {
      ...selectedItem.value,
      amount_applied: Number(amount) || 0,
    }
  }

  function resetTransactionInputs() {
    clearSelection()
    notes.value = ''
  }

  function reset() {
    resetTransactionInputs()
    searchQuery.value = ''
    searchGroups.value = []
    searchRegistrations.value = []
    paymentMethod.value = CASH_METHOD
  }

  // ── 送出 ──────────────────────────────────────────────────────
  /**
   * @param {Object} [options]
   * @param {boolean} [options.print=true] 是否在成功後觸發列印
   * @param {Function} [options.onSubmitted] 成功後的回調
   */
  async function submit(options: { print?: boolean; onSubmitted?: () => unknown } = {}) {
    const { print: shouldPrint = true, onSubmitted } = options
    if (!canSubmit.value) return
    const item = selectedItem.value
    if (!item) return

    // 退費必填原因（≥ 15 字），後端 schema 層亦會擋；此處提前 UI 驗證避免送出後被拒
    const cleanedNotes = (notes.value || '').trim()
    if (isRefundMode.value && cleanedNotes.length < 15) {
      ElMessage.warning('退費必須於備註填寫具體原因（至少 15 個字）')
      return
    }

    // submitting 必須在大額二次確認**之前**就鎖上（2026-08-14 bug hunt）：confirm
    // 是 await 的，期間若 submitting 仍為 false，canSubmit 為 true、送出鈕未 disable，
    // 可再開一次結帳流程（modal 遮罩只是視覺防線，鍵盤/程式路徑仍可觸發）。
    submitting.value = true

    // 大額交易（>= LARGE_AMOUNT_THRESHOLD）二次確認
    if (itemTotal.value >= LARGE_AMOUNT_THRESHOLD) {
      const typeLabel = isRefundMode.value ? '退費' : '收款'
      try {
        await ElMessageBox.confirm(
          `本次${typeLabel}金額為 ${formatTWD(itemTotal.value)}，請確認金額無誤後繼續。`,
          `大額${typeLabel}確認`,
          {
            type: 'warning',
            confirmButtonText: `確認${typeLabel}`,
            cancelButtonText: '取消',
            confirmButtonClass: isRefundMode.value ? 'el-button--danger' : 'el-button--primary',
          }
        )
      } catch {
        submitting.value = false
        return // 使用者取消
      }
    }

    // 若重試時 pendingIdempotencyKey 仍存在，代表上次 submit 還沒成功結束，重用同 key
    if (!pendingIdempotencyKey) {
      pendingIdempotencyKey = makeIdempotencyKey()
    }

    try {
      const payload: CheckoutBody = {
        items: [
          {
            registration_id: Number(item.id),
            amount: Number(item.amount_applied),
          },
        ],
        payment_method: paymentMethod.value as CheckoutBody['payment_method'],
        // 不傳 payment_date：由後端以台北時區當日決定（P2-06）
        tendered: null,
        notes: (notes.value || '').trim(),
        type: checkoutType.value as CheckoutBody['type'],
        idempotency_key: pendingIdempotencyKey,
      }
      const res = await posCheckout(payload)
      const receipt = {
        ...res.data,
        items_with_student: res.data.items,
      }
      lastReceipt.value = receipt

      if (receipt.idempotent_replay) {
        ElMessage.info(`偵測到重試，顯示先前收據：${receipt.receipt_no}`)
      } else {
        const doneLabel = receipt.type === 'refund' ? '退費成功' : '收款成功'
        ElMessage.success(`${doneLabel}：${receipt.receipt_no}`)
      }

      // 送出成功後才釋放 key + payment_date，重試時會復用
      releasePendingTransaction()

      if (shouldPrint) {
        receiptDialogVisible.value = true
        await nextTick()
        // 結帳當下的第一次列印＝正本，不可標補印（2026-08-14 bug hunt）
        printReceipt({ reprint: false })
      }
      resetTransactionInputs()
      // 刷新：日結、最近交易、搜尋結果（讓剛收款的學生立即從欠費列表消失）
      await Promise.allSettled([
        refreshDailySummary(),
        refreshRecentTransactions(),
        runSearch(),
        onSubmitted?.(),
      ])
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { detail?: string } } }
      const status = err?.response?.status
      if (status && status >= 400 && status < 500) {
        pendingIdempotencyKey = null
      }
      const detailMsg = err?.response?.data?.detail || '結帳失敗'
      // 409 = 這把 idempotency_key 已經成立過一筆**未作廢的有效收據**（後端只在命中
      // 有效收據時才拋），也就是前一筆已經入帳。若比照其他 4xx 只彈幾秒即消的 toast、
      // 又不刷新任何清單，櫃台看不到那筆收據就會再按一次——新 key 產生第二筆＝重複收款
      // （2026-08-15 code review P2-04）。先刷新今日交易與搜尋讓那筆現形，再用阻斷式
      // 對話框說明，把「是否重收」的決定交回櫃台。
      if (status === 409) {
        await Promise.allSettled([refreshRecentTransactions(), runSearch()])
        ElMessageBox.alert(
          `${detailMsg}\n\n前一筆交易已成功入帳，本次未再產生新收據。請先在下方「今日交易」列表確認該筆收據後，再決定是否需要重收。`,
          '前一筆已入帳，請勿重複收款',
          { type: 'warning', confirmButtonText: '我知道了，先去確認交易列表' }
        ).catch(() => {})
      } else if (status === 400 && /日結簽核/.test(detailMsg)) {
        // 400 且 detail 包含「日結」→ 用 alert 對話框顯示更清楚的指引
        ElMessageBox.alert(
          `${detailMsg}\n\n若確認要補這筆交易，請到「POS 日結簽核」解鎖該日，再重新結帳。`,
          '該日已日結，無法新增交易',
          { type: 'warning', confirmButtonText: '了解' }
        ).catch(() => {})
      } else {
        ElMessage.error(detailMsg)
      }
    } finally {
      submitting.value = false
    }
  }

  /**
   * 列印收據 PDF。
   * @param options.reprint 是否標記為補印。結帳當下的首印傳 false（正本）；
   *   從交易列表或收據 dialog 再印一次維持預設 true（2026-08-14 bug hunt）。
   */
  async function printReceipt(options: { reprint?: boolean } = {}) {
    const { reprint = true } = options
    const receiptNo = lastReceipt.value?.receipt_no
    if (!receiptNo) {
      ElMessage.warning('找不到收據編號，無法列印')
      return
    }
    await openPdfInNewTab({
      fetchBlob: async () => {
        const res = await getPOSReceiptPdf(receiptNo as string, { reprint })
        return res.data
      },
      loadingText: '收據載入中…',
      // 該端點是 responseType:'blob'，錯誤時 response.data 是 Blob，直接讀 err.message
      // 只會拿到「Request failed with status code 400」；真正的原因（例如「該收據已作廢」）
      // 要先把 Blob 讀成 JSON 才拿得到（2026-08-15 code review P3-15）。
      onError: async (err: unknown) => {
        ElMessage.error(await readBlobErrorDetail(err, '收據 PDF 載入失敗'))
      },
    })
  }

  // 重印防抖：避免連點兩次送兩次列印
  let reprinting = false

  /** 從歷史交易重印收據（重新指定 lastReceipt 並觸發列印） */
  async function reprintTransaction(tx: Record<string, unknown>) {
    if (!tx || reprinting) return
    reprinting = true
    lastReceipt.value = {
      receipt_no: tx.receipt_no,
      type: tx.type,
      total: tx.total,
      tendered: tx.tendered,
      change: tx.change,
      payment_method: tx.payment_method,
      payment_date: tx.payment_date,
      operator: tx.operator,
      notes: tx.notes,
      created_at: tx.created_at,
      items: tx.items,
      items_with_student: tx.items,
      is_reprint: true,
    }
    receiptDialogVisible.value = true
    await nextTick()
    try {
      printReceipt({ reprint: true })
    } finally {
      // 略等一小段時間再解鎖，避免印表機尚未結束就被觸發第二次
      setTimeout(() => {
        reprinting = false
      }, 1500)
    }
  }

  // ── 日結 ──────────────────────────────────────────────────────
  async function refreshDailySummary() {
    dailySummary.loading = true
    try {
      const res = await getPOSDailySummary()
      dailySummary.data = res.data
      dailySummary.error = false
    } catch {
      // fail-visible（P3-05）：不可靜默。留著上一次的數字＝顯示「不含剛收那筆」的
      // 舊金額，櫃台照著點鈔會少算；顯示 NT$0 又分不清「沒資料」與「今天真的是零」。
      // 清值 + 立旗標，由 POSDailySummaryBar 顯示「—」與重試。
      dailySummary.data = null
      dailySummary.error = true
    } finally {
      dailySummary.loading = false
    }
  }

  // ── 今日交易明細 ─────────────────────────────────────────────
  async function refreshRecentTransactions() {
    recentTransactions.loading = true
    try {
      const res = await getPOSRecentTransactions({ limit: RECENT_TRANSACTIONS_LIMIT })
      const items = res.data?.transactions || []
      recentTransactions.items = items
      // total 缺漏（舊版後端）時退回顯示筆數，至少不會顯示成 0 張
      recentTransactions.total = res.data?.total ?? items.length
      recentTransactions.truncated = res.data?.truncated ?? false
      recentTransactions.error = false
    } catch {
      // fail-visible（P3-05）：清單保留（既有收據仍需可重印），但立錯誤旗標讓 UI
      // 明講「這份清單可能不是最新」，避免櫃台在 409 提示後看不到新交易卻以為沒收到。
      recentTransactions.error = true
    } finally {
      recentTransactions.loading = false
    }
  }

  // ── 清理 ──────────────────────────────────────────────────────
  onScopeDispose(() => {
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
    // 讓 inflight seq 過期，結果不會再覆蓋
    searchSeq = Number.MAX_SAFE_INTEGER
    invalidateRefundSuggestion()
  })

  return {
    // 模式 / 搜尋
    mode,
    searchQuery,
    classroomFilter,
    overdueOnly,
    searching,
    searchGroups,
    searchRegistrations,
    searchError,
    searchTruncation,
    triggerSearch,
    runSearch,
    switchMode,
    // 交易類型
    checkoutType,
    isRefundMode,
    refundSuggestionLoading,
    // 單筆選取
    selectedItem,
    itemTotal,
    selectItem,
    clearSelection,
    updateSelectedAmount,
    resetTransactionInputs,
    reset,
    // 收款
    paymentMethod,
    notes,
    canSubmit,
    refundApprovalBlocked,
    submitting,
    submit,
    // 收據
    lastReceipt,
    receiptDialogVisible,
    printReceipt,
    reprintTransaction,
    // 日結與歷史
    dailySummary,
    refreshDailySummary,
    recentTransactions,
    refreshRecentTransactions,
  }
}
