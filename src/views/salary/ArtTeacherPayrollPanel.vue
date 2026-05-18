<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Edit, Delete, Download, Upload } from '@element-plus/icons-vue'
import {
  listArtPayroll,
  createArtPayroll,
  updateArtPayroll,
  deleteArtPayroll,
  batchImportArtPayroll,
} from '@/api/artTeacherPayroll'
import { useEmployeeStore } from '@/stores/employee'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1
const query = reactive({ year: currentYear, month: currentMonth })

const items = ref([])
const hourlyEmployees = ref([])
const loading = ref(false)

const dialogVisible = ref(false)
const dialogMode = ref('create')
const form = reactive({
  id: null,
  employee_id: null,
  salary_year: currentYear,
  salary_month: currentMonth,
  subject: '',
  classroom_label: '',
  hours: 0,
  hourly_rate: 0,
  excess_amount: 0,
  activity_bonus: 0,
  note: '',
})

const SUBJECT_PRESETS = [
  '美語', '外師', '課後美語', '舞蹈', '音樂',
  '管家', '體能', '足球', '美術', '感統',
]

const previewTotal = computed(() => {
  const base = (Number(form.hours) || 0) * (Number(form.hourly_rate) || 0)
  return Math.round(base) + (Number(form.excess_amount) || 0) + (Number(form.activity_bonus) || 0)
})

const grandTotal = computed(() =>
  items.value.reduce((sum, it) => sum + (it.total_amount || 0), 0),
)

const employeeTotals = computed(() => {
  const map = new Map()
  for (const it of items.value) {
    const key = it.employee_id
    if (!map.has(key)) {
      map.set(key, { name: it.employee_name, total: 0 })
    }
    map.get(key).total += it.total_amount || 0
  }
  return Array.from(map.values())
})

const employeeStore = useEmployeeStore()

const fetchEmployees = async () => {
  try {
    await employeeStore.fetchEmployees()
    hourlyEmployees.value = (employeeStore.employees || []).filter((e) => e.employee_type === 'hourly')
  } catch {
    /* ignore */
  }
}

const fetchList = async () => {
  loading.value = true
  try {
    const res = await listArtPayroll(query.year, query.month)
    items.value = res.data.items || []
  } catch (e) {
    ElMessage.error('載入失敗：' + apiError(e, e.message))
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  dialogMode.value = 'create'
  form.id = null
  form.employee_id = null
  form.salary_year = query.year
  form.salary_month = query.month
  form.subject = ''
  form.classroom_label = ''
  form.hours = 0
  form.hourly_rate = 0
  form.excess_amount = 0
  form.activity_bonus = 0
  form.note = ''
  dialogVisible.value = true
}

const openEdit = (row) => {
  dialogMode.value = 'edit'
  Object.assign(form, {
    id: row.id,
    employee_id: row.employee_id,
    salary_year: row.salary_year,
    salary_month: row.salary_month,
    subject: row.subject,
    classroom_label: row.classroom_label || '',
    hours: row.hours,
    hourly_rate: row.hourly_rate,
    excess_amount: row.excess_amount,
    activity_bonus: row.activity_bonus,
    note: row.note || '',
  })
  dialogVisible.value = true
}

const handleSave = async () => {
  if (!form.employee_id) {
    ElMessage.warning('請選擇才藝老師')
    return
  }
  if (!form.subject) {
    ElMessage.warning('請填科目')
    return
  }
  try {
    if (dialogMode.value === 'create') {
      await createArtPayroll({
        employee_id: form.employee_id,
        salary_year: form.salary_year,
        salary_month: form.salary_month,
        subject: form.subject,
        classroom_label: form.classroom_label || null,
        hours: form.hours,
        hourly_rate: form.hourly_rate,
        excess_amount: form.excess_amount,
        activity_bonus: form.activity_bonus,
        note: form.note || null,
      })
      ElMessage.success('新增成功')
    } else {
      await updateArtPayroll(form.id, {
        subject: form.subject,
        classroom_label: form.classroom_label || null,
        hours: form.hours,
        hourly_rate: form.hourly_rate,
        excess_amount: form.excess_amount,
        activity_bonus: form.activity_bonus,
        note: form.note || null,
      })
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch (e) {
    ElMessage.error('儲存失敗：' + apiError(e, e.message))
  }
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `確定刪除 ${row.employee_name} ${row.subject}${row.classroom_label || ''}（總 ${row.total_amount} 元）？`,
      '確認刪除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteArtPayroll(row.id)
    ElMessage.success('刪除成功')
    fetchList()
  } catch (e) {
    ElMessage.error('刪除失敗：' + apiError(e, e.message))
  }
}

const exportRoster = () => {
  const filename = `${query.year}年${String(query.month).padStart(2, '0')}月_才藝老師薪資清冊.xlsx`
  downloadFile(
    `/art-teacher-payroll/${query.year}/${query.month}/roster`,
    filename,
  )
}

const downloadTemplate = () => {
  downloadFile(
    '/art-teacher-payroll/import-template',
    '才藝薪資匯入範本.xlsx',
  )
}

const importDialogVisible = ref(false)
const importFile = ref(null)
const importReplaceExisting = ref(false)
const importResult = ref(null)
const importLoading = ref(false)

const openImportDialog = () => {
  importFile.value = null
  importReplaceExisting.value = false
  importResult.value = null
  importDialogVisible.value = true
}

const handleFileChange = (file) => {
  importFile.value = file.raw
}

const handleImport = async () => {
  if (!importFile.value) {
    ElMessage.warning('請選擇 Excel 檔案')
    return
  }
  importLoading.value = true
  try {
    const res = await batchImportArtPayroll(
      query.year,
      query.month,
      importFile.value,
      importReplaceExisting.value,
    )
    importResult.value = res.data
    const { imported, skipped, errors } = res.data
    if (skipped > 0) {
      ElMessage.warning(`已匯入 ${imported} 筆；${skipped} 筆失敗（見下方明細）`)
    } else {
      ElMessage.success(`已匯入 ${imported} 筆`)
    }
    fetchList()
  } catch (e) {
    ElMessage.error('匯入失敗：' + apiError(e, e.message))
  } finally {
    importLoading.value = false
  }
}

onMounted(() => {
  fetchEmployees()
  fetchList()
})
</script>

<template>
  <div class="art-teacher-panel">
    <el-card>
      <template #header>
        <div class="header">
          <div>
            <h3 style="margin: 0 0 4px;">才藝老師薪資</h3>
            <span class="hint">
              每月每老師可有多筆給付（科目/班級/星期分項）；該月有 entries 時，
              薪資引擎會以 sum(total) 覆寫 hourly_total 與 net_salary。
            </span>
          </div>
          <div class="header-actions">
            <el-button :icon="Plus" type="primary" @click="openCreate">新增明細</el-button>
            <el-button :icon="Upload" type="success" @click="openImportDialog">批次匯入</el-button>
            <el-button :icon="Download" @click="exportRoster">匯出清冊</el-button>
          </div>
        </div>
      </template>

      <div class="filters">
        <el-select v-model="query.year" style="width: 110px;" @change="fetchList">
          <el-option
            v-for="y in 5"
            :key="y"
            :label="currentYear - 2 + y + ' 年'"
            :value="currentYear - 2 + y"
          />
        </el-select>
        <el-select v-model="query.month" style="width: 90px;" @change="fetchList">
          <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
        </el-select>
        <span class="grand-total">
          全月合計：<b>{{ grandTotal.toLocaleString() }}</b> 元
          ｜ 共 <b>{{ employeeTotals.length }}</b> 位老師 / <b>{{ items.length }}</b> 筆
        </span>
      </div>

      <el-table :data="items" v-loading="loading" stripe style="width: 100%">
        <el-table-column prop="subject" label="科目" width="100">
          <template #default="{ row }">
            {{ row.subject }}<span v-if="row.classroom_label">{{ row.classroom_label }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="employee_name" label="姓名" width="120" />
        <el-table-column prop="hours" label="時數" width="80" align="right" />
        <el-table-column label="鐘點費" width="100" align="right">
          <template #default="{ row }">{{ row.hourly_rate.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="小計" width="100" align="right">
          <template #default="{ row }">{{ row.base_amount.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="超額" width="80" align="right">
          <template #default="{ row }">
            <span v-if="row.excess_amount">{{ row.excess_amount.toLocaleString() }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="加給活動" width="100" align="right">
          <template #default="{ row }">
            <span v-if="row.activity_bonus">{{ row.activity_bonus.toLocaleString() }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="總計" width="110" align="right">
          <template #default="{ row }">
            <b>{{ row.total_amount.toLocaleString() }}</b>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="備註" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" :icon="Edit" @click="openEdit(row)">編輯</el-button>
            <el-button link size="small" type="danger" :icon="Delete" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增才藝薪資明細' : '編輯才藝薪資明細'"
      width="540px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="老師">
          <el-select
            v-model="form.employee_id"
            filterable
            placeholder="選擇才藝老師（須為 hourly）"
            :disabled="dialogMode === 'edit'"
            style="width: 100%;"
          >
            <el-option
              v-for="emp in hourlyEmployees"
              :key="emp.id"
              :label="emp.name"
              :value="emp.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="年月">
          <el-input-number v-model="form.salary_year" :min="2020" :max="2100" :disabled="dialogMode === 'edit'" />
          <el-input-number
            v-model="form.salary_month"
            :min="1"
            :max="12"
            :disabled="dialogMode === 'edit'"
            style="margin-left: 10px;"
          />
        </el-form-item>
        <el-form-item label="科目">
          <el-select
            v-model="form.subject"
            allow-create
            filterable
            placeholder="選擇或輸入科目"
            style="width: 100%;"
          >
            <el-option v-for="s in SUBJECT_PRESETS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="班級/星期">
          <el-input v-model="form.classroom_label" placeholder="如 (二)、向.滿、(三.五)" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="時數">
              <el-input-number v-model="form.hours" :min="0" :precision="2" :step="0.5" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="鐘點費">
              <el-input-number v-model="form.hourly_rate" :min="0" :step="50" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="超額">
              <el-input-number v-model="form.excess_amount" :min="0" :step="100" style="width: 100%;" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="加給活動">
              <el-input-number v-model="form.activity_bonus" :min="0" :step="100" style="width: 100%;" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="備註">
          <el-input v-model="form.note" type="textarea" :rows="2" />
        </el-form-item>
        <el-alert
          :title="`預覽總計：${previewTotal.toLocaleString()} 元（時數×鐘點 + 超額 + 加給活動）`"
          type="success"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 批次匯入 dialog -->
    <el-dialog v-model="importDialogVisible" title="批次匯入才藝薪資" width="600px">
      <el-alert type="info" :closable="false" show-icon>
        <p style="margin: 0;">
          上傳 .xlsx 檔案（員工姓名 / 工號(選填) / 科目 / 班級備註 / 時數 / 鐘點費 / 超額 / 加給活動 / 備註）
        </p>
        <p style="margin: 4px 0 0;">
          <el-link type="primary" @click="downloadTemplate">下載範本</el-link>
        </p>
      </el-alert>

      <el-form label-width="120px" style="margin-top: 16px;">
        <el-form-item label="目標年月">
          {{ query.year }} 年 {{ query.month }} 月
        </el-form-item>
        <el-form-item label="選擇檔案">
          <el-upload
            :auto-upload="false"
            :show-file-list="true"
            :limit="1"
            accept=".xlsx"
            :on-change="handleFileChange"
          >
            <el-button :icon="Upload">選擇 .xlsx</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="覆寫模式">
          <el-switch v-model="importReplaceExisting" />
          <span class="hint" style="margin-left: 12px;">
            打開後：匯入前先刪除該月所有 entries（整月覆寫，避免重複）
          </span>
        </el-form-item>
      </el-form>

      <div v-if="importResult" style="margin-top: 12px;">
        <el-alert
          :type="importResult.skipped > 0 ? 'warning' : 'success'"
          :closable="false"
          show-icon
        >
          總筆數：{{ importResult.total }} ｜ 已匯入：{{ importResult.imported }}
          ｜ 失敗：{{ importResult.skipped }}
        </el-alert>
        <el-table
          v-if="importResult.errors.length"
          :data="importResult.errors"
          style="margin-top: 10px; max-height: 220px;"
          stripe
        >
          <el-table-column prop="row" label="列" width="80" />
          <el-table-column prop="message" label="錯誤訊息" />
        </el-table>
      </div>

      <template #footer>
        <el-button @click="importDialogVisible = false">關閉</el-button>
        <el-button type="primary" :loading="importLoading" @click="handleImport">
          開始匯入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.filters {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
.grand-total {
  margin-left: auto;
  color: var(--el-text-color-secondary);
}
.muted {
  color: var(--el-text-color-disabled);
}
</style>
