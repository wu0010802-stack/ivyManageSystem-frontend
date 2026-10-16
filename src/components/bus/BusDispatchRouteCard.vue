<script setup lang="ts">
/**
 * 今日調度：班次卡片（FE-DISPATCH-03）。
 *
 * 純呈現元件。狀態徽章五態（未生成／已排定／進行中／已完成／已過期）；
 * 「已完成」仍可點入生成同日第二趟（spec 當日計畫生命週期第 1 點：
 * completed／expired 不算未完成 trip）。載客計數 departed+pending / capacity，
 * 超過 capacity 紅字警示。方向文案沿用 DIRECTION_LABELS（早上接學生／下午送學生）。
 */
import { computed } from 'vue'
import { DIRECTION_LABELS } from '@/composables/useBusRouteEditor'

export interface DispatchPlanSummary {
  route_id: number
  route_name: string
  direction: 'morning' | 'afternoon'
  depart_time: string
  status: 'none' | 'planned' | 'in_progress' | 'completed' | 'expired'
  departed_count: number
  pending_count: number
  capacity: number
  end_time_estimated: string | null
}

const props = defineProps<{
  plan: DispatchPlanSummary
  active: boolean
}>()

const emit = defineEmits<{
  select: [routeId: number]
}>()

const STATUS_META: Record<
  DispatchPlanSummary['status'],
  { label: string; type: 'info' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  none: { label: '未生成', type: 'info' },
  planned: { label: '已排定', type: 'primary' },
  in_progress: { label: '進行中', type: 'success' },
  completed: { label: '已完成', type: 'warning' },
  expired: { label: '已過期', type: 'danger' },
}

const statusMeta = computed(() => STATUS_META[props.plan.status])
const directionLabel = computed(() => DIRECTION_LABELS[props.plan.direction])
const loadCount = computed(() => props.plan.departed_count + props.plan.pending_count)
const overloaded = computed(() => loadCount.value > props.plan.capacity)
</script>

<template>
  <button
    type="button"
    class="bus-dispatch-route-card"
    :class="{ 'bus-dispatch-route-card--active': active }"
    data-test="card"
    @click="emit('select', plan.route_id)"
  >
    <div class="bus-dispatch-route-card__head">
      <span class="bus-dispatch-route-card__direction">{{ directionLabel }}</span>
      <el-tag :type="statusMeta.type" size="small" data-test="status-badge">
        {{ statusMeta.label }}
      </el-tag>
    </div>
    <div class="bus-dispatch-route-card__name">{{ plan.route_name }}</div>
    <div class="bus-dispatch-route-card__meta">
      <span data-test="depart-time">{{ plan.depart_time }} 出發</span>
      <span
        class="bus-dispatch-route-card__load"
        :class="{ 'bus-dispatch-route-card__load--over': overloaded }"
        data-test="load-count"
      >
        {{ loadCount }} / {{ plan.capacity }} 人
      </span>
    </div>
    <div
      v-if="plan.status === 'in_progress' && plan.end_time_estimated"
      class="bus-dispatch-route-card__eta"
      data-test="end-time"
    >
      預計 {{ plan.end_time_estimated }} 結束
    </div>
  </button>
</template>

<style scoped>
.bus-dispatch-route-card {
  display: block;
  width: 100%;
  padding: 12px;
  text-align: left;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
}

.bus-dispatch-route-card--active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}

.bus-dispatch-route-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bus-dispatch-route-card__direction {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.bus-dispatch-route-card__name {
  margin-top: 4px;
  font-weight: 600;
}

.bus-dispatch-route-card__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.bus-dispatch-route-card__load--over {
  color: var(--el-color-danger);
  font-weight: 600;
}

.bus-dispatch-route-card__eta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
