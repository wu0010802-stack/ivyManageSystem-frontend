<template>
  <el-dialog v-model="visible" title="發布預覽" width="720px" class="plan-publish-dialog">
    <div v-loading="loading" class="publish-body">
      <template v-if="preview">
        <div class="totals-row">
          <div class="total-chip"><span class="total-label">班級數</span><span class="total-value">{{ preview.totals.class_count }}</span></div>
          <div class="total-chip"><span class="total-label">分派人數</span><span class="total-value">{{ preview.totals.assigned_count }}</span></div>
          <div class="total-chip"><span class="total-label">畢業</span><span class="total-value">{{ preview.totals.graduating_count }}</span></div>
          <div class="total-chip"><span class="total-label">排除</span><span class="total-value">{{ preview.totals.excluded_count }}</span></div>
        </div>

        <PlanIssuesPanel :issues="preview.issues" class="publish-issues" />

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
                <td>{{ cls.head_teacher_name ?? '待確認' }}</td>
                <td>{{ cls.assistant_teacher_name ?? '待確認' }}</td>
                <td>{{ cls.art_teacher_name ?? '待確認' }}</td>
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
        type="primary"
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
import PlanIssuesPanel from '@/components/enrollment/planning/PlanIssuesPanel.vue'
import type { Schema } from '@/api/_generated/typed'

type PreviewOut = Schema<'PreviewOut'>

// 發布前摘要 dialog：純讀（preview）+ 派發「使用者確認發布」意圖，實際呼叫
// publishClassroomYearPlan 交給父層 YearPlanWorkspaceView（其持有
// useYearPlanWorkspace 的單一狀態來源，version_conflict/blocking_issues 統一在那
// 邊處理）。發布失敗於 blocking_issues race 時，父層呼叫 `reload()`（defineExpose）
// 重新整理本 dialog 的 preview，讓使用者看到最新阻擋清單。

const props = defineProps<{
  modelValue: boolean
  planId: number | null
  /** 父層 publish() in-flight：期間確認/取消鈕鎖定，防雙擊重複送出。 */
  submitting?: boolean
}>()

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

const blockingCount = computed(() => preview.value?.issues.blocking.length ?? 0)
const canPublish = computed(() => preview.value != null && blockingCount.value === 0 && !loading.value)

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
    if (v) void reload()
  },
  { immediate: true },
)

defineExpose({ reload, preview, blockingCount, canPublish })
</script>

<style scoped>
.publish-body {
  min-height: 120px;
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
