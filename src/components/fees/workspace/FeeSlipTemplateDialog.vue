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
        <div class="slip-kpi"><span>本期在冊</span><b>{{ data?.active_total ?? 0 }}</b></div>
        <div class="slip-kpi"><span>將寫入範本</span><b>{{ data?.rows_total ?? 0 }}</b></div>
        <div class="slip-kpi"><span>排除新生</span><b>{{ data?.excluded_new_students ?? 0 }}</b></div>
        <div class="slip-kpi"><span>待補銷帳碼</span><b>{{ data?.missing_suffix.length ?? 0 }}</b></div>
      </div>

      <el-form label-position="top" :disabled="loading">
        <el-form-item label="班級範圍">
          <el-select
            v-model="classroomIds" multiple clearable collapse-tags collapse-tags-tooltip
            placeholder="全園在冊學生" class="slip-classrooms" data-test="slip-classrooms"
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
      <!-- SPEC-025 §7.3／§10 第三條風險：預繳折抵 v1 不做，會計必須知道面額偏高 -->
      <el-alert
        v-if="kind === 'registration'" type="warning" :closable="false" show-icon
        class="slip-alert" data-test="slip-prepaid-warning"
        title="本版不填預繳折抵（費用1 負值 −5,000）"
      >
        舊生的註冊費單面額會比實際應繳<b>多 5,000 元</b>。出檔後需人工處理這筆折抵，
        否則家長會多繳或來電詢問。
      </el-alert>

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
                :model-value="suffixInputs[String(row.student_id)] ?? ''"
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
        <p class="slip-hint">
          兩位在籍學生共用同一個號碼，銀行會把兩筆錢併進同一個虛擬帳號，出檔前必須改掉其中一個。
        </p>
        <ul>
          <li v-for="dup in data.duplicate_suffix" :key="dup.collection_suffix">
            {{ dup.collection_suffix }}：{{ dup.students.join('、') }}
            <span class="slip-hint" data-test="slip-duplicate-hint">— {{ duplicateHint(dup) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="data && data.missing_grade.length" class="slip-block" data-test="slip-missing-grade">
        <h4>{{ data.missing_grade.length }} 位學生無法決定年段</h4>
        <p class="slip-hint">
          年段決定金額與繳款單上的「識別代號」。這個月先不出他的單也可以，按「排除」即可。
        </p>
        <el-table :data="data.missing_grade" size="small" border>
          <el-table-column label="學生" width="120">
            <template #default="{ row }">{{ row.student_name }}</template>
          </el-table-column>
          <el-table-column label="班級" width="120">
            <template #default="{ row }">{{ row.classroom_name || '未編班' }}</template>
          </el-table-column>
          <el-table-column label="待補">
            <template #default="{ row }">{{ missingGradeHint(row) }}</template>
          </el-table-column>
          <el-table-column label="" width="80">
            <template #default="{ row }">
              <el-button
                link type="info" data-test="slip-exclude-missing-grade"
                @click="excludeStudent(row.student_id)"
              >
                排除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
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
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'
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

// 契約一律取自 OpenAPI codegen。手抄一份本地 interface＋雙重轉型等於關掉防漂移：
// 後端改欄名或 nullability 時 typecheck 不會紅，畫面到 prod 才壞。
type PreviewData = ApiResponse<'/fees/slip-templates/preview', 'post'>
type PreviewPayload = ApiBody<'/fees/slip-templates/preview', 'post'>
type DuplicateRow = PreviewData['duplicate_suffix'][number]
type MissingGradeRow = PreviewData['missing_grade'][number]

const classroomStore = useAllClassroomStore()
const step = ref(0)
const billYear = ref(props.defaultYear)
const billMonth = ref(props.defaultMonth)
const amounts = ref<Record<string, number>>({})
const classroomIds = ref<number[]>([])
/** 輸入框顯示用：可能是打到一半的 1–3 碼，只做「非數字剔除＋截 4 碼」的正規化 */
const suffixInputs = ref<Record<string, string>>({})
const excludeStudentIds = ref<number[]>([])
/**
 * 真正送出的指派：只收湊滿 4 碼的。
 *
 * 打到一半的碼若也進 payload，下一次因其他欄位變更觸發的試算會被後端以
 * 「指定的銷帳碼須為 4 位數字」擋成 422，使用者只會看到「試算範本失敗」。
 */
const suffixAssignments = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(suffixInputs.value)) {
    if (/^\d{4}$/.test(value)) result[key] = value
  }
  return result
})
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

function payload(): PreviewPayload {
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
    const result = await previewSlipTemplate(payload())
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
  const key = String(studentId)
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4)
  const before = suffixInputs.value[key] ?? ''
  // 輸入框顯示的一律是正規化後的值，不會殘留被剔除的字元
  suffixInputs.value[key] = digits
  // 只有「送出的內容真的變了」才重打試算，避免每敲一鍵就打一次
  const wasComplete = /^\d{4}$/.test(before)
  const isComplete = digits.length === 4
  if (wasComplete !== isComplete || (isComplete && digits !== before)) schedulePreview()
}

function duplicateHint(dup: DuplicateRow): string {
  if (dup.from_assignment) {
    return '其中一個是本次剛指定、還沒存進學生資料的號碼，請在上面「沒有銷帳碼」的表格改掉'
  }
  if (dup.out_of_scope) {
    return '其中一位不在本次選取的班級範圍內，請到學生資料頁改號'
  }
  return '請到學生資料頁改掉其中一位的號碼'
}

function missingGradeHint(row: MissingGradeRow): string {
  return row.classroom_name
    ? `「${row.classroom_name}」尚未設定年段，請到班級管理補`
    : '尚未編班，請先為該生編班'
}

function excludeStudent(studentId: number) {
  delete suffixInputs.value[String(studentId)]
  if (!excludeStudentIds.value.includes(studentId)) excludeStudentIds.value.push(studentId)
  schedulePreview()
}

async function download() {
  exporting.value = true
  try {
    const response = await exportSlipTemplate(payload())
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
  suffixInputs.value = {}
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
