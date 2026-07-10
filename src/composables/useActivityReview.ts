import { ref, reactive, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  matchRegistration,
  rejectRegistration,
  rematchRegistration,
  forceAcceptRegistration,
  restoreRegistration,
  searchActivityStudents,
} from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'

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
}

interface SearchTarget {
  candidates: StudentCandidate[]
  loading: boolean
}

function errDetail(err: unknown): string | undefined {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
}

export function useActivityReview(opts: { onChanged: () => void | Promise<void>; clearSelection: () => void }) {
  const batchProcessing = ref(false)

  // ── 手動匹配 dialog ────────────────────────────────────────────
  const matchDialog = reactive<{
    visible: boolean
    row: ReviewRow | null
    searchQuery: string
    candidates: StudentCandidate[]
    selected: StudentCandidate | null
    loading: boolean
  }>({ visible: false, row: null, searchQuery: '', candidates: [], selected: null, loading: false })

  // ── 重新比對 / 強行收件 共用 dialog ────────────────────────────
  const editDialog = reactive<{
    visible: boolean
    action: 'rematch' | 'force'
    row: ReviewRow | null
    submitting: boolean
    form: { name: string; birthday: string; parent_phone: string }
  }>({ visible: false, action: 'rematch', row: null, submitting: false, form: { name: '', birthday: '', parent_phone: '' } })

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
    done: { matched: number; forced: number; rejected: number; skipped: number }
  }>({
    visible: false, queue: [], index: 0, searchQuery: '', candidates: [], selected: null,
    loading: false, submitting: false, done: { matched: 0, forced: 0, rejected: 0, skipped: 0 },
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
    editDialog.visible = true
  }
  const openRematchDialog = (row: ReviewRow) => openEditDialog(row, 'rematch')
  const openForceDialog = (row: ReviewRow) => openEditDialog(row, 'force')

  function buildEditPayload(row: ReviewRow): Schema<'RegistrationRematchRequest'> {
    const payload: Schema<'RegistrationRematchRequest'> = {}
    const name = editDialog.form.name?.trim()
    const birthday = editDialog.form.birthday || ''
    const phone = editDialog.form.parent_phone?.trim()
    if (name && name !== row.student_name) payload.name = name
    if (birthday && birthday !== row.birthday) payload.birthday = birthday
    if (phone && phone !== row.parent_phone) payload.parent_phone = phone
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
    try {
      await rejectRegistration(row.id, reason)
      ElMessage.success('已拒絕該筆報名（篩選「已拒絕」可見，需要時可復原）')
      opts.onChanged()
    } catch (err) {
      ElMessage.error(errDetail(err) || '拒絕失敗')
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
    wizard.searchQuery = row?.student_name || ''
    searchSeq++ // 失效前一筆在途搜尋
    if (wizard.searchQuery) runWizardSearch()
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
    wizard.done.skipped += 1
    advanceWizard()
  }

  return {
    batchProcessing,
    // 狀態
    matchDialog, editDialog, wizard, wizardCurrent,
    // 搜尋
    runMatchSearch, debouncedMatchSearch, runWizardSearch, debouncedWizardSearch,
    // 單列
    openMatchDialog, confirmMatch, openRematchDialog, openForceDialog, confirmEdit,
    handleReject, handleRestore,
    // 批量
    handleBatchRematch, handleBatchForceAccept, handleBatchReject, handleBatchRestore,
    // 精靈
    openWizard, prevWizard, finishWizard, wizardMatch, wizardForce, wizardReject, wizardSkip,
  }
}
