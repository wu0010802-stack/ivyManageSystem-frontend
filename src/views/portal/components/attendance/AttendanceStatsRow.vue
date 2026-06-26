<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  summary: { type: Object, required: true },
})

const totalDays = computed(() => props.summary.total_work_days ?? 0)
const avgHours = computed(() => {
  const v = props.summary.avg_work_hours
  return v == null ? '—' : Number(v).toFixed(1)
})

// Anomaly chips：有數字才顯示；零異常時整條靜默
const anomalies = computed(() => {
  const out = []
  if (props.summary.late_count > 0) {
    out.push({ key: 'late', label: '遲到', value: props.summary.late_count, severity: 'warn' })
  }
  if (props.summary.early_leave_count > 0) {
    out.push({ key: 'early', label: '早退', value: props.summary.early_leave_count, severity: 'warn' })
  }
  if (props.summary.missing_punch_count > 0) {
    out.push({ key: 'missing', label: '缺卡', value: props.summary.missing_punch_count, severity: 'danger' })
  }
  if (props.summary.leave_count > 0) {
    out.push({ key: 'leave', label: '請假', value: props.summary.leave_count, severity: 'info' })
  }
  return out
})

const hasAnomaly = computed(() => anomalies.value.length > 0)
</script>

<template>
  <div class="stats-strip" data-test="attendance-stats">
    <!-- 主指標：出勤天數 / 平均工時 -->
    <div class="stats-strip__primary">
      <div class="metric">
        <span class="metric__value">{{ totalDays }}</span>
        <span class="metric__label">出勤天數</span>
      </div>
      <div class="metric metric--secondary">
        <span class="metric__value">{{ avgHours }}<span class="metric__unit">h</span></span>
        <span class="metric__label">平均工時</span>
      </div>
    </div>

    <!-- 異常 chips：有才顯示，依嚴重度上色 -->
    <div v-if="hasAnomaly" class="stats-strip__chips" role="list">
      <span
        v-for="chip in anomalies"
        :key="chip.key"
        class="chip"
        :class="`chip--${chip.severity}`"
        role="listitem"
      >
        <span class="chip__dot" aria-hidden="true"></span>
        <span class="chip__label">{{ chip.label }}</span>
        <span class="chip__value">{{ chip.value }}</span>
      </span>
    </div>

    <!-- 全月零異常時的靜默徽記 -->
    <div v-else class="stats-strip__clean">
      <span class="clean-dot" aria-hidden="true"></span>
      <span>本月無異常</span>
    </div>
  </div>
</template>

<style scoped>
.stats-strip {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex-wrap: wrap;
}

.stats-strip__primary {
  display: flex;
  align-items: baseline;
  gap: var(--space-6);
}

.metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric__value {
  font-size: var(--text-4xl);
  font-weight: 700;
  color: var(--pt-text-strong, var(--text-primary));
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.metric--secondary .metric__value {
  font-size: var(--text-3xl);
  font-weight: 600;
  color: var(--pt-text-body, var(--text-primary));
}

.metric__unit {
  font-size: 0.65em;
  font-weight: 500;
  margin-left: 2px;
  color: var(--pt-text-muted, var(--text-secondary));
}

.metric__label {
  font-size: var(--text-sm);
  color: var(--pt-text-muted, var(--text-secondary));
  font-weight: 500;
}

.stats-strip__chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-left: auto;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
  background: var(--neutral-100);
  color: var(--pt-text-body, var(--text-primary));
  border: 1px solid var(--neutral-200);
}

.chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.chip__value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--pt-text-strong, var(--text-primary));
}

.chip--warn {
  background: var(--color-warning-soft);
  border-color: transparent;
  color: var(--color-warning-darker);
}

.chip--danger {
  background: var(--color-danger-soft);
  border-color: transparent;
  color: var(--color-danger-darker);
}

.chip--info {
  background: var(--color-info-soft);
  border-color: transparent;
  color: var(--color-info-darker);
}

.stats-strip__clean {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-sm);
  color: var(--color-success-darker);
  margin-left: auto;
}

.clean-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 0 3px var(--color-success-soft);
}

@media (--to-sm) {
  .stats-strip {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-4);
  }
  .stats-strip__primary {
    justify-content: space-between;
  }
  .metric__value {
    font-size: var(--text-3xl);
  }
  .metric--secondary .metric__value {
    font-size: var(--text-2xl);
  }
  .stats-strip__chips {
    margin-left: 0;
  }
  .stats-strip__clean {
    margin-left: 0;
  }
}
</style>
