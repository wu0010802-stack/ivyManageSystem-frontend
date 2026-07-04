<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Upload, Download } from '@element-plus/icons-vue'
import {
  listAppraisalCycles,
  createAppraisalCycle,
  importAppraisalExcel,
  exportAppraisalCycleXlsxUrl,
  exportAppraisalTransferRosterXlsxUrl,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'
import type { UploadRawFile } from 'element-plus'

interface Cycle { id: number; academic_year?: number; semester?: string; base_score_calc_date?: string; base_score?: number; enrollment_actual?: number | null; enrollment_target?: number | null; status?: string }

const router = useRouter()
const loading = ref(false)
const cycles = ref<Cycle[]>([])
const createDialog = ref(false)
const importDialog = ref(false)
const submitting = ref(false)

const form = ref({
  academic_year: 114,
  semester: 'FIRST' as 'FIRST' | 'SECOND',
  enrollment_target: 160,
  enrollment_actual: null as number | null,
})

const importForm = ref({
  file: null as UploadRawFile | null,
  start_date: '',
  end_date: '',
  base_score_calc_date: '',
})

const semesterLabel = (v: string) => (v === 'FIRST' ? '上學期' : '下學期')
const statusLabel = (v: string) => ({ OPEN: '進行中', LOCKED: '已鎖定', CLOSED: '已封存' } as Record<string, string>)[v] || v

async function load() {
  loading.value = true
  try {
    const { data } = await listAppraisalCycles()
    cycles.value = data as unknown as Cycle[]
  } catch (e) {
    ElMessage.error(apiError(e, '載入考核週期失敗'))
  } finally {
    loading.value = false
  }
}

async function submit() {
  submitting.value = true
  try {
    await createAppraisalCycle({ ...form.value })
    ElMessage.success('建立成功')
    createDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '建立失敗'))
  } finally {
    submitting.value = false
  }
}

async function doImport() {
  if (!importForm.value.file) {
    ElMessage.warning('請選擇檔案')
    return
  }
  submitting.value = true
  try {
    const { data } = await importAppraisalExcel(importForm.value.file!, {
      startDate: importForm.value.start_date,
      endDate: importForm.value.end_date,
      baseScoreCalcDate: importForm.value.base_score_calc_date,
    })
    const result = data as { participants_created: number; participants_updated: number; score_items_upserted: number; skipped_unresolved_names: string[] }
    ElMessage.success(
      `匯入完成：新增 ${result.participants_created} 位、更新 ${result.participants_updated} 位、` +
        `score_items ${result.score_items_upserted} 筆，跳過 ${result.skipped_unresolved_names.length} 位未匹配員工`
    )
    importDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '匯入失敗'))
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="cycle-list">
    <el-page-header @back="router.back()" content="半年考核管理" />
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="createDialog = true">新增週期</el-button>
      <el-button type="success" :icon="Upload" @click="importDialog = true">上傳 Excel</el-button>
      <el-button :icon="Refresh" @click="load">重新整理</el-button>
    </div>

    <el-table :data="cycles" v-loading="loading" stripe>
      <el-table-column label="學年" prop="academic_year" width="100" />
      <el-table-column label="學期" width="120">
        <template #default="{ row }">{{ semesterLabel(row.semester) }}</template>
      </el-table-column>
      <el-table-column label="基準日" prop="base_score_calc_date" width="160" />
      <el-table-column label="基礎分數" width="120">
        <template #default="{ row }">{{ Number(row.base_score).toFixed(1) }}</template>
      </el-table-column>
      <el-table-column label="招生 (實/目標)" width="160">
        <template #default="{ row }">
          {{ row.enrollment_actual ?? '-' }} / {{ row.enrollment_target ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="120">
        <template #default="{ row }">{{ statusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <el-button size="small" @click="router.push(`/appraisal/cycles/${row.id}`)">明細</el-button>
          <el-button size="small" type="primary" :icon="Download" tag="a"
            :href="exportAppraisalCycleXlsxUrl(row.id)">匯出</el-button>
          <el-button size="small" :icon="Download" tag="a"
            :href="exportAppraisalTransferRosterXlsxUrl(row.id)">轉帳名冊</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增 -->
    <el-dialog v-model="createDialog" title="新增半年考核週期" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="學年">
          <el-input-number v-model="form.academic_year" :min="100" :max="200" />
        </el-form-item>
        <el-form-item label="學期">
          <el-radio-group v-model="form.semester">
            <el-radio-button value="FIRST">上學期</el-radio-button>
            <el-radio-button value="SECOND">下學期</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="招生目標"><el-input-number v-model="form.enrollment_target" :min="0" /></el-form-item>
        <el-form-item label="實際註冊"><el-input-number v-model="form.enrollment_actual" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">建立</el-button>
      </template>
    </el-dialog>

    <!-- 上傳 Excel -->
    <el-dialog v-model="importDialog" title="上傳半年考核 Excel" width="560px">
      <el-form :model="importForm" label-width="120px">
        <el-form-item label="檔案 (.xls/.xlsx)">
          <el-upload :auto-upload="false" :show-file-list="true" :limit="1"
            :on-change="(f) => (importForm.file = f.raw ?? null)">
            <el-button>選擇檔案</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="開始日"><el-date-picker v-model="importForm.start_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="結束日"><el-date-picker v-model="importForm.end_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="基準日"><el-date-picker v-model="importForm.base_score_calc_date" value-format="YYYY-MM-DD" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doImport">匯入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cycle-list { padding: 16px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; }
</style>
