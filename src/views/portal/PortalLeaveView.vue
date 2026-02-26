<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const loading = ref(false)
const submitLoading = ref(false)
const leaves = ref([])

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const leaveTypes = [
  { value: 'annual', label: '特休', deduction: '不扣薪' },
  { value: 'personal', label: '事假', deduction: '全扣薪' },
  { value: 'sick', label: '病假', deduction: '扣半薪' },
  { value: 'menstrual', label: '生理假', deduction: '扣半薪' },
  { value: 'maternity', label: '產假', deduction: '不扣薪' },
  { value: 'paternity', label: '陪產假', deduction: '不扣薪' },
  { value: 'official', label: '公假', deduction: '不扣薪' },
  { value: 'marriage', label: '婚假', deduction: '不扣薪' },
  { value: 'bereavement', label: '喪假', deduction: '不扣薪' },
  { value: 'prenatal', label: '產檢假', deduction: '不扣薪' },
  { value: 'paternity_new', label: '陪產檢及陪產假', deduction: '不扣薪' },
  { value: 'miscarriage', label: '流產假', deduction: '不扣薪' },
  { value: 'family_care', label: '家庭照顧假', deduction: '全扣薪' },
  { value: 'parental_unpaid', label: '育嬰留職停薪', deduction: '留停無薪' },
]

const leaveDeductionInfo = {
  annual: '不扣薪',
  personal: '扣全薪 (基本薪俸/30)*天數',
  sick: '扣半薪 (基本薪俸/30)*天數/2',
  menstrual: '扣半薪 (基本薪俸/30)*天數/2',
  maternity: '不扣薪',
  paternity: '不扣薪',
  official: '不扣薪（教召、研習等）',
  marriage: '不扣薪，共8日（可分次請）',
  bereavement: '不扣薪，依親疏3/6/8日',
  prenatal: '不扣薪，共7日（可以小時為單位）',
  paternity_new: '不扣薪，共7日',
  miscarriage: '不扣薪，依懷孕週數5日/1週/4週',
  family_care: '不給薪，併入事假計算，年7日',
  parental_unpaid: '留停無薪，子女滿3歲前，最長2年',
}

// 需要附件的假別（建議上傳）
const ATTACHMENT_SUGGESTED = new Set(['sick', 'marriage', 'bereavement', 'maternity', 'paternity', 'prenatal', 'paternity_new', 'miscarriage'])
// 必須上傳附件的假別
const ATTACHMENT_REQUIRED = new Set(['sick', 'paternity'])

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

const showForm = ref(false)
const form = reactive({
  leave_type: '',
  start_date: '',
  end_date: '',
  leave_hours: 8,
  reason: '',
})

// ── 請假模式 ──
const leaveMode = ref('full') // 'full' | 'morning' | 'afternoon' | 'custom'
const leaveSingleDate = ref('') // 上午/下午模式用的單一日期

// ── 排班整合計算 ──
const calcHint = ref('')
const calcBreakdown = ref([])
const calcLoading = ref(false)

const disabledEndDate = (time) => {
  if (!form.start_date) return false
  const s = new Date(form.start_date)
  s.setHours(0, 0, 0, 0)
  return time.getTime() < s.getTime()
}

const _fallbackCalc = (start, end) => {
  const s = new Date(start), e = new Date(end)
  const sDay = new Date(s); sDay.setHours(0,0,0,0)
  const eDay = new Date(e); eDay.setHours(0,0,0,0)
  if (sDay.getTime() === eDay.getTime()) {
    const sTimeStr = start.substring(11, 16) || '09:00'
    const eTimeStr = end.substring(11, 16) || '18:00'
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    let minutes = toMin(eTimeStr) - toMin(sTimeStr)
    const overlapStart = Math.max(toMin(sTimeStr), toMin('12:00'))
    const overlapEnd = Math.min(toMin(eTimeStr), toMin('13:00'))
    if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
    const h = Math.min(minutes / 60, 8)
    form.leave_hours = Math.max(0.5, Math.round(h * 2) / 2)
    calcHint.value = `同日請假 ${form.leave_hours}h（預設班制）`
  } else {
    let days = 0; const cur = new Date(sDay)
    while (cur <= eDay) { if (cur.getDay() !== 0 && cur.getDay() !== 6) days++; cur.setDate(cur.getDate()+1) }
    form.leave_hours = Math.max(0.5, days * 8)
    calcHint.value = `${days} 個工作日 × 8h = ${days*8}h（預設班制，已排除週末）`
  }
}

const fetchCalc = async (start, end) => {
  calcLoading.value = true; calcBreakdown.value = []; calcHint.value = ''
  try {
    const sd = start.substring(0, 10)
    const res = await api.get('/portal/my-workday-hours', {
      params: { start_date: sd, end_date: end.substring(0, 10) }
    })
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
      const wdays = breakdown.filter(d => d.type === 'workday').length
      const hdays = breakdown.filter(d => d.type === 'holiday').length
      calcHint.value = `${wdays} 個工作日，合計 ${total_hours}h` + (hdays > 0 ? `，${hdays} 天國定假日不計` : '')
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
        // 計算扣除午休
        const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
        let minutes = toMin(dayEnd) - toMin(dayStart)
        // 扣午休（若時段橫跨 12:00-13:00）
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
    _fallbackCalc(start, end); calcBreakdown.value = []
  } finally { calcLoading.value = false }
}

// 整天/自訂時段模式的計算觸發
watch([() => form.start_date, () => form.end_date], ([start, end]) => {
  if (leaveMode.value === 'morning' || leaveMode.value === 'afternoon') return
  if (!start || !end) { calcHint.value = ''; calcBreakdown.value = []; return }
  const s = new Date(start), e = new Date(end)
  if (leaveMode.value === 'full' ? e < s : e <= s) { calcHint.value = ''; calcBreakdown.value = []; return }
  fetchCalc(start, end)
})

// 上午/下午模式的計算觸發
watch([leaveSingleDate, leaveMode], ([singleDate, mode]) => {
  if (mode !== 'morning' && mode !== 'afternoon') return
  calcBreakdown.value = []
  if (!singleDate) { calcHint.value = ''; form.start_date = ''; form.end_date = ''; return }
  if (mode === 'morning') {
    form.start_date = `${singleDate} 08:00:00`
    form.end_date = `${singleDate} 12:00:00`
    form.leave_hours = 4
  } else {
    form.start_date = `${singleDate} 13:00:00`
    form.end_date = `${singleDate} 17:00:00`
    form.leave_hours = 4
  }
  fetchCalc(singleDate, singleDate)
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

// ── 配額查詢 ──
const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])
const quotaInfo = ref(null)
const quotaLoading = ref(false)

const fetchQuota = async () => {
  if (!form.leave_type || !QUOTA_TYPES.has(form.leave_type)) { quotaInfo.value = null; return }
  quotaLoading.value = true
  try {
    const res = await api.get('/portal/my-quotas')
    quotaInfo.value = res.data.find(q => q.leave_type === form.leave_type) || null
  } catch { quotaInfo.value = null }
  finally { quotaLoading.value = false }
}
watch(() => form.leave_type, fetchQuota)

const quotaExceeded = computed(() =>
  !!(quotaInfo.value && form.leave_hours > quotaInfo.value.remaining_hours)
)

// 附件是否必填
const attachmentRequired = computed(() => ATTACHMENT_REQUIRED.has(form.leave_type))

// 是否可送出
const canSubmit = computed(() => !quotaExceeded.value)

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
  // 若原本是 45-59 分鐘，進位到下個小時
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

const uploadRef = ref(null)
const fileList = ref([])

const rules = {
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }],
  start_date: [{ required: true, message: '請選擇開始時間', trigger: 'change' }],
  end_date: [{ required: true, message: '請選擇結束時間', trigger: 'change' }],
  leave_hours: [
    { required: true, message: '請輸入時數', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value < 0.5) callback(new Error('請假時數至少 0.5 小時'))
        else if (Math.round(value * 2) !== value * 2) callback(new Error('請假時數必須為 0.5 小時的倍數'))
        else callback()
      },
      trigger: 'change',
    },
  ],
}

const formRef = ref(null)

const fetchLeaves = async () => {
  loading.value = true
  try {
    const res = await api.get('/portal/my-leaves', {
      params: { year: query.year, month: query.month },
    })
    leaves.value = res.data
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const openForm = () => {
  form.leave_type = ''
  form.start_date = ''
  form.end_date = ''
  form.leave_hours = 8
  form.reason = ''
  fileList.value = []
  calcHint.value = ''
  calcBreakdown.value = []
  quotaInfo.value = null
  leaveMode.value = 'full'
  leaveSingleDate.value = ''
  showForm.value = true
}

const handleExceed = () => {
  ElMessage.warning(`最多上傳 5 個附件`)
}

const beforeUpload = (file) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/heic', 'application/pdf']
  const maxSize = 5 * 1024 * 1024
  if (!allowed.includes(file.type) && !file.name.match(/\.(heic|heif)$/i)) {
    ElMessage.error('僅支援 JPG、PNG、GIF、HEIC、PDF 格式')
    return false
  }
  if (file.size > maxSize) {
    ElMessage.error(`${file.name} 超過 5 MB 限制`)
    return false
  }
  return true
}

const submitLeave = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 附件必填檢查
  if (attachmentRequired.value && fileList.value.length === 0) {
    const ltLabel = leaveTypes.find(t => t.value === form.leave_type)?.label || form.leave_type
    ElMessage.error(`申請「${ltLabel}」須上傳證明附件，請先選擇檔案`)
    return
  }

  // 配額超額阻擋
  if (quotaExceeded.value) {
    ElMessage.error('剩餘配額不足，無法送出')
    return
  }

  submitLoading.value = true
  try {
    // Step 1：建立請假記錄
    const sd = form.start_date ? form.start_date.substring(0, 10) : ''
    const st = form.start_date && form.start_date.length > 10 ? form.start_date.substring(11, 16) : ''
    const ed = form.end_date ? form.end_date.substring(0, 10) : ''
    const et = form.end_date && form.end_date.length > 10 ? form.end_date.substring(11, 16) : ''

    const res = await api.post('/portal/my-leaves', {
      leave_type: form.leave_type,
      start_date: sd,
      start_time: st,
      end_date: ed,
      end_time: et,
      leave_hours: form.leave_hours,
      reason: form.reason,
    })
    const leaveId = res.data.id

    // Step 2：上傳附件（若有選擇）
    const rawFiles = fileList.value.map(f => f.raw).filter(Boolean)
    if (rawFiles.length > 0) {
      const formData = new FormData()
      rawFiles.forEach(f => formData.append('files', f))
      await api.post(`/portal/my-leaves/${leaveId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    }

    ElMessage.success('請假申請已送出，待主管核准')
    showForm.value = false
    fetchLeaves()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '提交失敗')
  } finally {
    submitLoading.value = false
  }
}

// ── 附件預覽 ──
const attachDialogVisible = ref(false)
const attachItems = ref([])    // { url, isImage, name }
const attachLoading = ref(false)

const viewAttachments = async (row) => {
  attachItems.value = []
  attachDialogVisible.value = true
  attachLoading.value = true
  try {
    for (const filename of row.attachment_paths) {
      const res = await api.get(`/portal/my-leaves/${row.id}/attachments/${filename}`, {
        responseType: 'blob',
      })
      const isImage = /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(filename)
      attachItems.value.push({
        name: filename,
        url: URL.createObjectURL(res.data),
        isImage,
      })
    }
  } catch {
    ElMessage.error('載入附件失敗')
  } finally {
    attachLoading.value = false
  }
}

const closeAttachDialog = () => {
  attachItems.value.forEach(a => URL.revokeObjectURL(a.url))
  attachItems.value = []
  attachDialogVisible.value = false
}

const leaveStats = ref(null)

const fetchLeaveStats = async () => {
  try {
    const res = await api.get('/portal/my-leave-stats')
    leaveStats.value = res.data
  } catch {
    // silent
  }
}

onMounted(() => {
  fetchLeaves()
  fetchLeaveStats()
})
</script>

<template>
  <div class="portal-leave">
    <div class="page-header">
      <h2>請假申請</h2>
      <el-button type="primary" @click="openForm">新增請假</el-button>
    </div>

    <!-- Stats Card -->
    <el-card class="rules-card" v-if="leaveStats">
      <div class="stats-container">
        <div class="stat-item">
          <div class="stat-label">到職日期</div>
          <div class="stat-value">{{ leaveStats.hire_date || '未設定' }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">目前年資</div>
          <div class="stat-value">{{ leaveStats.seniority_years }} 年 {{ leaveStats.seniority_months }} 個月</div>
        </div>
        <div class="stat-item highlight">
          <div class="stat-label">法定特休 (週年制)</div>
          <div class="stat-value">{{ leaveStats.annual_leave_quota }} 天</div>
        </div>
        <div class="stat-item highlight">
          <div class="stat-label">今年已休 ({{ new Date().getFullYear() }})</div>
          <div class="stat-value">{{ leaveStats.annual_leave_used_days }} 天</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">剩餘可用 (概算)</div>
          <div class="stat-value">{{ Math.max(0, leaveStats.annual_leave_quota - leaveStats.annual_leave_used_days) }} 天</div>
        </div>
      </div>
    </el-card>

    <!-- 扣薪規則已隱藏 -->

    <!-- Leave history -->
    <el-card v-loading="loading">
      <div class="query-row">
        <el-select v-model="query.year" style="width: 100px;" @change="fetchLeaves">
          <el-option v-for="y in [2024,2025,2026,2027]" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="query.month" style="width: 100px;" @change="fetchLeaves">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
      </div>

      <el-table :data="leaves" border stripe style="margin-top: 12px;" max-height="600">
        <el-table-column prop="leave_type_label" label="假別" width="100" />
        <el-table-column label="開始時間" width="140">
          <template #default="{ row }">
            {{ row.start_date }} {{ row.start_time || '' }}
          </template>
        </el-table-column>
        <el-table-column label="結束時間" width="140">
          <template #default="{ row }">
            {{ row.end_date }} {{ row.end_time || '' }}
          </template>
        </el-table-column>
        <el-table-column prop="leave_hours" label="時數" width="80" />
        <el-table-column prop="reason" label="原因" />
        <el-table-column label="附件" width="70" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.attachment_paths && row.attachment_paths.length > 0"
              link
              type="primary"
              size="small"
              @click="viewAttachments(row)"
            >
              <el-icon><Paperclip /></el-icon>
              {{ row.attachment_paths.length }}
            </el-button>
            <span v-else class="text-secondary" style="font-size: 12px;">—</span>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.is_approved === true" type="success" size="small">已核准</el-tag>
            <template v-else-if="row.is_approved === false">
              <el-tag type="danger" size="small">已駁回</el-tag>
              <el-tooltip v-if="row.rejection_reason" :content="`駁回原因：${row.rejection_reason}`" placement="top">
                <el-icon style="margin-left:4px;color:var(--el-color-danger);cursor:help;vertical-align:middle;"><InfoFilled /></el-icon>
              </el-tooltip>
            </template>
            <el-tag v-else type="warning" size="small">待核准</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="approved_by" label="核准人" width="100">
          <template #default="{ row }">
            {{ row.approved_by === 'Admin' ? '管理員' : row.approved_by }}
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && leaves.length === 0" description="本月無請假記錄" />
    </el-card>

    <!-- New leave dialog -->
    <el-dialog v-model="showForm" title="新增請假申請" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="假別" prop="leave_type">
          <el-select v-model="form.leave_type" placeholder="請選擇" style="width: 100%;">
            <el-option v-for="lt in leaveTypes" :key="lt.value" :label="lt.label" :value="lt.value">
              <span>{{ lt.label }}</span>
              <el-tag
                size="small"
                :type="lt.deduction.includes('不扣') ? 'success' : lt.deduction.includes('半') ? 'warning' : 'danger'"
              >{{ lt.deduction }}</el-tag>
            </el-option>
          </el-select>
          <div style="margin-top: 5px; font-size: 12px; min-height: 20px;">
            <span v-if="quotaLoading" style="color: var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align:middle;"><Loading /></el-icon> 查詢配額…
            </span>
            <template v-else-if="quotaInfo">
              <el-tag size="small" :type="quotaInfo.remaining_hours <= 0 ? 'danger' : quotaInfo.remaining_hours < 16 ? 'warning' : 'success'" style="margin-right:6px;">
                剩餘 {{ quotaInfo.remaining_hours }}h
              </el-tag>
              <span style="color:var(--el-text-color-secondary);">
                已用 {{ quotaInfo.used_hours }}h
                <template v-if="quotaInfo.pending_hours > 0">／待審 {{ quotaInfo.pending_hours }}h</template>
                ／總計 {{ quotaInfo.total_hours }}h
              </span>
            </template>
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
            <el-date-picker v-model="form.start_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" placeholder="例如: 2026-02-23 08:30" style="width: 100%;" />
          </el-form-item>
          <el-form-item label="結束時間" prop="end_date">
            <el-date-picker v-model="form.end_date" type="datetime" format="YYYY-MM-DD HH:mm" value-format="YYYY-MM-DD HH:mm:ss" placeholder="例如: 2026-02-23 17:30" style="width: 100%;" :disabled-date="disabledEndDate" />
          </el-form-item>
        </template>
        <el-form-item label="請假時數" prop="leave_hours">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-input-number v-model="form.leave_hours" :min="0.5" :max="240" :step="0.5" disabled />
            <el-tooltip v-if="calcTooltipHtml" placement="right" :content="calcTooltipHtml" raw-content>
              <el-icon style="cursor: help; color: var(--el-color-info); font-size: 16px;"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <div style="margin-top:5px;font-size:12px;">
            <span v-if="calcLoading && leaveMode !== 'morning' && leaveMode !== 'afternoon'" style="color:var(--el-color-info);">
              <el-icon class="is-loading" style="vertical-align:middle;"><Loading /></el-icon> 查詢排班中…
            </span>
            <span v-else-if="calcHint" style="color:var(--el-color-info);">{{ calcHint }}</span>
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
        <!-- 每日排班明細（≤14 天才展開） -->
        <el-form-item v-if="!calcLoading && calcBreakdown.length && calcBreakdown.length <= 14" label="每日明細">
          <div class="portal-breakdown">
            <div v-for="day in calcBreakdown" :key="day.date" class="pb-row" :class="day.type">
              <span class="pb-date">{{ day.date }}</span>
              <el-tag size="small" :type="day.type==='workday'?'':day.type==='holiday'?'danger':'info'" class="pb-tag">
                {{ day.type==='workday' ? (day.shift||'預設班')+(day.work_start?` ${day.work_start}–${day.work_end}`:'') : day.type==='holiday' ? day.holiday_name : '週末' }}
              </el-tag>
              <span class="pb-hours">{{ day.type==='workday' ? `${day.hours}h` : '—' }}</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="原因" prop="reason">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請輸入請假原因" />
        </el-form-item>

        <!-- 附件上傳（需要證明的假別才顯示提示） -->
        <el-form-item label="證明附件" :required="attachmentRequired">
          <div class="upload-wrapper">
            <el-upload
              ref="uploadRef"
              v-model:file-list="fileList"
              :auto-upload="false"
              :limit="5"
              accept=".jpg,.jpeg,.png,.gif,.heic,.heif,.pdf"
              multiple
              list-type="text"
              :before-upload="beforeUpload"
              :on-exceed="handleExceed"
            >
              <el-button size="small" plain>
                <el-icon><Upload /></el-icon>&nbsp;選擇檔案
              </el-button>
            </el-upload>
            <div class="upload-tip">
              可選：附上相關證明文件（圖片或 PDF，最多 5 個，單檔 5 MB）
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" :disabled="!canSubmit" @click="submitLeave">送出申請</el-button>
      </template>
    </el-dialog>

    <!-- 附件預覽 Dialog -->
    <el-dialog
      v-model="attachDialogVisible"
      title="假單附件"
      width="640px"
      :before-close="closeAttachDialog"
    >
      <div v-if="attachLoading" class="attach-loading">
        <el-icon class="is-loading"><Loading /></el-icon> 載入中…
      </div>
      <div v-else-if="attachItems.length === 0" class="text-secondary" style="text-align:center;padding:24px">
        無附件
      </div>
      <div v-else class="attach-grid">
        <div v-for="(item, i) in attachItems" :key="i" class="attach-item">
          <el-image
            v-if="item.isImage"
            :src="item.url"
            :preview-src-list="attachItems.filter(a => a.isImage).map(a => a.url)"
            :initial-index="attachItems.filter(a => a.isImage).findIndex(a => a.url === item.url)"
            fit="cover"
            class="attach-thumb"
          />
          <a
            v-else
            :href="item.url"
            :download="item.name"
            class="attach-file"
          >
            <el-icon :size="32"><Document /></el-icon>
            <span class="attach-file__name">{{ item.name }}</span>
            <span class="attach-file__hint">點擊下載</span>
          </a>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.rules-card {
  margin-bottom: var(--space-4);
}

.stats-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--space-5);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--space-4);
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.stat-item.highlight {
  background-color: var(--surface-color);
  border-color: var(--color-primary-soft);
  box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.1);
}

.stat-item.highlight .stat-value {
  color: var(--color-primary);
  font-weight: 700;
  font-size: var(--text-2xl);
}

.stat-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.stat-value {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.rules-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* Upload */
.upload-wrapper {
  width: 100%;
}

.upload-tip {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  line-height: 1.4;
}

.deduction-hint {
  margin-top: 4px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

/* Attachment viewer */
.attach-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  padding: 24px;
  justify-content: center;
}

.attach-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--space-4);
}

.attach-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.attach-thumb {
  width: 100%;
  height: 140px;
  display: block;
}

.attach-file {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--space-5);
  text-decoration: none;
  color: var(--text-primary);
  height: 140px;
  transition: background-color 0.2s;
}

.attach-file:hover {
  background-color: var(--bg-color-soft);
}

.attach-file__name {
  font-size: var(--text-xs);
  text-align: center;
  word-break: break-all;
  color: var(--text-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-file__hint {
  font-size: var(--text-xs);
  color: var(--color-primary);
}

/* 每日排班明細 */
.portal-breakdown {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--el-border-radius-base);
  padding: 6px;
  background: var(--el-fill-color-extra-light);
}
.pb-row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; font-size: 12px; }
.pb-row.weekend, .pb-row.holiday { opacity: 0.55; }
.pb-date { min-width: 82px; font-variant-numeric: tabular-nums; }
.pb-tag { flex: 1; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-hours { min-width: 32px; text-align: right; font-weight: 600; color: var(--el-color-primary); }
.pb-row.weekend .pb-hours, .pb-row.holiday .pb-hours { color: var(--el-text-color-secondary); font-weight: 400; }

.query-row {
  display: flex;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .query-row {
    flex-wrap: wrap;
  }

  .rules-grid {
    flex-direction: column;
    gap: 8px;
  }

  .stats-container {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .stat-value {
    font-size: var(--text-base);
  }
}
</style>
