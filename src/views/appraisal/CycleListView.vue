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
  createAppraisalCycle,
  importAppraisalExcel,
} from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { getCurrentAcademicTerm } from '@/utils/academic'
import CycleDetailPanel from './CycleDetailPanel.vue'
import type { UploadRawFile } from 'element-plus'

interface Cycle { id: number; academic_year?: number; semester?: string; base_score_calc_date?: string; base_score?: number; enrollment_actual?: number | null; enrollment_target?: number | null; status?: string }

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const cycles = ref<Cycle[]>([])
const createDialog = ref(false)
const importDialog = ref(false)
const submitting = ref(false)
const importFallbackNotice = '系統已支援進頁重算與手動事件維護；Excel 匯入僅供例外對稿或歷史資料修復。'

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
const cycleLabel = (c: Cycle) =>
  `${c.academic_year} 學年${semesterLabel(c.semester ?? '')}（${statusLabel(c.status ?? '')}）`

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
      <el-button type="primary" :icon="Plus" @click="createDialog = true">新增週期</el-button>
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
      <el-button type="primary" :icon="Plus" @click="createDialog = true">新增週期</el-button>
    </el-empty>

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
.cycle-list { padding: 16px 0 0; }
.toolbar { margin: 0 0 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cycle-select { width: 240px; }
.import-fallback-alert { margin-bottom: 12px; }
</style>
