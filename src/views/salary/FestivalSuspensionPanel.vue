<script setup lang="ts">
// 節慶停課月登記（義華 2026-10-27，第七篇第七條 3／4）。
// HR 依停課公告登記「某月某班（或全園）停課幾日」；獎金設定開啟「整班／全園停課停發節慶」後，
// 停課日數 ≥10 或月底繳費率 <60% 的班級（全園）當月節慶獎金為 0。
// 規則未開啟時登記只是紀錄，不影響計薪。寫入遇薪資批次計算中／已封存／年終已定案，後端回 409。
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
import { useFormDirty } from '@/composables/useFormDirty'
import { getClassrooms } from '@/api/classrooms'
import { academicTermForMonth } from '@/utils/academic'
import { hasPermission } from '@/utils/auth'
import { friendlyError } from '@/utils/errorMessages'
import { formatTaipeiDateTimeMinute, todayISO } from '@/utils/format'
import type { Schema } from '@/api/_generated/typed'
import {
  createFestivalSuspension,
  deleteFestivalSuspension,
  getFestivalSuspensionDecision,
  listFestivalSuspensions,
  updateFestivalSuspension,
} from '@/api/salary'
import {
  MIN_TRIGGER_REASON_LENGTH,
  SUSPENSION_DAYS_THRESHOLD,
  decisionHeadline,
  defaultSuspensionPeriod,
  isTriggerRegistration,
  reasonRequiredForSave,
  ruleStatusText,
  staleNotice,
  validateSuspendedDays,
  validateTriggerReason,
} from './festivalSuspension'

type Item = Schema<'FestivalSuspensionOut'>
type Decision = Schema<'FestivalSuspensionDecisionOut'>
type Mutation = Schema<'FestivalSuspensionMutationOut'>

const REASON_MAX = 500
const SCHOOL_WIDE = 'school'

const canRead = computed(() => hasPermission('SALARY_READ'))
const canWrite = computed(() => hasPermission('SALARY_WRITE'))

const today = todayISO()
const initial = defaultSuspensionPeriod(today)
const year = ref(initial.year)
const month = ref(initial.month)
const yearOptions = computed(() => {
  const base = Number(today.slice(0, 4))
  return [base - 2, base - 1, base, base + 1]
})
const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)
const periodLabel = computed(() => `${year.value} 年 ${month.value} 月`)

const items = ref<Item[]>([])
const decision = ref<Decision | null>(null)
const loading = ref(false)
const loadError = ref(false)

const headline = computed(() => (decision.value ? decisionHeadline(decision.value) : null))

// 兩支唯讀 API 並行載入；快速切換年月時只採最後一次的結果
let seq = 0
const load = async () => {
  if (!canRead.value) return
  const mine = ++seq
  loading.value = true
  loadError.value = false
  try {
    const params = { year: year.value, month: month.value }
    const [list, dec] = await Promise.all([listFestivalSuspensions(params), getFestivalSuspensionDecision(params)])
    if (mine !== seq) return
    items.value = list.data.items
    decision.value = dec.data
  } catch (e) {
    if (mine !== seq) return
    items.value = []
    decision.value = null
    loadError.value = true
    ElMessage.error(friendlyError('載入節慶停課登記失敗', e))
  } finally {
    if (mine === seq) loading.value = false
  }
}

// ── 新增／編輯 dialog ────────────────────────────────────────────────
// 班級每學期一列：下拉必須是「登記年月所屬學期」的班級，否則 classroom_id 會掛到別學期的列，
// 計薪端依該月學期解析老師班級時對不上，停發靜默失效。切換年月時重抓，只採最後一次結果。
const termClassrooms = ref<{ id: number; name: string }[]>([])
let classroomSeq = 0
const loadClassrooms = async () => {
  const mine = ++classroomSeq
  termClassrooms.value = []
  try {
    const res = await getClassrooms(academicTermForMonth(year.value, month.value))
    if (mine !== classroomSeq) return
    termClassrooms.value = res.data.map((c) => ({ id: c.id, name: c.name }))
  } catch {
    // 班級選項只在新增時用；載入失敗不影響瀏覽既有登記
  }
}
const classroomOptions = computed(() => {
  const registered = new Set<number | null>(items.value.map((i) => i.classroom_id ?? null))
  const classes = termClassrooms.value.map((c) => ({
    value: c.id as number | typeof SCHOOL_WIDE,
    label: registered.has(c.id) ? `${c.name}（本月已登記）` : c.name,
    disabled: registered.has(c.id),
  }))
  return [
    {
      value: SCHOOL_WIDE as number | typeof SCHOOL_WIDE,
      label: registered.has(null) ? '全園（本月已登記）' : '全園',
      disabled: registered.has(null),
    },
    ...classes,
  ]
})

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
// 編輯時的原始狀態：修改前後任一邊會停發都要寫原因（10 日改成 5 日也是在恢復發放）
const editingBefore = ref<{ schoolWide: boolean; days: number } | null>(null)
const saving = ref(false)
const form = reactive<{ scope: number | typeof SCHOOL_WIDE | null; suspended_days: number | null; reason: string }>({
  scope: null,
  suspended_days: null,
  reason: '',
})
const { isDirty: formDirty, snapshot: snapshotForm } = useFormDirty(form)
const formError = ref('')

const openCreate = () => {
  editingId.value = null
  editingBefore.value = null
  Object.assign(form, { scope: null, suspended_days: null, reason: '' })
  formError.value = ''
  snapshotForm()
  dialogVisible.value = true
}

const openEdit = (row: Item) => {
  editingId.value = row.id
  editingBefore.value = { schoolWide: row.classroom_id == null, days: row.suspended_days }
  Object.assign(form, {
    scope: row.classroom_id ?? SCHOOL_WIDE,
    suspended_days: row.suspended_days,
    reason: row.reason ?? '',
  })
  formError.value = ''
  snapshotForm()
  dialogVisible.value = true
}

// 全園停課或停課日數 >=10 的登記會影響節慶獎金，原因必填（先在前端擋，後端同樣 422）
const reasonRequired = computed(() =>
  reasonRequiredForSave({
    schoolWide: editingBefore.value ? editingBefore.value.schoolWide : form.scope === SCHOOL_WIDE,
    beforeDays: editingBefore.value ? editingBefore.value.days : undefined,
    afterDays: form.suspended_days,
  }),
)

const editingLabel = computed(() => items.value.find((i) => i.id === editingId.value)?.classroom_name ?? '')

// 異動成功後：顯示後端訊息，並提醒下游薪資／年終草稿需要重算
const afterMutation = async (res: Mutation) => {
  ElMessage.success(res.message)
  const notice = staleNotice(res.stale)
  if (notice) ElMessage.warning({ message: notice, duration: 8000 })
  await load()
}

const submit = async () => {
  if (saving.value) return
  if (editingId.value === null && form.scope === null) {
    formError.value = '請選擇班級或全園'
    return
  }
  const daysError = validateSuspendedDays(form.suspended_days, year.value, month.value)
  if (daysError) {
    formError.value = daysError
    return
  }
  if (reasonRequired.value) {
    const reasonError = validateTriggerReason(form.reason, editingId.value === null ? '登記' : '修改')
    if (reasonError) {
      formError.value = reasonError
      return
    }
  }
  formError.value = ''
  const reason = form.reason.trim() || null
  saving.value = true
  try {
    const days = form.suspended_days as number
    const res =
      editingId.value === null
        ? await createFestivalSuspension({
            year: year.value,
            month: month.value,
            classroom_id: form.scope === SCHOOL_WIDE ? null : (form.scope as number),
            suspended_days: days,
            reason,
          })
        : await updateFestivalSuspension(editingId.value, { suspended_days: days, reason })
    dialogVisible.value = false
    await afterMutation(res.data)
  } catch (e) {
    // 409（薪資計算中／已封存／年終定案／重複登記）的後端訊息是繁中說明，直接顯示
    ElMessage.error(friendlyError(editingId.value === null ? '登記停課失敗' : '更新停課登記失敗', e))
  } finally {
    saving.value = false
  }
}

const remove = async (row: Item) => {
  const target = `${periodLabel.value}「${row.classroom_name}」的停課登記（${row.suspended_days} 日）`
  let reason: string | undefined
  try {
    if (isTriggerRegistration(row.classroom_id == null, row.suspended_days)) {
      // 刪除會讓這個月的節慶獎金恢復發放：先問原因（後端 query reason，去空白後 >=10 字）
      const answer = await ElMessageBox.prompt(
        `刪除${target}後，該班（全園）當月的節慶獎金會恢復發放。請寫明刪除原因／依據（至少 ${MIN_TRIGGER_REASON_LENGTH} 字）：`,
        '刪除停課登記',
        {
          confirmButtonText: '確定刪除',
          cancelButtonText: '取消',
          type: 'warning',
          inputType: 'textarea',
          inputValidator: (value: string) => validateTriggerReason(value, '刪除') ?? true,
        },
      )
      reason = ((answer as { value?: string }).value ?? '').trim()
    } else {
      await ElMessageBox.confirm(`確定刪除${target}？`, '刪除停課登記', {
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消',
        type: 'warning',
      })
    }
  } catch {
    return
  }
  try {
    const res = await deleteFestivalSuspension(row.id, reason)
    await afterMutation(res.data)
  } catch (e) {
    ElMessage.error(friendlyError('刪除停課登記失敗', e))
  }
}

watch([year, month], () => {
  load()
  loadClassrooms()
})
onMounted(() => {
  load()
  loadClassrooms()
})

defineExpose({
  items, decision, headline, loadError, year, month, form, formError, dialogVisible, editingId,
  classroomOptions, reasonRequired, load, openCreate, openEdit, submit, remove,
})
</script>

<template>
  <div class="festival-suspension-panel">
    <el-alert
      v-if="!canRead"
      type="warning"
      :closable="false"
      show-icon
      title="需要「薪資檢視」權限才能查看節慶停課登記"
    />
    <el-card v-else shadow="never">
      <template #header>
        <div class="panel-header">
          <div>
            <h3 class="card-title">節慶停課登記</h3>
            <span class="hint">
              登記某月某班（或全園）的停課日數（含假日）。停課達 {{ SUSPENSION_DAYS_THRESHOLD }} 日，或月底繳費率低於 60%，
              該班（全園）當月節慶獎金停發；需先在獎金設定開啟「整班／全園停課停發節慶」。
            </span>
          </div>
          <div class="panel-actions">
            <el-select v-model="year" style="width: 110px" aria-label="年">
              <el-option v-for="y in yearOptions" :key="y" :value="y" :label="`${y} 年`" />
            </el-select>
            <el-select v-model="month" style="width: 100px" aria-label="月">
              <el-option v-for="m in monthOptions" :key="m" :value="m" :label="`${m} 月`" />
            </el-select>
            <el-button :loading="loading" @click="load">重新整理</el-button>
            <el-button v-if="canWrite" type="primary" data-test="create-button" @click="openCreate">新增登記</el-button>
          </div>
        </div>
      </template>

      <div v-if="loadError" class="load-error" data-test="load-error">
        載入失敗
        <el-button size="small" text type="primary" data-test="retry-button" @click="load">重試</el-button>
      </div>

      <template v-else>
        <div class="section-title">{{ periodLabel }}停發判定</div>
        <div v-if="decision" v-loading="loading" data-test="decision">
          <el-alert
            v-if="headline"
            :type="headline.type"
            :closable="false"
            show-icon
            :title="headline.text"
            class="mb-2"
            data-test="decision-headline"
          />
          <el-alert
            :type="decision.rule_enabled ? 'info' : 'warning'"
            :closable="false"
            show-icon
            :title="ruleStatusText(decision.rule_enabled)"
            class="mb-2"
            data-test="rule-status"
          />
          <el-alert
            v-for="(w, i) in decision.warnings"
            :key="`warn-${i}`"
            type="info"
            :closable="false"
            show-icon
            :title="w"
            class="mb-2"
            data-test="decision-warning"
          />
          <el-table
            v-if="decision.classes.length > 0"
            :data="decision.classes"
            size="small"
            stripe
            style="width: 100%"
            data-test="decision-classes"
          >
            <el-table-column prop="classroom_name" label="會停發的班級" min-width="140" />
            <el-table-column prop="reason" label="原因" min-width="240" />
          </el-table>
        </div>

        <div class="section-title">{{ periodLabel }}登記</div>
        <el-table v-loading="loading" :data="items" stripe style="width: 100%" empty-text="這個月還沒有停課登記" data-test="items-table">
          <el-table-column prop="classroom_name" label="班級" min-width="120" />
          <el-table-column label="停課日數" width="160">
            <template #default="{ row }">
              {{ row.suspended_days }} 日
              <el-tag v-if="row.triggers_suspension" type="warning" size="small" class="trigger-tag" data-test="trigger-tag">
                達停發門檻
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="200">
            <template #default="{ row }">{{ row.reason || '—' }}</template>
          </el-table-column>
          <el-table-column label="登記者" width="110">
            <template #default="{ row }">{{ row.created_by || '—' }}</template>
          </el-table-column>
          <el-table-column label="更新時間" width="150">
            <template #default="{ row }">{{ formatTaipeiDateTimeMinute(row.updated_at) }}</template>
          </el-table-column>
          <el-table-column v-if="canWrite" label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :data-test="`edit-${row.id}`" @click="openEdit(row)">編輯</el-button>
              <el-button link type="danger" size="small" :data-test="`delete-${row.id}`" @click="remove(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-card>

    <FormDialog
      v-model="dialogVisible"
      :title="editingId === null ? '新增節慶停課登記' : `編輯停課登記：${editingLabel}`"
      size="compact"
      :dirty="formDirty"
      :loading="saving"
      :submit-text="editingId === null ? '登記' : '儲存'"
      @submit="submit"
    >
      <el-form label-position="top" @submit.prevent>
        <p class="hint mb-2">{{ periodLabel }}</p>
        <el-form-item v-if="editingId === null" label="班級" required>
          <el-select v-model="form.scope" placeholder="選擇班級或全園" style="width: 100%" data-test="scope-select">
            <el-option
              v-for="opt in classroomOptions"
              :key="String(opt.value)"
              :value="opt.value"
              :label="opt.label"
              :disabled="opt.disabled"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="停課日數（含假日）" required>
          <el-input-number
            v-model="form.suspended_days"
            :min="0"
            :max="31"
            :step="1"
            :precision="0"
            controls-position="right"
            style="width: 100%"
            data-test="days-input"
          />
          <div class="hint">達 {{ SUSPENSION_DAYS_THRESHOLD }} 日即觸發停發；同月同班（全園）只能有一列，要調整請編輯該列</div>
        </el-form-item>
        <el-form-item label="原因／公告依據" :required="reasonRequired" data-test="reason-item">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            :maxlength="REASON_MAX"
            show-word-limit
            placeholder="例如：颱風停課公告字號、整修停課"
            data-test="reason-input"
          />
          <div v-if="reasonRequired" class="hint" data-test="reason-required-hint">
            全園停課或停課日數達 {{ SUSPENSION_DAYS_THRESHOLD }} 日會影響節慶獎金，需填寫原因／公告依據（至少 {{ MIN_TRIGGER_REASON_LENGTH }} 字）
          </div>
        </el-form-item>
        <el-alert v-if="formError" type="error" :closable="false" show-icon :title="formError" data-test="form-error" />
      </el-form>
    </FormDialog>
  </div>
</template>

<style scoped>
.card-title {
  margin: 0 0 4px;
}
.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--space-4);
}
.panel-actions {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: center;
  flex-wrap: wrap;
}
.section-title {
  font-weight: 600;
  margin: var(--space-4, 16px) 0 var(--space-2, 8px);
}
.mb-2 {
  margin-bottom: var(--space-2, 8px);
}
.trigger-tag {
  margin-left: var(--space-1, 4px);
}
.load-error {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
}
</style>
