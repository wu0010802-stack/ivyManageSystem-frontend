<template>
  <el-dialog
    :model-value="modelValue"
    title="建立現金項目批次"
    width="720px"
    append-to-body
    data-test="cfb-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <p class="intro">
      教材費等只收現金、不上銀行的費用：依年級填金額展開在籍學生，可改個別金額或移除，建立後逐生收現金。
    </p>
    <div class="form-grid">
      <label>類型
        <el-select v-model="form.kind" data-test="cfb-kind" style="width: 160px">
          <el-option v-for="o in CASH_FEE_KIND_OPTIONS" :key="o.key" :value="o.key" :label="o.label" />
        </el-select>
      </label>
      <label>名稱
        <el-input v-model="form.title" maxlength="100" placeholder="如 115-1 教材費" data-test="cfb-title" style="width: 220px" />
      </label>
      <label>學年
        <el-input-number v-model="form.school_year" :min="100" :max="200" size="small" data-test="cfb-year" />
      </label>
      <label>學期
        <el-select v-model="form.semester" data-test="cfb-semester" style="width: 90px">
          <el-option :value="1" label="上" />
          <el-option :value="2" label="下" />
        </el-select>
      </label>
      <label>逾期日
        <el-date-picker v-model="form.due_date" type="date" value-format="YYYY-MM-DD" size="small" data-test="cfb-due" />
      </label>
    </div>

    <h4 class="section-title">各年級金額（留空＝該年級不收）</h4>
    <div class="grade-grid">
      <label v-for="g in grades" :key="g.id" class="grade-cell">
        {{ g.name }}
        <el-input-number
          v-model="gradeAmounts[g.id]"
          :min="0"
          :step="100"
          size="small"
          controls-position="right"
          data-test="cfb-grade-amount"
          :aria-label="`${g.name} 金額`"
        />
      </label>
    </div>
    <el-button data-test="cfb-preview" :loading="previewing" @click="runPreview">展開學生</el-button>

    <template v-if="entries.length">
      <table class="rows">
        <thead>
          <tr><th>學生</th><th>班級</th><th>年級</th><th class="num">金額</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="row in entries" :key="row.student_id" data-test="cfb-row">
            <td>{{ row.student_name }}</td>
            <td>{{ row.classroom_name || '—' }}</td>
            <td>{{ row.grade_name || '—' }}</td>
            <td class="num">
              <el-input-number v-model="row.amount" :min="1" :step="100" size="small" controls-position="right" data-test="cfb-row-amount" />
            </td>
            <td>
              <el-button size="small" text type="danger" data-test="cfb-row-remove" @click="removeRow(row.student_id)">移除</el-button>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="total" data-test="cfb-total">共 {{ entries.length }} 人，合計 {{ formatCurrency(total) }}</p>
    </template>
    <el-alert v-else-if="previewed" type="info" :closable="false" title="沒有符合的在籍學生" />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" data-test="cfb-create" :loading="creating" :disabled="!canCreate" @click="create">建立批次</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/** 建立現金項目批次（SPEC-019 §7.1）：年級金額 → 預覽逐生（可改／移除）→ 建立。 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createCashFeeBatch, previewCashFeeBatch } from '@/api/fees'
import { getGrades } from '@/api/classrooms'
import { friendlyError } from '@/utils/errorMessages'
import { formatCurrency } from '@/utils/currency'
import { getCurrentAcademicTerm } from '@/utils/academic'
import { CASH_FEE_KIND_OPTIONS, type CashFeeEntryRow, type CashFeeKind } from './cashItemTypes'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [v: boolean]; created: [] }>()

interface GradeLite {
  id: number
  name: string
  sort_order?: number | null
}

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
const grades = ref<GradeLite[]>([])
const gradeAmounts = reactive<Record<number, number | undefined>>({})
const entries = ref<CashFeeEntryRow[]>([])
const previewed = ref(false)
const previewing = ref(false)
const creating = ref(false)

const total = computed(() => entries.value.reduce((a, r) => a + (r.amount || 0), 0))
const canCreate = computed(() => entries.value.length > 0 && !!form.title.trim() && !creating.value)

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
  const amounts: Record<number, number> = {}
  for (const g of grades.value) {
    const v = gradeAmounts[g.id]
    if (v && v > 0) amounts[g.id] = v
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
    entries.value = (out.entries as unknown as CashFeeEntryRow[]).map((e) => ({ ...e }))
    previewed.value = true
  } catch (e) {
    ElMessage.error(friendlyError('展開學生失敗', e))
  } finally {
    previewing.value = false
  }
}

function removeRow(studentId: number) {
  entries.value = entries.value.filter((r) => r.student_id !== studentId)
}

async function create() {
  if (!canCreate.value) return
  creating.value = true
  try {
    await createCashFeeBatch({
      kind: form.kind,
      title: form.title.trim(),
      school_year: form.school_year,
      semester: form.semester,
      due_date: form.due_date,
      entries: entries.value.map((r) => ({ student_id: r.student_id, amount: r.amount })),
    })
    ElMessage.success(`已建立「${form.title.trim()}」${entries.value.length} 人，合計 ${formatCurrency(total.value)}`)
    emit('created')
    emit('update:modelValue', false)
  } catch (e) {
    ElMessage.error(friendlyError('建立批次失敗', e))
  } finally {
    creating.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    entries.value = []
    previewed.value = false
    form.title = ''
    if (!grades.value.length) loadGrades()
  },
  { immediate: true },
)
</script>

<style scoped>
.intro { margin: 0 0 10px; font-size: 12.5px; color: var(--el-text-color-secondary); }
.form-grid { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 12px; font-size: 12.5px; }
.form-grid label { display: flex; flex-direction: column; gap: 4px; }
.section-title { margin: 8px 0 6px; font-size: 13px; }
.grade-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px; }
.grade-cell { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; }
.rows { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
.rows th, .rows td { padding: 5px 8px; border-bottom: 1px solid var(--el-border-color-lighter); text-align: left; }
.num { text-align: right; }
.total { margin: 8px 0 0; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
