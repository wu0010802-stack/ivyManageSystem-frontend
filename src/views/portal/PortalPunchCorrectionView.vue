<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

const loading = ref(false)
const submitLoading = ref(false)
const corrections = ref([])

const now = new Date()
const query = reactive({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
})

const correctionTypes = [
  { value: 'punch_in',  label: '補上班打卡', description: '有下班記錄，但缺上班記錄' },
  { value: 'punch_out', label: '補下班打卡', description: '有上班記錄，但缺下班記錄' },
  { value: 'both',      label: '補全天打卡', description: '整日無任何打卡記錄' },
]

const showForm = ref(false)
const form = reactive({
  attendance_date: '',
  correction_type: 'punch_out',
  requested_punch_in_time: '',
  requested_punch_out_time: '',
  reason: '',
})

const formRef = ref(null)

const disabledDate = (time) => {
  return time.getTime() > Date.now()
}

const showPunchIn = computed(() =>
  form.correction_type === 'punch_in' || form.correction_type === 'both'
)
const showPunchOut = computed(() =>
  form.correction_type === 'punch_out' || form.correction_type === 'both'
)

const rules = {
  attendance_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  correction_type: [{ required: true, message: '請選擇補正類型', trigger: 'change' }],
  reason: [{ required: false }],
}

const fetchCorrections = async () => {
  loading.value = true
  try {
    const res = await api.get('/portal/my-punch-corrections', {
      params: { year: query.year, month: query.month },
    })
    corrections.value = res.data
  } catch {
    ElMessage.error('載入失敗')
  } finally {
    loading.value = false
  }
}

const openForm = () => {
  form.attendance_date = ''
  form.correction_type = 'punch_out'
  form.requested_punch_in_time = ''
  form.requested_punch_out_time = ''
  form.reason = ''
  showForm.value = true
}

const buildDatetime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null
  return `${dateStr}T${timeStr}:00`
}

const submitCorrection = async () => {
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  // 前端驗證：依補正類型確認時間已填
  if (showPunchIn.value && !form.requested_punch_in_time) {
    ElMessage.warning('請填寫申請上班時間')
    return
  }
  if (showPunchOut.value && !form.requested_punch_out_time) {
    ElMessage.warning('請填寫申請下班時間')
    return
  }

  submitLoading.value = true
  try {
    const payload = {
      attendance_date: form.attendance_date,
      correction_type: form.correction_type,
      requested_punch_in: buildDatetime(form.attendance_date, form.requested_punch_in_time),
      requested_punch_out: buildDatetime(form.attendance_date, form.requested_punch_out_time),
      reason: form.reason || null,
    }

    await api.post('/portal/my-punch-corrections', payload)
    ElMessage.success('補打卡申請已送出，待主管核准')
    showForm.value = false
    fetchCorrections()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '提交失敗')
  } finally {
    submitLoading.value = false
  }
}

const statusTagType = (status) => {
  if (status === 'approved') return 'success'
  if (status === 'rejected') return 'danger'
  return 'warning'
}

const statusLabel = (status) => {
  if (status === 'approved') return '已核准'
  if (status === 'rejected') return '已駁回'
  return '待核准'
}

const correctionTypeTagType = (type) => {
  if (type === 'punch_in') return 'warning'
  if (type === 'punch_out') return 'info'
  return 'danger'
}

const formatTime = (isoStr) => {
  if (!isoStr) return '-'
  return isoStr.slice(11, 16)
}

onMounted(fetchCorrections)
</script>

<template>
  <div class="portal-punch-correction">
    <div class="page-header">
      <h2>補打卡申請</h2>
      <el-button type="primary" @click="openForm">新增申請</el-button>
    </div>

    <el-card class="notice-card">
      <div class="notice-content">
        <el-icon style="color: var(--el-color-warning); font-size: 16px;"><Warning /></el-icon>
        <span>若您遺忘打卡，請在此提交補打卡申請，由主管審核後系統將自動補正考勤記錄。</span>
      </div>
      <div class="type-grid">
        <div v-for="t in correctionTypes" :key="t.value" class="type-item">
          <el-tag :type="correctionTypeTagType(t.value)" size="small">{{ t.label }}</el-tag>
          <span>{{ t.description }}</span>
        </div>
      </div>
    </el-card>

    <el-card v-loading="loading">
      <div class="query-row">
        <el-select v-model="query.year" style="width: 100px;" @change="fetchCorrections">
          <el-option v-for="y in [2024,2025,2026,2027]" :key="y" :label="`${y}年`" :value="y" />
        </el-select>
        <el-select v-model="query.month" style="width: 100px;" @change="fetchCorrections">
          <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
        </el-select>
      </div>

      <el-table :data="corrections" border stripe style="margin-top: 12px;">
        <el-table-column prop="attendance_date" label="申請日期" width="120" />
        <el-table-column label="補正類型" width="120">
          <template #default="{ row }">
            <el-tag :type="correctionTypeTagType(row.correction_type)" size="small">
              {{ row.correction_type_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申請上班" width="100">
          <template #default="{ row }">
            {{ formatTime(row.requested_punch_in) }}
          </template>
        </el-table-column>
        <el-table-column label="申請下班" width="100">
          <template #default="{ row }">
            {{ formatTime(row.requested_punch_out) }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="說明原因" />
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.approval_status)" size="small">
              {{ statusLabel(row.approval_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="approved_by" label="核准人" width="100" />
        <el-table-column label="駁回原因" min-width="120">
          <template #default="{ row }">
            <span v-if="row.rejection_reason" style="color: var(--el-color-danger); font-size: 12px;">
              {{ row.rejection_reason }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && corrections.length === 0" description="本月無補打卡申請記錄" />
    </el-card>

    <!-- 申請對話框 -->
    <el-dialog v-model="showForm" title="新增補打卡申請" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="申請日期" prop="attendance_date">
          <el-date-picker
            v-model="form.attendance_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="選擇遺漏打卡的日期"
            :disabled-date="disabledDate"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="補正類型" prop="correction_type">
          <el-select v-model="form.correction_type" style="width: 100%;">
            <el-option
              v-for="t in correctionTypes"
              :key="t.value"
              :label="t.label"
              :value="t.value"
            >
              <div style="display: flex; justify-content: space-between;">
                <span>{{ t.label }}</span>
                <span style="color: var(--el-text-color-placeholder); font-size: 12px;">{{ t.description }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item v-if="showPunchIn" label="申請上班時間" required>
          <el-time-picker
            v-model="form.requested_punch_in_time"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="選擇申請上班時間"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item v-if="showPunchOut" label="申請下班時間" required>
          <el-time-picker
            v-model="form.requested_punch_out_time"
            format="HH:mm"
            value-format="HH:mm"
            placeholder="選擇申請下班時間"
            style="width: 100%;"
          />
        </el-form-item>
        <el-form-item label="說明原因">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            placeholder="請說明遺忘打卡的原因（選填）"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showForm = false">取消</el-button>
        <el-button
          type="primary"
          :loading="submitLoading"
          :disabled="!form.attendance_date"
          @click="submitCorrection"
        >
          送出申請
        </el-button>
      </template>
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

.page-header h2 {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text-primary);
}

.notice-card {
  margin-bottom: var(--space-4);
}

.notice-content {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.type-item {
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

@media (max-width: 767px) {
  .type-grid {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
