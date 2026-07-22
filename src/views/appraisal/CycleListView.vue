<script setup lang="ts">
/**
 * CycleListView — 歷史週期 tab 本體（2026-07-04 重構）
 *
 * 原「週期表格 → 跳轉 /appraisal/cycles/:id 分頁」改為：
 * dropdown 選週期（預設當期學期，無當期取最新）+ 內嵌 CycleDetailPanel。
 * 選擇同步 URL query `cycle`（F5 保留、可分享、舊分頁連結 redirect 落點）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Refresh, Upload, MoreFilled } from '@element-plus/icons-vue'
import {
  listAppraisalCycles,
  importAppraisalExcel,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { hasPermission } from '@/utils/auth'
import { cycleStatusLabel } from '@/constants/appraisalYearEnd'
import CycleDetailPanel from './CycleDetailPanel.vue'
import CreateCycleDialog from './components/CreateCycleDialog.vue'
import type { CreatedCycle } from './composables/useCreateCycle'
import type { UploadRawFile } from 'element-plus'

interface Cycle { id: number; academic_year?: number; semester?: string; base_score_calc_date?: string; base_score?: number; enrollment_actual?: number | null; enrollment_target?: number | null; status?: string }

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const cycles = ref<Cycle[]>([])
// Task A7：自帶「新增週期」dialog 改用共用 CreateCycleDialog（本頁只負責開關 +
// @created 後 reload）；canWrite gate 對齊後端 POST /appraisal/cycles 守衛
// （Permission.APPRAISAL_FINALIZE）。
const createDialogVisible = ref(false)
const canCreateCycle = computed(() => hasPermission('APPRAISAL_FINALIZE'))
const importDialog = ref(false)
const submitting = ref(false)
const importFallbackNotice = '系統已支援進頁重算與手動事件維護；Excel 匯入僅供例外對稿或歷史資料修復。'

const term = useAcademicTermStore()
const west = term.school_year + 1911 // 學年起始西元年

// 匯入日期預設依學期推算（僅供修改的建議值；基準日對齊 9/15、3/15 口徑）
const importForm = ref({
  file: null as UploadRawFile | null,
  start_date: term.semester === 2 ? `${west + 1}-02-01` : `${west}-08-01`,
  end_date: term.semester === 2 ? `${west + 1}-07-31` : `${west + 1}-01-31`,
  base_score_calc_date: term.semester === 2 ? `${west + 1}-03-15` : `${west}-09-15`,
})

const semesterLabel = (v: string) => (v === 'FIRST' ? '上學期' : '下學期')
const cycleLabel = (c: Cycle) =>
  `${c.academic_year} 學年${semesterLabel(c.semester ?? '')}（${cycleStatusLabel(c.status ?? '')}）`

// 新到舊：學年 desc，同學年下學期在前（下學期時間較晚）
const SEMESTER_RECENCY: Record<string, number> = { SECOND: 0, FIRST: 1 }
const sortedCycles = computed(() =>
  [...cycles.value].sort(
    (a, b) =>
      (b.academic_year ?? 0) - (a.academic_year ?? 0) ||
      (SEMESTER_RECENCY[a.semester ?? ''] ?? 9) - (SEMESTER_RECENCY[b.semester ?? ''] ?? 9),
  ),
)

const selectedCycleId = ref<number | null>(null)

/** 預設選中優先序：URL query cycle（有效）→ 當期學期週期 → 最新一筆。 */
function resolveDefaultCycleId(): number | null {
  const list = sortedCycles.value
  if (list.length === 0) return null
  const rawQuery = route.query.cycle
  const queryId = Number(Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)
  if (Number.isFinite(queryId) && list.some((c) => c.id === queryId)) return queryId
  const term = getCurrentAcademicTerm()
  const termSemester = Number(term.semester) === 1 ? 'FIRST' : 'SECOND'
  const current = list.find(
    (c) => c.academic_year === term.school_year && c.semester === termSemester,
  )
  return (current ?? list[0]).id
}

/** 選中週期同步至 URL query（保留 section/tab 等其他欄位）。 */
function syncCycleQuery() {
  const idStr = selectedCycleId.value != null ? String(selectedCycleId.value) : undefined
  const currentRaw = route.query.cycle
  const current = Array.isArray(currentRaw) ? currentRaw[0] : currentRaw
  if ((current ?? undefined) === idStr) return
  const query: LocationQueryRaw = { ...route.query }
  if (idStr) query.cycle = idStr
  else delete (query as Record<string, unknown>).cycle
  router.replace({ query })
}

function onCycleChange() {
  syncCycleQuery()
}

async function load() {
  loading.value = true
  try {
    const { data } = await listAppraisalCycles()
    cycles.value = data as unknown as Cycle[]
    selectedCycleId.value = resolveDefaultCycleId()
    syncCycleQuery()
  } catch (e) {
    ElMessage.error(apiError(e, '載入考核週期失敗'))
  } finally {
    loading.value = false
  }
}

// CreateCycleDialog 自身已在 submit 成功時彈「考核週期已建立」toast，此處僅需 reload。
async function handleCycleCreated(_cycle: CreatedCycle) {
  await load()
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
  <div class="cycle-list" v-loading="loading">
    <div class="toolbar">
      <el-select
        v-model="selectedCycleId"
        class="cycle-select"
        placeholder="選擇考核週期"
        data-test="cycle-select"
        @change="onCycleChange"
      >
        <el-option
          v-for="c in sortedCycles"
          :key="c.id"
          :value="c.id"
          :label="cycleLabel(c)"
        />
      </el-select>
      <el-button type="primary" :icon="Plus" @click="createDialogVisible = true">新增週期</el-button>
      <el-dropdown trigger="click">
        <el-button :icon="MoreFilled">更多操作</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              :icon="Upload"
              data-test="appraisal-import-fallback-action"
              @click="importDialog = true"
            >
              例外匯入 Excel
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button :icon="Refresh" @click="load">重新整理</el-button>
    </div>

    <CycleDetailPanel
      v-if="selectedCycleId != null"
      :key="selectedCycleId"
      :cycle-id="selectedCycleId"
    />
    <el-empty v-else-if="!loading" description="尚未建立任何考核週期">
      <el-button type="primary" :icon="Plus" @click="createDialogVisible = true">新增週期</el-button>
    </el-empty>

    <!-- 新增（Task A7：改用統一 CreateCycleDialog，取代原本自帶的完整表單）-->
    <CreateCycleDialog
      v-model:visible="createDialogVisible"
      :can-write="canCreateCycle"
      @created="handleCycleCreated"
    />

    <!-- 上傳 Excel -->
    <el-dialog v-model="importDialog" title="例外匯入半年考核 Excel" width="560px">
      <el-alert
        class="import-fallback-alert"
        type="info"
        :closable="false"
        show-icon
        :title="importFallbackNotice"
      />
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
.cycle-list { padding: var(--space-4) 0 0; }
.toolbar { margin: 0 0 var(--space-4); display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.cycle-select { width: 240px; }
.import-fallback-alert { margin-bottom: var(--space-3); }
</style>
