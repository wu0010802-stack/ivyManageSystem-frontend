<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createDutyRotation,
  exportDutyRotation,
  getDutyRotation,
  importDutyRotation,
  replaceDutyRotation,
} from '@/api/dutyRotations'
import { useShiftStore } from '@/stores/shift'
import { useAcademicTermStore } from '@/stores/academicTerm'
import { buildSchoolYearOptions } from '@/utils/academic'
import { friendlyError } from '@/utils/errorMessages'
import DutyRotationApplyDialog from './DutyRotationApplyDialog.vue'
import {
  ROLE_LABELS,
  addRow,
  cellKey,
  classroomLabel,
  fromRotation,
  generateWeeks,
  isNotFound,
  issueSeverityByCell,
  mergeWeeks,
  removeRow,
  removeWeek,
  setCell,
  snapshotKey,
  toDocumentBody,
  type ApplyResult,
  type EditableState,
  type RotationOut,
} from '@/utils/dutyRotationGrid'

type ShiftTypeLite = { id: number; name: string; work_start: string; work_end: string }

const emit = defineEmits<{ applied: [result: ApplyResult] }>()

const termStore = useAcademicTermStore()
const shiftStore = useShiftStore()
const shiftTypes = computed(() => shiftStore.activeShiftTypes as unknown as ShiftTypeLite[])

const schoolYear = ref<number>(termStore.school_year)
// 學期只會是 1 或 2（下方 el-select 選項亦僅此兩值）；DutyRotationCreate.semester 是 1|2 enum，
// termStore 型別為 number，這裡收窄以符合建立輪值表的請求 body 型別。
const semester = ref<1 | 2>(termStore.semester as 1 | 2)
const yearOptions = buildSchoolYearOptions(termStore.school_year, 2)
const termLabel = computed(() => `${schoolYear.value} 學年${semester.value === 1 ? '上' : '下'}學期`)

const loading = ref(false)
const saving = ref(false)
const rotation = ref<RotationOut | null>(null)
const state = ref<EditableState | null>(null)
const savedKey = ref('')
const weekRange = ref<[string, string] | null>(null)
const applyVisible = ref(false)
const applyFrom = ref<string | null>(null)
const importPreview = ref<{ file: File; errors: string[]; weekCount: number; cellCount: number } | null>(null)

const dirty = computed(() => state.value != null && snapshotKey(state.value) !== savedKey.value)
const hasErrors = computed(() => rotation.value?.issues.some((i) => i.severity === 'error') ?? false)
const severity = computed(() =>
  rotation.value && state.value ? issueSeverityByCell(rotation.value.issues, state.value.rows) : new Map()
)

const adopt = (r: RotationOut) => {
  rotation.value = r
  state.value = fromRotation(r)
  savedKey.value = snapshotKey(state.value)
}

const load = async () => {
  loading.value = true
  try {
    const res = await getDutyRotation({ school_year: schoolYear.value, semester: semester.value })
    adopt(res.data)
  } catch (e) {
    rotation.value = null
    state.value = null
    if (!isNotFound(e)) ElMessage.error(friendlyError('載入輪值表失敗', e))
  } finally {
    loading.value = false
  }
}

const create = async () => {
  try {
    const res = await createDutyRotation({
      school_year: schoolYear.value,
      semester: semester.value,
      name: `${schoolYear.value} ${semester.value === 1 ? '上' : '下'}教師值勤表`,
    })
    adopt(res.data)
  } catch (e) {
    ElMessage.error(friendlyError('建立輪值表失敗', e))
  }
}

const save = async () => {
  if (!rotation.value || !state.value) return
  let body
  try {
    body = toDocumentBody(state.value)
  } catch (e) {
    ElMessage.warning((e as Error).message)
    return
  }
  saving.value = true
  try {
    const res = await replaceDutyRotation(rotation.value.id, body)
    adopt(res.data)
    ElMessage.success('已儲存輪值表')
  } catch (e) {
    ElMessage.error(friendlyError('儲存輪值表失敗', e))
  } finally {
    saving.value = false
  }
}

const addWeeks = () => {
  if (!state.value || !weekRange.value) return
  const [start, end] = weekRange.value
  const next = state.value.weeks.length + 1
  state.value = { ...state.value, weeks: mergeWeeks(state.value.weeks, generateWeeks(start, end, next)) }
  weekRange.value = null
}

const onCellChange = (week: string, uid: string, value: number | null | undefined) => {
  if (state.value) state.value = setCell(state.value, week, uid, value ?? null)
}

// 模板事件一律走具名函式：vue-tsc 在 inline callback 內不保留 v-if 的 null 收窄
const onAddRow = (role: 'head' | 'assistant') => {
  if (state.value) state.value = addRow(state.value, role)
}
const onRemoveRow = (uid: string) => {
  if (state.value) state.value = removeRow(state.value, uid)
}
const onRemoveWeek = (week: string) => {
  if (state.value) state.value = removeWeek(state.value, week)
}
const closeImport = () => {
  importPreview.value = null
}
const onImportDialogToggle = (open: boolean) => {
  if (!open) closeImport()
}

const openApply = (from: string | null) => {
  applyFrom.value = from
  applyVisible.value = true
}

const openReapply = () => {
  openApply(rotation.value?.reapply_hint.from_week_start ?? null)
}

const onApplied = async (result: ApplyResult) => {
  emit('applied', result)
  await load()
}

const onImportFile = async (file: { raw?: File }) => {
  if (!rotation.value || !file.raw) return
  try {
    const res = await importDutyRotation(rotation.value.id, file.raw, true)
    importPreview.value = {
      file: file.raw,
      errors: res.data.errors,
      weekCount: res.data.week_count,
      cellCount: res.data.cell_count,
    }
  } catch (e) {
    ElMessage.error(friendlyError('讀取 Excel 失敗', e))
  }
}

const confirmImport = async () => {
  if (!rotation.value || !importPreview.value || importPreview.value.errors.length) return
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('匯入會覆蓋目前未儲存的週次與格子，確定繼續？', '匯入 Excel', { type: 'warning' })
    } catch {
      return
    }
  }
  try {
    const res = await importDutyRotation(rotation.value.id, importPreview.value.file, false)
    if (res.data.rotation) adopt(res.data.rotation)
    importPreview.value = null
    ElMessage.success('已匯入輪值表')
  } catch (e) {
    ElMessage.error(friendlyError('匯入輪值表失敗', e))
  }
}

const exportXlsx = async () => {
  if (!rotation.value) return
  try {
    const res = await exportDutyRotation(rotation.value.id)
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url
    a.download = `${rotation.value.name}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error(friendlyError('匯出輪值表失敗', e))
  }
}

onMounted(async () => {
  shiftStore.fetchShiftTypes()
  await load()
})
</script>

<template>
  <div class="drp">
    <div class="drp-toolbar">
      <el-select v-model="schoolYear" data-test="term-year" class="drp-term" @change="load">
        <el-option v-for="y in yearOptions" :key="y" :label="`${y} 學年`" :value="y" />
      </el-select>
      <el-select v-model="semester" data-test="term-semester" class="drp-term" @change="load">
        <el-option label="上學期" :value="1" />
        <el-option label="下學期" :value="2" />
      </el-select>
      <template v-if="rotation">
        <el-button type="primary" data-test="save" :loading="saving" :disabled="!dirty" @click="save">儲存</el-button>
        <el-button data-test="apply" :disabled="dirty || hasErrors" @click="openApply(null)">套用到班表</el-button>
        <el-upload :show-file-list="false" :auto-upload="false" accept=".xlsx" :on-change="onImportFile">
          <el-button data-test="import">匯入 Excel</el-button>
        </el-upload>
        <el-button data-test="export" @click="exportXlsx">匯出 Excel</el-button>
      </template>
    </div>

    <p v-if="loading" class="drp-muted">載入中…</p>
    <div v-else-if="!rotation || !state" class="drp-empty">
      <p>{{ termLabel }}尚未建立學期輪值表。</p>
      <el-button type="primary" data-test="create" @click="create">建立輪值表</el-button>
    </div>
    <template v-else>
      <el-alert
        v-if="rotation.reapply_hint.pending"
        data-test="reapply-hint"
        type="warning"
        :closable="false"
        show-icon
        :title="`輪值表或班級老師已變動，${rotation.reapply_hint.from_week_start} 起有 ${rotation.reapply_hint.affected_count} 筆週班表待重新套用`"
      >
        <el-button size="small" data-test="reapply" :disabled="dirty" @click="openReapply">
          重新套用
        </el-button>
      </el-alert>
      <el-alert v-if="dirty" type="info" :closable="false" title="有未儲存的變更；儲存後才能套用到班表。" />
      <ul v-if="rotation.issues.length" class="drp-issues" data-test="issues">
        <li v-for="(issue, i) in rotation.issues" :key="i" :class="`is-${issue.severity}`">{{ issue.message }}</li>
      </ul>

      <section class="drp-section">
        <h3>職務設定</h3>
        <div class="drp-defaults">
          <label>輪值表名稱 <el-input v-model="state.name" maxlength="100" class="drp-name" /></label>
          <label>
            班導未輪值
            <el-select v-model="state.default_head_shift_type_id" clearable placeholder="不寫入週班表">
              <el-option v-for="t in shiftTypes" :key="t.id" :label="`${t.name} ${t.work_start}–${t.work_end}`" :value="t.id" />
            </el-select>
          </label>
          <label>
            副班導未輪值
            <el-select v-model="state.default_assistant_shift_type_id" clearable placeholder="不寫入週班表">
              <el-option v-for="t in shiftTypes" :key="t.id" :label="`${t.name} ${t.work_start}–${t.work_end}`" :value="t.id" />
            </el-select>
          </label>
        </div>
        <table class="drp-rows">
          <thead><tr><th>角色</th><th>職務名稱</th><th>班別（時段）</th><th /></tr></thead>
          <tbody>
            <tr v-for="row in state.rows" :key="row.uid">
              <td>
                <el-select v-model="row.teacher_role" size="small">
                  <el-option label="班導" value="head" />
                  <el-option label="副班導" value="assistant" />
                </el-select>
              </td>
              <td><el-input v-model="row.label" size="small" maxlength="20" /></td>
              <td>
                <el-select v-model="row.shift_type_id" size="small" placeholder="選擇班別">
                  <el-option v-for="t in shiftTypes" :key="t.id" :label="`${t.name} ${t.work_start}–${t.work_end}`" :value="t.id" />
                </el-select>
              </td>
              <td><el-button link type="danger" @click="onRemoveRow(row.uid)">刪除</el-button></td>
            </tr>
          </tbody>
        </table>
        <el-button size="small" @click="onAddRow('head')">＋班導職務</el-button>
        <el-button size="small" @click="onAddRow('assistant')">＋副班導職務</el-button>
      </section>

      <section class="drp-section">
        <h3>週次</h3>
        <el-date-picker
          v-model="weekRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="第一週"
          end-placeholder="最後一週"
        />
        <el-button size="small" :disabled="!weekRange" @click="addWeeks">產生週次</el-button>
      </section>

      <section class="drp-grid-wrap">
        <table class="drp-grid" data-test="grid">
          <thead>
            <tr>
              <th>角色</th>
              <th>職務</th>
              <th v-for="w in state.weeks" :key="w.week_start_date">
                <div>{{ w.label }}</div>
                <div class="drp-muted">{{ w.week_start_date.slice(5) }}</div>
                <el-button
                  link
                  size="small"
                  :data-test="`remove-week-${w.week_start_date}`"
                  @click="onRemoveWeek(w.week_start_date)"
                >
                  移除
                </el-button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in state.rows" :key="row.uid">
              <td>{{ ROLE_LABELS[row.teacher_role] }}</td>
              <td>{{ row.label || '（未命名）' }}</td>
              <td
                v-for="w in state.weeks"
                :key="w.week_start_date"
                :class="`is-${severity.get(cellKey(w.week_start_date, row.uid)) ?? 'ok'}`"
              >
                <el-select
                  :model-value="state.cells[cellKey(w.week_start_date, row.uid)] ?? null"
                  size="small"
                  clearable
                  filterable
                  placeholder="—"
                  @update:model-value="(v: number | null | undefined) => onCellChange(w.week_start_date, row.uid, v)"
                >
                  <el-option v-for="c in rotation.classrooms" :key="c.id" :label="classroomLabel(c)" :value="c.id" />
                </el-select>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <DutyRotationApplyDialog
        v-model="applyVisible"
        :rotation-id="rotation.id"
        :from-week-start="applyFrom"
        @applied="onApplied"
      />
      <el-dialog
        :model-value="importPreview != null"
        title="匯入 Excel 預覽"
        width="520px"
        @update:model-value="onImportDialogToggle"
      >
        <div v-if="importPreview">
          <ul v-if="importPreview.errors.length" class="drp-issues">
            <li v-for="(err, i) in importPreview.errors" :key="i" class="is-error">{{ err }}</li>
          </ul>
          <p v-else>將匯入 {{ importPreview.weekCount }} 週、{{ importPreview.cellCount }} 格（覆蓋現有週次與格子，職務設定不變）。</p>
          <div class="drp-dialog-actions">
            <el-button @click="closeImport">取消</el-button>
            <el-button type="primary" :disabled="importPreview.errors.length > 0" @click="confirmImport">確認匯入</el-button>
          </div>
        </div>
      </el-dialog>
    </template>
  </div>
</template>

<style scoped>
.drp { display: flex; flex-direction: column; gap: 12px; }
.drp-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.drp-term { width: 120px; }
.drp-muted { color: var(--el-text-color-secondary); font-size: 12px; }
.drp-empty { padding: 24px 0; }
.drp-issues { margin: 0; padding-left: 20px; }
.drp-issues .is-error { color: var(--el-color-danger); }
.drp-issues .is-warning { color: var(--el-color-warning); }
.drp-section h3 { margin: 8px 0; font-size: 15px; }
.drp-defaults { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-bottom: 8px; }
.drp-defaults label { display: flex; gap: 8px; align-items: center; }
.drp-name { width: 220px; }
.drp-rows { border-collapse: collapse; margin-bottom: 8px; }
.drp-rows td, .drp-rows th { padding: 4px 8px; text-align: left; }
.drp-grid-wrap { overflow-x: auto; }
.drp-grid { border-collapse: collapse; min-width: max-content; }
.drp-grid th, .drp-grid td { border: 1px solid var(--el-border-color); padding: 4px; text-align: center; white-space: nowrap; }
.drp-grid td .el-select { width: 110px; }
.drp-grid td.is-error { outline: 2px solid var(--el-color-danger); outline-offset: -2px; }
.drp-grid td.is-warning { outline: 2px solid var(--el-color-warning); outline-offset: -2px; }
.drp-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .drp-defaults { flex-direction: column; }
}
</style>
