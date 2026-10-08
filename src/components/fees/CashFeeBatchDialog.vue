<template>
  <el-dialog
    :model-value="modelValue"
    title="新增收費項目"
    :close-on-click-modal="!creating"
    :close-on-press-escape="!creating"
    :show-close="!creating"
    width="min(760px, 94vw)"
    append-to-body
    data-test="cfb-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="intro">
      不納入網銀銷帳單的收費。先填收費內容，再選擇學生與確認金額；建立後可逐筆登記現金收款。
    </p>
    <fieldset :disabled="creating" class="form-section">
    <legend>1. 收費內容</legend>
    <div class="form-grid">
      <label>費用類型
        <el-select :disabled="creating" v-model="form.kind" data-test="cfb-kind">
          <el-option v-for="o in CASH_FEE_KIND_OPTIONS" :key="o.key" :value="o.key" :label="o.label" />
        </el-select>
      </label>
      <label>項目名稱
        <el-input :disabled="creating" v-model="form.title" maxlength="100" placeholder="例如：新生註冊費、115-1 耗材費" data-test="cfb-title" />
      </label>
      <label>學年
        <el-input-number :disabled="creating" v-model="form.school_year" :min="100" :max="200" data-test="cfb-year" />
      </label>
      <label>學期
        <el-select :disabled="creating" v-model="form.semester" data-test="cfb-semester">
          <el-option :value="1" label="上" />
          <el-option :value="2" label="下" />
        </el-select>
      </label>
      <label>繳費期限
        <el-date-picker :disabled="creating" v-model="form.due_date" type="date" value-format="YYYY-MM-DD" data-test="cfb-due" />
      </label>
    </div>

    </fieldset>
    <fieldset :disabled="creating" class="form-section">
    <legend>2. 收費對象</legend>
    <label class="mode-label">選擇方式
      <el-select :disabled="creating" v-model="mode" aria-label="收費對象選擇方式" data-test="cfb-mode">
        <el-option value="students" label="指定學生" :disabled="!canReadStudents" />
        <el-option value="grade" label="依年級帶入" />
      </el-select>
    </label>
    <p v-if="!canReadStudents" class="intro">指定學生需具備學生檢視權限，可改用依年級帶入。</p>
    <p v-if="mode === 'students' && canReadStudents" class="intro">從可檢視的學生中選擇，逐一填入本次應收金額。尚未建立學生資料的新生，請先完成學生建檔。</p>
    <el-button v-if="mode === 'students' && canReadStudents" :disabled="creating" data-test="cfb-pick" @click="pickerVisible = true">選擇學生</el-button>
    <template v-else>
    <h4 class="section-title">各年級金額（留空＝該年級不收）</h4>
    <div class="grade-grid">
      <label v-for="g in grades" :key="g.id" class="grade-cell">
        {{ g.name }}
        <el-input-number
          :disabled="creating"
          v-model="gradeAmounts[g.id]"
          :min="0"
          :step="100" :precision="0"
          size="small"
          controls-position="right"
          data-test="cfb-grade-amount"
          :aria-label="`${g.name} 金額`"
        />
      </label>
    </div>
    <el-button :disabled="creating" data-test="cfb-preview" :loading="previewing" @click="runPreview">帶入學生名單</el-button>
    <p class="intro">變更年級金額或學期後需重新帶入；重新帶入會取代下方名單與個別金額。</p>
    </template>

    <template v-if="entries.length">
      <div class="table-scroll"><table class="rows">
        <thead>
          <tr><th>學生</th><th>班級</th><th>年級</th><th class="num">金額</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="row in entries" :key="row.student_id" data-test="cfb-row">
            <td>{{ row.student_name }}</td>
            <td>{{ row.classroom_name || '—' }}</td>
            <td>{{ row.grade_name || '—' }}</td>
            <td class="num">
              <el-input-number :disabled="creating" v-model="row.amount" :min="0" :step="100" :precision="0" :aria-label="`${row.student_name} 應收金額`" controls-position="right" data-test="cfb-row-amount" />
            </td>
            <td>
              <el-button text type="danger" :disabled="creating" data-test="cfb-row-remove" @click="removeRow(row.student_id)">移除</el-button>
            </td>
          </tr>
        </tbody>
      </table></div>
      <p class="total" data-test="cfb-total">共 {{ entries.length }} 人，合計 {{ formatCurrency(total) }}</p>
    </template>
    <el-alert v-else-if="previewed" type="info" :closable="false" title="沒有符合的在籍學生" />

    <p v-if="previewStale" role="status" class="validation">收費條件已變更，請重新帶入學生名單後再建立。</p>
    <p v-if="entries.length && !validAmounts" role="status" class="validation">請為每位學生填入大於 0 的整數金額。</p>
    </fieldset>
    <StudentPickerDialog v-if="canReadStudents" v-model="pickerVisible" title="選擇收費學生" @pick="pickStudent" />

    <template #footer>
      <el-button :disabled="creating" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" data-test="cfb-create" :loading="creating" :disabled="!canCreate" @click="create">確認建立收費項目</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/** 建立現金項目批次（SPEC-019 §7.1）：年級金額 → 預覽逐生（可改／移除）→ 建立。 */
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createCashFeeBatch, previewCashFeeBatch } from '@/api/fees'
import { getGrades } from '@/api/classrooms'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { hasPermission } from '@/utils/auth'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { getCurrentAcademicTerm } from '@/utils/academic'
import StudentPickerDialog from './StudentPickerDialog.vue'
import { CASH_FEE_KIND_OPTIONS, type CashFeeEntryRow, type CashFeeKind } from './cashItemTypes'

const props = defineProps<{ modelValue: boolean; schoolYear?: number; semester?: number }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; created: [] }>()

interface GradeLite {
  id: number
  name: string
  sort_order?: number | null
}

const canReadStudents = computed(() => hasPermission(PERMISSION_NAMES.STUDENTS_READ))
const term = getCurrentAcademicTerm()
const form = reactive<{
  kind: CashFeeKind
  title: string
  school_year: number
  semester: number
  due_date: string | null
}>({
  kind: 'material',
  title: '',
  school_year: term.school_year,
  semester: term.semester,
  due_date: null,
})
const mode = ref<'students' | 'grade'>(canReadStudents.value ? 'students' : 'grade')
const pickerVisible = ref(false)
let previewSequence = 0
let sessionSequence = 0
onBeforeUnmount(() => { previewSequence++; sessionSequence++ })
const grades = ref<GradeLite[]>([])
const gradeAmounts = reactive<Record<number, number | undefined>>({})
const entries = ref<CashFeeEntryRow[]>([])
const previewed = ref(false)
const previewStale = ref(false)
const previewing = ref(false)
const creating = ref(false)

const total = computed(() => entries.value.reduce((a, r) => a + (r.amount || 0), 0))
const validAmounts = computed(() => entries.value.every(r => Number.isSafeInteger(r.amount) && r.amount > 0))
const validTerm = computed(() => Number.isSafeInteger(form.school_year) && form.school_year >= 100 && form.school_year <= 200 && [1, 2].includes(form.semester))
const canCreate = computed(() => validTerm.value && entries.value.length > 0 && validAmounts.value && !!form.title.trim() && !creating.value && !previewing.value && !previewStale.value)

function pickStudent(student: { id: number; name: string; classroom_name?: string | null }) {
  if (!canReadStudents.value || creating.value || !props.modelValue || mode.value !== 'students') return
  if (!entries.value.some(row => row.student_id === student.id)) {
    entries.value.push({ student_id: student.id, student_name: student.name, classroom_name: student.classroom_name ?? null, grade_name: null, amount: 0 })
  }
  pickerVisible.value = false
}

watch([() => form.kind, () => form.school_year, () => form.semester, mode, () => JSON.stringify(gradeAmounts)], () => {
  previewSequence++
  previewing.value = false
  if (mode.value === 'grade' && entries.value.length) previewStale.value = true
})
watch(mode, () => {
  if (mode.value === 'students' && !canReadStudents.value) mode.value = 'grade'
  entries.value = []; previewStale.value = false; previewed.value = false; pickerVisible.value = false })

async function loadGrades() {
  try {
    const res = await getGrades()
    const list = (res.data as unknown as GradeLite[]) ?? []
    grades.value = [...list].sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
  } catch (e) {
    ElMessage.error(friendlyError('載入年級失敗', e))
  }
}

async function runPreview() {
  if (previewing.value || creating.value || !validTerm.value) return
  const sequence = ++previewSequence
  if (entries.value.length) {
    try { await ElMessageBox.confirm('重新帶入會取代目前名單與已修改的金額，是否繼續？', '重新帶入學生', { type: 'warning' }) } catch { return }
    if (sequence !== previewSequence || !props.modelValue) return
  }
  const amounts: Record<number, number> = {}
  for (const g of grades.value) {
    const v = gradeAmounts[g.id]
    if (v && Number.isSafeInteger(v) && v > 0) amounts[g.id] = v
  }
  if (!Object.keys(amounts).length) {
    ElMessage.warning('請至少填一個年級的金額')
    return
  }
  previewing.value = true
  try {
    const out = await previewCashFeeBatch({
      kind: form.kind,
      school_year: form.school_year,
      semester: form.semester,
      amounts_by_grade: amounts,
    })
    if (sequence !== previewSequence || !props.modelValue) return
    entries.value = (out.entries as unknown as CashFeeEntryRow[]).map((e) => ({ ...e }))
    previewed.value = true
    previewStale.value = false
  } catch (e) {
    if (sequence === previewSequence) ElMessage.error(friendlyError('展開學生失敗', e))
  } finally {
    if (sequence === previewSequence) previewing.value = false
  }
}

function removeRow(studentId: number) {
  entries.value = entries.value.filter((r) => r.student_id !== studentId)
}

async function create() {
  if (!canCreate.value) return
  creating.value = true
  const session = sessionSequence
  try {
    await createCashFeeBatch({
      kind: form.kind,
      title: form.title.trim(),
      school_year: form.school_year,
      semester: form.semester,
      due_date: form.due_date,
      entries: entries.value.map((r) => ({ student_id: r.student_id, amount: r.amount })),
    })
    if (session !== sessionSequence) { emit('created'); return }
    ElMessage.success(`已建立「${form.title.trim()}」${entries.value.length} 人，合計 ${formatCurrency(total.value)}`)
    emit('created')
    emit('update:modelValue', false)
  } catch (e) {
    if (session === sessionSequence) ElMessage.error(friendlyError('建立收費項目失敗', e))
  } finally {
    creating.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    previewSequence++
    sessionSequence++
    previewing.value = false
    pickerVisible.value = false
    if (!open) return
    mode.value = canReadStudents.value ? 'students' : 'grade'
    Object.keys(gradeAmounts).forEach(key => delete gradeAmounts[Number(key)])
    form.kind = 'material'
    form.school_year = props.schoolYear ?? term.school_year
    form.semester = props.semester ?? term.semester
    form.due_date = null
    entries.value = []
    previewed.value = false
    previewStale.value = false
    form.title = ''
    if (!grades.value.length) loadGrades()
  },
  { immediate: true },
)
</script>

<style scoped>
.form-section { border: 0; padding: 0; margin: 0 0 var(--space-5); min-width: 0; }
.form-section legend { font-size: var(--text-base); font-weight: 600; margin-bottom: var(--space-3); }
.mode-label { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-3); margin-bottom: var(--space-3); }
.table-scroll { overflow-x: auto; }
.validation { color: var(--el-color-danger); font-size: var(--text-sm); }
.intro { margin: 0 0 var(--space-3); font-size: var(--text-sm); color: var(--el-text-color-secondary); line-height: 1.6; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); margin-bottom: var(--space-3); font-size: var(--text-sm); }
.form-grid label { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.form-grid :deep(.el-input-number), .form-grid :deep(.el-date-editor.el-input) { width: 100%; }
.section-title { margin: var(--space-3) 0; font-size: var(--text-sm); }
.grade-grid { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-bottom: var(--space-3); }
.grade-cell { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); }
.rows { width: 100%; min-width: 520px; border-collapse: collapse; margin-top: var(--space-3); font-size: var(--text-sm); }
.rows th, .rows td { padding: var(--space-2); border-bottom: 1px solid var(--el-border-color-lighter); text-align: left; }
.rows .num { text-align: right; }
.total { margin: var(--space-3) 0 0; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
@media (--to-sm) {
  .form-grid { grid-template-columns: minmax(0, 1fr); }
  .mode-label { align-items: stretch; flex-direction: column; }
}
</style>
