<script setup>
import StatCard from '@/components/common/StatCard.vue'
import { Calendar, Clock, Warning, Close, ArrowDown, Tickets } from '@element-plus/icons-vue'

defineProps({
  summary: { type: Object, required: true },
})
</script>

<template>
  <div class="attendance-stats">
    <StatCard
      label="出勤天數"
      :value="summary.total_work_days ?? 0"
      :icon="Calendar"
      color="primary"
      variant="filled"
    />
    <StatCard
      label="平均工時(h)"
      :value="summary.avg_work_hours ?? 0"
      :icon="Clock"
      color="primary"
      variant="filled"
    />
    <StatCard
      label="遲到次數"
      :value="summary.late_count ?? 0"
      :icon="Warning"
      color="warning"
      variant="filled"
    />
    <StatCard
      label="早退次數"
      :value="summary.early_leave_count ?? 0"
      :icon="ArrowDown"
      color="warning"
      variant="filled"
    />
    <StatCard
      label="缺卡次數"
      :value="summary.missing_punch_count ?? 0"
      :icon="Close"
      color="danger"
      variant="filled"
    />
    <StatCard
      label="請假天數"
      :value="summary.leave_count ?? 0"
      :icon="Tickets"
      color="info"
      variant="filled"
    />
  </div>
</template>

<style scoped>
.attendance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
</style>
