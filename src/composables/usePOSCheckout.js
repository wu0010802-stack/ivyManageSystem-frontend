import { computed, nextTick, onScopeDispose, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import {
  getPOSDailySummary,
  getPOSOutstandingByStudent,
  getPOSRecentTransactions,
  getRegistrations,
  posCheckout,
} from '@/api/activity'
import { CASH_METHOD, LARGE_AMOUNT_THRESHOLD, POS_PAYMENT_METHODS, formatTWD } from '@/constants/pos'
import { useAcademicTermStore } from '@/stores/academicTerm'

/**
 * POS 收銀狀態機：搜尋 → 選擇 → 輸入實收 → 送出 → 列印 → 重置。
 * 有意不放 Pinia store：POS 狀態頁面級且短暫，不跨路由共享。
 *
 * 安全保護：
 * - 每次送出產生新的 idempotency_key，避免網路重送造成重複結帳
 * - payment_date 使用台北時區本地日期字串，避免跨日 UTC 誤差
 * - scope dispose 時清除 searchTimer
 * - 切換付款方式時清空 tenderedInput
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

  // ── 購物車 ──────────────────────────────────────────────────────
  const cart = ref([])

  // ── 交易類型（繳費 or 退費） ─────────────────────────────────────
  const checkoutType = ref('payment') // 'payment' | 'refund'
  const isRefundMode = computed(() => checkoutType.value === 'refund')

  // ── 收款 ────────────────────────────────────────────────────────
  const paymentMethod = ref(CASH_METHOD)
  const tenderedInput = ref(null)
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
  const cartTotal = computed(() =>
    cart.value.reduce((sum, row) => sum + (Number(row.amount_applied) || 0), 0)
  )

  const isCash = computed(() => paymentMethod.value === CASH_METHOD)

  const change = computed(() => {
    if (!isCash.value || tenderedInput.value == null) return null
    const diff = Number(tenderedInput.value) - cartTotal.value
    return diff >= 0 ? diff : null
  })

  const canSubmit = computed(() => {
    if (submitting.value) return false
    if (cart.value.length === 0) return false
    if (cartTotal.value <= 0) return false
    if (cart.value.some((row) => !(Number(row.amount_applied) > 0))) return false
    // 退費模式：每筆金額不得超過已繳
    if (isRefundMode.value) {
      if (cart.value.some((row) => Number(row.amount_applied) > (row.paid_amount || 0))) {
        return false
      }
    } else if (isCash.value) {
      // 收款模式 + 現金：必須輸入足夠實收
      if (tenderedInput.value == null) return false
      if (Number(tenderedInput.value) < cartTotal.value) return false
    }
    return true
  })

  const paymentMethodOptions = POS_PAYMENT_METHODS

  // 切換付款方式（非現金）時清空實收欄位，避免殘值誤導
  watch(paymentMethod, (next, prev) => {
    if (next === prev) return
    if (next !== CASH_METHOD) {
      tenderedInput.value = null
    }
  })

  // 切換繳費 / 退費時：清空購物車（兩模式邏輯不同，避免混淆）
  watch(checkoutType, (next, prev) => {
    if (next === prev) return
    cart.value = []
    tenderedInput.value = null
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
          limit: 50,
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

  // ── 購物車 ────────────────────────────────────────────────────
  function addToCart(row) {
    const id = row.id
    if (cart.value.some((r) => r.id === id)) return
    const paid = Number(row.paid_amount || 0)
    const owed = Number(
      row.owed ?? Math.max(0, (row.total_amount || 0) - paid)
    )
    // 繳費：預填欠費；退費：預填已繳金額
    const defaultAmount = isRefundMode.value ? paid : owed
    cart.value.push({
      id,
      student_name: row.student_name || row._student_name || '',
      class_name: row.class_name || '',
      total_amount: row.total_amount || 0,
      paid_amount: paid,
      owed,
      amount_applied: defaultAmount,
      courses: row.courses || [],
      supplies: row.supplies || [],
    })
  }

  function removeFromCart(id) {
    cart.value = cart.value.filter((r) => r.id !== id)
  }

  function toggleCart(row, studentName) {
    const exists = cart.value.find((r) => r.id === row.id)
    if (exists) {
      removeFromCart(row.id)
    } else {
      addToCart({ ...row, _student_name: studentName })
    }
  }

  function resetCart() {
    cart.value = []
    tenderedInput.value = null
    notes.value = ''
  }

  function reset() {
    resetCart()
    searchQuery.value = ''
    searchGroups.value = []
    searchRegistrations.value = []
    paymentMethod.value = CASH_METHOD
  }

  // ── 送出 ──────────────────────────────────────────────────────
  async function submit(onSubmitted) {
    if (!canSubmit.value) return

    // 大額交易（>= LARGE_AMOUNT_THRESHOLD）二次確認
    if (cartTotal.value >= LARGE_AMOUNT_THRESHOLD) {
      const typeLabel = isRefundMode.value ? '退費' : '收款'
      try {
        await ElMessageBox.confirm(
          `本次${typeLabel}金額為 ${formatTWD(cartTotal.value)}，請確認金額無誤後繼續。`,
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
        items: cart.value.map((r) => ({
          registration_id: r.id,
          amount: Number(r.amount_applied),
        })),
        payment_method: paymentMethod.value,
        payment_date: taipeiTodayISO(),
        tendered: (!isRefundMode.value && isCash.value) ? Number(tenderedInput.value) : null,
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
      receiptDialogVisible.value = true

      if (receipt.idempotent_replay) {
        ElMessage.info(`偵測到重試，顯示先前收據：${receipt.receipt_no}`)
      } else {
        const doneLabel = receipt.type === 'refund' ? '退費成功' : '結帳成功'
        ElMessage.success(`${doneLabel}：${receipt.receipt_no}`)
      }

      // 送出成功後才釋放 key，重試時會復用
      pendingIdempotencyKey = null

      await nextTick()
      printReceipt()
      resetCart()
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
      ElMessage.error(e?.response?.data?.detail || '結帳失敗')
    } finally {
      submitting.value = false
    }
  }

  function printReceipt() {
    window.print()
  }

  /** 從歷史交易重印收據（重新指定 lastReceipt 並觸發列印） */
  async function reprintTransaction(tx) {
    if (!tx) return
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
    printReceipt()
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
    // 購物車
    cart,
    cartTotal,
    addToCart,
    removeFromCart,
    toggleCart,
    resetCart,
    reset,
    // 收款
    paymentMethod,
    paymentMethodOptions,
    isCash,
    tenderedInput,
    notes,
    change,
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
