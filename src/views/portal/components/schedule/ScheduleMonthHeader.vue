<script setup lang="ts">
defineProps({
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  summary: { type: Object, default: null }, // { total_hours, work_days, ... } – 預留給未來 summary stats
})

defineEmits(['prev', 'next'])
</script>

<template>
  <div class="schedule-month-header">
    <div class="month-nav">
      <el-button class="ctrl-btn" @click="$emit('prev')">上月</el-button>
      <span class="month-label">{{ year }} 年 {{ month }} 月</span>
      <el-button class="ctrl-btn" @click="$emit('next')">下月</el-button>
    </div>

    <div v-if="summary" class="month-summary">
      <span v-if="summary.total_hours != null">
        總工時：<strong>{{ summary.total_hours }}</strong> h
      </span>
      <span v-if="summary.work_days != null">
        排班天數：<strong>{{ summary.work_days }}</strong> 天
      </span>
    </div>
  </div>
</template>

<style scoped>
.schedule-month-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.month-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ctrl-btn {
  min-height: var(--touch-target-min);
  padding-left: var(--space-4);
  padding-right: var(--space-4);
}

.month-label {
  font-size: var(--text-lg);
  font-weight: 600;
  min-width: 140px;
  text-align: center;
}

.month-summary {
  display: flex;
  gap: var(--space-3);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.month-summary strong {
  color: var(--text-primary);
}

@media (--to-sm) {
  .month-nav {
    justify-content: center;
  }
  .month-label {
    min-width: 120px;
    font-size: var(--text-base);
  }
}
</style>
