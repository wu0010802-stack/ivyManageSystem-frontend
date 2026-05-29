<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElAlert, ElCollapse, ElCollapseItem } from 'element-plus'
import { getLifecycleOverview, type LifecycleOverview } from '@/api/studentLifecycle'
import OuterStepperRow from './lifecycle/OuterStepperRow.vue'
import InnerGradeStepperRow from './lifecycle/InnerGradeStepperRow.vue'
import LifecycleTimelineList from './lifecycle/LifecycleTimelineList.vue'

const props = defineProps<{
  studentId: number
  active?: boolean
}>()

const overview = ref<LifecycleOverview | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const collapseValue = ref<string[]>(['timeline'])

async function load() {
  if (!props.studentId) return
  loading.value = true
  error.value = null
  try {
    const resp = await getLifecycleOverview(props.studentId)
    overview.value = resp.data as LifecycleOverview
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : 'load failed'
    overview.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.studentId, props.active] as const,
  ([sid, isActive]) => {
    if (sid && isActive !== false) load()
  },
  { immediate: true }
)
</script>

<template>
  <div class="lifecycle-tab" data-testid="lifecycle-tab">
    <div v-if="loading" data-testid="lifecycle-loading" class="loading-row">載入中...</div>
    <el-alert
      v-else-if="error"
      type="error"
      :closable="false"
      data-testid="lifecycle-error"
    >
      {{ error }}
    </el-alert>
    <template v-else-if="overview">
      <div
        v-if="overview.on_leave_badge"
        class="on-leave-banner"
        data-testid="on-leave-banner"
      >
        ⏸ {{ overview.on_leave_since || '日期未知' }} 起休學中
      </div>

      <OuterStepperRow :overview="overview" />

      <div v-if="overview.inner_grade_steps.length > 0" class="inner-section">
        <h4 class="section-title">年級進度</h4>
        <InnerGradeStepperRow :grades="overview.inner_grade_steps" />
      </div>

      <el-collapse v-model="collapseValue" class="timeline-section">
        <el-collapse-item name="timeline" title="詳細歷史">
          <LifecycleTimelineList :student-id="studentId" />
        </el-collapse-item>
      </el-collapse>
    </template>
  </div>
</template>

<style scoped>
.lifecycle-tab {
  padding: 8px;
}
.loading-row {
  padding: 16px;
  color: var(--el-color-info);
}
.on-leave-banner {
  background: var(--el-color-warning-light-9);
  color: var(--el-color-warning);
  padding: 8px 12px;
  border-radius: 4px;
  margin-bottom: 12px;
}
.section-title {
  margin: 16px 8px 8px;
  font-size: 14px;
  color: var(--el-color-info);
}
.timeline-section {
  margin-top: 16px;
}
</style>
