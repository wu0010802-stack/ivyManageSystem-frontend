<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getEvents, createEvent, updateEvent, deleteEvent, getHolidayImportTemplate, importHolidays } from '@/api/events'
import { downloadFile } from '@/utils/download'

const loading = ref(false)
const events = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)

const now = new Date()
const currentDate = ref(new Date(now.getFullYear(), now.getMonth(), 1))

const eventTypes = [
  { value: 'meeting', label: '會議', color: '#409EFF' },
  { value: 'activity', label: '活動', color: '#67C23A' },
  { value: 'holiday', label: '假日', color: '#E6A23C' },
  { value: 'general', label: '一般', color: '#909399' },
]

const eventTypeMap = Object.fromEntries(eventTypes.map(t => [t.value, t]))

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

const exportCalendar = () => {
  downloadFile(`/exports/calendar?year=${currentYear.value}&month=${currentMonth.value}`, `${currentYear.value}年${currentMonth.value}月行事曆.xlsx`)
}

const exportHolidays = () => {
  downloadFile(`/exports/holidays?year=${currentYear.value}`, `${currentYear.value}年國定假日.xlsx`)
}

const downloadHolidayTemplate = async () => {
  try {
    const res = await getHolidayImportTemplate()
    const blob = new Blob([res.data])
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = '假日匯入範本.xlsx'
    link.click()
    URL.revokeObjectURL(link.href)
  } catch {
    ElMessage.error('下載範本失敗')
  }
}

const holidayImportVisible = ref(false)
const holidayImportLoading = ref(false)
const holidayImportResult = ref(null)

const handleHolidayImport = async (file) => {
  holidayImportLoading.value = true
  holidayImportResult.value = null
  try {
    const formData = new FormData()
    formData.append('file', file.raw)
    const res = await importHolidays(formData)
    holidayImportResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`匯入完成，成功建立/更新 ${res.data.upserted} 筆假日`)
    }
  } catch (err) {
    ElMessage.error('匯入失敗：' + (err.response?.data?.detail || err.message))
  } finally {
    holidayImportLoading.value = false
  }
  return false
}

const fetchEvents = async () => {
  loading.value = true
  try {
    const res = await getEvents({ year: currentYear.value, month: currentMonth.value })
    events.value = res.data
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

// Calendar helpers
const daysInMonth = computed(() => {
  return new Date(currentYear.value, currentMonth.value, 0).getDate()
})

const firstDayOfWeek = computed(() => {
  // 0=Sun, we want Mon=0
  const d = new Date(currentYear.value, currentMonth.value - 1, 1).getDay()
  return d === 0 ? 6 : d - 1
})

const calendarDays = computed(() => {
  const days = []
  // Padding for days before the 1st
  for (let i = 0; i < firstDayOfWeek.value; i++) {
    days.push({ day: null, events: [] })
  }
  for (let d = 1; d <= daysInMonth.value; d++) {
    const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const dayEvents = events.value.filter(ev => {
      const start = ev.event_date
      const end = ev.end_date || ev.event_date
      return dateStr >= start && dateStr <= end
    })
    days.push({ day: d, date: dateStr, events: dayEvents })
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

const handleAdd = (dateStr) => {
  isEdit.value = false
  resetForm()
  if (dateStr) form.event_date = dateStr
  dialogVisible.value = true
}

const handleEdit = (ev) => {
  isEdit.value = true
  Object.assign(form, {
    id: ev.id,
    title: ev.title,
    description: ev.description || '',
    event_date: ev.event_date,
    end_date: ev.end_date || null,
    event_type: ev.event_type,
    is_all_day: ev.is_all_day,
    start_time: ev.start_time || '',
    end_time: ev.end_time || '',
    location: ev.location || '',
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
    fetchEvents()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '操作失敗')
  }
}

const handleDelete = (ev) => {
  ElMessageBox.confirm(`確定要刪除「${ev.title}」？`, '確認刪除', {
    confirmButtonText: '刪除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    try {
      await deleteEvent(ev.id)
      ElMessage.success('事件已刪除')
      fetchEvents()
    } catch (error) {
      ElMessage.error(error.response?.data?.detail || '刪除失敗')
    }
  }).catch(() => {})
}

// Event list view (table below calendar)
const searchText = ref('')
const filteredEvents = computed(() => {
  if (!searchText.value) return events.value
  const kw = searchText.value.toLowerCase()
  return events.value.filter(ev =>
    ev.title.toLowerCase().includes(kw) ||
    (ev.description && ev.description.toLowerCase().includes(kw)) ||
    (ev.location && ev.location.toLowerCase().includes(kw))
  )
})

const monthLabel = computed(() => `${currentYear.value} 年 ${currentMonth.value} 月`)

onMounted(fetchEvents)
</script>

<template>
  <div class="calendar-page" v-loading="loading">
    <!-- Header -->
    <div class="page-header">
      <h2>學校行事曆</h2>
      <div class="header-actions">
        <el-button type="success" @click="exportCalendar">匯出行事曆</el-button>
        <el-button @click="exportHolidays">匯出假日</el-button>
        <el-button @click="downloadHolidayTemplate">下載假日範本</el-button>
        <el-button @click="holidayImportVisible = true">匯入假日</el-button>
        <el-button type="primary" @click="handleAdd(null)">新增事件</el-button>
      </div>
    </div>

    <!-- Calendar navigation -->
    <el-card class="calendar-card">
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
          @dblclick="cell.day && handleAdd(cell.date)"
        >
          <div class="cell-day" v-if="cell.day">{{ cell.day }}</div>
          <div class="cell-events" v-if="cell.events.length">
            <div
              v-for="ev in cell.events.slice(0, 3)"
              :key="ev.id"
              class="event-dot"
              :style="{ backgroundColor: eventTypeMap[ev.event_type]?.color || '#909399' }"
              :title="ev.title"
              @click.stop="handleEdit(ev)"
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
    </el-card>

    <!-- Event list table -->
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
        <el-table-column prop="title" label="標題" min-width="150" />
        <el-table-column label="類型" width="90" align="center">
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
        <el-table-column prop="description" label="說明" min-width="150" show-overflow-tooltip />
        <el-table-column fixed="right" label="操作" width="130" align="center">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="handleEdit(row)">編輯</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Add/Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '編輯事件' : '新增事件'" width="550px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="標題" required>
          <el-input v-model="form.title" placeholder="例：期末教學會議" />
        </el-form-item>
        <el-form-item label="類型">
          <el-select v-model="form.event_type" style="width: 100%">
            <el-option v-for="t in eventTypes" :key="t.value" :label="t.label" :value="t.value" />
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
        <el-form-item label="開始時間" v-if="!form.is_all_day">
          <el-time-picker v-model="form.start_time" format="HH:mm" value-format="HH:mm" placeholder="開始時間" style="width: 100%" />
        </el-form-item>
        <el-form-item label="結束時間" v-if="!form.is_all_day">
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

    <!-- 假日匯入 Dialog -->
    <el-dialog v-model="holidayImportVisible" title="批次匯入國定假日" width="500px">
      <div style="margin-bottom: 12px;">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>上傳 Excel 檔案，系統將批次新增/更新假日記錄（UPSERT by 日期）。匯入後考勤計算將自動排除這些假日。</template>
        </el-alert>
      </div>
      <div style="margin-bottom: 8px;">
        <el-button link type="primary" size="small" @click="downloadHolidayTemplate">
          下載匯入範本
        </el-button>
      </div>
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleHolidayImport"
        accept=".xlsx"
        :limit="1"
        :show-file-list="false"
      >
        <el-icon class="el-icon--upload" style="font-size: 48px; color: var(--el-color-primary);"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖曳 Excel 至此，或 <em>點擊選取</em></div>
        <template #tip><div class="el-upload__tip">僅支援 .xlsx 格式</div></template>
      </el-upload>
      <div v-if="holidayImportLoading" style="text-align:center; margin-top: 16px;">
        <el-icon class="is-loading" style="font-size: 24px;"><Loading /></el-icon> 匯入中…
      </div>
      <el-card v-if="holidayImportResult" style="margin-top: 16px;" shadow="never">
        <div style="display: flex; gap: 16px; align-items: center;">
          <span>共 <strong>{{ holidayImportResult.total }}</strong> 筆</span>
          <el-tag type="success">成功 {{ holidayImportResult.upserted }}</el-tag>
          <el-tag v-if="holidayImportResult.failed > 0" type="danger">失敗 {{ holidayImportResult.failed }}</el-tag>
        </div>
        <div v-if="holidayImportResult.errors?.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
          <p v-for="e in holidayImportResult.errors" :key="e" style="font-size:12px; color:var(--el-color-danger); margin: 2px 0;">{{ e }}</p>
        </div>
      </el-card>
      <template #footer>
        <el-button @click="holidayImportVisible = false">關閉</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
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
  font-size: 11px;
  color: #fff;
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
</style>
