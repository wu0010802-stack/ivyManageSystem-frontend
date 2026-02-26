<script setup>
import { ref, reactive, computed, watch } from 'vue'
import api from '@/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, Search } from '@element-plus/icons-vue'
import { downloadFile } from '@/utils/download'
import EmptyState from '@/components/common/EmptyState.vue'

const activeTab = ref('upload')
const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

// ---- Upload ----
const uploading = ref(false)
const uploadResult = ref(null)
const csvText = ref('')

const handleExcelUpload = async (options) => {
  uploading.value = true
  uploadResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', options.file)
    const response = await api.post('/attendance/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    uploadResult.value = response.data
    ElMessage.success(response.data.message || '匯入完成')
  } catch (error) {
    ElMessage.error('上傳失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    uploading.value = false
  }
}

const handleCsvImport = async () => {
  if (!csvText.value.trim()) {
    ElMessage.warning('請貼上 CSV 資料')
    return
  }

  uploading.value = true
  uploadResult.value = null
  try {
    // Parse CSV/TSV text into records
    const lines = csvText.value.trim().split('\n')
    if (lines.length < 2) {
      ElMessage.warning('資料至少需要標題行和一行資料')
      uploading.value = false
      return
    }

    // Detect separator (tab or comma)
    const separator = lines[0].includes('\t') ? '\t' : ','
    const headers = lines[0].split(separator).map(h => h.trim())

    const records = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map(c => c.trim())
      if (cols.length < 4) continue

      records.push({
        department: cols[0] || '',
        employee_number: cols[1] || '',
        name: cols[2] || '',
        date: cols[3] || '',
        weekday: cols[4] || '',
        punch_in: cols[5] || '',
        punch_out: cols[6] || ''
      })
    }

    if (records.length === 0) {
      ElMessage.warning('未解析到有效資料')
      uploading.value = false
      return
    }

    const response = await api.post('/attendance/upload-csv', { records })
    uploadResult.value = response.data.results || response.data
    ElMessage.success(response.data.message || '匯入完成')
  } catch (error) {
    ElMessage.error('匯入失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    uploading.value = false
  }
}

// ---- Query ----
const query = reactive({ year: currentYear, month: currentMonth })
const loadingRecords = ref(false)
const hasQueried = ref(false)
const attendanceRecords = ref([])
const summaryData = ref([])

const fetchRecords = async () => {
  loadingRecords.value = true
  try {
    const response = await api.get('/attendance/records', {
      params: { year: query.year, month: query.month }
    })
    attendanceRecords.value = response.data
  } catch (error) {
    ElMessage.error('查詢失敗')
  } finally {
    loadingRecords.value = false
  }
}

const fetchSummary = async () => {
  loadingRecords.value = true
  try {
    const response = await api.get('/attendance/summary', {
      params: { year: query.year, month: query.month }
    })
    summaryData.value = response.data
  } catch (error) {
    ElMessage.error('統計查詢失敗')
  } finally {
    loadingRecords.value = false
  }
}

const exportAttendance = () => {
  downloadFile(`/exports/attendance?year=${query.year}&month=${query.month}`, `${query.year}年${query.month}月出勤月報.xlsx`)
}

const queryAttendance = async () => {
  await Promise.all([fetchRecords(), fetchSummary()])
  hasQueried.value = true
}

const deleteMonthRecords = () => {
  ElMessageBox.confirm(
    `確定要刪除 ${query.year} 年 ${query.month} 月的所有考勤記錄嗎？此操作不可復原。`,
    '警告',
    { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' }
  ).then(async () => {
    try {
      await api.delete(`/attendance/records/${query.year}/${query.month}`)
      ElMessage.success('已刪除')
      attendanceRecords.value = []
      summaryData.value = []
    } catch (error) {
      ElMessage.error('刪除失敗: ' + (error.response?.data?.detail || error.message))
    }
  }).catch(() => {})
}

const getStatusType = (row) => {
  if (row.status === 'normal') return 'success'
  if (row.is_late || row.is_early_leave) return 'warning'
  return 'danger'
}

const getStatusLabel = (row) => {
  const parts = []
  if (row.is_late) parts.push(`遲到${row.late_minutes}分`)
  if (row.is_early_leave) parts.push(`早退${row.early_leave_minutes}分`)
  if (row.is_missing_punch_in) parts.push('未打卡(上)')
  if (row.is_missing_punch_out) parts.push('未打卡(下)')
  return parts.length ? parts.join(', ') : '正常'
}

// Unique employee filter for records table
const employeeFilter = ref('')
const debouncedFilter = ref('')
let _filterTimer = null
watch(employeeFilter, (val) => {
  clearTimeout(_filterTimer)
  _filterTimer = setTimeout(() => { debouncedFilter.value = val }, 300)
})
const filteredRecords = computed(() => {
  if (!debouncedFilter.value) return attendanceRecords.value
  return attendanceRecords.value.filter(r => r.employee_name.includes(debouncedFilter.value))
})
</script>

<template>
  <div class="attendance-page">
    <h2>考勤管理</h2>

    <el-tabs v-model="activeTab" type="card">
      <!-- 匯入打卡記錄 -->
      <el-tab-pane label="匯入打卡記錄" name="upload">
        <el-row :gutter="20">
          <!-- Excel Upload -->
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><div class="card-header"><span>Excel 上傳</span></div></template>
              <p class="desc-text">
                支援欄位格式：部門, 編號, 姓名, 日期, 星期, 上班時間, 下班時間
              </p>
              <el-upload
                drag
                action=""
                :http-request="handleExcelUpload"
                :show-file-list="false"
                accept=".xlsx,.xls"
                :disabled="uploading"
              >
                <el-icon class="el-icon--upload" :size="40"><UploadFilled /></el-icon>
                <div class="el-upload__text">
                  拖曳檔案到此處，或 <em>點擊上傳</em>
                </div>
                <template #tip>
                  <div class="el-upload__tip">僅支援 .xlsx / .xls 格式</div>
                </template>
              </el-upload>
            </el-card>
          </el-col>

          <!-- CSV Paste -->
          <el-col :span="12">
            <el-card shadow="never">
              <template #header><div class="card-header"><span>CSV / Excel 貼上</span></div></template>
              <p class="desc-text">
                從 Excel 複製資料後貼到下方（Tab 分隔）。<br>
                格式：部門, 編號, 姓名, 日期, 星期, 上班時間, 下班時間
              </p>
              <el-input
                v-model="csvText"
                type="textarea"
                :rows="8"
                placeholder="部門&#9;編號&#9;姓名&#9;日期&#9;星期&#9;上班時間&#9;下班時間
行政部&#9;E001&#9;王小明&#9;2026/02/01&#9;一&#9;08:00&#9;17:00"
              />
              <el-button
                type="primary"
                style="margin-top: 12px;"
                :loading="uploading"
                @click="handleCsvImport"
              >匯入</el-button>
            </el-card>
          </el-col>
        </el-row>

        <!-- Upload Result -->
        <el-card v-if="uploadResult" shadow="never" style="margin-top: 20px;">
          <template #header><div class="card-header"><span>匯入結果</span></div></template>
          <el-alert
            :title="`成功 ${uploadResult.success || 0} 筆，失敗 ${uploadResult.failed || uploadResult.anomaly_count || 0} 筆`"
            :type="(uploadResult.failed || uploadResult.anomaly_count) ? 'warning' : 'success'"
            show-icon
            :closable="false"
            style="margin-bottom: 16px;"
          />

          <!-- Summary table -->
          <el-table
            v-if="uploadResult.summary && uploadResult.summary.length"
            :data="uploadResult.summary"
            border
            stripe
            style="width: 100%"
            max-height="400"
          >
            <el-table-column prop="員工姓名" label="姓名" width="120" />
            <el-table-column prop="總出勤天數" label="出勤天數" width="100" />
            <el-table-column prop="正常天數" label="正常" width="80" />
            <el-table-column prop="遲到次數" label="遲到" width="80">
              <template #default="scope">
                <span :style="scope.row['遲到次數'] > 0 ? 'color: var(--color-warning); font-weight: bold;' : ''">
                  {{ scope.row['遲到次數'] }}
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="早退次數" label="早退" width="80" />
            <el-table-column prop="未打卡(上班)" label="未打卡(上)" width="100" />
            <el-table-column prop="未打卡(下班)" label="未打卡(下)" width="100" />
            <el-table-column prop="遲到總分鐘" label="遲到分鐘" width="100" />
          </el-table>

          <!-- Errors -->
          <div v-if="uploadResult.errors && uploadResult.errors.length" style="margin-top: 12px;">
            <div class="section-title">錯誤訊息</div>
            <ul class="error-list">
              <li v-for="(err, i) in uploadResult.errors" :key="i">{{ err }}</li>
            </ul>
          </div>
          <div v-if="uploadResult.anomalies && uploadResult.anomalies.length" style="margin-top: 12px;">
            <div class="section-title">異常訊息</div>
            <ul class="error-list">
              <li v-for="(err, i) in uploadResult.anomalies" :key="i">{{ typeof err === 'string' ? err : JSON.stringify(err) }}</li>
            </ul>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 考勤查詢 -->
      <el-tab-pane label="考勤查詢" name="query">
        <el-card class="control-panel" shadow="never">
          <div class="controls">
            <el-select v-model="query.year" style="width: 110px;">
              <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
            </el-select>
            <el-select v-model="query.month" style="width: 90px;">
              <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
            </el-select>
            <el-button type="primary" :loading="loadingRecords" @click="queryAttendance">查詢</el-button>
            <el-button type="success" @click="exportAttendance">匯出月報</el-button>
            <el-button type="danger" @click="deleteMonthRecords">刪除該月記錄</el-button>
            <el-input
              v-model="employeeFilter"
              placeholder="篩選姓名"
              style="width: 140px; margin-left: auto;"
              clearable
            />
          </div>
        </el-card>

        <!-- Summary -->
        <div v-if="summaryData.length > 0" style="margin-top: 16px;">
          <h3>月統計摘要</h3>
          <el-table :data="summaryData" border stripe style="width: 100%" max-height="300">
            <el-table-column prop="employee_name" label="姓名" width="100" sortable />
            <el-table-column prop="total_days" label="出勤天數" width="100" sortable />
            <el-table-column prop="normal_days" label="正常" width="80" />
            <el-table-column prop="late_count" label="遲到" width="80" sortable>
              <template #default="scope">
                <el-tag v-if="scope.row.late_count > 0" type="warning" size="small">{{ scope.row.late_count }}</el-tag>
                <span v-else>0</span>
              </template>
            </el-table-column>
            <el-table-column prop="early_leave_count" label="早退" width="80" />
            <el-table-column prop="missing_punch_in" label="未打卡(上)" width="100" />
            <el-table-column prop="missing_punch_out" label="未打卡(下)" width="100" />
            <el-table-column prop="total_late_minutes" label="遲到分鐘" width="100" sortable />
          </el-table>
        </div>

        <!-- Detail Records -->
        <div v-if="filteredRecords.length > 0" style="margin-top: 20px;">
          <h3>明細記錄 ({{ filteredRecords.length }} 筆)</h3>
          <el-table :data="filteredRecords" border stripe style="width: 100%" max-height="500" v-loading="loadingRecords">
            <el-table-column prop="employee_name" label="姓名" width="100" sortable />
            <el-table-column prop="date" label="日期" width="120" sortable />
            <el-table-column prop="weekday" label="星期" width="60" />
            <el-table-column prop="punch_in" label="上班" width="80">
              <template #default="scope">{{ scope.row.punch_in || '-' }}</template>
            </el-table-column>
            <el-table-column prop="punch_out" label="下班" width="80">
              <template #default="scope">{{ scope.row.punch_out || '-' }}</template>
            </el-table-column>
            <el-table-column label="狀態" width="200">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row)" size="small">{{ getStatusLabel(scope.row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="備註" min-width="100" />
          </el-table>
        </div>

        <EmptyState
          v-if="hasQueried && !loadingRecords && attendanceRecords.length === 0"
          :icon="Search"
          title="查無考勤記錄"
          :description="`${query.year} 年 ${query.month} 月尚無考勤資料，請先匯入打卡記錄`"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-3);
}
.controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}
.card-header {
  font-weight: bold;
}
.desc-text {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: var(--space-3);
}
.section-title {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--color-warning);
  margin-bottom: var(--space-2);
}
.error-list {
  font-size: var(--text-sm);
  color: var(--color-danger);
  padding-left: var(--space-5);
  max-height: 200px;
  overflow-y: auto;
}
.error-list li {
  margin-bottom: var(--space-1);
}
</style>
