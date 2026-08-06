import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  matchRegistration,
  rejectRegistration,
  rematchRegistration,
  rematchAllPendingRegistrations,
  forceAcceptRegistration,
  restoreRegistration,
  searchActivityStudents,
  fetchMatchSuggestions,
} from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'
import { FIELD_RULES, forceRefundReasonPromptOptions } from '@/constants/activity'

/**
 * 才藝報名「審核工作流」集中邏輯：單列動作（手動匹配 / 重新比對 / 強行收件 / 拒絕 / 復原）、
 * 批量動作（重新比對 / 強行收件 / 拒絕 / 復原）、逐筆審核精靈。
 * 主頁建立單一實例，dialog / wizard 元件以 props 綁定此處的 reactive 狀態與函式（純呈現）。
 * 後端無批量端點 → 批量以 Promise.allSettled 逐筆並發彙總（沿用待審核頁範式）。
 */

export interface ReviewRow {
  id: number
  student_name?: string
  birthday?: string
  parent_phone?: string
  class_name?: string
  match_status?: string
  paid_amount?: number
}

export interface StudentCandidate {
  id: number
  student_id?: string
  name?: string
  birthday?: string
  classroom_name?: string
  parent_phone?: string
  /** 僅系統建議候選帶：姓名字元相似度（0~1），供人工判斷，不是比對結論 */
  similarity?: number
  /** 僅系統建議候選帶：是否與家長填寫的班級相同 */
  same_class?: boolean
}

interface SearchTarget {
  candidates: StudentCandidate[]
  loading: boolean
}

interface SuggestionTarget {
  suggestions: StudentCandidate[]
  suggestionsLoading: boolean
}

function errDetail(err: unknown): string | undefined {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
}

export function useActivityReview(opts: { onChanged: () => void | Promise<void>; clearSelection: () => void }) {
  const batchProcessing = ref(false)
  const rematchAllLoading = ref(false)

  // ── 手動匹配 dialog ────────────────────────────────────────────
  const matchDialog = reactive<{
    visible: boolean
    row: ReviewRow | null
    searchQuery: string
    candidates: StudentCandidate[]
    selected: StudentCandidate | null
    loading: boolean
    suggestions: StudentCandidate[]
    suggestionsLoading: boolean
  }>({
    visible: false, row: null, searchQuery: '', candidates: [], selected: null, loading: false,
    suggestions: [], suggestionsLoading: false,
  })

  // ── 重新比對 / 強行收件 共用 dialog ────────────────────────────
  const editDialog = reactive<{
    visible: boolean
    action: 'rematch' | 'force'
    row: ReviewRow | null
    submitting: boolean
    form: { name: string; birthday: string; parent_phone: string; class_name: string }
  }>({
    visible: false, action: 'rematch', row: null, submitting: false,
    form: { name: '', birthday: '', parent_phone: '', class_name: '' },
  })

  // ── 逐筆審核精靈 ────────────────────────────────────────────────
  const wizard = reactive<{
    visible: boolean
    queue: ReviewRow[]
    index: number
    searchQuery: string
    candidates: StudentCandidate[]
    selected: StudentCandidate | null
    loading: boolean
    submitting: boolean
    suggestions: StudentCandidate[]
    suggestionsLoading: boolean
    done: { matched: number; forced: number; rejected: number; skipped: number }
  }>({
    visible: false, queue: [], index: 0, searchQuery: '', candidates: [], selected: null,
    loading: false, submitting: false, suggestions: [], suggestionsLoading: false,
    done: { matched: 0, forced: 0, rejected: 0, skipped: 0 },
  })
  const wizardCurrent = computed<ReviewRow | null>(() => wizard.queue[wizard.index] ?? null)

  // ── 學生搜尋（match dialog 與 wizard 共用；seq 守衛防亂序覆蓋）──
  let searchSeq = 0
  async function searchInto(query: string, target: SearchTarget) {
    const seq = ++searchSeq
    const q = (query || '').trim()
    if (!q) { target.candidates = []; return }
    target.loading = true
    try {
      const res = await searchActivityStudents(q, 20)
      if (seq !== searchSeq) return
      target.candidates = (res.data as { items?: StudentCandidate[] })?.items || []
    } catch (err) {
      if (seq !== searchSeq) return
      ElMessage.error(errDetail(err) || '搜尋學生失敗')
    } finally {
      if (seq === searchSeq) target.loading = false
    }
  }

  let matchTimer: ReturnType<typeof setTimeout> | null = null
  function runMatchSearch() { searchInto(matchDialog.searchQuery, matchDialog) }
  function debouncedMatchSearch() {
    if (matchTimer) clearTimeout(matchTimer)
    matchTimer = setTimeout(runMatchSearch, 250)
  }

  let wizardTimer: ReturnType<typeof setTimeout> | null = null
  function runWizardSearch() { searchInto(wizard.searchQuery, wizard) }
  function debouncedWizardSearch() {
    if (wizardTimer) clearTimeout(wizardTimer)
    wizardTimer = setTimeout(runWizardSearch, 250)
  }

  // ── 系統建議候選（相似姓名）──────────────────────────────────
  // 搜尋框走 ilike 子字串比對，找不到「薛旆青 vs 薛斾青」這種字元差異——那正是
  // 配不上的主因。建議清單改以姓名相似度撈候選，讓承辦不必在名冊裡大海撈針。
  let suggestSeq = 0
  async function loadSuggestions(row: ReviewRow, target: SuggestionTarget) {
    const seq = ++suggestSeq
    target.suggestions = []
    target.suggestionsLoading = true
    try {
      const res = await fetchMatchSuggestions(row.id)
      if (seq !== suggestSeq) return
      target.suggestions = (res.data as { items?: StudentCandidate[] })?.items || []
    } catch {
      // 建議只是輔助，失敗不打斷手動匹配流程（承辦仍可用搜尋框）。
      if (seq === suggestSeq) target.suggestions = []
    } finally {
      if (seq === suggestSeq) target.suggestionsLoading = false
    }
  }

  // ── 單列：手動匹配 ─────────────────────────────────────────────
  function openMatchDialog(row: ReviewRow) {
    matchDialog.row = row
    matchDialog.searchQuery = row.student_name || ''
    matchDialog.candidates = []
    matchDialog.selected = null
    matchDialog.loading = false
    matchDialog.visible = true
    searchSeq++ // 使前一次在途搜尋失效，避免污染本次候選
    if (matchDialog.searchQuery) runMatchSearch()
    loadSuggestions(row, matchDialog)
  }
  async function confirmMatch() {
    if (!matchDialog.row || !matchDialog.selected) return
    try {
      await matchRegistration(matchDialog.row.id, matchDialog.selected.id)
      ElMessage.success('已完成手動匹配')
      matchDialog.visible = false
      opts.onChanged()
    } catch (err) {
      ElMessage.error(errDetail(err) || '匹配失敗')
    }
  }

  // ── 單列：重新比對 / 強行收件 ──────────────────────────────────
  function openEditDialog(row: ReviewRow, action: 'rematch' | 'force') {
    editDialog.action = action
    editDialog.row = row
    editDialog.form.name = row.student_name || ''
    editDialog.form.birthday = row.birthday || ''
    editDialog.form.parent_phone = row.parent_phone || ''
    editDialog.form.class_name = row.class_name || ''
    editDialog.visible = true
  }
  const openRematchDialog = (row: ReviewRow) => openEditDialog(row, 'rematch')
  const openForceDialog = (row: ReviewRow) => openEditDialog(row, 'force')

  function buildEditPayload(row: ReviewRow): Schema<'RegistrationRematchRequest'> {
    const payload: Schema<'RegistrationRematchRequest'> = {}
    const name = editDialog.form.name?.trim()
    const birthday = editDialog.form.birthday || ''
    const phone = editDialog.form.parent_phone?.trim()
    const className = editDialog.form.class_name?.trim()
    if (name && name !== row.student_name) payload.name = name
    if (birthday && birthday !== row.birthday) payload.birthday = birthday
    if (phone && phone !== row.parent_phone) payload.parent_phone = phone
    // 班級是比對鍵的另一半（2026-08-03 生日退出後更是佔一半權重），家長選錯班是
    // 未配對的主因之一。後端 rematch 一直支援改班級，只是這裡以前沒給欄位。
    if (className && className !== row.class_name) payload.class = className
    return payload
  }

  async function confirmEdit() {
    if (!editDialog.row) return
    const row = editDialog.row
    const payload = buildEditPayload(row)
    editDialog.submitting = true
    try {
      if (editDialog.action === 'force') {
        const res = await forceAcceptRegistration(row.id, payload)
        ElMessage.success(
          (res.data as { field_changed?: boolean })?.field_changed
            ? '已強行收件並保留修改後的資料'
            : '已強行收件（標記：forced）',
        )
      } else {
        const res = await rematchRegistration(row.id, payload)
        const data = res.data as { matched?: boolean; field_changed?: boolean }
        if (data.matched) ElMessage.success('重新比對成功，已自動綁定在校生')
        else if (data.field_changed) ElMessage.warning('仍無符合的在校生，但已保留修改後的資料')
        else ElMessage.warning('仍無符合的在校生，請考慮手動匹配或強行收件')
      }
      editDialog.visible = false
      opts.onChanged()
    } catch (err) {
      ElMessage.error(errDetail(err) || '操作失敗')
    } finally {
      editDialog.submitting = false
    }
  }

  // ── 單列：拒絕 / 復原 ──────────────────────────────────────────
  async function handleReject(row: ReviewRow) {
    let reason = ''
    try {
      const result = (await ElMessageBox.prompt(
        `確認將「${row.student_name}」視為資料不符拒絕？（原因將寫入 audit log）`,
        '拒絕報名',
        {
          inputPlaceholder: '必填：拒絕原因（至少 2 字）',
          confirmButtonText: '確認拒絕',
          cancelButtonText: '取消',
          type: 'warning',
          inputValidator: (val: string) => {
            const t = (val || '').trim()
            if (t.length < 2) return '請填寫拒絕原因（至少 2 字）'
            if (t.length > 200) return '不得超過 200 字'
            return true
          },
        },
      )) as { value: string }
      reason = result.value.trim()
    } catch {
      return
    }
    await doReject(row, reason, false)
  }

  // 拒絕送出（2026-07-31 拒絕擴大涵蓋：後台唯一移除入口）。
  // 409 且訊息含「繳費金額」＝該報名已有已繳款，需二次確認以 force_refund 自動
  // 沖帳（後端強制 refund_reason ≥15 字，走與原刪除流程相同的退費簽核閘）。
  async function doReject(row: ReviewRow, reason: string, forceRefund: boolean, refundReason?: string) {
    try {
      await rejectRegistration(row.id, reason, { forceRefund, refundReason })
      ElMessage.success(
        forceRefund
          ? '已拒絕該筆報名並自動寫退費沖帳（篩選「已拒絕」可見，需要時可復原）'
          : '已拒絕該筆報名（篩選「已拒絕」可見，需要時可復原）',
      )
      opts.onChanged()
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status
      const detailMsg = errDetail(err)
      if (status === 409 && !forceRefund && (detailMsg || '').includes('繳費金額')) {
        let reasonResult: { value: string }
        try {
          reasonResult = (await ElMessageBox.prompt(
            `${detailMsg}\n\n按「確認拒絕並沖帳」後會自動寫退費沖帳紀錄（付款方式：系統補齊），原繳費歷史保留。` +
              `\n\n請輸入沖帳原因（至少 ${FIELD_RULES.refundReasonMin} 字，會寫入退費紀錄供稽核）：`,
            '需要確認自動沖帳',
            forceRefundReasonPromptOptions('確認拒絕並沖帳'),
          )) as { value: string }
        } catch {
          return
        }
        await doReject(row, reason, true, (reasonResult.value || '').trim())
        return
      }
      ElMessage.error(detailMsg || '拒絕失敗')
    }
  }

  async function handleRestore(row: ReviewRow) {
    try {
      await ElMessageBox.confirm(`確認將「${row.student_name}」復原至待審核？`, '復原報名', {
        confirmButtonText: '確認復原', cancelButtonText: '取消', type: 'info',
      })
    } catch {
      return
    }
    try {
      await restoreRegistration(row.id)
      ElMessage.success('已復原至待審核')
      opts.onChanged()
    } catch (err) {
      ElMessage.error(errDetail(err) || '復原失敗')
    }
  }

  // ── 工具列：一鍵重新比對全部待審核（2026-07-23）─────────────────
  // 取代原本「重新比對」單列動作：頁面工具列的按鈕不需勾選，直接對後端目前
  // 學期全部待審核報名批次重新比對（後端 POST /registrations/rematch-batch）。
  async function handleRematchAllPending(params?: { school_year?: number; semester?: number }) {
    try {
      await ElMessageBox.confirm(
        '將對目前學期所有「待審核」報名重新執行自動比對（姓名 + 生日 + 班級）。比對成功者自動綁定在校生，其餘維持待審核。',
        '重新比對',
        { confirmButtonText: '確定重新比對', cancelButtonText: '取消', type: 'info' },
      )
    } catch {
      return
    }
    rematchAllLoading.value = true
    try {
      const res = await rematchAllPendingRegistrations(params)
      const data = res.data as { message?: string; failed?: unknown[] }
      const msg = data.message || '重新比對完成'
      ;(data.failed?.length ?? 0) > 0 ? ElMessage.warning(msg) : ElMessage.success(msg)
      await opts.onChanged()
    } catch (err) {
      ElMessage.error(errDetail(err) || '重新比對失敗')
    } finally {
      rematchAllLoading.value = false
    }
  }

  // ── 批量 ───────────────────────────────────────────────────────
  async function runBatch(rows: ReviewRow[], fn: (row: ReviewRow) => Promise<unknown>): Promise<{ ok: number; fail: number }> {
    const results = await Promise.allSettled(rows.map((r) => fn(r)))
    let ok = 0
    let fail = 0
    for (const res of results) res.status === 'fulfilled' ? (ok += 1) : (fail += 1)
    return { ok, fail }
  }

  async function handleBatchRematch(rows: ReviewRow[]) {
    if (rows.length === 0) return
    try {
      await ElMessageBox.confirm(
        `將對已選 ${rows.length} 筆待審核報名重新執行自動比對（姓名 + 生日 + 家長手機）。比對成功者自動綁定在校生，其餘維持待審核。`,
        '批量重新比對',
        { confirmButtonText: '確定重新比對', cancelButtonText: '取消', type: 'info' },
      )
    } catch {
      return
    }
    batchProcessing.value = true
    try {
      const results = await Promise.allSettled(rows.map((r) => rematchRegistration(r.id)))
      let matched = 0
      let still = 0
      let fail = 0
      for (const res of results) {
        if (res.status === 'fulfilled') {
          ;(res.value.data as { matched?: boolean })?.matched ? (matched += 1) : (still += 1)
        } else fail += 1
      }
      const msg = `重新比對完成：自動綁定 ${matched} 筆、仍待審核 ${still} 筆` + (fail ? `、失敗 ${fail} 筆` : '')
      fail ? ElMessage.warning(msg) : ElMessage.success(msg)
      opts.clearSelection()
      // P3-1：await refetch 完成後才於 finally 解除 loading 態，避免短暫窗口內
      // 按鈕可再次點擊、表格仍是舊資料。
      await opts.onChanged()
    } finally {
      batchProcessing.value = false
    }
  }

  async function handleBatchForceAccept(rows: ReviewRow[]) {
    if (rows.length === 0) return
    try {
      await ElMessageBox.confirm(
        `將把已選 ${rows.length} 筆待審核報名「強行收件」（跳過比對、標記 forced，視為校外生直接收進正式報名）。`,
        '批量強行收件',
        { confirmButtonText: '確定強行收件', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
    batchProcessing.value = true
    try {
      const { ok, fail } = await runBatch(rows, (row) => forceAcceptRegistration(row.id))
      fail === 0 ? ElMessage.success(`已強行收件 ${ok} 筆`) : ElMessage.warning(`強行收件完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
      opts.clearSelection()
      // P3-1：await refetch 完成後才於 finally 解除 loading 態，避免短暫窗口內
      // 按鈕可再次點擊、表格仍是舊資料。
      await opts.onChanged()
    } finally {
      batchProcessing.value = false
    }
  }

  async function handleBatchReject(rows: ReviewRow[]) {
    if (rows.length === 0) return
    let reason = ''
    try {
      const result = (await ElMessageBox.prompt(
        `將對已選 ${rows.length} 筆「待審核」報名套用同一拒絕原因（原因將寫入 audit log）。已有繳費的報名會被後端擋下並計入失敗。`,
        '批量拒絕',
        {
          inputPlaceholder: '必填：共用拒絕原因（至少 2 字）',
          confirmButtonText: '確認批次拒絕',
          cancelButtonText: '取消',
          type: 'warning',
          inputValidator: (val: string) => {
            const t = (val || '').trim()
            if (t.length < 2) return '請填寫拒絕原因（至少 2 字）'
            if (t.length > 200) return '不得超過 200 字'
            return true
          },
        },
      )) as { value: string }
      reason = result.value.trim()
    } catch {
      return
    }
    batchProcessing.value = true
    try {
      const { ok, fail } = await runBatch(rows, (row) => rejectRegistration(row.id, reason))
      fail === 0 ? ElMessage.success(`已批次拒絕 ${ok} 筆`) : ElMessage.warning(`批次拒絕完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
      opts.clearSelection()
      // P3-1：await refetch 完成後才於 finally 解除 loading 態，避免短暫窗口內
      // 按鈕可再次點擊、表格仍是舊資料。
      await opts.onChanged()
    } finally {
      batchProcessing.value = false
    }
  }

  async function handleBatchRestore(rows: ReviewRow[]) {
    if (rows.length === 0) return
    try {
      await ElMessageBox.confirm(`確認將已選 ${rows.length} 筆「已拒絕」報名批次復原至待審核？`, '批量復原', {
        confirmButtonText: '確認批次復原', cancelButtonText: '取消', type: 'info',
      })
    } catch {
      return
    }
    batchProcessing.value = true
    try {
      const { ok, fail } = await runBatch(rows, (row) => restoreRegistration(row.id))
      fail === 0 ? ElMessage.success(`已批次復原 ${ok} 筆`) : ElMessage.warning(`批次復原完成：成功 ${ok} 筆、失敗 ${fail} 筆`)
      opts.clearSelection()
      // P3-1：await refetch 完成後才於 finally 解除 loading 態，避免短暫窗口內
      // 按鈕可再次點擊、表格仍是舊資料。
      await opts.onChanged()
    } finally {
      batchProcessing.value = false
    }
  }

  // ── 逐筆審核精靈 ────────────────────────────────────────────────
  function openWizard(rows: ReviewRow[]) {
    if (rows.length === 0) return
    wizard.queue = [...rows]
    wizard.index = 0
    wizard.done = { matched: 0, forced: 0, rejected: 0, skipped: 0 }
    wizard.visible = true
    loadWizardRow()
  }
  function loadWizardRow() {
    const row = wizardCurrent.value
    wizard.selected = null
    wizard.candidates = []
    wizard.suggestions = []
    wizard.searchQuery = row?.student_name || ''
    searchSeq++ // 失效前一筆在途搜尋
    if (wizard.searchQuery) runWizardSearch()
    if (row) loadSuggestions(row, wizard)
  }
  function advanceWizard() {
    if (wizard.index < wizard.queue.length - 1) {
      wizard.index += 1
      loadWizardRow()
    } else {
      // 到底 → 關閉 dialog；結算與刷新統一交給 dialog @close → finishWizard（避免重複）。
      wizard.visible = false
    }
  }
  function prevWizard() {
    if (wizard.submitting) return
    if (wizard.index > 0) {
      wizard.index -= 1
      loadWizardRow()
    }
  }
  // 綁定 el-dialog @close：不論按「結束」、關閉鈕或到底自動關，皆在此結算一次。
  function finishWizard() {
    const d = wizard.done
    ElMessage.success(`逐筆審核結束：匹配 ${d.matched} · 強收 ${d.forced} · 拒絕 ${d.rejected} · 略過 ${d.skipped}`)
    opts.clearSelection()
    opts.onChanged()
  }
  async function wizardMatch() {
    if (wizard.submitting) return
    const row = wizardCurrent.value
    if (!row || !wizard.selected) return
    wizard.submitting = true
    try {
      await matchRegistration(row.id, wizard.selected.id)
      wizard.done.matched += 1
      advanceWizard()
    } catch (err) {
      ElMessage.error(errDetail(err) || '匹配失敗，可略過此筆')
    } finally {
      wizard.submitting = false
    }
  }
  async function wizardForce() {
    if (wizard.submitting) return
    const row = wizardCurrent.value
    if (!row) return
    wizard.submitting = true
    try {
      await forceAcceptRegistration(row.id)
      wizard.done.forced += 1
      advanceWizard()
    } catch (err) {
      ElMessage.error(errDetail(err) || '強行收件失敗，可略過此筆')
    } finally {
      wizard.submitting = false
    }
  }
  async function wizardReject() {
    if (wizard.submitting) return
    const row = wizardCurrent.value
    if (!row) return
    let reason = ''
    try {
      const result = (await ElMessageBox.prompt('請填寫拒絕原因（至少 2 字）', '拒絕此筆', {
        confirmButtonText: '確認拒絕', cancelButtonText: '取消', type: 'warning',
        inputValidator: (val: string) => {
          const t = (val || '').trim()
          if (t.length < 2) return '請填寫拒絕原因（至少 2 字）'
          if (t.length > 200) return '不得超過 200 字'
          return true
        },
      })) as { value: string }
      reason = result.value.trim()
    } catch {
      return
    }
    wizard.submitting = true
    try {
      await rejectRegistration(row.id, reason)
      wizard.done.rejected += 1
      advanceWizard()
    } catch (err) {
      ElMessage.error(errDetail(err) || '拒絕失敗，可略過此筆')
    } finally {
      wizard.submitting = false
    }
  }
  function wizardSkip() {
    if (wizard.submitting) return
    wizard.done.skipped += 1
    advanceWizard()
  }

  return {
    batchProcessing,
    rematchAllLoading,
    // 狀態
    matchDialog, editDialog, wizard, wizardCurrent,
    // 搜尋
    runMatchSearch, debouncedMatchSearch, runWizardSearch, debouncedWizardSearch,
    // 單列
    openMatchDialog, confirmMatch, openRematchDialog, openForceDialog, confirmEdit,
    handleReject, handleRestore,
    // 工具列：一鍵重新比對全部待審核
    handleRematchAllPending,
    // 批量
    handleBatchRematch, handleBatchForceAccept, handleBatchReject, handleBatchRestore,
    // 精靈
    openWizard, prevWizard, finishWizard, wizardMatch, wizardForce, wizardReject, wizardSkip,
  }
}
