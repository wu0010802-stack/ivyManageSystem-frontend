<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { Plus, Refresh, Upload, Download } from '@element-plus/icons-vue'
import {
  listYearEndCycles,
  createYearEndCycle,
  importYearEndExcel,
  exportYearEndSummaryXlsxUrl,
  exportYearEndTransferRosterXlsxUrl,
} from '@/api/yearEnd'
import { apiError } from '@/utils/error'

const router = useRouter()
const cycles = ref<unknown[]>([])
const loading = ref(false)
const createDialog = ref(false)
const importDialog = ref(false)
const busy = ref(false)

const form = ref({
  academic_year: 114,
  start_date: '',
  end_date: '',
  bonus_calc_date: '',
})

const importForm = ref<{
  file: File | null
  start_date: string
  end_date: string
  bonus_calc_date: string
  org_rate_first: number
  org_rate_second: number
  enrollment_target: number
}>({
  file: null,
  start_date: '',
  end_date: '',
  bonus_calc_date: '',
  org_rate_first: 83.6,
  org_rate_second: 91.5,
  enrollment_target: 160,
})

async function load() {
  loading.value = true
  try {
    cycles.value = (await listYearEndCycles()).data
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function submit() {
  busy.value = true
  try {
    await createYearEndCycle(form.value)
    ElMessage.success('建立成功')
    createDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '建立失敗'))
  } finally {
    busy.value = false
  }
}

async function doImport() {
  if (!importForm.value.file) {
    ElMessage.warning('請選擇 .xls 檔')
    return
  }
  busy.value = true
  try {
    const { data } = await importYearEndExcel(importForm.value.file, {
      startDate: importForm.value.start_date,
      endDate: importForm.value.end_date,
      bonusCalcDate: importForm.value.bonus_calc_date,
      orgRateFirst: importForm.value.org_rate_first,
      orgRateSecond: importForm.value.org_rate_second,
      enrollmentTarget: importForm.value.enrollment_target,
    })
    ElMessage.success(
      `匯入完成：settlements ${data.settlements_upserted}、特別獎金 ${data.special_bonuses_upserted}、` +
        `班級績效 ${data.class_targets_upserted}、跳過 ${data.skipped_unresolved_names.length}`
    )
    importDialog.value = false
    await load()
  } catch (e) {
    ElMessage.error(apiError(e, '匯入失敗'))
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="ye-list">
    <el-page-header @back="router.back()" content="年終獎金結算" />
    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="createDialog = true">新增年度週期</el-button>
      <el-button type="success" :icon="Upload" @click="importDialog = true">上傳 Excel</el-button>
      <el-button :icon="Refresh" @click="load">重新整理</el-button>
    </div>

    <el-table :data="cycles" v-loading="loading" stripe>
      <el-table-column label="學年" prop="academic_year" width="100" />
      <el-table-column label="基準日" prop="bonus_calc_date" width="160" />
      <el-table-column label="狀態" prop="status" width="120" />
      <el-table-column label="操作" width="320">
        <template #default="{ row }">
          <el-button size="small" @click="router.push(`/year_end/cycles/${row.id}`)">明細</el-button>
          <el-button size="small" :icon="Download" tag="a"
            :href="exportYearEndSummaryXlsxUrl(row.id)">年終獎金總表</el-button>
          <el-button size="small" :icon="Download" tag="a"
            :href="exportYearEndTransferRosterXlsxUrl(row.id)">轉帳名冊</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDialog" title="新增年度週期" width="520px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="學年"><el-input-number v-model="form.academic_year" :min="100" :max="200" /></el-form-item>
        <el-form-item label="開始日"><el-date-picker v-model="form.start_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="結束日"><el-date-picker v-model="form.end_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="結算基準日"><el-date-picker v-model="form.bonus_calc_date" value-format="YYYY-MM-DD" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="submit">建立</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialog" title="上傳年終經營績效 Excel" width="640px">
      <el-form :model="importForm" label-width="160px">
        <el-form-item label="檔案 (.xls)">
          <el-upload :auto-upload="false" :show-file-list="true" :limit="1"
            :on-change="(f) => (importForm.file = f.raw ?? null)">
            <el-button>選擇檔案</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="開始日"><el-date-picker v-model="importForm.start_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="結束日"><el-date-picker v-model="importForm.end_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="結算基準日"><el-date-picker v-model="importForm.bonus_calc_date" value-format="YYYY-MM-DD" /></el-form-item>
        <el-form-item label="上學期達成比率%"><el-input-number v-model="importForm.org_rate_first" :precision="2" /></el-form-item>
        <el-form-item label="下學期達成比率%"><el-input-number v-model="importForm.org_rate_second" :precision="2" /></el-form-item>
        <el-form-item label="招生目標"><el-input-number v-model="importForm.enrollment_target" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importDialog = false">取消</el-button>
        <el-button type="primary" :loading="busy" @click="doImport">匯入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ye-list { padding: 16px; }
.toolbar { margin: 16px 0; display: flex; gap: 8px; }
</style>
