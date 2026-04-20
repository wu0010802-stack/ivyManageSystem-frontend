import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSRecentTransactions,
  getRegistrations,
  posCheckout,
} from '@/api/activity'
import {
  CASH_METHOD,
  LARGE_AMOUNT_THRESHOLD,
  POS_PAYMENT_METHODS,
  computeOwed,
  formatTWD,
} from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

/**
 * POS 收銀狀態機：搜尋 → 選擇單筆 → 送出（可選列印） → 重置。
 * 單筆模式：同時間只允許選取一筆報名，點選第二筆會直接取代前一筆。
 * 一次繳清定位：不處理實收/找零，只記錄「收款金額」。
 * 有意不放 Pinia store：POS 狀態頁面級且短暫，不跨路由共享。
 *
 * 安全保護：
 * - 每次送出產生新的 idempotency_key，避免網路重送造成重複結帳
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
  const searchGroups = ref([])
  const searchRegistrations = ref([])
  let searchSeq = 0
  let searchTimer = null

  // ── 單筆選取（取代購物車） ───────────────────────────────────────
  // null = 尚未選取；物件結構同以往 cart 行項目
  const selectedItem = ref(null)

  // ── 交易類型（繳費 or 退費） ─────────────────────────────────────
  const checkoutType = ref('payment') // 'payment' | 'refund'
  const isRefundMode = computed(() => checkoutType.value === 'refund')

  // ── 收款 ────────────────────────────────────────────────────────
  const paymentMethod = ref(CASH_METHOD)
  const notes = ref('')
  const submitting = ref(false)

  // ── 冪等 key（送出當下產生，成功後清除） ────────────────────────
  let pendingIdempotencyKey = null

  // ── 最後收據與日結 ─────────────────────────────────────────────
  const lastReceipt = ref(null)
  const receiptDialogVisible = ref(false)

  const dailySummary = reactive({
    data: null,
    loading: false,
  })

  // ── 今日交易明細（可重印） ─────────────────────────────────────
  const recentTransactions = reactive({
    items: [],
    loading: false,
  })

  // ── 計算屬性 ──────────────────────────────────────────────────
  const itemTotal = computed(() =>
    selectedItem.value ? Number(selectedItem.value.amount_applied) || 0 : 0
  )

  const canSubmit = computed(() => {
    if (submitting.value) return false
    const item = selectedItem.value
    if (!item) return false
    const applied = Number(item.amount_applied) || 0
    if (applied <= 0) return false
    // 退費模式：金額不得超過已繳
    if (isRefundMode.value && applied > (item.paid_amount || 0)) return false
    return true
  })

  const paymentMethodOptions = POS_PAYMENT_METHODS

  // 切換繳費 / 退費時：清空選取（兩模式邏輯不同，避免混淆）
  watch(checkoutType, (next, prev) => {
    if (next === prev) return
    selectedItem.value = null
    notes.value = ''
    // 搜尋結果也重新拉（退費模式要看已繳金額 > 0 的）
    if (searchQuery.value) runSearch()
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
    const q = (searchQuery.value || '').trim()
    const classroom = (classroomFilter.value || '').trim()
    const seq = ++searchSeq
    searching.value = true
    try {
      if (mode.value === 'by-student') {
        const opts = {
          filter: isRefundMode.value ? 'refundable' : 'outstanding',
          school_year: termStore.school_year,
          semester: termStore.semester,
        }
        if (classroom) opts.classroom = classroom
        if (overdueOnly.value && !isRefundMode.value) opts.overdue_only = true
        const res = await getPOSOutstandingByStudent(q, 100, opts)
        if (seq !== searchSeq) return
        searchGroups.value = res.data?.groups || []
      } else {
        const statuses = isRefundMode.value
          ? ['paid', 'partial', 'overpaid']
          : ['partial', 'unpaid']
        const baseParams = {
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
        const items = results.flatMap((r) => r.data?.items || [])
        const seen = new Set()
        const merged = []
        for (const item of items) {
          if (seen.has(item.id)) continue
          seen.add(item.id)
          // 過濾空報名（無 enrolled 課程且無用品），避免後端 unpaid=paid_amount==0 漏擋
          const total = Number(item.total_amount || 0)
          if (total <= 0) continue
          merged.push(item)
        }
        merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        searchRegistrations.value = merged
      }
    } catch (e) {
      if (seq === searchSeq) {
        ElMessage.error(e?.response?.data?.detail || '搜尋失敗')
      }
    } finally {
      if (seq === searchSeq) searching.value = false
    }
  }

  function switchMode(next) {
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
  function buildSelection(row, studentName) {
    const paid = Number(row.paid_amount || 0)
    const owed = Number(row.owed ?? computeOwed(row.total_amount, paid))
    // 繳費：預填欠費；退費：預填已繳金額
    const defaultAmount = isRefundMode.value ? paid : owed
    return {
      id: row.id,
      student_name: row.student_name || studentName || '',
      class_name: row.class_name || '',
      total_amount: row.total_amount || 0,
      paid_amount: paid,
      owed,
      amount_applied: defaultAmount,
      courses: row.courses || [],
      supplies: row.supplies || [],
    }
  }

  /** 點擊搜尋結果：同 id 再點 → 取消；不同 id → 取代 */
  function selectItem(row, studentName) {
    if (!row) return
    if (selectedItem.value && selectedItem.value.id === row.id) {
      selectedItem.value = null
      return
    }
    selectedItem.value = buildSelection(row, studentName)
  }

  function clearSelection() {
    selectedItem.value = null
  }

  function updateSelectedAmount(amount) {
    if (!selectedItem.value) return
    selectedItem.value = {
      ...selectedItem.value,
      amount_applied: Number(amount) || 0,
    }
  }

  function resetTransactionInputs() {
    selectedItem.value = null
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
  async function submit(options = {}) {
    const { print: shouldPrint = true, onSubmitted } = options
    if (!canSubmit.value) return
    const item = selectedItem.value
    if (!item) return

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
      const payload = {
        items: [
          {
            registration_id: item.id,
            amount: Number(item.amount_applied),
          },
        ],
        payment_method: paymentMethod.value,
        payment_date: taipeiTodayISO(),
        tendered: null,
        notes: (notes.value || '').trim(),
        type: checkoutType.value,
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
      const status = e?.response?.status
      if (status && status >= 400 && status < 500) {
        pendingIdempotencyKey = null
      }
      const detailMsg = e?.response?.data?.detail || '結帳失敗'
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

  function printReceipt() {
    window.print()
  }

  // 重印防抖：避免連點兩次送兩次列印
  let reprinting = false

  /** 從歷史交易重印收據（重新指定 lastReceipt 並觸發列印） */
  async function reprintTransaction(tx) {
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
    triggerSearch,
    runSearch,
    switchMode,
    // 交易類型
    checkoutType,
    isRefundMode,
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
    paymentMethodOptions,
    notes,
    canSubmit,
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
