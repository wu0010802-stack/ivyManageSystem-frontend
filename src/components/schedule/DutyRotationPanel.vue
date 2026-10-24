<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  type RotationIssue,
  type RotationOut,
} from '@/utils/dutyRotationGrid'

type ShiftTypeLite = { id: number; name: string; work_start: string; work_end: string }

const emit = defineEmits<{ applied: [result: ApplyResult]; changed: [] }>()

const termStore = useAcademicTermStore()
const shiftStore = useShiftStore()
const shiftTypes = computed(() => shiftStore.activeShiftTypes as unknown as ShiftTypeLite[])

const schoolYear = ref<number>(termStore.school_year)
// 學期只會是 1 或 2（下方 el-select 選項亦僅此兩值）；DutyRotationCreate.semester 是 1|2 enum，
// termStore 型別為 number，這裡收窄以符合建立輪值表的請求 body 型別。
const semester = ref<1 | 2>(termStore.semester as 1 | 2)
// 記住「上一個已確認」的學年／學期，切換時若使用者取消確認要能還原（Final fix FE-2）。
const confirmedSchoolYear = ref(schoolYear.value)
const confirmedSemester = ref(semester.value)
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

// ── 週次標籤顯示 ───────────────────────────────────────────────────────────────
// 後端存的是原始標籤：數字週（"01"、"05"）與「預」（學期開始前的預備週，例如 8 月初的排班週）。
// 直接拼成「第 {label} 週」會得到「第 預 週」，讀不順；預備週不是第 N 週，要單獨寫。
const PREP_WEEK_LABEL = '預'
const isNumericWeek = (label: string) => /^\d+$/.test(label)
/** 一組週次標籤 → 「預備週、第 01、02 週」 */
const formatWeekLabels = (labels: string[]): string => {
  const numeric = labels.filter(isNumericWeek)
  const others = labels
    .filter((l) => !isNumericWeek(l))
    .map((l) => (l === PREP_WEEK_LABEL ? '預備週' : `「${l}」週`))
  return [...others, ...(numeric.length ? [`第 ${numeric.join('、')} 週`] : [])].join('、')
}
/** 表頭用的短寫：「預」→「預備週」，數字週維持原樣（欄寬有限） */
const weekHeading = (label: string) => (label === PREP_WEEK_LABEL ? '預備週' : label)
/** 後端 issue.message 內嵌「第 {label} 週」，label 為「預」時改寫成「預備週」 */
const tidyMessage = (message: string) => message.replace(/第\s*預\s*週/g, '預備週')

// ── 檢查結果摘要（原本一條 issue 一行，數十條會把表格推出首屏）──────────────────────────
// 依 code 分組；CLASS_MISSING_TEACHER（班級沒設老師 → 該週職務不會寫入週班表）一個班級 × 職務
// 會在每一週各產生一筆，另依「班級 × 職務列」合併成一行並列出所有週次。
const ISSUE_TITLES: Record<string, string> = {
  WEEK_NOT_MONDAY: '週次起始日不是週一',
  NO_DEFAULT: '未設定未輪值時的預設班別',
  CELL_ORPHAN: '格子指向不存在的職務或週次',
  CLASS_WRONG_TERM: '班級不屬於本學期',
  DUP_ROLE_IN_WEEK: '同班同角色重複排入',
  CLASS_MISSING_TEACHER: '班級尚未設定老師',
  EMPLOYEE_DOUBLE_BOOKED: '同一位老師同週重複排入',
}

interface IssueGroup {
  code: string
  severity: 'error' | 'warning'
  title: string
  /** 該類原始 issue 筆數（合併成較少的明細行後仍以原始筆數計） */
  count: number
  lines: string[]
}

const mergeMissingTeacher = (list: RotationIssue[], r: RotationOut): string[] => {
  const rooms = new Map(r.classrooms.map((c) => [c.id, c]))
  const rows = new Map(r.rows.map((row) => [row.id, row]))
  const weeks = new Map(r.weeks.map((w) => [w.week_start_date, w.label]))
  const merged = new Map<string, { room: string; order: number; text: string; labels: string[] }>()
  const loose: string[] = []
  for (const issue of list) {
    const room = issue.classroom_id == null ? undefined : rooms.get(issue.classroom_id)
    const row = issue.row_id == null ? undefined : rows.get(issue.row_id)
    const weekLabel = issue.week_start_date ? weeks.get(issue.week_start_date) : undefined
    if (!room || !row || weekLabel === undefined) {
      // 對不回結構化欄位就不冒險合併，原文照列
      loose.push(tidyMessage(issue.message))
      continue
    }
    const key = `${room.id}|${row.id}`
    const hit = merged.get(key)
    if (hit) hit.labels.push(weekLabel)
    else {
      merged.set(key, {
        room: room.name,
        order: row.sort_order,
        text: `${room.name} 尚未設定${ROLE_LABELS[row.teacher_role]}：「${row.label}」在`,
        labels: [weekLabel],
      })
    }
  }
  const lines = [...merged.values()]
    .sort((a, b) => a.room.localeCompare(b.room, 'zh-TW') || a.order - b.order)
    .map((m) => `${m.text}${formatWeekLabels(m.labels)}不會寫入週班表`)
  return [...lines, ...loose]
}

const issueGroups = computed<IssueGroup[]>(() => {
  const r = rotation.value
  if (!r) return []
  const byCode = new Map<string, RotationIssue[]>()
  for (const issue of r.issues) {
    const list = byCode.get(issue.code)
    if (list) list.push(issue)
    else byCode.set(issue.code, [issue])
  }
  const groups = [...byCode].map(([code, list]): IssueGroup => ({
    code,
    severity: list.some((i) => i.severity === 'error') ? 'error' : 'warning',
    title: ISSUE_TITLES[code] ?? '其他提醒',
    count: list.length,
    lines: code === 'CLASS_MISSING_TEACHER' ? mergeMissingTeacher(list, r) : list.map((i) => tidyMessage(i.message)),
  }))
  // 錯誤在前（會擋「套用到班表」），同嚴重度維持後端給的順序（Array.sort 為穩定排序）
  return groups.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
})
const errorCount = computed(() => rotation.value?.issues.filter((i) => i.severity === 'error').length ?? 0)
const warningCount = computed(() => (rotation.value?.issues.length ?? 0) - errorCount.value)
const issueBreakdown = computed(() => issueGroups.value.map((g) => `${g.title} ${g.count}`).join('、'))
// 只有提醒（warning）時預設收合；有錯誤就展開——錯誤會讓「套用到班表」停用，使用者得立刻看到原因
const issuesOpen = ref(false)
watch(hasErrors, (v) => { if (v) issuesOpen.value = true }, { immediate: true })

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

// 學年／學期切換時若有未儲存的網格編輯，先確認才捨棄（Final fix FE-2，最終審查
// I4）；取消則把選單值還原為原學期、不重新載入。v-model 在 @change 觸發前已把
// schoolYear/semester 更新成新值，故這裡的「還原」是把 ref 撥回 confirmed* 快照。
const guardedTermChange = async (revert: () => void, commit: () => void) => {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('有未儲存的變更，切換學期會捨棄這些變更，確定？', '切換學期', {
        type: 'warning',
      })
    } catch {
      revert()
      return
    }
  }
  commit()
  await load()
}
const onYearChange = () =>
  guardedTermChange(
    () => { schoolYear.value = confirmedSchoolYear.value },
    () => { confirmedSchoolYear.value = schoolYear.value }
  )
const onSemesterChange = () =>
  guardedTermChange(
    () => { semester.value = confirmedSemester.value },
    () => { confirmedSemester.value = semester.value }
  )

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
    if (!res.data.applied || res.data.errors.length > 0) {
      // 後端二次驗證失敗（HTTP 200，例如 preview 後、confirm 前有人改了班級代號）：
      // 保留對話框開啟並更新錯誤訊息（確認鈕因此自動停用），不 adopt、不當作成功
      importPreview.value = { ...importPreview.value, errors: res.data.errors }
      ElMessage.error(`匯入未完成：${res.data.errors[0] ?? '請重新確認匯入內容'}`)
      return
    }
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
      <el-select v-model="schoolYear" data-test="term-year" class="drp-term" @change="onYearChange">
        <el-option v-for="y in yearOptions" :key="y" :label="`${y} 學年`" :value="y" />
      </el-select>
      <el-select v-model="semester" data-test="term-semester" class="drp-term" @change="onSemesterChange">
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
      <section v-if="rotation.issues.length" class="drp-checks" data-test="issues" aria-label="輪值表檢查結果">
        <div class="drp-checks__head">
          <span class="drp-checks__summary">
            <strong v-if="errorCount" class="is-error">{{ errorCount }} 項錯誤</strong>
            <strong v-if="warningCount" class="is-warning">{{ warningCount }} 項提醒</strong>
            <span class="drp-muted">{{ issueBreakdown }}</span>
          </span>
          <el-button
            link
            type="primary"
            class="drp-link-btn"
            data-test="issues-toggle"
            :aria-expanded="issuesOpen"
            aria-controls="drp-checks-detail"
            @click="issuesOpen = !issuesOpen"
          >
            {{ issuesOpen ? '收合明細' : '展開明細' }}
          </el-button>
        </div>
        <!-- v-show 而非 v-if：收合時文字仍在 DOM，不丟資訊，也不影響以文字斷言的既有測試 -->
        <div v-show="issuesOpen" id="drp-checks-detail" class="drp-checks__detail">
          <div v-for="g in issueGroups" :key="g.code" class="drp-checks__group" :data-test="`issue-group-${g.code}`">
            <h4 :class="`is-${g.severity}`">{{ g.title }}（{{ g.count }}）</h4>
            <ul>
              <li v-for="(line, i) in g.lines" :key="i">{{ line }}</li>
            </ul>
          </div>
        </div>
      </section>

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
                <el-select v-model="row.teacher_role" size="small" class="drp-role-select">
                  <el-option label="班導" value="head" />
                  <el-option label="副班導" value="assistant" />
                </el-select>
              </td>
              <td><el-input v-model="row.label" size="small" maxlength="20" /></td>
              <td>
                <el-select v-model="row.shift_type_id" size="small" placeholder="選擇班別" class="drp-shift-select">
                  <el-option v-for="t in shiftTypes" :key="t.id" :label="`${t.name} ${t.work_start}–${t.work_end}`" :value="t.id" />
                </el-select>
              </td>
              <td><el-button link type="danger" class="drp-link-btn" @click="onRemoveRow(row.uid)">刪除</el-button></td>
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
                <div>{{ weekHeading(w.label) }}</div>
                <div class="drp-muted">{{ w.week_start_date.slice(5) }}</div>
                <el-button
                  link
                  size="small"
                  class="drp-link-btn"
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
            <el-button data-test="cancel-import" @click="closeImport">取消</el-button>
            <el-button
              type="primary"
              data-test="confirm-import"
              :disabled="importPreview.errors.length > 0"
              @click="confirmImport"
            >
              確認匯入
            </el-button>
          </div>
        </div>
      </el-dialog>
    </template>
    <!-- 放在 loading／v-else 鏈之外：套用後 onApplied 會重讀（loading=true），掛在鏈內會把仍開著的
         對話框連同「後續處理」清單一起卸載（D-08）。重讀期間 rotation／state 不會被清空，只有讀取失敗才卸載 -->
    <DutyRotationApplyDialog
      v-if="rotation && state"
      v-model="applyVisible"
      :rotation-id="rotation.id"
      :from-week-start="applyFrom"
      :weeks="state.weeks"
      @applied="onApplied"
      @changed="emit('changed')"
    />
  </div>
</template>

<style scoped>
.drp { display: flex; flex-direction: column; gap: 12px; }
.drp-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.drp-term { width: 120px; }
.drp-muted { color: var(--el-text-color-secondary); font-size: var(--text-xs); }
.drp-empty { padding: 24px 0; }
.drp-issues { margin: 0; padding-left: 20px; }
.drp-issues .is-error { color: var(--color-danger-darker); }
.drp-issues .is-warning { color: var(--color-warning-darker); }
.drp-section h3 { margin: 8px 0; font-size: var(--text-lg); }
.drp-defaults { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-bottom: 8px; }
.drp-defaults label { display: flex; gap: 8px; align-items: center; }
.drp-name { width: 220px; }
/* 下拉要放得下選項全文：班別是「班別名 時段」（例如「早車 07:00–16:30」）用 180px，角色（班導／副班導）用 104px；預設寬度會截字 */
.drp-defaults .el-select { width: 180px; }
.drp-rows { border-collapse: collapse; margin-bottom: 8px; }
.drp-rows td, .drp-rows th { padding: 4px 8px; text-align: left; }
.drp-rows .drp-role-select { width: 104px; }
.drp-rows .drp-shift-select { width: 180px; }
.drp-grid-wrap { overflow-x: auto; }
.drp-grid { border-collapse: collapse; min-width: max-content; }
.drp-grid th, .drp-grid td { border: 1px solid var(--el-border-color); padding: 4px; text-align: center; white-space: nowrap; }
.drp-grid td .el-select { width: 110px; }
.drp-grid td.is-error { outline: 2px solid var(--el-color-danger); outline-offset: -2px; }
.drp-grid td.is-warning { outline: 2px solid var(--el-color-warning); outline-offset: -2px; }
/* 檢查結果摘要：一行摘要＋可展開的分組明細（取代逐條列出） */
.drp-checks { border: 1px solid var(--el-border-color-lighter); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); }
.drp-checks__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-1) var(--space-3); }
.drp-checks__summary { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-1) var(--space-3); font-size: var(--text-sm); }
.drp-checks__detail { margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--el-border-color-lighter); }
.drp-checks__group + .drp-checks__group { margin-top: var(--space-3); }
.drp-checks__group h4 { margin: 0 0 var(--space-1); font-size: var(--text-sm); }
.drp-checks__group ul { margin: 0; padding-left: 20px; font-size: var(--text-sm); }
.drp-checks .is-error { color: var(--color-danger-darker); }
.drp-checks .is-warning { color: var(--color-warning-darker); }
/* 列內 link 按鈕：EP 預設只有字高（約 18–21px），點擊區拉到 ≥28px（桌面工具，不強求 44） */
.drp .drp-link-btn { min-height: 28px; padding-inline: var(--space-2); }
/* EP el-alert warning 的標題 #e6a23c 在 #fdf6ec 上只有 2.04:1；只在這頁覆寫成 darker（不動全站 EP 主題） */
.drp :deep(.el-alert--warning.is-light) { color: var(--color-warning-darker); }
.drp :deep(.el-alert--warning.is-light .el-alert__title),
.drp :deep(.el-alert--warning.is-light .el-alert__description) { color: var(--color-warning-darker); }
/* 「有未儲存的變更」info alert 同理（#909399 on #f4f4f5 約 2.9:1） */
.drp :deep(.el-alert--info.is-light),
.drp :deep(.el-alert--info.is-light .el-alert__description) { color: var(--el-text-color-regular); }
.drp-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
@media (max-width: 640px) {
  .drp-defaults { flex-direction: column; }
}
</style>
