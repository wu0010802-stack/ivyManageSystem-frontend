<template>
  <el-dialog
    :model-value="modelValue" :title="dialogTitle" width="900px" append-to-body
    :close-on-click-modal="false" :close-on-press-escape="!exporting"
    data-test="slip-template-dialog" @update:model-value="close"
  >
    <el-steps :active="step" simple finish-status="success">
      <el-step title="帳期與金額" />
      <el-step title="對象" />
      <el-step title="預覽與下載" />
    </el-steps>

    <!-- 步驟 1：帳期與金額 -->
    <section v-if="step === 0" class="slip-step">
      <el-form label-position="left" label-width="96px" :disabled="loading">
        <el-form-item label="帳期">
          <el-select v-model="billYear" class="slip-year" data-test="slip-year" aria-label="帳期年份">
            <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y - 1911} 學年度（西元 ${y}）`" />
          </el-select>
          <el-select v-model="billMonth" class="slip-month" data-test="slip-month" aria-label="帳期月份">
            <el-option v-for="m in 12" :key="m" :value="m" :label="`${m} 月`" />
          </el-select>
        </el-form-item>
        <el-form-item label="繳款帳號">
          <div class="slip-account">
            <span class="slip-account-seg">{{ data?.project_code || '——' }}</span>
            <span class="slip-account-seg slip-account-seg--accent">{{ data?.account_period || '——' }}</span>
            <span class="slip-account-seg">每位學生的銷帳碼</span>
          </div>
          <div class="slip-hint">
            14 碼寫進「繳款人資料-欄位十」。專案代號來自系統設定，帳期一改中段跟著變。
          </div>
        </el-form-item>
      </el-form>

      <el-table :data="data?.by_grade || []" size="small" border>
        <el-table-column label="年段" width="120">
          <template #default="{ row }">{{ row.grade_name }}</template>
        </el-table-column>
        <el-table-column label="人數" width="90" align="right">
          <template #default="{ row }">{{ row.student_count }}</template>
        </el-table-column>
        <el-table-column label="費用金額（元）" width="200">
          <template #default="{ row }">
            <el-input-number
              :model-value="amounts[row.grade_name] ?? undefined"
              :min="0" :max="999999" :precision="0" :step="100" controls-position="right"
              :aria-label="`${row.grade_name} 費用金額`" data-test="slip-grade-row"
              @update:model-value="(v: number | undefined) => setAmount(row.grade_name, v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="小計" align="right">
          <template #default="{ row }">
            {{ row.amount == null ? '待填' : `NT$${row.subtotal.toLocaleString()}` }}
          </template>
        </el-table-column>
      </el-table>
      <el-alert
        v-if="data && data.missing_amounts.length" type="warning" :closable="false" show-icon
        class="slip-alert" data-test="slip-missing-amounts"
        :title="`尚未填金額的年段：${data.missing_amounts.join('、')}`"
      />
    </section>

    <!-- 步驟 2：對象 -->
    <section v-else-if="step === 1" class="slip-step">
      <div class="slip-kpis">
        <div class="slip-kpi"><span>在園學生</span><b>{{ data?.active_total ?? 0 }}</b></div>
        <div class="slip-kpi"><span>將寫入範本</span><b>{{ data?.rows_total ?? 0 }}</b></div>
        <div class="slip-kpi"><span>排除新生</span><b>{{ data?.excluded_new_students ?? 0 }}</b></div>
        <div class="slip-kpi"><span>待補銷帳碼</span><b>{{ data?.missing_suffix.length ?? 0 }}</b></div>
      </div>

      <el-form label-position="top" :disabled="loading">
        <el-form-item label="班級範圍">
          <el-select
            v-model="classroomIds" multiple clearable collapse-tags collapse-tags-tooltip
            placeholder="全園在園學生" class="slip-classrooms" data-test="slip-classrooms"
            aria-label="班級範圍"
          >
            <el-option v-for="c in classroomOptions" :key="c.id" :value="c.id" :label="c.name" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="kind === 'registration'" type="info" :closable="false" show-icon class="slip-alert"
        title="註冊費單不含本學年新生——新生註冊費於報名時另收。"
      />

      <div v-if="data && data.missing_suffix.length" class="slip-block" data-test="slip-missing-suffix">
        <h4>{{ data.missing_suffix.length }} 位學生沒有銷帳碼</h4>
        <p class="slip-hint">指定號碼後產檔會一併存進學生資料；或先排除、之後在學生頁補。</p>
        <el-table :data="data.missing_suffix" size="small" border>
          <el-table-column label="學生" width="120">
            <template #default="{ row }">{{ row.student_name }}</template>
          </el-table-column>
          <el-table-column label="班級" width="120">
            <template #default="{ row }">{{ row.classroom_name || '未編班' }}</template>
          </el-table-column>
          <el-table-column label="指定銷帳碼" width="220">
            <template #default="{ row }">
              <el-input
                :model-value="suffixAssignments[String(row.student_id)] ?? ''"
                maxlength="4" inputmode="numeric" class="slip-suffix-input"
                :aria-label="`${row.student_name} 的銷帳碼`"
                @update:model-value="(v: string) => setAssignment(row.student_id, v)"
              />
            </template>
          </el-table-column>
          <el-table-column label="建議">
            <template #default="{ row }">
              <el-button
                v-if="row.suggested_suffix" link type="primary" data-test="slip-apply-suggested"
                @click="setAssignment(row.student_id, row.suggested_suffix)"
              >
                用 {{ row.suggested_suffix }}
              </el-button>
              <span v-else class="slip-hint">同班無既有號碼，請自行指定</span>
            </template>
          </el-table-column>
          <el-table-column label="" width="80">
            <template #default="{ row }">
              <el-button link type="info" @click="excludeStudent(row.student_id)">排除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="data && data.duplicate_suffix.length" class="slip-block" data-test="slip-duplicate-suffix">
        <h4>{{ data.duplicate_suffix.length }} 組銷帳碼重複</h4>
        <p class="slip-hint">兩位在園學生共用同一個號碼，銀行會把兩筆錢併進同一個虛擬帳號。請到學生資料頁改號。</p>
        <ul>
          <li v-for="dup in data.duplicate_suffix" :key="dup.collection_suffix">
            {{ dup.collection_suffix }}：{{ dup.students.join('、') }}
          </li>
        </ul>
      </div>

      <div v-if="data && data.missing_grade.length" class="slip-block" data-test="slip-missing-grade">
        <h4>{{ data.missing_grade.length }} 位學生的班級未設年段</h4>
        <p class="slip-hint">年段決定金額與繳款單上的「識別代號」，請先到班級管理補。</p>
        <ul>
          <li v-for="item in data.missing_grade" :key="item.student_id">
            {{ item.student_name }}（{{ item.classroom_name || '未編班' }}）
          </li>
        </ul>
      </div>
    </section>

    <!-- 步驟 3：預覽與下載 -->
    <section v-else class="slip-step">
      <p class="slip-summary">
        <b>{{ data?.rows_total ?? 0 }} 列</b>
        ・金額合計 <b>NT${{ (data?.total_amount ?? 0).toLocaleString() }}</b>
        ・依銷帳碼排序
      </p>
      <el-table :data="data?.sample_rows || []" size="small" border data-test="slip-sample">
        <el-table-column prop="student_name" label="A 繳款人" width="110" />
        <el-table-column prop="classroom_label" label="C 繳款人地址" width="130" />
        <el-table-column prop="grade_label" label="D 欄位一" width="100" />
        <el-table-column prop="student_name" label="E 欄位二" width="110" />
        <el-table-column prop="collection_suffix" label="F 欄位三" width="100" />
        <el-table-column prop="full_collection_number" label="M 欄位十" width="170" />
        <el-table-column label="N 費用1(正)" align="right">
          <template #default="{ row }">{{ row.amount.toLocaleString() }}</template>
        </el-table-column>
      </el-table>
      <p class="slip-hint">
        僅顯示前後數列。銷帳碼與帳號以文字寫入（保前導 0）；O 欄之後（費用1 負值、費用2…）一律留空。
      </p>
    </section>

    <template #footer>
      <el-button v-if="step > 0" link :disabled="exporting" data-test="slip-prev" @click="step -= 1">
        上一步
      </el-button>
      <span class="slip-footer-gap" />
      <el-button :disabled="exporting" data-test="slip-cancel" @click="close(false)">取消</el-button>
      <el-button
        v-if="step < 2" type="primary" :disabled="!canAdvance || loading"
        data-test="slip-next" @click="step += 1"
      >
        {{ step === 0 ? '下一步：對象' : '下一步：預覽' }}
      </el-button>
      <el-button
        v-else-if="!blocked" type="success" :loading="exporting"
        data-test="slip-download" @click="download"
      >
        下載 .xls（{{ data?.rows_total ?? 0 }} 列）
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 永豐繳款單範本產生（SPEC-025）。
 *
 * 三步：帳期與金額 → 對象 → 預覽下載。每次輸入變更都重新試算，
 * 「能不能往下走」完全由後端回的阻擋清單決定，前端不自己判規則。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { exportSlipTemplate, previewSlipTemplate, type SlipTemplateKind } from '@/api/fees'
import { saveBlobResponse } from '@/utils/download'
import { friendlyError } from '@/utils/errorMessages'
import { useAllClassroomStore } from '@/stores/classroomAll'

const props = defineProps<{
  modelValue: boolean
  kind: SlipTemplateKind
  defaultYear: number
  defaultMonth: number
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

interface GradeRow {
  grade_name: string
  student_count: number
  amount: number | null
  subtotal: number
}
interface MissingSuffixRow {
  student_id: number
  student_name: string
  classroom_name: string | null
  suggested_suffix: string | null
}
interface DuplicateRow { collection_suffix: string; students: string[] }
interface MissingGradeRow { student_id: number; student_name: string; classroom_name: string | null }
interface SampleRow {
  student_name: string
  classroom_label: string
  grade_label: string
  collection_suffix: string
  full_collection_number: string
  amount: number
}
interface PreviewData {
  kind: string
  bill_year: number
  bill_month: number
  project_code: string
  account_period: string
  rows_total: number
  total_amount: number
  active_total: number
  excluded_new_students: number
  excluded_manual: number
  by_grade: GradeRow[]
  missing_suffix: MissingSuffixRow[]
  duplicate_suffix: DuplicateRow[]
  missing_grade: MissingGradeRow[]
  missing_amounts: string[]
  sample_rows: SampleRow[]
  amount_defaults: Record<string, number>
  blocked: boolean
}

const classroomStore = useAllClassroomStore()
const step = ref(0)
const billYear = ref(props.defaultYear)
const billMonth = ref(props.defaultMonth)
const amounts = ref<Record<string, number>>({})
const classroomIds = ref<number[]>([])
const suffixAssignments = ref<Record<string, string>>({})
const excludeStudentIds = ref<number[]>([])
const data = ref<PreviewData | null>(null)
const loading = ref(false)
const exporting = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const dialogTitle = computed(() =>
  props.kind === 'registration' ? '產生範本 — 註冊費單' : '產生範本 — 月費單',
)
const yearOptions = computed(() => {
  const base = props.defaultYear
  return [base - 1, base, base + 1]
})
const classroomOptions = computed(() =>
  (classroomStore.classrooms as Array<{ id: number; name: string }>) || [],
)
const blocked = computed(() => data.value?.blocked !== false)
const canAdvance = computed(() => {
  if (!data.value) return false
  if (step.value === 0) return data.value.missing_amounts.length === 0
  return !data.value.blocked
})

function payload() {
  return {
    kind: props.kind,
    bill_year: billYear.value,
    bill_month: billMonth.value,
    amounts: amounts.value,
    classroom_ids: classroomIds.value.length ? classroomIds.value : null,
    suffix_assignments: suffixAssignments.value,
    exclude_student_ids: excludeStudentIds.value,
  }
}

async function fetchPreview() {
  loading.value = true
  try {
    const result = (await previewSlipTemplate(payload() as never)) as unknown as PreviewData
    data.value = result
    // 第一次載入：把上次用過的金額帶進來，使用者只需確認
    for (const row of result.by_grade) {
      if (amounts.value[row.grade_name] == null) {
        const remembered = result.amount_defaults?.[row.grade_name]
        if (typeof remembered === 'number') amounts.value[row.grade_name] = remembered
      }
    }
  } catch (e) {
    ElMessage.error(friendlyError('試算範本失敗', e))
  } finally {
    loading.value = false
  }
}

function schedulePreview() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(fetchPreview, 300)
}

function setAmount(gradeName: string, value: number | undefined) {
  if (value == null) delete amounts.value[gradeName]
  else amounts.value[gradeName] = value
  schedulePreview()
}

function setAssignment(studentId: number, value: string) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4)
  const key = String(studentId)
  if (digits.length === 4) {
    suffixAssignments.value[key] = digits
    schedulePreview()
  } else if (digits.length === 0) {
    delete suffixAssignments.value[key]
    schedulePreview()
  } else {
    suffixAssignments.value[key] = digits
  }
}

function excludeStudent(studentId: number) {
  delete suffixAssignments.value[String(studentId)]
  if (!excludeStudentIds.value.includes(studentId)) excludeStudentIds.value.push(studentId)
  schedulePreview()
}

async function download() {
  exporting.value = true
  try {
    const response = await exportSlipTemplate(payload() as never)
    saveBlobResponse(response, 'sinopac_slip_template.xls')
    ElMessage.success('範本已下載，請上傳永豐代收平台')
    close(false)
  } catch (e) {
    ElMessage.error(friendlyError('產生範本失敗', e))
  } finally {
    exporting.value = false
  }
}

function close(value: boolean) {
  if (!exporting.value) emit('update:modelValue', value)
}

function reset() {
  step.value = 0
  billYear.value = props.defaultYear
  billMonth.value = props.defaultMonth
  amounts.value = {}
  classroomIds.value = []
  suffixAssignments.value = {}
  excludeStudentIds.value = []
  data.value = null
}

watch([billYear, billMonth, classroomIds], schedulePreview)
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    reset()
    classroomStore.fetchClassrooms?.()
    void fetchPreview()
  },
  { immediate: true },
)
</script>

<style scoped>
.slip-step { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
.slip-year { width: 190px; margin-right: 8px; }
.slip-month { width: 110px; }
.slip-account { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.slip-account-seg {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 10px; border: 1px solid var(--el-border-color); border-radius: 4px;
}
.slip-account-seg--accent { color: var(--el-color-primary); border-color: var(--el-color-primary); }
.slip-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.slip-alert { margin: 0; }
.slip-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.slip-kpi {
  border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 8px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.slip-kpi span { font-size: 12px; color: var(--el-text-color-secondary); }
.slip-kpi b { font-size: 20px; font-variant-numeric: tabular-nums; }
.slip-classrooms { width: 100%; }
.slip-block { display: flex; flex-direction: column; gap: 8px; }
.slip-block h4 { margin: 0; font-size: 14px; }
.slip-block ul { margin: 0; padding-left: 20px; font-size: 13px; }
.slip-suffix-input { width: 100px; }
.slip-summary { margin: 0; font-size: 13px; }
.slip-footer-gap { flex: 1; }
@media (max-width: 640px) {
  .slip-kpis { grid-template-columns: 1fr 1fr; }
}
</style>
