<script setup lang="ts">
interface DayObj { day?: number; date: string; is_weekend?: boolean; shift_name?: string; work_start?: string; work_end?: string; is_override?: boolean; [key: string]: unknown }

defineProps<{
  weeks: (DayObj | null)[][]
  isToday: (day: { date: string } | null) => boolean
  isFutureDate: (dateStr: string) => boolean
  isMobile?: boolean
}>()

const emit = defineEmits<{
  'cell-click': [day: DayObj]
  'swap-click': [day: DayObj]
}>()


const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
</script>

<template>
  <div class="calendar-grid">
    <!-- 星期標題列 -->
    <div class="calendar-header">
      <div v-for="(w, i) in WEEKDAYS" :key="i" class="calendar-header-cell">{{ w }}</div>
    </div>

    <!-- 日曆列 -->
    <div v-for="(week, wi) in weeks" :key="wi" class="calendar-row">
      <div
        v-for="(day, di) in week"
        :key="di"
        class="calendar-cell"
        :class="{
          'is-today': isToday(day),
          'is-weekend': day && day.is_weekend,
          'has-shift': day && day.shift_name,
          'no-shift': day && !day.shift_name && !day.is_weekend,
          'is-empty': !day,
          'is-tappable': isMobile && !!day,
        }"
        :role="isMobile && day ? 'button' : undefined"
        :tabindex="isMobile && day ? 0 : undefined"
        @click="day && emit('cell-click', day)"
        @keydown.enter="day && emit('cell-click', day)"
      >
        <template v-if="day">
          <div class="cell-day">{{ day.day }}</div>
          <div v-if="day.shift_name" class="cell-shift">{{ day.shift_name }}</div>
          <div v-if="day.work_start" class="cell-time">
            {{ day.work_start }}~{{ day.work_end }}
          </div>
          <div v-if="day.is_override" class="cell-override">
            <el-tag size="small" type="warning" effect="plain">調班</el-tag>
          </div>
          <!-- 換班按鈕：desktop only；mobile 改走 cell-click BottomSheet -->
          <!-- 用 div 攔截 click 冒泡，避免同時觸發 cell-click -->
          <div
            v-if="day.shift_name && isFutureDate(day.date ?? '') && !day.is_weekend"
            class="cell-swap-btn-wrap"
            @click.stop
          >
            <el-button
              size="small"
              type="primary"
              link
              class="cell-swap-btn"
              @click="emit('swap-click', day)"
            >換班</el-button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-grid {
  overflow-x: auto;
}

.calendar-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  margin-bottom: 1px;
}

.calendar-header-cell {
  text-align: center;
  font-weight: 600;
  padding: var(--space-2);
  background: var(--bg-color);
  color: var(--text-secondary);
  font-size: var(--text-sm, 13px);
}

.calendar-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
}

.calendar-cell {
  min-height: 90px;
  padding: var(--space-2);
  border: 1px solid var(--border-color-light, #ebeef5);
  position: relative;
  font-size: 13px;
}

.calendar-cell.is-empty {
  background: var(--bg-color, #f5f7fa);
}

.calendar-cell.is-weekend {
  background: #fafafa;
  color: var(--text-tertiary);
}

.calendar-cell.is-today {
  border-color: var(--color-primary, var(--color-info));
  border-width: 2px;
}

.calendar-cell.has-shift {
  background: #f0f9ff;
}

.calendar-cell.no-shift {
  background: var(--pt-surface-card);
}

.cell-day {
  font-weight: 600;
  margin-bottom: 2px;
}

.cell-shift {
  font-size: 13px;
  color: var(--color-primary, var(--color-info));
  font-weight: 500;
}

.cell-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.cell-override {
  margin-top: 2px;
}

.cell-swap-btn-wrap {
  margin-top: 2px;
}

.cell-swap-btn {
  font-size: 12px !important;
  padding: 0 !important;
}

.calendar-cell.is-tappable {
  cursor: pointer;
  -webkit-tap-highlight-color: rgba(64, 158, 255, 0.15);
}

.calendar-cell.is-tappable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-info));
  outline-offset: -2px;
}

@media (--to-sm) {
  .calendar-cell {
    min-height: 65px;
    padding: 4px;
    font-size: 12px;
  }

  .cell-time {
    font-size: 10px;
  }

  .cell-swap-btn-wrap {
    display: none;
  }
}
</style>
