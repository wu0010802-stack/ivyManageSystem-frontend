<template>
  <el-dialog
    :model-value="modelValue"
    :title="`批次列印 ${month} 月考核表`"
    :width="FORM_DIALOG_WIDTH.compact"
    top="6vh"
    append-to-body
    data-test="appraisal-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <div class="appraisal">
      <p class="appraisal__intro">
        勾選要列印的教職員，每人一頁，依班級順序排列；PDF 會在新分頁開啟，用瀏覽器的列印鈕列印。
      </p>

      <p v-if="loading" class="appraisal__status" role="status">正在載入名單…</p>
      <div v-else-if="loadError" class="appraisal__error" role="alert" data-test="appraisal-load-error">
        <p>{{ loadError }}</p>
        <el-button data-test="appraisal-retry" @click="loadCandidates">重試</el-button>
      </div>
      <p v-else-if="rows.length === 0" class="appraisal__status" data-test="appraisal-empty">
        {{ month }} 月沒有可列印的教職員。
      </p>

      <template v-else>
        <div class="appraisal__toolbar">
          <el-checkbox
            v-model="allSelected"
            :indeterminate="selectedCount > 0 && !allSelected"
            data-test="appraisal-select-all"
          >全選</el-checkbox>
          <span class="appraisal__count" data-test="appraisal-count">已選 {{ selectedCount }} 人</span>
        </div>
        <p v-if="selectedCount > LARGE_BATCH_THRESHOLD" class="appraisal__hint" data-test="appraisal-large-hint">
          人數較多時產生需要較久（約 1 分鐘內）；若逾時請分班列印。
        </p>

        <div class="appraisal__list">
          <section v-for="group in groups" :key="group.key" class="appraisal__group">
            <el-checkbox
              class="appraisal__group-title"
              :model-value="isGroupAllSelected(group)"
              :indeterminate="isGroupPartlySelected(group)"
              :data-test="`appraisal-group-${group.key}`"
              @update:model-value="(v) => setGroupSelected(group, Boolean(v))"
            >{{ group.label }}（{{ group.employees.length }} 人）</el-checkbox>
            <ul class="appraisal__members">
              <li v-for="emp in group.employees" :key="emp.employee_id">
                <el-checkbox v-model="emp.selected" :data-test="`appraisal-emp-${emp.employee_id}`">
                  {{ emp.name }}
                  <span v-if="emp.role_label || emp.title_name" class="appraisal__role">{{ emp.role_label || emp.title_name }}</span>
                </el-checkbox>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button data-test="appraisal-cancel" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button
        type="primary"
        :loading="generating"
        :disabled="loading || !!loadError || selectedCount === 0"
        data-test="appraisal-generate"
        @click="generate"
      >產生 PDF</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * 批次列印月考核表：載入當月在職過的教職員（依班級分組），預設全勾，勾選後產生一份 PDF 開新分頁。
 * 後端 PDF 每位員工一頁、順序依班級分組；只讀不寫，不會動薪資或考核紀錄。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FORM_DIALOG_WIDTH } from '@/constants/formDialog'
import { getAppraisalSheetCandidates, getAppraisalSheetsPdf } from '@/api/attendance'
import type { AppraisalSheetCandidateGroup } from '@/api/attendance'
import { apiError, localErrorMessage } from '@/utils/error'
import { openPdfInNewTab } from '@/utils/printPdfWindow'

const props = defineProps<{
  modelValue: boolean
  year: number
  month: number
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

type Employee = AppraisalSheetCandidateGroup['employees'][number] & { selected: boolean }
interface Group {
  key: string
  label: string
  employees: Employee[]
}

// 每人一次薪資試算：超過這個人數就提示可能要等約 1 分鐘（請求逾時 60 秒，見 getAppraisalSheetsPdf）
const LARGE_BATCH_THRESHOLD = 30
const TIMEOUT_MESSAGE = '產生逾時，請減少人數（例如分班）後再試'

const groups = ref<Group[]>([])
const loading = ref(false)
const loadError = ref('')
const generating = ref(false)
let seq = 0

// 名單顯示順序攤平；employee_ids 與「已選 N 人」都由這份算出
const rows = computed(() => groups.value.flatMap((g) => g.employees))
const selectedCount = computed(() => rows.value.filter((r) => r.selected).length)
const allSelected = computed({
  get: () => rows.value.length > 0 && rows.value.every((r) => r.selected),
  set: (v: boolean) => rows.value.forEach((r) => { r.selected = v }),
})

const isGroupAllSelected = (g: Group) => g.employees.length > 0 && g.employees.every((e) => e.selected)
const isGroupPartlySelected = (g: Group) => g.employees.some((e) => e.selected) && !isGroupAllSelected(g)
const setGroupSelected = (g: Group, v: boolean) => g.employees.forEach((e) => { e.selected = v })

async function loadCandidates(): Promise<void> {
  const current = ++seq
  loading.value = true
  loadError.value = ''
  groups.value = []
  try {
    const res = await getAppraisalSheetCandidates({ year: props.year, month: props.month })
    if (current !== seq) return
    // 預設全勾
    groups.value = res.data.groups.map((g) => ({
      key: g.key,
      label: g.label,
      employees: g.employees.map((e) => ({ ...e, selected: true })),
    }))
  } catch (err) {
    if (current === seq) loadError.value = apiError(err, '載入名單失敗')
  } finally {
    if (current === seq) loading.value = false
  }
}

// 打開時、或打開中換了月份就重新載入（回到預設全勾）
watch(
  [() => props.modelValue, () => props.year, () => props.month],
  ([open]) => { if (open) void loadCandidates() },
  { immediate: true },
)

/** 前端 60 秒逾時（axios ECONNABORTED）或 nginx 先切斷（504）：都是這批太大，給可操作的建議 */
function isTimeoutError(err: unknown): boolean {
  const e = err as { code?: unknown; response?: { status?: unknown } } | null
  return e?.code === 'ECONNABORTED' || e?.response?.status === 504
}

function generateErrorMessage(err: unknown): string {
  if (isTimeoutError(err)) return TIMEOUT_MESSAGE
  // 本機錯誤（例：彈出視窗被封鎖）照原訊息顯示；apiError 只看後端回應，會吞成通用失敗
  return localErrorMessage(err) ?? apiError(err, '產生考核表失敗')
}

async function generate(): Promise<void> {
  const employeeIds = rows.value.filter((r) => r.selected).map((r) => r.employee_id)
  if (generating.value || employeeIds.length === 0) return
  const { year, month } = props
  generating.value = true
  try {
    // openPdfInNewTab 要在使用者點擊的同一個 tick 內開新分頁（之前不能 await），否則會被彈出視窗封鎖擋掉。
    // 它自己吞錯走 onError，成功回 window、失敗或被擋回 null——失敗時保留對話框與勾選供重試
    const win = await openPdfInNewTab({
      fetchBlob: async () => {
        const res = await getAppraisalSheetsPdf({ year, month, employee_ids: employeeIds })
        return res.data
      },
      loadingText: '考核表產生中…',
      onError: (err) => ElMessage.error(generateErrorMessage(err)),
    })
    if (win) emit('update:modelValue', false)
  } finally {
    generating.value = false
  }
}
</script>

<style scoped>
.appraisal { display: grid; gap: var(--space-3); }
.appraisal p { margin: 0; }
.appraisal__intro { color: var(--el-text-color-regular); font-size: var(--text-sm); line-height: 1.6; }
.appraisal__status { color: var(--el-text-color-secondary); }
.appraisal__error { display: grid; justify-items: start; gap: var(--space-2); color: var(--el-color-danger); }
.appraisal__toolbar { display: flex; align-items: center; justify-content: space-between; }
.appraisal__count { color: var(--el-text-color-secondary); font-size: var(--text-sm); font-variant-numeric: tabular-nums; }
.appraisal__hint { color: var(--el-text-color-secondary); font-size: var(--text-xs); line-height: 1.6; text-align: right; }
.appraisal__list { max-height: 50vh; overflow-y: auto; display: grid; gap: var(--space-3); padding-right: var(--space-1); }
.appraisal__group { border-top: 1px solid var(--el-border-color-lighter); padding-top: var(--space-2); }
.appraisal__group-title { font-weight: 600; }
.appraisal__members {
  margin: 0;
  padding: 0 0 0 var(--space-5);
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  column-gap: var(--space-3);
}
.appraisal__role { margin-left: var(--space-1); color: var(--el-text-color-secondary); font-size: var(--text-xs); }
</style>
