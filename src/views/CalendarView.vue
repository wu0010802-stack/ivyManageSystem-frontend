<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from '@fullcalendar/core'
import { createEvent, deleteEvent, getCalendarFeed, updateEvent } from '@/api/events'
import { getAdminFeed } from '@/api/calendar'
import { useCalendarLayers } from '@/composables/useCalendarLayers'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'
import CalendarToolbar from '@/components/calendar/CalendarToolbar.vue'
import RecurrenceEditor from '@/components/calendar/RecurrenceEditor.vue'
import type { RecurrenceRule } from '@/components/calendar/types'
import type { CalendarLayer } from '@/api/calendar'
import CalendarBoard from '@/components/calendar/CalendarBoard.vue'
import CalendarEventDetailDialog from '@/components/calendar/CalendarEventDetailDialog.vue'
import { EVENT_TYPES } from '@/constants/calendarEventTypes'

interface CalendarEvent {
  id: number
  title: string
  event_date: string
  end_date?: string | null
  event_type: string
  description?: string
  location?: string
  is_all_day: boolean
  start_time?: string
  end_time?: string
  is_read_only?: boolean
  event_type_label?: string
  is_official?: boolean
  recurrence_rule?: RecurrenceRule | null
  [key: string]: unknown
}

interface OfficialSync {
  warning?: string
  [key: string]: unknown
}

const router = useRouter()
const {
  enabledLayers,
  fullCalendarEvents,
  setItems,
} = useCalendarLayers()

const loading = ref(false)
const events = ref<CalendarEvent[]>([])
const deleting = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const isEdit = ref(false)
const officialSync = ref<OfficialSync | null>(null)
const searchText = ref('')

// FC 當前可見區間（datesSet 維護），用於決定 admin_feed window + export 月份
const viewRange = ref<{ start: Date; end: Date }>({
  start: new Date(),
  end: new Date(),
})

const currentYear = computed(() => viewRange.value.start.getFullYear())
const currentMonth = computed(() => viewRange.value.start.getMonth() + 1)

const eventTypes = EVENT_TYPES
const eventTypeMap = Object.fromEntries(eventTypes.map((item) => [item.value, item]))

const form = reactive<{
  id: number | null
  title: string
  description: string
  event_date: string
  end_date: string | null
  event_type: string
  is_all_day: boolean
  start_time: string
  end_time: string
  location: string
  recurrence_rule: RecurrenceRule | null
}>({
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
  recurrence_rule: null,
})

const selectedEvent = ref<CalendarEvent | null>(null)

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
  form.recurrence_rule = null
}

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

const exportCalendar = () => {
  downloadFile(`/exports/calendar?year=${currentYear.value}&month=${currentMonth.value}`, `${currentYear.value}年${currentMonth.value}月行事曆.xlsx`)
}

const exportHolidays = () => {
  downloadFile(`/exports/holidays?year=${currentYear.value}`, `${currentYear.value}年國定假日.xlsx`)
}

// FC 給 end 是 exclusive — 在拉資料窗口時減一天得到 inclusive end
const fmtDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const fetchAdminFeed = async (start: Date, end: Date) => {
  try {
    const fromStr = fmtDate(start)
    const toExclusive = new Date(end)
    toExclusive.setDate(toExclusive.getDate() - 1)
    const toStr = fmtDate(toExclusive)
    const resp = await getAdminFeed(fromStr, toStr)
    setItems(resp.data.items)
  } catch (error) {
    console.error('[calendar] getAdminFeed failed', error)
    setItems([])
  }
}

const fetchEvents = async () => {
  loading.value = true
  try {
    const res = await getCalendarFeed({ year: currentYear.value, month: currentMonth.value })
    const d = res.data as { events: CalendarEvent[]; official_sync?: OfficialSync }
    events.value = d.events
    officialSync.value = d.official_sync ?? null
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

const refreshAll = () => {
  fetchEvents()
  fetchAdminFeed(viewRange.value.start, viewRange.value.end)
}

const handleAdd = (dateStr: string | null | undefined) => {
  isEdit.value = false
  resetForm()
  if (dateStr) form.event_date = dateStr
  dialogVisible.value = true
}

const showDetail = (event: CalendarEvent) => {
  selectedEvent.value = event
  detailVisible.value = true
}

const openEvent = (event: CalendarEvent) => {
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
    recurrence_rule: event.recurrence_rule ?? null,
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
      recurrence_rule: form.recurrence_rule || null,
    }
    if (isEdit.value) {
      await updateEvent(form.id!, payload)
      ElMessage.success('事件已更新')
    } else {
      await createEvent(payload)
      ElMessage.success('事件已新增')
    }
    dialogVisible.value = false
    refreshAll()
  } catch (error) {
    ElMessage.error(apiError(error, '操作失敗'))
  }
}

const handleDelete = async (event: CalendarEvent) => {
  try {
    await ElMessageBox.confirm(`確定要刪除「${event.title}」？`, '確認刪除', {
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  deleting.value = true
  try {
    await deleteEvent(event.id)
    ElMessage.success('事件已刪除')
    refreshAll()
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  } finally {
    deleting.value = false
  }
}

// ===== FullCalendar callbacks =====

const onDatesSet = (arg: DatesSetArg) => {
  viewRange.value = { start: arg.start, end: arg.end }
  // 月份變化時：若新月份和上次 fetchEvents 不同，重撈 events
  // 同時撈當前 view window 的 admin_feed
  fetchAdminFeed(arg.start, arg.end)
  fetchEvents()
}

const onEventClick = (arg: EventClickArg) => {
  const layer = arg.event.extendedProps.layer as CalendarLayer | undefined
  const rawId = arg.event.extendedProps.rawId
  const link = arg.event.extendedProps.link as string | null | undefined

  if (layer === 'event') {
    // Phase C 展開的重複事件 id 為 "{pk}@{date}"——取 pk 部分
    const pk = typeof rawId === 'string' ? Number(rawId.split('@')[0]) : Number(rawId)
    const ev = events.value.find((e) => e.id === pk)
    if (ev) {
      openEvent(ev)
      return
    }
  }
  // 其他 layer：有 link 就導頁
  if (link) router.push(link)
}

const fmtHHMM = (d: Date) => {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const onEventDrop = async (info: EventDropArg) => {
  const layer = info.event.extendedProps.layer as CalendarLayer | undefined
  if (layer !== 'event') {
    info.revert()
    ElMessage.warning('此項目不能拖拉改期')
    return
  }
  const rawId = info.event.extendedProps.rawId
  const pk = typeof rawId === 'string' ? Number(rawId.split('@')[0]) : Number(rawId)
  if (!pk || Number.isNaN(pk)) {
    info.revert()
    return
  }

  const start = info.event.start
  if (!start) {
    info.revert()
    return
  }
  const newStart = fmtDate(start)
  // FC all-day end 是 exclusive；timed end 是 inclusive
  let newEnd: string | null = null
  if (info.event.end) {
    if (info.event.allDay) {
      const e = new Date(info.event.end)
      e.setDate(e.getDate() - 1)
      newEnd = fmtDate(e)
    } else {
      newEnd = fmtDate(info.event.end)
    }
    if (newEnd === newStart) newEnd = null
  }

  // 在 timeGridWeek/Day 拖時段事件時，同步送 start_time/end_time，
  // 否則 BE 不會改 time 欄位，前端 refetch 後事件會跳回原時段。
  const payload: Record<string, unknown> = {
    event_date: newStart,
    end_date: newEnd,
  }
  if (!info.event.allDay && info.event.start) {
    payload.is_all_day = false
    payload.start_time = fmtHHMM(info.event.start)
    payload.end_time = info.event.end ? fmtHHMM(info.event.end) : null
  }

  try {
    await updateEvent(pk, payload)
    ElMessage.success('已更新事件日期')
    refreshAll()
  } catch (error) {
    info.revert()
    ElMessage.error(apiError(error, '更新失敗，已還原'))
  }
}

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
      <CalendarToolbar v-model="enabledLayers" />
      <CalendarBoard
        :events="fullCalendarEvents"
        editable
        @event-click="onEventClick"
        @event-drop="onEventDrop"
        @dates-set="onDatesSet"
      />
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
              <el-button link type="danger" size="small" @click="handleDelete(row)" :loading="deleting">刪除</el-button>
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
        <el-form-item label="重複">
          <RecurrenceEditor v-model="form.recurrence_rule" />
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

    <CalendarEventDetailDialog v-model="detailVisible" :event="selectedEvent" />
  </div>
</template>

<style scoped>
.sync-alert {
  margin-bottom: 16px;
}

.calendar-card {
  overflow: visible;
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
  color: var(--text-tertiary);
  font-size: 12px;
}


</style>
