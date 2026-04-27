<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ChildSelector from '../components/ChildSelector.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import { getMonthlyAttendance } from '../api/attendance'
import { toast } from '../utils/toast'

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

const statusColor = (status) => {
  return {
    出席: { bg: '#e6f4ea', color: '#2d6a3a' },
    缺席: { bg: '#fde8e8', color: '#a51c1c' },
    病假: { bg: '#fff4e6', color: '#a25e0a' },
    事假: { bg: '#eaf2fb', color: '#2057a8' },
    遲到: { bg: '#fff8d6', color: '#7a6500' },
  }[status] || { bg: '#f0f2f5', color: '#666' }
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
  fetchData()
})

watch([selectedId, year, month], fetchData)
</script>

<template>
  <div class="attendance-view">
    <ChildSelector />

    <div class="month-bar">
      <button class="nav" @click="prevMonth">‹</button>
      <span class="month-label">{{ year }} 年 {{ month }} 月</span>
      <button class="nav" @click="nextMonth">›</button>
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
        :class="{ filled: cell, has: cell?.info, selected: selected?.date === cell?.date }"
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
    <div v-else-if="selected" class="detail empty">
      {{ selected.date }} 尚無紀錄
    </div>

    <div v-if="loading" class="loading-mask">載入中...</div>
  </div>
</template>

<style scoped>
.attendance-view {
  position: relative;
}

.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: #fff;
  border-radius: 12px;
  padding: 8px;
  margin-bottom: 12px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.month-label {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.nav {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  font-size: 20px;
  color: #3f7d48;
  cursor: pointer;
}

.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #555;
  margin-bottom: 10px;
}

.stats span {
  background: #fff;
  padding: 4px 10px;
  border-radius: 12px;
}

.weekday-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  text-align: center;
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cell {
  aspect-ratio: 1;
  background: transparent;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: default;
}

.cell.filled {
  background: #fff;
  cursor: pointer;
}

.cell.has {
  font-weight: 600;
}

.cell.selected {
  outline: 2px solid #3f7d48;
}

.day {
  line-height: 1;
}

.status-mini {
  font-size: 10px;
  margin-top: 2px;
}

.detail {
  margin-top: 12px;
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.detail.empty {
  color: #888;
  text-align: center;
}

.detail-row {
  display: flex;
  gap: 8px;
  padding: 4px 0;
}

.detail-row .label {
  color: #888;
  width: 48px;
}

.loading-mask {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  pointer-events: none;
}
</style>
