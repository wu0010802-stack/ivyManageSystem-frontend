<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const loading = ref(false)
const submitLoading = ref(false)
const overtimes = ref([])

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const overtimeTypes = [
  { value: 'weekday', label: '平日', info: '前2hr 1.34倍, 後2hr 1.67倍' },
  { value: 'weekend', label: '假日', info: '全部 2倍' },
  { value: 'holiday', label: '國定假日', info: '全部 2倍' },
]

const showForm = ref(false)
const form = reactive({
  overtime_date: '',
  overtime_type: 'weekday',
  start_time: '',
  end_time: '',
  hours: 0,
  reason: '',
})
const typeDetecting = ref(false)
const typeHint = ref('')   // 顯示偵測結果說明

const rules = {
  overtime_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  overtime_type: [{ required: true, message: '請選擇類型', trigger: 'change' }],
  hours: [
    { required: true, type: 'number', message: '請填入時數', trigger: 'change' },
    { type: 'number', min: 0.5, message: '至少 0.5 小時', trigger: 'change' },
  ],
}

const formRef = ref(null)

const fetchOvertimes = async () => {
  loading.value = true
  try {
    const res = await api.get('/portal/my-overtimes', {
      params: { year: query.year, month: query.month },
    })
    overtimes.value = res.data
  } catch (error) {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const openForm = () => {
  form.overtime_date = ''
  form.overtime_type = 'weekday'
  form.start_time = ''
  form.end_time = ''
  form.hours = 0
  form.reason = ''
  typeHint.value = ''
  showForm.value = true
}

// ── 根據日期自動偵測加班類型 ──
watch(() => form.overtime_date, async (dateStr) => {
  if (!dateStr) { typeHint.value = ''; return }
  typeDetecting.value = true
  try {
    // 用 workday-hours API 查詢該日的 type
    const res = await api.get('/portal/my-workday-hours', {
      params: { start_date: dateStr, end_date: dateStr },
    })
    const bd = res.data.breakdown
    if (bd && bd.length > 0) {
      const day = bd[0]
      if (day.type === 'holiday') {
        form.overtime_type = 'holiday'
        typeHint.value = `國定假日（${day.holiday_name}）`
      } else if (day.type === 'weekend') {
        form.overtime_type = 'weekend'
        typeHint.value = '假日（週末）'
      } else {
        form.overtime_type = 'weekday'
        typeHint.value = `平日${day.shift ? `（${day.shift}）` : ''}`
      }
    }
  } catch {
    // API 失敗時用星期幾判斷
    const d = new Date(dateStr)
    const wd = d.getDay()
    if (wd === 0 || wd === 6) {
      form.overtime_type = 'weekend'
      typeHint.value = '假日（週末）'
    } else {
      form.overtime_type = 'weekday'
      typeHint.value = '平日'
    }
  } finally {
    typeDetecting.value = false
  }
})

// ── 根據起迄時間自動計算時數 ──
const timeError = ref('')
const calcHours = () => {
  timeError.value = ''
  if (!form.start_time || !form.end_time) return
  if (form.end_time <= form.start_time) {
    timeError.value = '結束時間必須晚於開始時間'
    form.hours = 0
    return
  }
  const [sh, sm] = form.start_time.split(':').map(Number)
  const [eh, em] = form.end_time.split(':').map(Number)
  let minutes = (eh * 60 + em) - (sh * 60 + sm)
  form.hours = Math.max(0.5, Math.round(minutes / 60 * 2) / 2)
}
watch(() => form.start_time, calcHours)
watch(() => form.end_time, calcHours)

// ── 類型標籤顯示 ──
const typeLabel = computed(() => {
  const t = overtimeTypes.find(o => o.value === form.overtime_type)
  return t ? t.label : ''
})

const submitOvertime = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  if (form.hours < 0.5) {
    ElMessage.warning('請先填入開始與結束時間')
    return
  }

  submitLoading.value = true
  try {
    const payload = {
      overtime_date: form.overtime_date,
      overtime_type: form.overtime_type,
      hours: form.hours,
      reason: form.reason,
    }
    if (form.start_time) payload.start_time = form.start_time
    if (form.end_time) payload.end_time = form.end_time

    const res = await api.post('/portal/my-overtimes', payload)
    ElMessage.success(`加班申請已送出，預估加班費: NT$ ${res.data.overtime_pay}`)
    showForm.value = false
    fetchOvertimes()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '提交失敗')
  } finally {
    submitLoading.value = false
  }
}

const withdrawOvertime = async (id) => {
  try {
    await api.delete(`/portal/my-overtimes/${id}`)
    ElMessage.success('加班申請已撤回')
    fetchOvertimes()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '撤回失敗')
  }
}

const totalHours = () => overtimes.value.reduce((sum, o) => sum + o.hours, 0)
const totalPay = () => overtimes.value.reduce((sum, o) => sum + (o.overtime_pay || 0), 0)

onMounted(fetchOvertimes)
</script>

<template>
  <div class="portal-overtime">
    <div class="page-header">
      <h2>加班申請</h2>
      <el-button type="primary" @click="openForm">新增加班</el-button>
    </div>

    <!-- Pay rules -->
    <el-card class="rules-card">
      <h4 style="margin: 0 0 8px 0;">加班費計算方式</h4>
      <div class="rules-grid">
        <div v-for="ot in overtimeTypes" :key="ot.value" class="rule-item">
          <el-tag size="small">{{ ot.label }}</el-tag>
          <span>{{ ot.info }}</span>
        </div>
      </div>
    </el-card>

    <!-- Records -->
    <el-card v-loading="loading">
      <div class="query-row">
        <el-select v-model="query.year" style="width: 100px;" @change="fetchOvertimes">
          <el-option v-for="y in [2024,2025,2026,2027]" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="query.month" style="width: 100px;" @change="fetchOvertimes">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
        <div class="month-total" v-if="overtimes.length">
          本月合計: {{ totalHours() }} 小時 / NT$ {{ totalPay() }}
        </div>
      </div>

      <div style="overflow-x: auto">
      <el-table :data="overtimes" border stripe style="margin-top: 12px;">
        <el-table-column prop="overtime_date" label="日期" width="120" />
        <el-table-column prop="overtime_type_label" label="類型" width="100" />
        <el-table-column prop="start_time" label="開始" width="80" />
        <el-table-column prop="end_time" label="結束" width="80" />
        <el-table-column prop="hours" label="時數" width="80" />
        <el-table-column prop="overtime_pay" label="加班費" width="100">
          <template #default="{ row }">
            NT$ {{ row.overtime_pay }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" />
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.is_approved === true" type="success" size="small">已核准</el-tag>
            <el-tag v-else-if="row.is_approved === false" type="danger" size="small">已駁回</el-tag>
            <el-tag v-else type="warning" size="small">待核准</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ row }">
            <el-popconfirm
              v-if="row.is_approved === null || row.is_approved === undefined"
              title="確定撤回此加班申請？"
              confirm-button-text="撤回"
              cancel-button-text="取消"
              @confirm="withdrawOvertime(row.id)"
            >
              <template #reference>
                <el-button type="danger" size="small" plain>撤回</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>

      </div>
      <el-empty v-if="!loading && overtimes.length === 0" description="本月無加班記錄" />
    </el-card>

    <!-- New overtime dialog -->
    <el-dialog v-model="showForm" title="新增加班申請" width="500px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="日期" prop="overtime_date">
          <el-date-picker v-model="form.overtime_date" type="date" value-format="YYYY-MM-DD" placeholder="選擇加班日期" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="類型" prop="overtime_type">
          <div style="display: flex; align-items: center; gap: 8px;">
            <el-tag v-if="typeDetecting" type="info" size="default">
              <el-icon class="is-loading" style="vertical-align: middle;"><Loading /></el-icon> 偵測中…
            </el-tag>
            <el-tag v-else-if="form.overtime_date" :type="form.overtime_type === 'weekday' ? '' : form.overtime_type === 'weekend' ? 'warning' : 'danger'" size="default">
              {{ typeLabel }}
            </el-tag>
            <span v-else style="color: var(--el-text-color-placeholder);">請先選擇日期</span>
            <span v-if="typeHint" style="font-size: 12px; color: var(--el-text-color-secondary);">{{ typeHint }}</span>
          </div>
        </el-form-item>
        <el-form-item label="開始時間" required>
          <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="選擇開始時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="結束時間" required :error="timeError">
          <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="選擇結束時間" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="時數" prop="hours">
          <el-input-number v-model="form.hours" :min="0.5" :max="12" :step="0.5" disabled />
          <span v-if="form.hours > 0" style="margin-left: 8px; font-size: 12px; color: var(--el-text-color-secondary);">
            由開始/結束時間自動計算
          </span>
        </el-form-item>
        <el-form-item label="原因">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請輸入加班原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" :disabled="!form.overtime_date || form.hours < 0.5 || !!timeError" @click="submitOvertime">送出申請</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rules-card { margin-bottom: var(--space-4); }

.rules-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.query-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.month-total {
  margin-left: auto;
  font-weight: 600;
  color: var(--color-primary);
}

@media (max-width: 767px) {
  .query-row {
    flex-wrap: wrap;
  }

  .month-total {
    margin-left: 0;
    width: 100%;
    font-size: var(--text-sm);
  }

  .rules-grid {
    flex-direction: column;
    gap: 8px;
  }
}

</style>
