<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createEvent, deleteEvent, getCalendarFeed, updateEvent } from '@/api/events'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'

const loading = ref(false)
const events = ref([])
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
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
const eventTypeMap = Object.fromEntries(eventTypes.map((item) => [item.value, item]))

const form = reactive({
  id: null,
  title: '',
  description: '',
  event_date: '',
  end_date: null,
  event_type: 'general',
  is_all_day: true,
  start_time: '',
  end_time: '',
  location: '',
})

const selectedEvent = ref(null)
const searchText = ref('')

const resetForm = () => {
  form.id = null
  form.title = ''
  form.description = ''
  form.event_date = ''
  form.end_date = null
  form.event_type = 'general'
  form.is_all_day = true
  form.start_time = ''
  form.end_time = ''
  form.location = ''
}

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth() + 1)
const monthLabel = computed(() => `${currentYear.value} 年 ${currentMonth.value} 月`)

const officialSyncAlertType = computed(() => {
  if (officialSync.value?.warning) return 'warning'
  return 'info'
})

const officialSyncMessage = computed(() => {
  if (officialSync.value?.warning) return officialSync.value.warning
  return '國定假日與補班日依官方資料自動同步，官方項目為唯讀。'
})

const filteredEvents = computed(() => {
  if (!searchText.value) return events.value
  const keyword = searchText.value.toLowerCase()
  return events.value.filter((event) =>
    event.title.toLowerCase().includes(keyword)
    || (event.description && event.description.toLowerCase().includes(keyword))
    || (event.location && event.location.toLowerCase().includes(keyword))
  )
})

const daysInMonth = computed(() => new Date(currentYear.value, currentMonth.value, 0).getDate())

const firstDayOfWeek = computed(() => {
  const day = new Date(currentYear.value, currentMonth.value - 1, 1).getDay()
  return day === 0 ? 6 : day - 1
})

const calendarDays = computed(() => {
  const yr = currentYear.value
  const mo = String(currentMonth.value).padStart(2, '0')
  const totalDays = daysInMonth.value

  // 預建日期→事件 Map，避免對每天都做 O(n) 線性掃描
  const eventsByDate = new Map()
  for (const event of events.value) {
    const start = event.event_date
    const end = event.end_date || event.event_date
    for (let d = 1; d <= totalDays; d += 1) {
      const dateStr = `${yr}-${mo}-${String(d).padStart(2, '0')}`
      if (dateStr >= start && dateStr <= end) {
        if (!eventsByDate.has(dateStr)) eventsByDate.set(dateStr, [])
        eventsByDate.get(dateStr).push(event)
      }
    }
  }

  const days = []
  for (let i = 0; i < firstDayOfWeek.value; i += 1) {
    days.push({ day: null, events: [] })
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateStr = `${yr}-${mo}-${String(day).padStart(2, '0')}`
    days.push({ day, date: dateStr, events: eventsByDate.get(dateStr) || [] })
  }
  return days
})

const exportCalendar = () => {
  downloadFile(`/exports/calendar?year=${currentYear.value}&month=${currentMonth.value}`, `${currentYear.value}年${currentMonth.value}月行事曆.xlsx`)
}

const exportHolidays = () => {
  downloadFile(`/exports/holidays?year=${currentYear.value}`, `${currentYear.value}年國定假日.xlsx`)
}

const fetchEvents = async () => {
  loading.value = true
  try {
    const res = await getCalendarFeed({ year: currentYear.value, month: currentMonth.value })
    events.value = res.data.events
    officialSync.value = res.data.official_sync
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const prevMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value - 2, 1)
  fetchEvents()
}

const nextMonth = () => {
  currentDate.value = new Date(currentYear.value, currentMonth.value, 1)
  fetchEvents()
}

const goToday = () => {
  const current = new Date()
  currentDate.value = new Date(current.getFullYear(), current.getMonth(), 1)
  fetchEvents()
}

const isToday = (dateStr) => {
  if (!dateStr) return false
  const current = new Date()
  const todayStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
  return dateStr === todayStr
}

const handleAdd = (dateStr) => {
  isEdit.value = false
  resetForm()
  if (dateStr) form.event_date = dateStr
  dialogVisible.value = true
}

const showDetail = (event) => {
  selectedEvent.value = event
  detailVisible.value = true
}

const openEvent = (event) => {
  if (event.is_read_only) {
    showDetail(event)
    return
  }
  isEdit.value = true
  Object.assign(form, {
    id: event.id,
    title: event.title,
    description: event.description || '',
    event_date: event.event_date,
    end_date: event.end_date || null,
    event_type: event.event_type,
    is_all_day: event.is_all_day,
    start_time: event.start_time || '',
    end_time: event.end_time || '',
    location: event.location || '',
  })
  dialogVisible.value = true
}

const saveEvent = async () => {
  if (!form.title || !form.event_date) {
    ElMessage.warning('請填寫標題與日期')
    return
  }

  try {
    const payload = {
      title: form.title,
      description: form.description || null,
      event_date: form.event_date,
      end_date: form.end_date || null,
      event_type: form.event_type,
      is_all_day: form.is_all_day,
      start_time: form.is_all_day ? null : (form.start_time || null),
      end_time: form.is_all_day ? null : (form.end_time || null),
      location: form.location || null,
    }
    if (isEdit.value) {
      await updateEvent(form.id, payload)
      ElMessage.success('事件已更新')
    } else {
      await createEvent(payload)
      ElMessage.success('事件已新增')
    }
    dialogVisible.value = false
    await fetchEvents()
  } catch (error) {
    ElMessage.error(apiError(error, '操作失敗'))
  }
}

const handleDelete = (event) => {
  ElMessageBox.confirm(`確定要刪除「${event.title}」？`, '確認刪除', {
    confirmButtonText: '刪除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await deleteEvent(event.id)
      ElMessage.success('事件已刪除')
      await fetchEvents()
    } catch (error) {
      ElMessage.error(apiError(error, '刪除失敗'))
    }
  }).catch(() => {})
}

onMounted(fetchEvents)
</script>

<template>
  <div class="calendar-page" v-loading="loading">
    <div class="page-header">
      <h2>學校行事曆</h2>
      <div class="header-actions">
        <el-button type="success" @click="exportCalendar">匯出行事曆</el-button>
        <el-button @click="exportHolidays">匯出假日</el-button>
        <el-button type="primary" @click="handleAdd(null)">新增事件</el-button>
      </div>
    </div>

    <el-alert
      :title="officialSyncMessage"
      :type="officialSyncAlertType"
      :closable="false"
      show-icon
      class="sync-alert"
    />

    <el-card class="calendar-card">
      <div class="calendar-nav">
        <el-button @click="prevMonth" :icon="'ArrowLeft'" circle size="small" />
        <h3 class="month-label">{{ monthLabel }}</h3>
        <el-button @click="nextMonth" :icon="'ArrowRight'" circle size="small" />
        <el-button size="small" style="margin-left: 12px" @click="goToday">今天</el-button>
      </div>

      <div class="calendar-grid">
        <div v-for="day in ['一', '二', '三', '四', '五', '六', '日']" :key="day" class="calendar-header">
          {{ day }}
        </div>
        <div
          v-for="(cell, idx) in calendarDays"
          :key="idx"
          class="calendar-cell"
          :class="{ empty: !cell.day, today: isToday(cell.date) }"
          @dblclick="cell.day && handleAdd(cell.date)"
        >
          <div v-if="cell.day" class="cell-day">{{ cell.day }}</div>
          <div v-if="cell.events.length" class="cell-events">
            <div
              v-for="event in cell.events.slice(0, 3)"
              :key="event.id"
              class="event-dot"
              :class="{ 'event-dot--readonly': event.is_read_only }"
              :style="{ backgroundColor: eventTypeMap[event.event_type]?.color || '#909399' }"
              :title="event.title"
              @click.stop="openEvent(event)"
            >
              <span v-if="event.is_official" class="event-dot__flag">官</span>
              {{ event.title.length > 6 ? `${event.title.slice(0, 6)}…` : event.title }}
            </div>
            <div v-if="cell.events.length > 3" class="event-more">
              +{{ cell.events.length - 3 }} 更多
            </div>
          </div>
        </div>
      </div>

      <div class="legend">
        <span v-for="item in eventTypes" :key="item.value" class="legend-item">
          <span class="legend-dot" :style="{ backgroundColor: item.color }"></span>
          {{ item.label }}
        </span>
      </div>
    </el-card>

    <el-card style="margin-top: 20px">
      <div class="list-header">
        <h3>事件列表</h3>
        <el-input v-model="searchText" placeholder="搜尋事件" clearable style="width: 220px" prefix-icon="Search" />
      </div>
      <el-table :data="filteredEvents" stripe style="width: 100%" max-height="600" empty-text="本月無事件">
        <el-table-column label="日期" width="120">
          <template #default="{ row }">
            {{ row.event_date }}
            <span v-if="row.end_date && row.end_date !== row.event_date"> ~ {{ row.end_date }}</span>
          </template>
        </el-table-column>
        <el-table-column label="標題" min-width="200">
          <template #default="{ row }">
            <div class="title-cell">
              <span>{{ row.title }}</span>
              <el-tag v-if="row.is_official" size="small" type="info">官方</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="類型" width="110" align="center">
          <template #default="{ row }">
            <el-tag
              :color="eventTypeMap[row.event_type]?.color"
              effect="dark"
              size="small"
              style="border: none; color: #fff"
            >
              {{ row.event_type_label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="時間" width="120">
          <template #default="{ row }">
            <span v-if="row.is_all_day">全天</span>
            <span v-else>{{ row.start_time }} - {{ row.end_time }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地點" width="120" />
        <el-table-column prop="description" label="說明" min-width="180" show-overflow-tooltip />
        <el-table-column fixed="right" label="操作" width="160" align="center">
          <template #default="{ row }">
            <template v-if="row.is_read_only">
              <el-button link type="primary" size="small" @click="showDetail(row)">查看</el-button>
              <span class="readonly-label">唯讀</span>
            </template>
            <template v-else>
              <el-button link type="primary" size="small" @click="openEvent(row)">編輯</el-button>
              <el-button link type="danger" size="small" @click="handleDelete(row)">刪除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯事件' : '新增事件'" width="550px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="標題" required>
          <el-input v-model="form.title" placeholder="例：期末教學會議" />
        </el-form-item>
        <el-form-item label="類型">
          <el-select v-model="form.event_type" style="width: 100%">
            <el-option
              v-for="item in eventTypes.filter((eventType) => !['holiday', 'makeup_workday'].includes(eventType.value))"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="開始日期" required>
          <el-date-picker v-model="form.event_date" type="date" placeholder="選擇日期" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="結束日期">
          <el-date-picker v-model="form.end_date" type="date" placeholder="多日事件可選" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="全天">
          <el-switch v-model="form.is_all_day" />
        </el-form-item>
        <el-form-item v-if="!form.is_all_day" label="開始時間">
          <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="開始時間" style="width: 100%" />
        </el-form-item>
        <el-form-item v-if="!form.is_all_day" label="結束時間">
          <el-time-picker v-model="form.end_time" format="HH:mm" value-format="HH:mm" placeholder="結束時間" style="width: 100%" />
        </el-form-item>
        <el-form-item label="地點">
          <el-input v-model="form.location" placeholder="例：會議室A" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="事件說明..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEvent">儲存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="事件詳情" width="460px">
      <template v-if="selectedEvent">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="標題">
            <span>{{ selectedEvent.title }}</span>
            <el-tag v-if="selectedEvent.is_official" size="small" type="info" style="margin-left: 8px">官方</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="類型">
            <el-tag
              :color="eventTypeMap[selectedEvent.event_type]?.color"
              effect="dark"
              size="small"
              style="border: none; color: #fff"
            >
              {{ selectedEvent.event_type_label }}
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
          <el-descriptions-item label="地點">{{ selectedEvent.location || '—' }}</el-descriptions-item>
          <el-descriptions-item label="說明">{{ selectedEvent.description || '—' }}</el-descriptions-item>
          <el-descriptions-item label="資料來源">
            {{ selectedEvent.is_official ? '官方同步（唯讀）' : '校內事件' }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">關閉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sync-alert {
  margin-bottom: 16px;
}

.calendar-card {
  overflow: visible;
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
  border-radius: var(--radius-sm);
}

.calendar-header {
  padding: 8px;
  text-align: center;
  font-weight: bold;
  font-size: var(--text-sm);
  color: #606266;
  background: var(--bg-color-soft);
  border-bottom: 1px solid var(--border-color);
}

.calendar-cell {
  min-height: 90px;
  padding: 4px 6px;
  border-right: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background 0.15s;
}

.calendar-cell:hover:not(.empty) {
  background: var(--bg-color-soft);
}

.calendar-cell.empty {
  background: var(--bg-color);
  cursor: default;
}

.calendar-cell.today {
  background: #ecf5ff;
}

.calendar-cell.today .cell-day {
  color: #409eff;
  font-weight: bold;
}

.cell-day {
  font-size: var(--text-sm);
  color: #303133;
  margin-bottom: 2px;
}

.cell-events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-dot {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.event-dot--readonly {
  opacity: 0.92;
}

.event-dot__flag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 10px;
}

.event-dot:hover {
  opacity: 0.85;
}

.event-more {
  font-size: 11px;
  color: #909399;
}

.legend {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: #606266;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.list-header h3 {
  margin: 0;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.readonly-label {
  color: #909399;
  font-size: 12px;
}
</style>
