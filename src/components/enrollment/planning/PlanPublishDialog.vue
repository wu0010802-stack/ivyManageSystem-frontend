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
        <section class="apply-notice" :class="{ 'apply-notice--immediate': appliesImmediately }">
          <p class="apply-when">{{ applyWhenText }}</p>
          <ul class="consequence-list">
            <li>{{ preview.totals.assigned_count }} 位學生搬到新班級</li>
            <li v-if="preview.totals.graduating_count">{{ preview.totals.graduating_count }} 位大班生轉為畢業</li>
            <li v-if="preview.totals.excluded_count">{{ preview.totals.excluded_count }} 位排除的學生不會被搬動，仍留在原班</li>
            <li>各班老師的帶班資料同步更新，相關薪資需重新計算</li>
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
              :placeholder="String(targetSchoolYear ?? '')"
              inputmode="numeric"
              autocomplete="off"
            />
          </div>
        </section>

        <div class="totals-row">
          <div class="total-chip"><span class="total-label">班級數</span><span class="total-value">{{ preview.totals.class_count }}</span></div>
          <div class="total-chip"><span class="total-label">分派人數</span><span class="total-value">{{ preview.totals.assigned_count }}</span></div>
          <div class="total-chip"><span class="total-label">畢業</span><span class="total-value">{{ preview.totals.graduating_count }}</span></div>
          <div class="total-chip"><span class="total-label">排除</span><span class="total-value">{{ preview.totals.excluded_count }}</span></div>
        </div>

        <PlanIssuesSummary :issues="preview.issues" class="publish-issues" />

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

        <div class="section-row">
          <div class="section">
            <h4>畢業名單（{{ preview.graduating.length }}）</h4>
            <ul class="summary-list">
              <li v-for="s in preview.graduating" :key="s.id">{{ s.name }}<span class="source">{{ s.source_classroom_name ?? '' }}</span></li>
            </ul>
          </div>
          <div class="section">
            <h4>排除名單（{{ preview.excluded.length }}）</h4>
            <ul class="summary-list">
              <li v-for="s in preview.excluded" :key="s.id">
                {{ s.name }}<span class="source">{{ s.source_classroom_name ?? '' }}</span>
                <span v-if="s.exclude_reason" class="reason">（{{ s.exclude_reason }}）</span>
              </li>
            </ul>
          </div>
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
}>(), {
  submitting: false,
  applyDate: null,
  appliesImmediately: false,
  targetSchoolYear: null,
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
const yearConfirmed = computed(
  () => !props.appliesImmediately || confirmYear.value.trim() === String(props.targetSchoolYear ?? ''),
)
const canPublish = computed(
  () => preview.value != null && blockingCount.value === 0 && !loading.value && yearConfirmed.value,
)

const applyWhenText = computed(() => {
  const year = props.targetSchoolYear
  if (props.appliesImmediately) {
    return `現在已是 ${year} 學年上學期，發布後約一小時內就會套用到現行班級。`
  }
  const date = formatPlanDate(props.applyDate)
  return date
    ? `發布後，系統會在 ${date}（${year} 學年上學期開始）自動套用到正式班級。`
    : '發布後，系統會在新學年上學期開始時自動套用到正式班級。'
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

.apply-notice--immediate {
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
  font-size: 12px;
  color: var(--text-secondary);
}

.total-value {
  font-size: 20px;
  font-weight: 700;
}

.publish-issues {
  margin-bottom: var(--space-4);
}

.section {
  margin-bottom: var(--space-4);
  flex: 1;
}

.section h4 {
  margin: 0 0 var(--space-2);
  font-size: 13px;
}

.section-row {
  display: flex;
  gap: var(--space-5);
}

.classes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
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
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source {
  color: var(--text-secondary);
  font-size: 12px;
  margin-left: 6px;
}

.reason {
  color: var(--text-secondary);
  font-size: 12px;
}
</style>
