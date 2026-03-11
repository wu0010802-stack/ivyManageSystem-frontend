<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { getLeaves, createLeave, updateLeave, approveLeave as approveLeaveApi, getWorkdayHours, getLeaveQuotas, batchApproveLeaves, getLeaveImportTemplate, importLeaves } from '@/api/leaves'
import { getApprovalLogs, getApprovalPolicies } from '@/api/approvalSettings'
import { getUserInfo } from '@/utils/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useCrudDialog, useConfirmDelete, useDateQuery } from '@/composables'
import { downloadFile } from '@/utils/download'
import { LEAVE_TYPES as leaveTypes } from '@/utils/leaves'
import { money } from '@/utils/format'
import LeaveAttachmentDialog from './leave/LeaveAttachmentDialog.vue'
import LeaveQuotaManager from './leave/LeaveQuotaManager.vue'
import LeaveRejectDialog from './leave/LeaveRejectDialog.vue'
import LeaveCalendar from './leave/LeaveCalendar.vue'

const { currentYear, query } = useDateQuery()
const employeeStore = useEmployeeStore()

const loading = ref(false)
const leaveRecords = ref([])
const formRef = ref(null)

// 子元件 ref
const attachRef = ref(null)
const rejectRef = ref(null)

// 行事曆 / 配額 Dialog 的顯示控制
const activeTab = ref('list')
const quotaDialogVisible = ref(false)

const ATTACHMENT_HINTS = {
  sick: '建議上傳：醫院診斷證明書',
  marriage: '建議上傳：結婚證書或喜帖',
  bereavement: '建議上傳：訃聞或死亡證明',
  maternity: '建議上傳：媽媽手冊或出生證明',
  paternity: '建議上傳：出生證明',
  prenatal: '建議上傳：產檢相關文件',
  paternity_new: '建議上傳：出生證明',
  miscarriage: '建議上傳：醫院證明',
}
const ATTACHMENT_SUGGESTED = new Set(Object.keys(ATTACHMENT_HINTS))

const DAILY_WORK_HOURS = 8  // 無排班資料時的降級預設值

// 本地降級計算（無排班資料或 API 失敗時使用）
const countWorkdays = (startDate, endDate) => {
  let count = 0
  const cur = new Date(startDate)
  cur.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

const calcSameDayHours = (start, end) => {
  const sTime = start.toTimeString().substring(0, 5)
  const eTime = end.toTimeString().substring(0, 5)
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  let minutes = toMin(eTime) - toMin(sTime)
  const overlapStart = Math.max(toMin(sTime), toMin('12:00'))
  const overlapEnd = Math.min(toMin(eTime), toMin('13:00'))
  if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
  const h = Math.min(minutes / 60, DAILY_WORK_HOURS)
  return Math.max(0, h)
}

const calcHint = ref('')
const calcBreakdown = ref([])
const calcLoading = ref(false)
const leaveMode = ref('full') // 'full' | 'morning' | 'afternoon' | 'custom'
const leaveSingleDate = ref('') // 上午/下午模式用的單一日期

// ── 配額追蹤 ──
const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])
const quotaInfo = ref(null)   // { total_hours, used_hours, pending_hours, remaining_hours }
const quotaLoading = ref(false)

const form = reactive({
  id: null,
  employee_id: null,
  leave_type: 'personal',
  start_date: '',
  end_date: '',
  leave_hours: 8,
  reason: '',
})

const formRules = {
  employee_id: [{ required: true, message: '請選擇員工', trigger: 'change' }],
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  start_date: [{ required: true, message: '請選擇開始時間', trigger: 'change' }],
  end_date: [{ required: true, message: '請選擇結束時間', trigger: 'change' }],
  leave_hours: [
    { required: true, type: 'number', message: '請填寫請假時數', trigger: 'change' },
    {
      type: 'number',
      validator: (rule, value, callback) => {
        if (value < 0.5) callback(new Error('請假時數至少 0.5 小時'))
        else if (Math.round(value * 2) !== value * 2) callback(new Error('請假時數必須為 0.5 小時的倍數'))
        else callback()
      },
      trigger: 'change',
    },
  ],
}

// 結束日期不得早於開始日期
const disabledEndDate = (time) => {
  if (!form.start_date) return false
  const s = new Date(form.start_date)
  s.setHours(0, 0, 0, 0)
  return time.getTime() < s.getTime()
}

const resetForm = () => {
  form.id = null
  form.employee_id = null
  form.leave_type = 'personal'
  form.start_date = ''
  form.end_date = ''
  form.leave_hours = 8
  form.reason = ''
  calcHint.value = ''
  calcBreakdown.value = []
  calcLoading.value = false
  quotaInfo.value = null
  leaveMode.value = 'full'
  leaveSingleDate.value = ''
  formRef.value?.clearValidate()
}

// ---- 排班整合計算 ----

const _fallbackCalc = (start, end) => {
  const s = new Date(start)
  const e = new Date(end)
  const sDay = new Date(s); sDay.setHours(0, 0, 0, 0)
  const eDay = new Date(e); eDay.setHours(0, 0, 0, 0)
  if (sDay.getTime() === eDay.getTime()) {
    const hours = calcSameDayHours(s, e)
    form.leave_hours = Math.max(0.5, Math.round(hours * 2) / 2)
    const lunchNote = hours < (e - s) / 3600000 ? '（已扣除 1h 午休）' : ''
    calcHint.value = `同日請假 ${form.leave_hours}h${lunchNote}（預設班制）`
  } else {
    const workdays = countWorkdays(sDay, eDay)
    const total = workdays * DAILY_WORK_HOURS
    form.leave_hours = Math.max(0.5, total)
    calcHint.value = `${workdays} 個工作日 × ${DAILY_WORK_HOURS}h = ${total}h（預設班制，已排除週末）`
  }
}

const fetchWorkdayHours = async (employeeId, start, end) => {
  calcLoading.value = true
  calcBreakdown.value = []
  calcHint.value = ''
  try {
    const sd = start.substring(0, 10)
    const ed = end.substring(0, 10)
    const res = await getWorkdayHours({ employee_id: employeeId, start_date: sd, end_date: ed })
    const { total_hours, breakdown } = res.data
    calcBreakdown.value = breakdown

    if (leaveMode.value === 'morning') {
      const dayData = breakdown.find(d => d.date === sd && d.type === 'workday')
      const workStart = dayData?.work_start || '08:00'
      form.start_date = `${sd} ${workStart}:00`
      form.end_date = `${sd} 12:00:00`
      const hours = Math.max(0.5, Math.round((new Date(form.end_date) - new Date(form.start_date)) / 3600000 * 2) / 2)
      form.leave_hours = hours
      calcHint.value = `上午請假 ${hours}h（${workStart}–12:00）`
    } else if (leaveMode.value === 'afternoon') {
      const dayData = breakdown.find(d => d.date === sd && d.type === 'workday')
      const workEnd = dayData?.work_end || '17:00'
      form.start_date = `${sd} 13:00:00`
      form.end_date = `${sd} ${workEnd}:00`
      const hours = Math.max(0.5, Math.round((new Date(form.end_date) - new Date(form.start_date)) / 3600000 * 2) / 2)
      form.leave_hours = hours
      calcHint.value = `下午請假 ${hours}h（13:00–${workEnd}）`
    } else if (leaveMode.value === 'full') {
      form.leave_hours = Math.max(0.5, total_hours)
      const workdayCount = breakdown.filter(d => d.type === 'workday').length
      const holidayCount = breakdown.filter(d => d.type === 'holiday').length
      const parts = [`${workdayCount} 個工作日，合計 ${total_hours}h`]
      if (holidayCount > 0) parts.push(`${holidayCount} 天國定假日不計`)
      calcHint.value = parts.join('，')
    } else {
      // custom 模式：跨日或同日計算，考慮首尾日的實際時間
      const startTime = start.substring(11, 16) || '09:00'
      const endTime = end.substring(11, 16) || '18:00'
      const startDateStr = start.substring(0, 10)
      const endDateStr = end.substring(0, 10)
      let totalH = 0
      for (const d of breakdown) {
        if (d.type !== 'workday') continue
        const ws = d.work_start || '09:00'
        const we = d.work_end || '18:00'
        const lunchStart = '12:00', lunchEnd = '13:00'
        let dayStart = ws, dayEnd = we
        if (d.date === startDateStr) dayStart = startTime > ws ? startTime : ws
        if (d.date === endDateStr) dayEnd = endTime < we ? endTime : we
        if (dayStart >= dayEnd) continue
        const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
        let minutes = toMin(dayEnd) - toMin(dayStart)
        const overlapStart = Math.max(toMin(dayStart), toMin(lunchStart))
        const overlapEnd = Math.min(toMin(dayEnd), toMin(lunchEnd))
        if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
        totalH += Math.max(0, minutes / 60)
      }
      form.leave_hours = Math.max(0.5, Math.round(totalH * 2) / 2)
      const wdays = breakdown.filter(d => d.type === 'workday').length
      const hdays = breakdown.filter(d => d.type === 'holiday').length
      calcHint.value = `${wdays} 個工作日，合計 ${form.leave_hours}h（依實際時段）` + (hdays > 0 ? `，${hdays} 天國定假日不計` : '')
    }
  } catch {
    // API 失敗時降級為本地計算
    _fallbackCalc(start, end)
    calcBreakdown.value = []
  } finally {
    calcLoading.value = false
  }
}

// 整天/自訂時段模式的計算觸發
watch([() => form.employee_id, () => form.start_date, () => form.end_date], ([empId, start, end]) => {
  if (leaveMode.value === 'morning' || leaveMode.value === 'afternoon') return
  if (!start || !end) { calcHint.value = ''; calcBreakdown.value = []; return }
  const s = new Date(start), e = new Date(end)
  // 整天模式允許 start == end（單日全天），其他模式要求 end > start
  if (leaveMode.value === 'full' ? e < s : e <= s) { calcHint.value = ''; calcBreakdown.value = []; return }
  if (empId) {
    fetchWorkdayHours(empId, start, end)
  } else {
    _fallbackCalc(start, end)
    calcBreakdown.value = []
  }
})

// 上午/下午模式的計算觸發
watch([() => form.employee_id, leaveSingleDate, leaveMode], ([empId, singleDate, mode]) => {
  if (mode !== 'morning' && mode !== 'afternoon') return
  calcBreakdown.value = []
  if (!singleDate) { calcHint.value = ''; form.start_date = ''; form.end_date = ''; return }
  // 立即設定暫時時間以通過表單驗證
  if (mode === 'morning') {
    form.start_date = `${singleDate} 08:00:00`
    form.end_date = `${singleDate} 12:00:00`
    form.leave_hours = 4
  } else {
    form.start_date = `${singleDate} 13:00:00`
    form.end_date = `${singleDate} 17:00:00`
    form.leave_hours = 4
  }
  if (empId) {
    fetchWorkdayHours(empId, singleDate, singleDate)
  } else {
    calcHint.value = `${mode === 'morning' ? '上午' : '下午'} 4h（預設班制）`
  }
})

// 請假模式切換時同步日期狀態
watch(leaveMode, (newMode) => {
  calcHint.value = ''
  calcBreakdown.value = []
  if (newMode === 'full') {
    if (leaveSingleDate.value) {
      form.start_date = leaveSingleDate.value
      form.end_date = leaveSingleDate.value
    } else if (form.start_date) {
      form.start_date = form.start_date.substring(0, 10)
      form.end_date = form.end_date ? form.end_date.substring(0, 10) : ''
    }
    leaveSingleDate.value = ''
  } else if (newMode === 'morning' || newMode === 'afternoon') {
    const dateStr = form.start_date ? form.start_date.substring(0, 10) : ''
    leaveSingleDate.value = dateStr
    form.start_date = ''
    form.end_date = ''
  } else if (newMode === 'custom') {
    const dateStr = leaveSingleDate.value || (form.start_date ? form.start_date.substring(0, 10) : '')
    if (dateStr) {
      form.start_date = `${dateStr} 08:00:00`
      form.end_date = `${dateStr} 17:00:00`
    }
    leaveSingleDate.value = ''
  }
})

const populateForm = (row) => {
  form.id = row.id
  form.employee_id = row.employee_id
  form.leave_type = row.leave_type
  if (row.start_time || row.end_time) {
    leaveMode.value = 'custom'
    form.start_date = row.start_time ? `${row.start_date} ${row.start_time}:00` : `${row.start_date} 00:00:00`
    form.end_date = row.end_time ? `${row.end_date} ${row.end_time}:00` : `${row.end_date} 00:00:00`
    leaveSingleDate.value = row.start_date
  } else {
    leaveMode.value = 'full'
    form.start_date = row.start_date
    form.end_date = row.end_date
    leaveSingleDate.value = row.start_date
  }
  form.leave_hours = row.leave_hours
  form.reason = row.reason
}

const { dialogVisible, isEdit, openCreate, openEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const statusFilter = ref('')

// ── 批次審核 ──
const selectedLeaves = ref([])
const batchRejectVisible = ref(false)
const batchRejectReason = ref('')
const batchLoading = ref(false)

const handleSelectionChange = (selection) => {
  selectedLeaves.value = selection
}

const showBatchApproveConfirm = async () => {
  try {
    await ElMessageBox.confirm(
      `確認批次核准選取的 ${selectedLeaves.value.length} 筆請假記錄？`,
      '批次核准',
      { type: 'warning', confirmButtonText: '確認核准', cancelButtonText: '取消' }
    )
    batchLoading.value = true
    const ids = selectedLeaves.value.map(r => r.id)
    const res = await batchApproveLeaves(ids, true)
    const { succeeded, failed } = res.data
    if (failed.length === 0) {
      ElMessage.success(`已成功核准 ${succeeded.length} 筆`)
    } else {
      ElMessage.warning(
        `核准完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆（${failed.map(f => `#${f.id}: ${f.reason}`).join('；')}）`
      )
    }
    fetchLeaves()
  } catch (err) {
    if (err !== 'cancel') ElMessage.error('批次核准失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    batchLoading.value = false
  }
}

const openBatchReject = () => {
  batchRejectReason.value = ''
  batchRejectVisible.value = true
}

const confirmBatchReject = async () => {
  if (!batchRejectReason.value.trim()) {
    ElMessage.warning('請填寫駁回原因')
    return
  }
  batchLoading.value = true
  try {
    const ids = selectedLeaves.value.map(r => r.id)
    const res = await batchApproveLeaves(ids, false, batchRejectReason.value.trim())
    const { succeeded, failed } = res.data
    batchRejectVisible.value = false
    if (failed.length === 0) {
      ElMessage.success(`已成功駁回 ${succeeded.length} 筆`)
    } else {
      ElMessage.warning(
        `駁回完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆`
      )
    }
    fetchLeaves()
  } catch (err) {
    ElMessage.error('批次駁回失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    batchLoading.value = false
  }
}

// ── Excel 匯入 ──
const importVisible = ref(false)
const importLoading = ref(false)
const importResult = ref(null)

const downloadImportTemplate = async () => {
  try {
    const res = await getLeaveImportTemplate()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '請假匯入範本.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch {
    ElMessage.error('下載範本失敗')
  }
}

const handleImportFile = async (file) => {
  importLoading.value = true
  importResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await importLeaves(formData)
    importResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，成功建立 ${res.data.created} 筆草稿假單`)
      fetchLeaves()
    }
  } catch (err) {
    ElMessage.error('匯入失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    importLoading.value = false
  }
  return false
}

// ── 表單配額查詢 ──
const fetchQuotaInfo = async () => {
  if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type)) {
    quotaInfo.value = null
    return
  }
  quotaLoading.value = true
  try {
    const year = new Date().getFullYear()
    const res = await getLeaveQuotas({ employee_id: form.employee_id, year, leave_type: form.leave_type })
    quotaInfo.value = res.data[0] || null
  } catch {
    quotaInfo.value = null
  } finally {
    quotaLoading.value = false
  }
}
watch([() => form.employee_id, () => form.leave_type], fetchQuotaInfo)

const quotaExceeded = computed(() =>
  !!(quotaInfo.value && form.leave_hours > quotaInfo.value.remaining_hours)
)

// ── 是否可儲存 ──
const canSave = computed(() => !quotaExceeded.value)

// ── 計算公式 Tooltip ──
const calcTooltipHtml = computed(() => {
  if (!calcBreakdown.value.length) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const lines = []
  let total = 0
  const isCustom = leaveMode.value === 'custom'
  const startTime = isCustom && form.start_date ? form.start_date.substring(11, 16) : ''
  const endTime = isCustom && form.end_date ? form.end_date.substring(11, 16) : ''
  const startDateStr = isCustom && form.start_date ? form.start_date.substring(0, 10) : ''
  const endDateStr = isCustom && form.end_date ? form.end_date.substring(0, 10) : ''
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  for (const d of calcBreakdown.value) {
    const dt = new Date(d.date)
    const wd = weekdays[dt.getDay()]
    if (d.type === 'workday') {
      let h = d.hours
      if (isCustom && startTime && endTime) {
        const ws = d.work_start || '09:00'
        const we = d.work_end || '18:00'
        let dayStart = ws, dayEnd = we
        if (d.date === startDateStr) dayStart = startTime > ws ? startTime : ws
        if (d.date === endDateStr) dayEnd = endTime < we ? endTime : we
        if (dayStart >= dayEnd) { h = 0 } else {
          let mins = toMin(dayEnd) - toMin(dayStart)
          const oS = Math.max(toMin(dayStart), 720), oE = Math.min(toMin(dayEnd), 780)
          if (oE > oS) mins -= (oE - oS)
          h = Math.max(0, Math.round(mins / 60 * 2) / 2)
        }
      }
      const timeRange = isCustom ? (() => {
        const ws = d.work_start || '09:00', we = d.work_end || '18:00'
        let ds = ws, de = we
        if (d.date === startDateStr && startTime) ds = startTime > ws ? startTime : ws
        if (d.date === endDateStr && endTime) de = endTime < we ? endTime : we
        return ` ${ds}–${de}`
      })() : ''
      lines.push(`${d.date}（${wd}）${h}h${timeRange}`)
      total += h
    } else if (d.type === 'holiday') {
      lines.push(`${d.date}（${wd}）${d.holiday_name} 0h`)
    } else {
      lines.push(`${d.date}（${wd}）週末 0h`)
    }
  }
  lines.push(`合計 = ${total}h`)
  return lines.join('<br>')
})

// ── 辦公時間邊界警告 ──
const DEFAULT_WORK_START = '09:00'
const DEFAULT_WORK_END = '18:00'
const officeHoursWarning = computed(() => {
  if (leaveMode.value !== 'custom' || !form.start_date || !form.end_date) return ''
  const st = form.start_date.substring(11, 16)
  const et = form.end_date.substring(11, 16)
  if (!st || !et) return ''
  const warnings = []
  if (st < DEFAULT_WORK_START) warnings.push(`開始時間 ${st} 早於預設上班 ${DEFAULT_WORK_START}`)
  if (et > DEFAULT_WORK_END) warnings.push(`結束時間 ${et} 晚於預設下班 ${DEFAULT_WORK_END}`)
  return warnings.join('；')
})

// ── 自訂時段 30 分鐘對齊 ──
const snapMinuteTo30 = (val) => {
  if (!val || val.length < 16) return val
  const min = parseInt(val.substring(14, 16), 10)
  const snapped = min < 15 ? '00' : min < 45 ? '30' : '00'
  let result = val.substring(0, 14) + snapped + val.substring(16)
  if (min >= 45) {
    const d = new Date(result)
    d.setHours(d.getHours() + 1)
    const hh = String(d.getHours()).padStart(2, '0')
    result = result.substring(0, 11) + hh + ':' + snapped + result.substring(16)
  }
  return result
}

watch(() => form.start_date, (val) => {
  if (leaveMode.value === 'custom' && val && val.length > 10) {
    const snapped = snapMinuteTo30(val)
    if (snapped !== val) form.start_date = snapped
  }
})
watch(() => form.end_date, (val) => {
  if (leaveMode.value === 'custom' && val && val.length > 10) {
    const snapped = snapMinuteTo30(val)
    if (snapped !== val) form.end_date = snapped
  }
})

const fetchLeaves = async () => {
  loading.value = true
  try {
    const params = { year: query.year, month: query.month }
    if (query.employee_id) params.employee_id = query.employee_id
    if (statusFilter.value) params.status = statusFilter.value
    const response = await getLeaves(params)
    leaveRecords.value = response.data
  } catch (error) {
    ElMessage.error('載入請假記錄失敗')
  } finally {
    loading.value = false
  }
}

const saveLeave = async () => {
  // el-form 規則驗證
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  // 時間順序防呆
  const s = new Date(form.start_date)
  const e = new Date(form.end_date)
  if (leaveMode.value === 'full' ? e < s : e <= s) {
    ElMessage.warning(leaveMode.value === 'full' ? '結束日期不得早於開始日期' : '結束時間必須晚於開始時間')
    return
  }

  // 時數合理性警告：優先用 API 算出的工時，否則降級為本地計算
  const sDay = new Date(s); sDay.setHours(0, 0, 0, 0)
  const eDay = new Date(e); eDay.setHours(0, 0, 0, 0)
  const apiMaxHours = calcBreakdown.value.length
    ? calcBreakdown.value.reduce((sum, d) => sum + (d.hours || 0), 0)
    : null
  const maxHours = apiMaxHours ?? (countWorkdays(sDay, eDay) * DAILY_WORK_HOURS)
  if (form.leave_hours > maxHours + 0.5) {
    const confirmed = await ElMessageBox.confirm(
      `請假時數（${form.leave_hours}h）超過預期工作日時數（${maxHours}h），確認要儲存嗎？`,
      '時數異常確認',
      { type: 'warning', confirmButtonText: '確認儲存', cancelButtonText: '取消' }
    ).catch(() => false)
    if (!confirmed) return
  }

  // 配額超額警告（有配額資料才檢查）
  if (quotaInfo.value && quotaInfo.value.remaining_hours < form.leave_hours) {
    const over = (form.leave_hours - quotaInfo.value.remaining_hours).toFixed(1)
    const confirmed = await ElMessageBox.confirm(
      `此次請假（${form.leave_hours}h）將超出剩餘配額（${quotaInfo.value.remaining_hours}h），超出 ${over}h，確認要儲存嗎？`,
      '配額不足警告',
      { type: 'warning', confirmButtonText: '確認儲存', cancelButtonText: '取消' }
    ).catch(() => false)
    if (!confirmed) return
  }

  try {
    const sd = form.start_date ? form.start_date.substring(0, 10) : ''
    const st = form.start_date && form.start_date.length > 10 ? form.start_date.substring(11, 16) : ''
    const ed = form.end_date ? form.end_date.substring(0, 10) : ''
    const et = form.end_date && form.end_date.length > 10 ? form.end_date.substring(11, 16) : ''

    if (isEdit.value) {
      await updateLeave(form.id, {
        leave_type: form.leave_type,
        start_date: sd,
        start_time: st,
        end_date: ed,
        end_time: et,
        leave_hours: form.leave_hours,
        reason: form.reason,
      })
      ElMessage.success('請假記錄已更新')
    } else {
      await createLeave({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        start_date: sd,
        start_time: st,
        end_date: ed,
        end_time: et,
        leave_hours: form.leave_hours,
        reason: form.reason,
      })
      ElMessage.success('請假記錄已新增')
    }
    closeDialog()
    fetchLeaves()
  } catch (error) {
    ElMessage.error('儲存失敗: ' + (error.response?.data?.detail || error.message))
  }
}

const { confirmDelete: deleteLeave } = useConfirmDelete({
  endpoint: '/leaves',
  onSuccess: fetchLeaves,
  successMsg: '已刪除',
})

const approveLeave = async (row) => {
  try {
    await approveLeaveApi(row.id, { approved: true })
    ElMessage.success('已核准')
    fetchLeaves()
  } catch (error) {
    ElMessage.error('操作失敗：' + (error.response?.data?.detail || error.message))
  }
}

const cancelApprove = async (row) => {
  try {
    await approveLeaveApi(row.id, { approved: false, rejection_reason: '取消核准' })
    ElMessage.success('已取消核准')
    fetchLeaves()
  } catch (error) {
    ElMessage.error('操作失敗：' + (error.response?.data?.detail || error.message))
  }
}

const getLeaveTypeTag = (type) => {
  return leaveTypes.find(t => t.value === type) || { label: type, color: '' }
}

// ── 簽核記錄 Drawer ─────────────────────────────────────────────────────────
const approvalLogDrawerVisible = ref(false)
const approvalLogs = ref([])
const approvalLogLoading = ref(false)

const openApprovalLogs = async (row) => {
  approvalLogDrawerVisible.value = true
  approvalLogLoading.value = true
  approvalLogs.value = []
  try {
    const res = await getApprovalLogs('leave', row.id)
    approvalLogs.value = res.data
  } catch {
    ElMessage.error('載入簽核記錄失敗')
  } finally {
    approvalLogLoading.value = false
  }
}

const ACTION_LABELS = { approved: '核准', rejected: '駁回', cancelled: '取消' }
const ACTION_TAG_TYPES = { approved: 'success', rejected: 'danger', cancelled: 'warning' }

// ── 審核資格判斷 ─────────────────────────────────────────────────────────────
const approvalPolicies = ref([])
const currentUserInfo = getUserInfo()

const fetchApprovalPoliciesForView = async () => {
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data
  } catch {
    // 靜默：載入失敗時 canApprove 退回 false（不影響主功能）
  }
}

const canApprove = (row) => {
  const myRole = currentUserInfo?.role
  if (!myRole || myRole === 'teacher') return false
  const submitterRole = row.submitter_role || 'teacher'
  const policy = approvalPolicies.value.find(p => p.submitter_role === submitterRole)
  if (!policy) return myRole === 'admin'
  return policy.approver_roles.split(',').map(r => r.trim()).includes(myRole)
}

onMounted(() => {
  employeeStore.fetchEmployees()
  fetchLeaves()
  fetchApprovalPoliciesForView()
})
</script>

<template>
  <div class="leave-page">
    <h2>請假管理</h2>

    <el-tabs v-model="activeTab" class="leave-tabs">

      <!-- ─── 列表 Tab ─── -->
      <el-tab-pane name="list">
        <template #label><el-icon><List /></el-icon> 列表</template>

    <el-card class="control-panel">
      <div class="controls">
        <el-select v-model="query.employee_id" placeholder="全部員工" clearable filterable style="width: 180px;">
          <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
        </el-select>
        <el-select v-model="query.year" style="width: 110px;">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
        <el-select v-model="query.month" style="width: 90px;">
          <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="全部狀態" clearable style="width: 120px;">
          <el-option label="待審核" value="pending" />
          <el-option label="已核准" value="approved" />
          <el-option label="已駁回" value="rejected" />
        </el-select>
        <el-button type="primary" @click="fetchLeaves" :loading="loading">查詢</el-button>
        <el-button type="warning" @click="downloadFile(`/exports/leaves?year=${query.year}&month=${query.month}`, `${query.year}年${query.month}月請假記錄.xlsx`)">匯出 Excel</el-button>
        <el-button @click="quotaDialogVisible = true">配額管理</el-button>
        <el-button @click="downloadImportTemplate">下載範本</el-button>
        <el-button @click="importVisible = true">匯入 Excel</el-button>
        <el-button
          v-if="selectedLeaves.length > 0"
          type="success"
          :loading="batchLoading"
          @click="showBatchApproveConfirm"
        >批次核准 ({{ selectedLeaves.length }})</el-button>
        <el-button
          v-if="selectedLeaves.length > 0"
          type="danger"
          :loading="batchLoading"
          @click="openBatchReject"
        >批次駁回 ({{ selectedLeaves.length }})</el-button>
        <el-button type="success" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增請假
        </el-button>
      </div>
    </el-card>

    <TableSkeleton v-if="loading && !leaveRecords.length" :columns="8" />
    <el-table v-else :data="leaveRecords" border stripe style="width: 100%; margin-top: 20px;" v-loading="loading" max-height="600" @selection-change="handleSelectionChange">
      <el-table-column type="selection" width="45" />
      <el-table-column prop="employee_name" label="員工" width="100" />
      <el-table-column label="假別" width="100">
        <template #default="scope">
          <el-tag :type="getLeaveTypeTag(scope.row.leave_type).color" size="small">
            {{ scope.row.leave_type_label }}
          </el-tag>
        </template>
      </el-table-column>
        <el-table-column label="開始時間" width="140">
          <template #default="scope">
            {{ scope.row.start_date }} {{ scope.row.start_time || '' }}
          </template>
        </el-table-column>
        <el-table-column label="結束時間" width="140">
          <template #default="scope">
            {{ scope.row.end_date }} {{ scope.row.end_time || '' }}
          </template>
        </el-table-column>
        <el-table-column label="時數" width="80">
          <template #default="scope">{{ scope.row.leave_hours }}h</template>
        </el-table-column>
        <el-table-column label="扣薪比例" width="90">
          <template #default="scope">
            {{ scope.row.deduction_ratio === 0 ? '不扣' : (scope.row.deduction_ratio === 1 ? '全扣' : '半薪') }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
        <el-table-column label="附件" width="70" align="center">
          <template #default="scope">
            <el-button
              v-if="scope.row.attachment_paths && scope.row.attachment_paths.length > 0"
              link
              type="primary"
              size="small"
              @click="attachRef.open(scope.row)"
            >
              <el-icon><Paperclip /></el-icon>
              {{ scope.row.attachment_paths.length }}
            </el-button>
            <span v-else class="text-secondary" style="font-size:12px">—</span>
          </template>
        </el-table-column>
        <el-table-column label="審核" width="120">
          <template #default="scope">
            <el-tag v-if="scope.row.is_approved === true" type="success" size="small">已核准</el-tag>
            <template v-else-if="scope.row.is_approved === false">
              <el-tag type="danger" size="small">已駁回</el-tag>
              <el-tooltip v-if="scope.row.rejection_reason" :content="scope.row.rejection_reason" placement="top">
                <el-icon style="margin-left:4px;color:var(--el-color-danger);cursor:help;vertical-align:middle;"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
            <el-tag v-else type="info" size="small">待審核</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="代理人" width="140">
          <template #default="scope">
            <template v-if="scope.row.substitute_employee_name">
              <span style="font-size:12px;">{{ scope.row.substitute_employee_name }}</span>
              <el-tag
                size="small"
                :type="{ not_required:'info', pending:'warning', accepted:'success', rejected:'danger' }[scope.row.substitute_status] || ''"
                style="margin-left:4px;"
              >{{ { not_required:'—', pending:'待回應', accepted:'已接受', rejected:'已拒絕' }[scope.row.substitute_status] || scope.row.substitute_status }}</el-tag>
            </template>
            <span v-else style="color:var(--el-text-color-secondary);font-size:12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="換班關聯" width="100" align="center">
          <template #default="scope">
            <el-tooltip
              v-if="scope.row.related_swap"
              placement="top"
              :content="`換班申請 #${scope.row.related_swap.id}（${scope.row.related_swap.swap_date}，狀態：${scope.row.related_swap.status}）`"
            >
              <el-tag type="warning" size="small" effect="plain">換班中</el-tag>
            </el-tooltip>
            <span v-else style="color:var(--el-text-color-secondary);font-size:12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="scope">
            <template v-if="scope.row.is_approved === null && canApprove(scope.row)">
              <el-button type="success" size="small" link @click="approveLeave(scope.row)">核准</el-button>
              <el-button type="danger" size="small" link @click="rejectRef.open(scope.row)">駁回</el-button>
            </template>
            <el-button v-if="scope.row.is_approved === true && canApprove(scope.row)" type="warning" size="small" link @click="cancelApprove(scope.row)">取消核准</el-button>
            <el-button v-if="scope.row.is_approved === false && canApprove(scope.row)" type="success" size="small" link @click="approveLeave(scope.row)">核准</el-button>
            <el-button type="primary" size="small" link @click="openEdit(scope.row)">編輯</el-button>
            <el-button type="danger" size="small" link @click="deleteLeave(scope.row)">刪除</el-button>
            <el-button type="info" size="small" link @click="openApprovalLogs(scope.row)">記錄</el-button>
          </template>
        </el-table-column>
      </el-table>

      </el-tab-pane>

      <!-- ─── 行事曆 Tab ─── -->
      <el-tab-pane name="calendar">
        <template #label><el-icon><Calendar /></el-icon> 行事曆</template>
        <LeaveCalendar :activeTab="activeTab" />
      </el-tab-pane>

    </el-tabs>

    <!-- 子元件 -->
    <LeaveRejectDialog ref="rejectRef" @rejected="fetchLeaves()" />
    <LeaveQuotaManager v-model:visible="quotaDialogVisible" />
    <LeaveAttachmentDialog ref="attachRef" />

    <!-- 批次駁回 Dialog -->
    <el-dialog v-model="batchRejectVisible" title="批次駁回" width="420px">
      <el-form label-width="80px">
        <el-form-item label="駁回原因" required>
          <el-input
            v-model="batchRejectReason"
            type="textarea"
            :rows="3"
            placeholder="必填：請輸入駁回原因（將套用至所有選取假單）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchRejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="batchLoading" @click="confirmBatchReject">確認駁回</el-button>
      </template>
    </el-dialog>

    <!-- 匯入 Excel Dialog -->
    <el-dialog v-model="importVisible" title="批次匯入請假" width="500px">
      <div style="margin-bottom: 12px;">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>上傳 Excel 檔案（.xlsx），系統將批次建立草稿假單，需後續人工審核。</template>
        </el-alert>
      </div>
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleImportFile"
        accept=".xlsx"
        :limit="1"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload" style="font-size: 48px; color: var(--el-color-primary);"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖曳 Excel 至此，或 <em>點擊選取</em></div>
        <template #tip><div class="el-upload__tip">僅支援 .xlsx 格式</div></template>
      </el-upload>
      <div v-if="importLoading" style="text-align:center; margin-top: 16px;">
        <el-icon class="is-loading" style="font-size: 24px;"><Loading /></el-icon> 匯入中…
      </div>
      <el-card v-if="importResult" style="margin-top: 16px;" shadow="never">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span>共 <strong>{{ importResult.total }}</strong> 筆</span>
          <el-tag type="success">成功 {{ importResult.created }}</el-tag>
          <el-tag v-if="importResult.failed > 0" type="danger">失敗 {{ importResult.failed }}</el-tag>
        </div>
        <div v-if="importResult.errors?.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
          <p v-for="e in importResult.errors" :key="e" style="font-size:12px; color:var(--el-color-danger); margin: 2px 0;">{{ e }}</p>
        </div>
      </el-card>
      <template #footer>
        <el-button @click="importVisible = false">關閉</el-button>
      </template>
    </el-dialog>

    <!-- Create/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯請假' : '新增請假申請'" width="550px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="100px">
        <el-form-item label="員工" prop="employee_id">
          <el-select v-model="form.employee_id" filterable placeholder="選擇員工" :disabled="isEdit" style="width: 100%;">
            <el-option v-for="emp in employeeStore.employees" :key="emp.id" :label="emp.name" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="假別" prop="leave_type">
          <el-select v-model="form.leave_type" style="width: 100%;">
            <el-option v-for="lt in leaveTypes" :key="lt.value" :label="lt.label" :value="lt.value">
              <span>{{ lt.label }}</span>
              <el-tag
                size="small"
                :type="lt.deduction.includes('不扣') ? 'success' : lt.deduction.includes('半') ? 'warning' : 'danger'"
                style="margin-left: 8px; float: right;"
              >{{ lt.deduction }}</el-tag>
            </el-option>
          </el-select>
          <div style="margin-top: 5px; font-size: 12px; min-height: 20px;">
            <span v-if="quotaLoading" style="color: var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 查詢配額…
            </span>
            <template v-else-if="quotaInfo">
              <el-tag
                size="small"
                :type="quotaInfo.remaining_hours <= 0 ? 'danger' : quotaInfo.remaining_hours < 16 ? 'warning' : 'success'"
                style="margin-right: 6px;"
              >
                剩餘 {{ quotaInfo.remaining_hours }}h
              </el-tag>
              <span style="color: var(--el-text-color-secondary);">
                已核准 {{ quotaInfo.used_hours }}h
                <template v-if="quotaInfo.pending_hours > 0">
                  ／待審 {{ quotaInfo.pending_hours }}h
                </template>
                ／總計 {{ quotaInfo.total_hours }}h
              </span>
            </template>
            <span v-else-if="form.employee_id && !QUOTA_TYPES.has(form.leave_type)" style="color: var(--el-text-color-placeholder);">
              此假別無年度上限
            </span>
          </div>
          <div v-if="ATTACHMENT_HINTS[form.leave_type]" style="margin-top: 5px; font-size: 12px; color: var(--el-color-warning); display: flex; align-items: center; gap: 4px;">
            <el-icon><InfoFilled /></el-icon>
            {{ ATTACHMENT_HINTS[form.leave_type] }}
          </div>
        </el-form-item>
        <el-form-item label="請假模式">
          <el-radio-group v-model="leaveMode" size="small">
            <el-radio-button value="full">整天</el-radio-button>
            <el-radio-button value="morning">上午</el-radio-button>
            <el-radio-button value="afternoon">下午</el-radio-button>
            <el-radio-button value="custom">自訂時段</el-radio-button>
          </el-radio-group>
          <div style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
            <template v-if="leaveMode === 'full'">整天或多日請假，只需選日期</template>
            <template v-else-if="leaveMode === 'morning'">僅限單日，自動帶入上班至12:00</template>
            <template v-else-if="leaveMode === 'afternoon'">僅限單日，自動帶入13:00至下班</template>
            <template v-else>自行填入起訖日期時間</template>
          </div>
        </el-form-item>

        <!-- 整天模式：只選日期 -->
        <template v-if="leaveMode === 'full'">
          <el-form-item label="開始日期" prop="start_date">
            <el-date-picker v-model="form.start_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇開始日期" />
          </el-form-item>
          <el-form-item label="結束日期" prop="end_date">
            <el-date-picker v-model="form.end_date" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇結束日期" :disabled-date="disabledEndDate" />
          </el-form-item>
        </template>

        <!-- 上午/下午模式：單日 -->
        <template v-else-if="leaveMode === 'morning' || leaveMode === 'afternoon'">
          <el-form-item label="請假日期" prop="start_date">
            <el-date-picker v-model="leaveSingleDate" type="date" value-format="YYYY-MM-DD" style="width: 100%;" placeholder="選擇請假日期" />
            <div v-if="form.start_date && form.end_date" style="margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary);">
              時段：{{ form.start_date.substring(11, 16) }} – {{ form.end_date.substring(11, 16) }}
              <el-icon v-if="calcLoading" class="is-loading" style="vertical-align: middle; margin-left: 6px;"><Loading /></el-icon>
            </div>
          </el-form-item>
        </template>

        <!-- 自訂時段模式 -->
        <template v-else>
          <el-form-item label="開始時間" prop="start_date">
            <el-date-picker v-model="form.start_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%;" placeholder="選擇開始日期時間" />
          </el-form-item>
          <el-form-item label="結束時間" prop="end_date">
            <el-date-picker v-model="form.end_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" style="width: 100%;" placeholder="選擇結束日期時間" :disabled-date="disabledEndDate" />
          </el-form-item>
        </template>
        <el-form-item label="請假時數" prop="leave_hours">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-input-number v-model="form.leave_hours" :min="0.5" :step="0.5" :max="240" disabled />
            <el-tooltip v-if="calcTooltipHtml" placement="right" :content="calcTooltipHtml" raw-content>
              <el-icon style="cursor: help; color: var(--el-color-info); font-size: 16px;"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div style="margin-top: 6px; font-size: 12px; line-height: 1.5;">
            <span v-if="calcLoading && leaveMode !== 'morning' && leaveMode !== 'afternoon'" style="color: var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 查詢排班中…
            </span>
            <span v-else-if="calcHint" style="color: var(--el-color-info);">
              {{ calcHint }}
            </span>
          </div>
          <el-alert
            v-if="officeHoursWarning"
            type="warning"
            :title="officeHoursWarning"
            show-icon
            :closable="false"
            style="margin-top: 6px;"
          />
          <el-alert
            v-if="quotaExceeded"
            type="warning"
            :title="`剩餘配額不足：剩餘 ${quotaInfo.remaining_hours}h，本次申請 ${form.leave_hours}h`"
            show-icon
            :closable="false"
            style="margin-top: 6px;"
          />
        </el-form-item>

        <!-- 每日排班明細（≤31 天才展開，以免過長） -->
        <el-form-item v-if="!calcLoading && calcBreakdown.length && calcBreakdown.length <= 31" label="每日明細">
          <div class="breakdown-table">
            <div
              v-for="day in calcBreakdown"
              :key="day.date"
              class="breakdown-row"
              :class="day.type"
            >
              <span class="bd-date">{{ day.date }}</span>
              <el-tag
                size="small"
                :type="day.type === 'workday' ? '' : day.type === 'holiday' ? 'danger' : 'info'"
                class="bd-tag"
              >
                {{ day.type === 'workday'
                  ? (day.shift || '預設班') + (day.work_start ? ` ${day.work_start}–${day.work_end}` : '')
                  : day.type === 'holiday' ? day.holiday_name
                  : '週末' }}
              </el-tag>
              <span class="bd-hours">
                {{ day.type === 'workday' ? `${day.hours}h` : '—' }}
              </span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :disabled="!canSave" @click="saveLeave">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 簽核記錄 Drawer -->
    <el-drawer v-model="approvalLogDrawerVisible" title="簽核記錄" direction="rtl" size="420px">
      <div v-loading="approvalLogLoading">
        <el-empty v-if="!approvalLogLoading && approvalLogs.length === 0" description="尚無簽核記錄" />
        <el-timeline v-else>
          <el-timeline-item
            v-for="log in approvalLogs"
            :key="log.id"
            :timestamp="log.created_at ? new Date(log.created_at).toLocaleString('zh-TW') : ''"
            placement="top"
          >
            <el-card shadow="never" style="padding: 8px 12px;">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <el-tag :type="ACTION_TAG_TYPES[log.action] || ''" size="small">
                  {{ ACTION_LABELS[log.action] || log.action }}
                </el-tag>
                <span style="font-weight: 500;">{{ log.approver_username }}</span>
                <el-tag size="small" type="info">{{ log.approver_role }}</el-tag>
              </div>
              <div v-if="log.comment" style="margin-top: 6px; color: #606266; font-size: 13px;">
                {{ log.comment }}
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-5);
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

/* 每日排班明細 */
.breakdown-table {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 6px;
  background: var(--el-fill-color-extra-light);
}

.breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  border-radius: 4px;
  font-size: 12px;
}

.breakdown-row.weekend,
.breakdown-row.holiday {
  opacity: 0.55;
}

.bd-date {
  min-width: 82px;
  color: var(--el-text-color-regular);
  font-variant-numeric: tabular-nums;
}

.bd-tag {
  flex: 1;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bd-hours {
  min-width: 32px;
  text-align: right;
  font-weight: 600;
  color: var(--el-color-primary);
}

.breakdown-row.weekend .bd-hours,
.breakdown-row.holiday .bd-hours {
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

/* 讓 tab-pane 沒有多餘 top padding */
.leave-tabs :deep(.el-tabs__content) {
  padding-top: 4px;
}
</style>
