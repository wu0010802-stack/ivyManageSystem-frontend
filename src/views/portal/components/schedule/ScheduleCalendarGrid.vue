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
          <!-- 手機一格只剩約 45px：起訖拆兩行、隱藏「~」，避免撐破七欄（10-12 實測週六整欄被裁） -->
          <div v-if="day.work_start" class="cell-time">
            <span>{{ day.work_start }}</span><span class="cell-time-sep">~</span><span>{{ day.work_end }}</span>
          </div>
          <div v-if="day.is_override" class="cell-override">
            <el-tag size="small" type="warning" effect="plain">調班</el-tag>
          </div>
          <!-- 換班按鈕：desktop only；mobile 改走 cell-click BottomSheet -->
          <!-- 用 div 攔截 click 冒泡，避免同時觸發 cell-click -->
          <!-- 過去日期也開放（SPEC-026 3-3）：後端改建「補登」確認項目，鈕文字改為「補登換班」 -->
          <div
            v-if="day.shift_name && !day.is_weekend"
            class="cell-swap-btn-wrap"
            @click.stop
          >
            <el-button
              size="small"
              type="primary"
              link
              class="cell-swap-btn"
              @click="emit('swap-click', day)"
            >{{ isFutureDate(day.date ?? '') ? '換班' : '補登換班' }}</el-button>
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
  /* minmax(0,1fr)：1fr 的最小值是內容寬，長時間字串會把欄撐開造成橫捲 */
  grid-template-columns: repeat(7, minmax(0, 1fr));
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
  grid-template-columns: repeat(7, minmax(0, 1fr));
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

/* 觸控平板（≥768px 仍顯示格內「換班」鈕）：原本 26×14，撐出觸控高度 */
@media (pointer: coarse) {
  .cell-swap-btn {
    min-height: 32px;
    padding: 0 var(--space-2) !important;
  }
}

.calendar-cell.is-tappable {
  cursor: pointer;
  -webkit-tap-highlight-color: rgba(64, 158, 255, 0.15);
}

.calendar-cell.is-tappable:focus-visible {
  outline: 2px solid var(--color-primary, var(--color-info));
  outline-offset: -2px;
}

/* 1024 以下（平板直式一格約 80px、手機約 45px）：「08:30~18:00」單行放不下，
   起訖拆兩行、隱藏「~」，班別過長省略（2026-10-12 平板驗收：原本被截成「16:3」） */
@media (--to-md) {
  .cell-time {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
  }

  .cell-time-sep {
    display: none;
  }

  .cell-shift {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (--to-sm) {
  .calendar-cell {
    min-height: 65px;
    /* 390px 寬一格約 45px：左右只留 2px，三字班別（無值週）才放得下不被截斷 */
    padding: 4px 2px;
    font-size: 12px;
  }

  .cell-shift {
    font-size: 12px;
  }

  .cell-time {
    font-size: 11px;
  }

  .cell-swap-btn-wrap {
    display: none;
  }
}
</style>
