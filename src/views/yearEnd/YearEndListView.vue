<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Upload, ArrowDown, MoreFilled } from '@element-plus/icons-vue'
import {
  listYearEndCycles,
  createYearEndCycle,
  importYearEndExcel,
  exportYearEndSummaryXlsxUrl,
  exportYearEndTransferRosterXlsxUrl,
} from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'
import PageHeader from '@/components/common/PageHeader.vue'

interface YearEndCycleRow {
  id: number
  academic_year: number
  bonus_calc_date: string
  status: string
  [key: string]: unknown
}

const router = useRouter()
const cycles = ref<YearEndCycleRow[]>([])
const loading = ref(false)
const createDialog = ref(false)
const importDialog = ref(false)
const busy = ref(false)
const importFallbackNotice = '系統已自動試算並產生轉帳清冊；Excel 匯入僅供例外對稿或歷史資料修復。'

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
    <PageHeader title="年終獎金" subtitle="年度結算週期管理">
      <template #actions>
        <el-button type="primary" :icon="Plus" @click="createDialog = true">新增年度週期</el-button>
        <el-dropdown trigger="click">
          <el-button :icon="MoreFilled">更多操作</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                :icon="Upload"
                data-test="year-end-import-fallback-action"
                @click="importDialog = true"
              >
                例外匯入 Excel
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button :icon="Refresh" @click="load">重新整理</el-button>
      </template>
    </PageHeader>

    <el-table :data="cycles" v-loading="loading" stripe>
      <el-table-column label="學年" prop="academic_year" width="100" />
      <el-table-column label="基準日" prop="bonus_calc_date" width="160" />
      <el-table-column label="狀態" width="100">
        <template #default="{ row }">
          <el-tag :type="CYCLE_STATUS_TAG[row.status] || 'info'" size="small">
            {{ CYCLE_STATUS_LABEL[row.status] ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="320">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}`)">明細</el-button>
          <el-button link type="primary" @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}/grid`)">總表</el-button>
          <el-button link @click="router.push(`/appraisal-year-end/year-end/cycles/${row.id}/config`)">設定</el-button>
          <el-dropdown>
            <el-button link>匯出<el-icon><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item><a :href="exportYearEndSummaryXlsxUrl(row.id)">年終獎金總表</a></el-dropdown-item>
                <el-dropdown-item><a :href="exportYearEndTransferRosterXlsxUrl(row.id)">轉帳名冊</a></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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

    <el-dialog v-model="importDialog" title="例外匯入年終經營績效 Excel" width="640px">
      <el-alert
        class="import-fallback-alert"
        type="info"
        :closable="false"
        show-icon
        :title="importFallbackNotice"
      />
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
.ye-list { padding: var(--space-4); }
.toolbar { margin: var(--space-4) 0; display: flex; gap: var(--space-2); }
.import-fallback-alert { margin-bottom: var(--space-3); }
</style>
