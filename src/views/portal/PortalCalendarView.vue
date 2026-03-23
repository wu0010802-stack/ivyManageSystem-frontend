<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getCalendar } from '@/api/portal'
import { apiError } from '@/utils/error'

const loading = ref(false)
const events = ref([])
const officialSync = ref(null)

const now = new Date()
const currentDate = ref(new Date(now.getFullYear(), now.getMonth(), 1))

const eventTypes = [
  { value: 'meeting', label: '會議', color: '#409EFF' },
  { value: 'activity', label: '活動', color: '#67C23A' },
  { value: 'holiday', label: '國定假日', color: '#E6A23C' },
  { value: 'makeup_workday', label: '補班日', color: '#8B5CF6' },
  { value: 'general', label: '一般', color: '#909399' },
]
const eventTypeMap = Object.fromEntries(eventTypes.map(t => [t.value, t]))

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth() + 1)
const monthLabel = computed(() => `${currentYear.value} 年 ${currentMonth.value} 月`)

const fetchEvents = async () => {
  loading.value = true
  try {
    const res = await getCalendar({ year: currentYear.value, month: currentMonth.value })
    events.value = res.data.events || []
    officialSync.value = res.data.official_sync || null
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const officialSyncAlertType = computed(() => officialSync.value?.warning ? 'warning' : 'info')

const officialSyncMessage = computed(() => {
  if (officialSync.value?.warning) return officialSync.value.warning
  return '此行事曆與後台同步，包含校內事件、國定假日與補班日。'
})

// Calendar helpers
const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value, 0).getDate())

const firstDayOfWeek = computed(() => {
  const d = new Date(currentYear.value, currentMonth.value - 1, 1).getDay()
  return d === 0 ? 6 : d - 1
})

const calendarDays = computed(() => {
  const yr = currentYear.value
  const mo = String(currentMonth.value).padStart(2, '0')
  const totalDays = daysInMonth.value

  // 預建日期→事件 Map，避免對每天都做 O(n) 線性掃描
  const eventsByDate = new Map()
  for (const ev of events.value) {
    const start = ev.event_date
    const end = ev.end_date || ev.event_date
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${yr}-${mo}-${String(d).padStart(2, '0')}`
      if (dateStr >= start && dateStr <= end) {
        if (!eventsByDate.has(dateStr)) eventsByDate.set(dateStr, [])
        eventsByDate.get(dateStr).push(ev)
      }
    }
  }

  const days = []
  for (let i = 0; i < firstDayOfWeek.value; i++) {
    days.push({ day: null, events: [] })
  }
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${yr}-${mo}-${String(d).padStart(2, '0')}`
    days.push({ day: d, date: dateStr, events: eventsByDate.get(dateStr) || [] })
  }
  return days
})

const prevMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 2, 1)
  fetchEvents()
}
const nextMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value, 1)
  fetchEvents()
}
const goToday = () => {
  const n = new Date()
  currentDate.value = new Date(n.getFullYear(), n.getMonth(), 1)
  fetchEvents()
}

const isToday = (dateStr) => {
  if (!dateStr) return false
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return dateStr === todayStr
}

// Detail dialog
const detailVisible = ref(false)
const selectedEvent = ref(null)
const showDetail = (ev) => {
  selectedEvent.value = ev
  detailVisible.value = true
}

onMounted(fetchEvents)
</script>

<template>
  <div class="portal-calendar" v-loading="loading">
    <el-alert
      :title="officialSyncMessage"
      :type="officialSyncAlertType"
      :closable="false"
      show-icon
      class="sync-alert"
    />

    <!-- Calendar navigation -->
    <div class="calendar-nav">
      <el-button @click="prevMonth" :icon="'ArrowLeft'" circle size="small" />
      <h3 class="month-label">{{ monthLabel }}</h3>
      <el-button @click="nextMonth" :icon="'ArrowRight'" circle size="small" />
      <el-button size="small" @click="goToday" style="margin-left: 12px">今天</el-button>
    </div>

    <!-- Calendar grid -->
    <div class="calendar-grid">
      <div class="calendar-header" v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day">
        {{ day }}
      </div>
      <div
        v-for="(cell, idx) in calendarDays"
        :key="idx"
        class="calendar-cell"
        :class="{ 'empty': !cell.day, 'today': isToday(cell.date) }"
      >
        <div class="cell-day" v-if="cell.day">{{ cell.day }}</div>
        <div class="cell-events" v-if="cell.events.length">
          <div
            v-for="ev in cell.events.slice(0, 3)"
            :key="ev.id"
            class="event-dot"
            :style="{ backgroundColor: eventTypeMap[ev.event_type]?.color || '#909399' }"
            :title="ev.title"
            @click.stop="showDetail(ev)"
          >
            {{ ev.title.length > 6 ? ev.title.slice(0, 6) + '…' : ev.title }}
          </div>
          <div v-if="cell.events.length > 3" class="event-more">
            +{{ cell.events.length - 3 }} 更多
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="legend">
      <span v-for="t in eventTypes" :key="t.value" class="legend-item">
        <span class="legend-dot" :style="{ backgroundColor: t.color }"></span>
        {{ t.label }}
      </span>
    </div>

    <!-- Upcoming events list -->
    <div class="upcoming" v-if="events.length">
      <h4>本月事件</h4>
      <div
        v-for="ev in events"
        :key="ev.id"
        class="event-card"
        @click="showDetail(ev)"
      >
        <div class="event-card-left">
          <span class="event-type-bar" :style="{ backgroundColor: eventTypeMap[ev.event_type]?.color || '#909399' }"></span>
        </div>
        <div class="event-card-body">
          <div class="event-card-title">{{ ev.title }}</div>
          <div class="event-card-meta">
            <span>{{ ev.event_date }}<template v-if="ev.end_date && ev.end_date !== ev.event_date"> ~ {{ ev.end_date }}</template></span>
            <span v-if="!ev.is_all_day"> | {{ ev.start_time }} - {{ ev.end_time }}</span>
            <span v-if="ev.location"> | {{ ev.location }}</span>
          </div>
        </div>
        <el-tag
          v-if="ev.is_official"
          type="info"
          effect="plain"
          size="small"
        >
          官方
        </el-tag>
        <el-tag :color="eventTypeMap[ev.event_type]?.color" effect="dark" size="small" style="border: none; color: #fff">
          {{ ev.event_type_label }}
        </el-tag>
      </div>
    </div>
    <el-empty v-else-if="!loading" description="本月沒有排定的事件" />

    <!-- Detail Dialog -->
    <el-dialog v-model="detailVisible" title="事件詳情" width="450px">
      <template v-if="selectedEvent">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="標題">{{ selectedEvent.title }}</el-descriptions-item>
          <el-descriptions-item label="類型">
            <el-tag :color="eventTypeMap[selectedEvent.event_type]?.color" effect="dark" size="small" style="border: none; color: #fff">
              {{ selectedEvent.event_type_label }}
            </el-tag>
            <el-tag v-if="selectedEvent.is_official" type="info" effect="plain" size="small" style="margin-left: 8px">
              官方
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="日期">
            {{ selectedEvent.event_date }}
            <template v-if="selectedEvent.end_date && selectedEvent.end_date !== selectedEvent.event_date">
              ~ {{ selectedEvent.end_date }}
            </template>
          </el-descriptions-item>
          <el-descriptions-item label="時間">
            <span v-if="selectedEvent.is_all_day">全天</span>
            <span v-else>{{ selectedEvent.start_time }} - {{ selectedEvent.end_time }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="地點" v-if="selectedEvent.location">{{ selectedEvent.location }}</el-descriptions-item>
          <el-descriptions-item label="說明" v-if="selectedEvent.description">{{ selectedEvent.description }}</el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">關閉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.portal-calendar {
  padding: 10px;
}

.sync-alert {
  margin-bottom: var(--space-4);
}

.calendar-nav {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.month-label {
  margin: 0;
  min-width: 140px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--surface-color);
}

.calendar-header {
  padding: 8px;
  text-align: center;
  font-weight: bold;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg-color-soft);
  border-bottom: 1px solid var(--border-color);
}

.calendar-cell {
  min-height: 80px;
  padding: 4px 6px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
}

.calendar-cell.empty {
  background: var(--bg-color);
}

.calendar-cell.today {
  background: var(--color-info-lighter);
}

.calendar-cell.today .cell-day {
  color: var(--color-info);
  font-weight: bold;
}

.cell-day {
  font-size: var(--text-sm);
  color: var(--text-primary);
  margin-bottom: 2px;
}

.cell-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-dot {
  font-size: 11px;
  color: var(--surface-color);
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.event-dot:hover {
  opacity: 0.85;
}

.event-more {
  font-size: 11px;
  color: var(--text-tertiary);
}

.legend {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.upcoming {
  margin-top: var(--space-5);
}

.upcoming h4 {
  margin: 0 0 var(--space-3);
  color: var(--text-primary);
}

.event-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px var(--space-3);
  background: var(--surface-color);
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: box-shadow 0.15s;
  border: 1px solid var(--border-color);
}

.event-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.event-card-left {
  flex-shrink: 0;
}

.event-type-bar {
  display: block;
  width: 4px;
  height: 36px;
  border-radius: 2px;
}

.event-card-body {
  flex: 1;
  min-width: 0;
}

.event-card-title {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
}

.event-card-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: 2px;
}
</style>
