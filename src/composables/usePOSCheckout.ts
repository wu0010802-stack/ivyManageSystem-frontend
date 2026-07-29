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
 * - payment_date 使用台北時區本地日期字串，避免跨日 UTC 誤差
 * - scope dispose 時清除 searchTimer
 */

/** 取得台北時區當日 ISO 日期字串（避免 new Date().toISOString() 跨日誤差） */
function taipeiTodayISO() {
  // sv-SE locale 輸出 YYYY-MM-DD，與 ISO 一致
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' })
}

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
  let pendingIdempotencyKey: string | null = null

  // ── 最後收據與日結 ─────────────────────────────────────────────
  const lastReceipt = ref<Record<string, unknown> | null>(null)
  const receiptDialogVisible = ref(false)

  const dailySummary = reactive({
    data: null as ApiResponse<'/activity/pos/daily-summary', 'get'> | null,
    loading: false,
  })

  // ── 今日交易明細（可重印） ─────────────────────────────────────
  const recentTransactions = reactive({
    items: [] as NonNullable<ApiResponse<'/activity/pos/recent-transactions', 'get'>['transactions']>,
    loading: false,
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
    } catch (e) {
      if (seq === searchSeq) {
        const err = e as { response?: { data?: { detail?: string } } }
        ElMessage.error(err?.response?.data?.detail || '搜尋失敗')
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
        return // 使用者取消
      }
    }

    submitting.value = true

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
        payment_date: taipeiTodayISO(),
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

      // 送出成功後才釋放 key，重試時會復用
      pendingIdempotencyKey = null

      if (shouldPrint) {
        receiptDialogVisible.value = true
        await nextTick()
        printReceipt()
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
      // 400 且 detail 包含「日結」→ 用 alert 對話框顯示更清楚的指引
      if (status === 400 && /日結簽核/.test(detailMsg)) {
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

  async function printReceipt() {
    const receiptNo = lastReceipt.value?.receipt_no
    if (!receiptNo) {
      ElMessage.warning('找不到收據編號，無法列印')
      return
    }
    await openPdfInNewTab({
      fetchBlob: async () => {
        const res = await getPOSReceiptPdf(receiptNo as string)
        return res.data
      },
      loadingText: '收據載入中…',
      onError: (err: unknown) => {
        ElMessage.error((err as { message?: string })?.message || '收據 PDF 載入失敗')
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
      printReceipt()
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
    } catch {
      // 日結非關鍵路徑，失敗靜默
    } finally {
      dailySummary.loading = false
    }
  }

  // ── 今日交易明細 ─────────────────────────────────────────────
  async function refreshRecentTransactions() {
    recentTransactions.loading = true
    try {
      const res = await getPOSRecentTransactions({ limit: 20 })
      recentTransactions.items = res.data?.transactions || []
    } catch {
      // 失敗靜默
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
