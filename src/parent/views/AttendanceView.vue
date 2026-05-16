<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ChildSelector from '../components/ChildSelector.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { getMonthlyAttendance } from '../api/attendance'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import PullToRefresh from '../components/PullToRefresh.vue'
import ParentIcon from '../components/ParentIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1)

const data = ref(null)
const loading = ref(false)
const dayMap = computed(() => {
  const m = new Map()
  for (const item of data.value?.items || []) m.set(item.date, item)
  return m
})

const counts = computed(() => data.value?.counts || {})
const recordedDays = computed(() => data.value?.recorded_days || 0)

const calendarDays = computed(() => {
  const y = year.value
  const m = month.value
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  const cells = []
  // 補滿前面（週一為起點）→ 為簡化用週日為起點
  const startWeekday = firstDay.getDay() // 0=Sun
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({
      date: dateStr,
      day: d,
      info: dayMap.value.get(dateStr) || null,
    })
  }
  return cells
})

const selected = ref(null)
function selectCell(cell) {
  if (!cell) return
  selected.value = cell
}

async function fetchData() {
  if (!selectedId.value) return
  loading.value = true
  try {
    const { data: res } = await getMonthlyAttendance(
      selectedId.value,
      year.value,
      month.value,
    )
    data.value = res
  } catch (err) {
    toast.error(err?.displayMessage || '載入出席紀錄失敗')
  } finally {
    loading.value = false
  }
}

function prevMonth() {
  if (month.value === 1) {
    month.value = 12
    year.value -= 1
  } else {
    month.value -= 1
  }
}

function nextMonth() {
  if (month.value === 12) {
    month.value = 1
    year.value += 1
  } else {
    month.value += 1
  }
}

function goToday() {
  const d = new Date()
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
}

// status → IvyKids tint token mapping
// 出席/present/on_time → tint-calendar（綠）
// 病假/事假/leave/absence → tint-leave（青綠）
// 缺席/absent → tint-announcement（珊瑚紅）
// 遲到/late/tardy → tint-money（黃，與一般出席區隔）
const statusColor = (status) => {
  return {
    出席:   { bg: 'var(--pt-tint-calendar)',     color: 'var(--pt-tint-calendar-fg)' },
    缺席:   { bg: 'var(--pt-tint-announcement)', color: 'var(--pt-tint-announcement-fg)' },
    病假:   { bg: 'var(--pt-tint-leave)',        color: 'var(--pt-tint-leave-fg)' },
    事假:   { bg: 'var(--pt-tint-leave)',        color: 'var(--pt-tint-leave-fg)' },
    遲到:   { bg: 'var(--pt-tint-money)',        color: 'var(--pt-tint-money-fg)' },
  }[status] || { bg: 'var(--pt-surface-mute)', color: 'var(--pt-text-soft)' }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
  fetchData()
})

watch([selectedId, year, month], fetchData)

async function pullRefresh() {
  await fetchData()
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="attendance-view">
    <ChildSelector />

    <div class="month-bar">
      <button class="nav" type="button" aria-label="上個月" @click="prevMonth">
        <ParentIcon name="back" size="sm" />
      </button>
      <span class="month-label">{{ year }} 年 {{ month }} 月</span>
      <button class="today-btn" type="button" @click="goToday">今天</button>
      <button class="nav" type="button" aria-label="下個月" @click="nextMonth">
        <ParentIcon name="chevron-right" size="sm" />
      </button>
    </div>

    <div class="stats">
      <span>已紀錄 {{ recordedDays }} 天</span>
      <span v-if="counts.出席">出席 {{ counts.出席 }}</span>
      <span v-if="counts.缺席">缺席 {{ counts.缺席 }}</span>
      <span v-if="counts.病假">病假 {{ counts.病假 }}</span>
      <span v-if="counts.事假">事假 {{ counts.事假 }}</span>
      <span v-if="counts.遲到">遲到 {{ counts.遲到 }}</span>
    </div>

    <div class="weekday-row">
      <div v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w">
        {{ w }}
      </div>
    </div>

    <div class="calendar">
      <div
        v-for="(cell, i) in calendarDays"
        :key="i"
        class="cell"
        :class="{ filled: cell, has: cell?.info, selected: !!cell && selected?.date === cell.date }"
        :style="cell?.info ? {
          background: statusColor(cell.info.status).bg,
          color: statusColor(cell.info.status).color,
        } : {}"
        @click="selectCell(cell)"
      >
        <template v-if="cell">
          <span class="day">{{ cell.day }}</span>
          <span v-if="cell.info" class="status-mini">{{ cell.info.status }}</span>
        </template>
      </div>
    </div>

    <div v-if="selected?.info" class="detail">
      <div class="detail-row">
        <span class="label">日期</span>
        <span>{{ selected.date }}</span>
      </div>
      <div class="detail-row">
        <span class="label">狀態</span>
        <span>{{ selected.info.status }}</span>
      </div>
      <div v-if="selected.info.remark" class="detail-row">
        <span class="label">備註</span>
        <span>{{ selected.info.remark }}</span>
      </div>
    </div>
    <EmptyState
      v-else-if="selected"
      variant="inline"
      :title="`${selected.date} 尚無紀錄`"
    />

    <div v-if="loading && !data" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="2" />
    </div>
    <div v-else-if="loading" class="loading-mask" aria-hidden="true" />
  </PullToRefresh>
</template>

<style scoped>
.attendance-view {
  position: relative;
}
.attendance-view :deep(.ptr-content) {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.month-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 12px;
  padding: 8px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.month-label {
  flex: 1;
  text-align: center;
  font-size: 15px;
  font-weight: 800;
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.nav {
  width: var(--touch-target-min, 44px);
  height: var(--touch-target-min, 44px);
  border: none;
  border-radius: 12px;
  background: var(--pt-tint-brand, var(--brand-primary-soft));
  color: var(--brand-primary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.today-btn {
  min-height: var(--touch-target-min, 44px);
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 12px;
  background: var(--pt-surface-raised, var(--pt-surface-card));
  color: var(--m3-on-surface, var(--pt-text-strong));
  font-size: 12px;
  font-weight: 800;
  padding: 0 12px;
  cursor: pointer;
}

.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

.stats span {
  background: var(--pt-surface-card, var(--neutral-0));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  padding: 5px 10px;
  border-radius: 999px;
  font-weight: 700;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  text-align: center;
  font-size: 12px;
  color: var(--pt-text-placeholder);
  padding: 0 2px;
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 12px;
  padding: 6px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.cell {
  aspect-ratio: 1;
  background: transparent;
  border-radius: 11px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: default;
}

.cell.filled {
  background: var(--pt-surface-recessed, var(--pt-surface-mute));
  cursor: pointer;
}

.cell.has {
  font-weight: 600;
}

.cell.selected {
  outline: 2px solid var(--brand-primary);
}

.day {
  line-height: 1;
}

.status-mini {
  font-size: 10px;
  margin-top: 2px;
}

.detail {
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 12px;
  padding: 14px 16px;
  font-size: 14px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.detail-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.detail-row .label {
  color: var(--pt-text-placeholder);
  width: 48px;
}

.loading-mask {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.4);
  pointer-events: none;
}

.skeleton-wrap {
  margin-top: 12px;
}
</style>
