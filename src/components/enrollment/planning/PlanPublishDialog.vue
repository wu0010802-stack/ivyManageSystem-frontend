<template>
  <el-dialog v-model="visible" title="發布編班計畫" :width="FORM_DIALOG_WIDTH.standardNarrow" class="plan-publish-dialog">
    <div v-loading="loading" class="publish-body">
      <el-alert
        v-if="loadErrorMessage"
        class="load-error"
        type="error"
        :title="loadErrorMessage"
        show-icon
        :closable="false"
      />
      <template v-else-if="preview">
        <!-- 發布最大的焦慮是「之後會發生什麼」：先講何時套用、會改到什麼、能不能反悔 -->
        <section class="apply-notice" :class="{ 'apply-notice--danger': appliesImmediately || !schedulerEnabled }">
          <p class="apply-when">{{ applyWhenText }}</p>
          <ul class="consequence-list">
            <li>{{ assignedText }}</li>
            <li v-if="preview.totals.graduating_count">{{ preview.totals.graduating_count }} 位大班生轉為畢業</li>
            <li v-if="preview.totals.excluded_count">{{ excludedText }}</li>
            <li>各班老師的帶班資料同步更新</li>
            <!-- 依 apply.py：帶班異動老師的未封存薪資＋（有學生搬動時）全園之後節慶發放月的
                 未封存薪資會標 needs_recalc；系統不會自動重算 -->
            <li>帶班有異動的老師，以及全園之後節慶獎金發放月的未封存薪資，會標成「待重算」；要由負責薪資的同仁到薪資頁重新計算，已封存的月份不受影響</li>
          </ul>
          <p class="apply-undo">{{ undoText }}</p>
          <!-- 補救模式：發布＝一小時內不可逆套用到現行班級，要求輸入學年確認意圖 -->
          <div v-if="appliesImmediately" class="confirm-year">
            <label class="confirm-year-label" :for="confirmInputId">
              請輸入學年「{{ targetSchoolYear }}」，確認要立即套用到現行班級
            </label>
            <el-input
              :id="confirmInputId"
              v-model="confirmYear"
              class="confirm-year-input"
              placeholder="輸入學年數字"
              inputmode="numeric"
              autocomplete="off"
            />
            <span v-if="confirmYearMismatch" class="confirm-year-error" role="alert">
              請輸入 {{ targetSchoolYear }}
            </span>
          </div>
        </section>

        <div class="totals-row">
          <div class="total-chip"><span class="total-label">班級數</span><span class="total-value">{{ preview.totals.class_count }}</span></div>
          <div class="total-chip"><span class="total-label">分派人數</span><span class="total-value">{{ preview.totals.assigned_count }}</span></div>
          <div class="total-chip"><span class="total-label">畢業</span><span class="total-value">{{ preview.totals.graduating_count }}</span></div>
          <div class="total-chip"><span class="total-label">排除</span><span class="total-value">{{ preview.totals.excluded_count }}</span></div>
        </div>

        <!-- dialog 內沒有表格可定位：提醒事項只列文字，不給可點的外觀 -->
        <PlanIssuesSummary :issues="preview.issues" :interactive="false" class="publish-issues" />

        <div class="section">
          <h4>逐班分派</h4>
          <table class="classes-table">
            <thead>
              <tr>
                <th>年級</th><th>班名</th><th>人數</th><th>班導</th><th>副班導</th><th>美語老師</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(cls, idx) in preview.classes" :key="idx">
                <td>{{ cls.grade_name ?? '—' }}</td>
                <td>{{ cls.target_name }}</td>
                <td :class="{ 'over-capacity': cls.capacity != null && cls.assigned_count > cls.capacity }">
                  {{ cls.assigned_count }}/{{ cls.capacity ?? '—' }}
                </td>
                <td>{{ cls.head_teacher_name ?? '未指派' }}</td>
                <td>{{ cls.assistant_teacher_name ?? '未指派' }}</td>
                <td>{{ cls.art_teacher_name ?? '未指派' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 畢業名單常有三、四十人：多欄排列，不再一人一行把 dialog 拉成長條 -->
        <div class="section">
          <h4>畢業名單（{{ preview.graduating.length }}）</h4>
          <ul class="summary-list summary-list--grid graduating-list">
            <li v-for="s in preview.graduating" :key="s.id">{{ s.name }}<span class="source">{{ s.source_classroom_name ?? '' }}</span></li>
          </ul>
        </div>
        <div class="section">
          <h4>排除名單（{{ preview.excluded.length }}）</h4>
          <ul class="summary-list summary-list--grid excluded-list">
            <li v-for="s in preview.excluded" :key="s.id">
              {{ s.name }}<span class="source">{{ s.source_classroom_name ?? '' }}</span>
              <span v-if="s.exclude_reason" class="reason">（{{ s.exclude_reason }}）</span>
              <!-- 排除只是不搬班：畢業年級的學生畢業日照樣會被自動畢業 -->
              <span v-if="willGraduateIds.has(s.id)" class="will-graduate">將於 {{ graduationText }} 畢業</span>
            </li>
          </ul>
        </div>

      </template>
      <el-empty v-else-if="!loading" description="尚無預覽資料" />
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">取消</el-button>
      <!-- disabled 除 blocking gating 外也要吃父層 publish() in-flight（submitting），
           防雙擊以同一 base_version 送第二發撞 409 偽版本衝突 -->
      <el-button
        :type="appliesImmediately ? 'danger' : 'primary'"
        :disabled="!canPublish || submitting"
        :loading="loading || submitting"
        @click="emit('confirm')"
      >
        確認發布
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getClassroomYearPlanPreview } from '@/api/classroomYearPlan'
import { apiError } from '@/utils/error'
import PlanIssuesSummary from '@/components/enrollment/planning/PlanIssuesSummary.vue'
import { FORM_DIALOG_WIDTH } from '@/constants/formDialog'
import type { Schema } from '@/api/_generated/typed'
import { formatPlanDate } from './planHelpers'

type PreviewOut = Schema<'PreviewOut'>

// 發布前摘要 dialog：純讀（preview）+ 派發「使用者確認發布」意圖，實際呼叫
// publishClassroomYearPlan 交給父層 YearPlanWorkspaceView（其持有
// useYearPlanWorkspace 的單一狀態來源，version_conflict/blocking_issues 統一在那
// 邊處理）。發布失敗於 blocking_issues race 時，父層呼叫 `reload()`（defineExpose）
// 重新整理本 dialog 的 preview，讓使用者看到最新阻擋清單。

const props = withDefaults(defineProps<{
  modelValue: boolean
  planId: number | null
  /** 父層 publish() in-flight：期間確認/取消鈕鎖定，防雙擊重複送出。 */
  submitting?: boolean
  /** 排程套用日（目標學年上學期開學日，'YYYY-MM-DD'）。 */
  applyDate?: string | null
  /** 補救模式：目前已是目標學年上學期，發布後排程下一輪（約一小時內）就套用。 */
  appliesImmediately?: boolean
  targetSchoolYear?: number | null
  /** 已分班的一般升班生中，換到別班的人數（父層由草稿計算；預覽 API 沒有逐生資料） */
  movedCount?: number
  /** 已分班的留級生人數 */
  retainCount?: number
  /** 排程是否啟用；關閉時發布後不會自動套用 */
  schedulerEnabled?: boolean
  /** 畢業日（'YYYY-MM-DD'）：排除的畢業年級學生仍會在這天被畢業 */
  graduationDate?: string | null
  /** 自動畢業是否開啟；關閉時排除的學生不會被畢業，不標畢業日 */
  autoGraduationEnabled?: boolean
}>(), {
  submitting: false,
  applyDate: null,
  appliesImmediately: false,
  targetSchoolYear: null,
  movedCount: 0,
  retainCount: 0,
  schedulerEnabled: true,
  graduationDate: null,
  autoGraduationEnabled: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const loading = ref(false)
const preview = ref<PreviewOut | null>(null)
const loadErrorMessage = ref<string | null>(null)

const confirmYear = ref('')
const confirmInputId = `plan-publish-confirm-${Math.random().toString(36).slice(2, 8)}`

const blockingCount = computed(() => preview.value?.issues.blocking.length ?? 0)
// NFKC：注音輸入法全形狀態打出的「１１５」也要算（否則按鈕永遠停用又沒提示）
const normalizedConfirmYear = computed(() => confirmYear.value.normalize('NFKC').trim())
const yearConfirmed = computed(
  () => !props.appliesImmediately || normalizedConfirmYear.value === String(props.targetSchoolYear ?? ''),
)
const confirmYearMismatch = computed(
  () => props.appliesImmediately && normalizedConfirmYear.value !== '' && !yearConfirmed.value,
)
const canPublish = computed(
  () => preview.value != null && blockingCount.value === 0 && !loading.value && yearConfirmed.value,
)

const applyWhenText = computed(() => {
  if (!props.schedulerEnabled) {
    return '自動套用未啟用：發布後不會自動套用到正式班級，請聯絡系統管理員開啟。'
  }
  const year = props.targetSchoolYear
  if (props.appliesImmediately) {
    return `現在已是 ${year} 學年上學期，發布後約一小時內就會套用到現行班級。`
  }
  const date = formatPlanDate(props.applyDate)
  return date
    ? `發布後，系統會在 ${date}（${year} 學年上學期開始）自動套用到正式班級。`
    : '發布後，系統會在新學年上學期開始時自動套用到正式班級。'
})
const assignedText = computed(() => {
  const total = preview.value?.totals.assigned_count ?? 0
  const year = props.targetSchoolYear
  const base = `${total} 位學生升到 ${year != null ? `${year} 學年` : '新學年'}班級`
  const parts: string[] = []
  if (props.movedCount > 0) parts.push(`${props.movedCount} 位換班`)
  if (props.retainCount > 0) parts.push(`${props.retainCount} 位留級`)
  return parts.length ? `${base}（其中 ${parts.join('、')}）` : base
})
// 被排除但仍會在畢業日被自動畢業的學生（後端 exclude_will_graduate 提醒帶 student_id）
const willGraduateIds = computed(() => new Set(
  (props.autoGraduationEnabled ? preview.value?.issues.warnings ?? [] : [])
    .filter(issue => issue.code === 'exclude_will_graduate' && issue.student_id != null)
    .map(issue => issue.student_id as number),
))
const graduationText = computed(() => formatPlanDate(props.graduationDate) || '畢業日')
const excludedText = computed(() => {
  const total = preview.value?.totals.excluded_count ?? 0
  const graduating = (preview.value?.excluded ?? []).filter(s => willGraduateIds.value.has(s.id)).length
  if (graduating === 0) return `${total} 位排除的學生不會被搬動，仍留在原班`
  return `${total} 位排除的學生不會被搬動；其中 ${graduating} 位畢業年級的學生仍會在 ${graduationText.value} 畢業`
})

const undoText = computed(() =>
  props.appliesImmediately
    ? '套用後無法復原；還沒準備好就先不要發布。'
    : '套用前都可以「撤回發布」回到草稿修改；套用後無法復原。',
)

async function reload(): Promise<void> {
  if (props.planId == null) return
  loading.value = true
  try {
    const res = await getClassroomYearPlanPreview(props.planId)
    preview.value = res.data
    loadErrorMessage.value = null
  } catch (e) {
    loadErrorMessage.value = apiError(e, '載入發布預覽失敗')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      confirmYear.value = ''
      void reload()
    }
  },
  { immediate: true },
)

defineExpose({ reload, preview, blockingCount, canPublish })
</script>

<style scoped>
.publish-body {
  min-height: 120px;
}

.load-error {
  margin-bottom: var(--space-3);
}

.apply-notice {
  margin-bottom: var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-info-soft);
  border-radius: var(--radius-md);
  background: var(--color-info-soft);
  color: var(--text-primary);
  font-size: var(--text-sm);
}

.apply-notice--danger {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}

.apply-when {
  margin: 0 0 var(--space-2);
  font-weight: var(--font-weight-semibold);
}

.consequence-list {
  margin: 0 0 var(--space-2);
  padding-left: var(--space-5);
  line-height: 1.7;
}

.apply-undo {
  margin: 0;
  color: var(--text-secondary);
}

.confirm-year {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-3);
  font-weight: var(--font-weight-semibold);
}

.confirm-year-input {
  max-width: 200px;
}

.confirm-year-error {
  font-size: var(--text-xs);
  font-weight: var(--font-weight-regular);
  color: var(--color-danger-hover);
}

.totals-row {
  display: flex;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.total-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-2);
  border-radius: var(--radius-md);
  background: var(--neutral-100);
}

.total-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.total-value {
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-bold);
}

.publish-issues {
  margin-bottom: var(--space-4);
}

.section {
  margin-bottom: var(--space-4);
}

.section h4 {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
}

.classes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.classes-table th,
.classes-table td {
  border: 1px solid var(--neutral-300);
  padding: 4px 8px;
  text-align: center;
}

.over-capacity {
  color: var(--color-danger-hover);
  font-weight: 700;
}

.summary-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: var(--text-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.summary-list--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  column-gap: var(--space-4);
}

.source {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  margin-left: var(--space-1);
}

.reason {
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.will-graduate {
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-warning-darker);
  background: var(--color-warning-soft);
}
</style>
