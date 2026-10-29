<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { ArrowDown, Search } from '@element-plus/icons-vue'
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from '@fullcalendar/core'
import { createEvent, deleteEvent, getCalendarFeed, getEvent, updateEvent } from '@/api/events'
import { getAdminFeed } from '@/api/calendar'
import { useCalendarLayers } from '@/composables/useCalendarLayers'
import { useIsMobile } from '@/composables/useIsMobile'
import { useEmployeeStore } from '@/stores/employee'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'
import CalendarToolbar from '@/components/calendar/CalendarToolbar.vue'
import CalendarEventFormDialog from '@/components/calendar/CalendarEventFormDialog.vue'
import {
  createEmptyEventForm,
  eventDetailToFormValues,
  type CalendarEventDetailSource,
  type CalendarEventFormValues,
  type CalendarEventPayload,
  type EmployeeOption,
} from '@/components/calendar/eventForm'
import type { RecurrenceRule } from '@/components/calendar/types'
import type { CalendarLayer } from '@/api/calendar'
import CalendarBoard from '@/components/calendar/CalendarBoard.vue'
import CalendarImportDialog from '@/components/calendar/CalendarImportDialog.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import AdminCreateButton from '@/components/common/AdminCreateButton.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import CalendarEventDetailDialog from '@/components/calendar/CalendarEventDetailDialog.vue'
import { eventTypeColor, eventTypeLabel } from '@/constants/calendarEventTypes'
import {
  EVENT_VISIBILITY_LABELS,
  eventVisibilityTagType,
} from '@/constants/eventVisibility'

interface CalendarEvent {
  // 重複事件展開後的每個場次 id 為 "{pk}@{date}"（非重複事件為數字）
  id: number | string
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
  visibility?: string
  category?: string
  academic_year?: number | null
  semester?: string | null
  week_no?: number | null
  owner_employee_id?: number | null
  owner_employee_name?: string | null
  source?: string
  [key: string]: unknown
}

interface OfficialSync {
  warning?: string
  [key: string]: unknown
}

const router = useRouter()
const { isMobile } = useIsMobile()
const {
  enabledLayers,
  fullCalendarEvents,
  setItems,
} = useCalendarLayers()

const loading = ref(false)
const events = ref<CalendarEvent[]>([])
// 載入失敗要明講，不能讓畫面看起來像「這個月沒有事件」：
// feedError＝月曆格線（admin_feed）失敗，eventsError＝下方事件列表失敗
const feedError = ref(false)
const eventsError = ref(false)
const deletingId = ref<number | string | null>(null)
const saving = ref(false)
const dialogVisible = ref(false)
const detailVisible = ref(false)
const importVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogInitial = ref<CalendarEventFormValues>(createEmptyEventForm())
const dialogOwnerName = ref<string | null>(null)
// 開啟時事件原本的可見範圍：只有「新發布給家長」才需要再確認一次
const originalVisibility = ref<string | null>(null)
const selectedEvent = ref<CalendarEvent | null>(null)
const officialSync = ref<OfficialSync | null>(null)
const searchText = ref('')

const employeeStore = useEmployeeStore()
onMounted(() => {
  employeeStore.fetchEmployees()
})
const employeeOptions = computed(() => employeeStore.employees as EmployeeOption[])
// createFetchStore 不 rethrow，失敗只寫進 store.error——負責人下拉要能說清楚「沒載到」
const employeesError = computed(
  () => Boolean((employeeStore as unknown as { error?: string | null }).error),
)

// FC 當前可見區間（datesSet 維護），用於決定 admin_feed window
const viewRange = ref<{ start: Date; end: Date }>({
  start: new Date(),
  end: new Date(),
})

// 當前顯示月份錨點（view.currentStart）——月檢視的格線 start 常落在前月末尾，
// 不能拿它推「顯示中的月份」，否則下方事件列表與匯出會撈到前一個月。
const viewAnchor = ref<Date>(new Date())

const currentYear = computed(() => viewAnchor.value.getFullYear())
const currentMonth = computed(() => viewAnchor.value.getMonth() + 1)

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

const emptyTitle = computed(() =>
  searchText.value ? `找不到符合「${searchText.value}」的事件` : '這個月還沒有事件',
)
const emptyDescription = computed(() =>
  searchText.value
    ? '搜尋只會比對目前顯示月份的標題、說明與地點。'
    : '按右上角「新增事件」就能建立。',
)

// ===== 匯入／匯出 =====

const exportCalendar = () => {
  downloadFile(`/exports/calendar?year=${currentYear.value}&month=${currentMonth.value}`, `${currentYear.value}年${currentMonth.value}月行事曆.xlsx`)
}

const exportHolidays = () => {
  downloadFile(`/exports/holidays?year=${currentYear.value}`, `${currentYear.value}年國定假日.xlsx`)
}

const onMenuCommand = (command: unknown) => {
  if (command === 'import') importVisible.value = true
  else if (command === 'export-calendar') exportCalendar()
  else if (command === 'export-holidays') exportHolidays()
}

// 呼叫 API 一律用來源事件的 pk：重複事件的場次 id 長得像 "5@2026-07-10"，直接拿去打 API 會 4xx
const sourceEventId = (id: number | string): number =>
  typeof id === 'string' ? Number(id.split('@')[0]) : Number(id)
const isRecurringOccurrence = (event: CalendarEvent) =>
  typeof event.id === 'string' && event.id.includes('@')

// FC 給 end 是 exclusive — 在拉資料窗口時減一天得到 inclusive end
const fmtDate = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

let adminFeedEpoch = 0
const fetchAdminFeed = async (start: Date, end: Date) => {
  const requestEpoch = ++adminFeedEpoch
  try {
    const fromStr = fmtDate(start)
    const toExclusive = new Date(end)
    toExclusive.setDate(toExclusive.getDate() - 1)
    const toStr = fmtDate(toExclusive)
    const resp = await getAdminFeed(fromStr, toStr)
    if (requestEpoch !== adminFeedEpoch) return
    setItems(resp.data.items)
    feedError.value = false
  } catch (error) {
    if (requestEpoch !== adminFeedEpoch) return
    console.error('[calendar] getAdminFeed failed', error)
    // 清空避免留著上個月的項目，並標記失敗：空白月曆 ≠ 沒有行程
    setItems([])
    feedError.value = true
  }
}

let calendarEventsEpoch = 0
const fetchEvents = async () => {
  const requestEpoch = ++calendarEventsEpoch
  const requestedYear = currentYear.value
  const requestedMonth = currentMonth.value
  loading.value = true
  try {
    const res = await getCalendarFeed({ year: requestedYear, month: requestedMonth })
    if (
      requestEpoch !== calendarEventsEpoch
      || currentYear.value !== requestedYear
      || currentMonth.value !== requestedMonth
    ) return
    const d = res.data as { events: CalendarEvent[]; official_sync?: OfficialSync }
    events.value = d.events
    officialSync.value = d.official_sync ?? null
    eventsError.value = false
  } catch (error) {
    if (requestEpoch !== calendarEventsEpoch) return
    // 清空而不是保留上個月的列：否則失敗時舊月份的事件會掛在新月份標題底下
    events.value = []
    eventsError.value = true
    ElMessage.error(apiError(error, '本月事件載入失敗'))
  } finally {
    if (requestEpoch === calendarEventsEpoch) loading.value = false
  }
}

const refreshAll = () => {
  fetchEvents()
  fetchAdminFeed(viewRange.value.start, viewRange.value.end)
}

// ===== 新增／編輯 =====

const openDialog = (
  mode: 'create' | 'edit',
  initial: CalendarEventFormValues,
  ownerName: string | null = null,
) => {
  dialogMode.value = mode
  dialogInitial.value = initial
  dialogOwnerName.value = ownerName
  originalVisibility.value = mode === 'edit' ? initial.visibility : null
  // 員工名單上次沒載到：開表單時再試一次（有快取時不會重打）
  if (employeesError.value) employeeStore.fetchEmployees()
  dialogVisible.value = true
}

const handleAdd = (dateStr: string | null | undefined) => {
  const initial = createEmptyEventForm()
  if (dateStr) initial.event_date = dateStr
  openDialog('create', initial)
}

const showDetail = (event: CalendarEvent) => {
  selectedEvent.value = event
  detailVisible.value = true
}

const openEvent = async (event: CalendarEvent) => {
  if (event.is_read_only) {
    showDetail(event)
    return
  }
  // calendar-feed 是精簡 shape（無 category/學年/負責人等欄位）——編輯前必須
  // 先抓單筆完整資料，否則存檔會把這些欄位靜默打回預設值（資料遺失）
  let detail: CalendarEvent
  try {
    const res = await getEvent(sourceEventId(event.id))
    detail = res.data as CalendarEvent
  } catch (error) {
    ElMessage.error(apiError(error, '載入事件資料失敗'))
    return
  }
  openDialog(
    'edit',
    eventDetailToFormValues(detail as unknown as CalendarEventDetailSource),
    detail.owner_employee_name ?? null,
  )
}

const saveEvent = async (payload: CalendarEventPayload) => {
  if (saving.value) return
  const editingId = dialogInitial.value.id
  // 新發布給家長（新增，或編輯時把範圍改成家長）要再確認一次：家長端手機馬上看得到
  if (
    payload.visibility === 'parent'
    && (dialogMode.value === 'create' || originalVisibility.value !== 'parent')
  ) {
    try {
      await ElMessageBox.confirm(
        `「${payload.title}」會公開給家長端，家長在手機上就看得到。確定要發布嗎？`,
        '確認發布給家長',
        { confirmButtonText: '發布', cancelButtonText: '再檢查一下', type: 'warning' },
      )
    } catch {
      return
    }
  }
  saving.value = true
  try {
    if (dialogMode.value === 'edit') {
      await updateEvent(editingId!, payload)
      ElMessage.success('事件已更新')
    } else {
      // requires_acknowledgment 僅 create 時送預設值；update 絕不送（表單
      // 未管理此欄，送出會覆寫既有事件的簽閱設定）
      await createEvent({ ...payload, requires_acknowledgment: false })
      ElMessage.success('事件已新增')
    }
    dialogVisible.value = false
    refreshAll()
  } catch (error) {
    // 失敗時對話框保持開啟、內容不動，使用者可直接修正後再送
    ElMessage.error(apiError(error, '儲存失敗，請稍後再試'))
  } finally {
    saving.value = false
  }
}

const deleteImpactNote = (event: CalendarEvent) => {
  const notes: string[] = []
  // 重複事件刪的是整個系列，不是只有點到的這一天
  if (isRecurringOccurrence(event)) notes.push('這是重複事件，刪除會一併移除整個系列的所有場次。')
  if (event.visibility === 'parent') notes.push('這個事件家長端看得到，刪除後家長端也會一併消失。')
  else if (event.visibility === 'staff') notes.push('這個事件教師端看得到，刪除後教師端也會一併消失。')
  return notes.join('')
}

const handleDelete = async (event: CalendarEvent) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${event.title}」？${deleteImpactNote(event)}`,
      '確認刪除',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  deletingId.value = event.id
  try {
    await deleteEvent(sourceEventId(event.id))
    ElMessage.success('事件已刪除')
    refreshAll()
  } catch (error) {
    ElMessage.error(apiError(error, '刪除失敗'))
  } finally {
    deletingId.value = null
  }
}

// ===== CalendarBoard 事件處理 =====

const onDatesSet = (arg: DatesSetArg) => {
  viewRange.value = { start: arg.start, end: arg.end }
  viewAnchor.value = arg.view.currentStart
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
    // Phase C 展開的重複事件 id 為 "{pk}@{date}"——先找同一場次，找不到再用 pk 找同一系列
    const pk = sourceEventId(rawId)
    const ev = events.value.find((e) => String(e.id) === String(rawId))
      ?? events.value.find((e) => sourceEventId(e.id) === pk)
    if (ev) {
      openEvent(ev)
      return
    }
    // 找不到對應事件：不能讓點擊無聲無息。多半是事件清單沒載到，或點到月曆格線上相鄰月份的日期
    if (!link) {
      ElMessage.warning(
        eventsError.value
          ? '本月事件清單沒有載入成功，請先按「重新載入」再開啟事件'
          : '這個事件不在目前月份的清單內，請切換到事件所在的月份再開啟',
      )
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
  const pk = sourceEventId(rawId)
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

  // 拖到錯的格子很容易：家長看得到的事件改期前先確認（取消就彈回原位）
  const target = events.value.find((e) => sourceEventId(e.id) === pk)
  if (target?.visibility === 'parent') {
    const range = newEnd ? `${newStart} ~ ${newEnd}` : newStart
    try {
      await ElMessageBox.confirm(
        `「${target.title}」家長端看得到，確定要改到 ${range}？`,
        '確認改期',
        { confirmButtonText: '改期', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      info.revert()
      return
    }
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

// ===== 事件列表顯示 =====

const typeLabel = (row: CalendarEvent) => row.event_type_label || eventTypeLabel(row.event_type)
const visibilityLabel = (visibility: string) => EVENT_VISIBILITY_LABELS[visibility] || '其他'
const dateText = (row: CalendarEvent) =>
  row.end_date && row.end_date !== row.event_date ? `${row.event_date} ~ ${row.end_date}` : row.event_date
const timeText = (row: CalendarEvent) => {
  if (row.is_all_day) return '全天'
  if (row.start_time && row.end_time) return `${row.start_time} - ${row.end_time}`
  return row.start_time || '—'
}

// 手機：8 欄表格要橫捲才按得到編輯／刪除，改任務卡片
const CARD_COLUMNS = [
  { label: '日期', prop: '__date', formatter: (item: Record<string, unknown>) => dateText(item as CalendarEvent) },
  { label: '類型', prop: '__type' },
  { label: '可見範圍', prop: '__visibility' },
  { label: '時間', prop: '__time', formatter: (item: Record<string, unknown>) => timeText(item as CalendarEvent) },
  { label: '地點', prop: 'location', formatter: (item: Record<string, unknown>) => (item.location as string) || '—' },
  { label: '說明', prop: 'description', block: true, formatter: (item: Record<string, unknown>) => (item.description as string) || '—' },
]
</script>

<template>
  <div class="calendar-page" v-loading="loading">
    <PageHeader :title="PAGE_TERMS.calendar">
      <template #actions>
        <el-dropdown trigger="click" @command="onMenuCommand">
          <el-button data-test="calendar-more-menu">
            匯入／匯出<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import" data-test="menu-import">匯入分校行事曆</el-dropdown-item>
              <el-dropdown-item command="export-calendar" divided data-test="menu-export-calendar">
                匯出 {{ currentYear }} 年 {{ currentMonth }} 月行事曆
              </el-dropdown-item>
              <el-dropdown-item command="export-holidays" data-test="menu-export-holidays">
                匯出 {{ currentYear }} 年國定假日
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <AdminCreateButton @click="handleAdd(null)">新增事件</AdminCreateButton>
      </template>
    </PageHeader>

    <el-alert
      :title="officialSyncMessage"
      :type="officialSyncAlertType"
      :closable="false"
      show-icon
      class="sync-alert"
    />

    <el-alert
      v-if="feedError"
      title="月曆資料載入失敗"
      type="error"
      :closable="false"
      show-icon
      class="sync-alert"
      data-test="calendar-feed-error"
    >
      <div class="feed-error-body">
        <span>月曆上現在看不到的項目，不代表這段期間沒有行程；請重新載入後再確認。</span>
        <el-button size="small" type="primary" :loading="loading" data-test="calendar-feed-retry" @click="refreshAll">
          重新載入
        </el-button>
      </div>
    </el-alert>

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

    <el-card class="list-card">
      <div class="list-header">
        <h3>{{ currentYear }} 年 {{ currentMonth }} 月事件</h3>
        <el-input
          v-model="searchText"
          class="list-search"
          placeholder="搜尋本月事件"
          aria-label="搜尋本月事件"
          clearable
          :prefix-icon="Search"
        />
      </div>

      <EmptyState
        v-if="eventsError"
        variant="error"
        title="本月事件列表載入失敗"
        description="請重新載入；成功之前請勿當作這個月沒有事件。"
        data-test="calendar-events-error"
      >
        <template #action>
          <el-button type="primary" :loading="loading" data-test="calendar-events-retry" @click="refreshAll">
            重新載入
          </el-button>
        </template>
      </EmptyState>

      <AdminListCards
        v-else-if="isMobile"
        :items="filteredEvents"
        :columns="CARD_COLUMNS"
        row-key="id"
        data-test="calendar-event-cards"
      >
        <template #empty>
          <EmptyState variant="inline" :title="emptyTitle" :description="emptyDescription" />
        </template>
        <template #title="{ item }">
          <span class="card-title">
            {{ item.title }}
            <el-tag v-if="item.is_official" size="small" type="info">官方</el-tag>
          </span>
        </template>
        <template #cell-__type="{ item }">
          <el-tag
            :color="eventTypeColor(item.event_type as string)"
            effect="dark"
            size="small"
            style="border: none; color: #fff"
          >
            {{ typeLabel(item as CalendarEvent) }}
          </el-tag>
        </template>
        <template #cell-__visibility="{ item }">
          <el-tag
            v-if="!item.is_official && item.visibility"
            :type="eventVisibilityTagType(item.visibility as string)"
            size="small"
            :effect="item.visibility === 'parent' ? 'dark' : 'plain'"
          >
            {{ visibilityLabel(item.visibility as string) }}
          </el-tag>
          <span v-else>—</span>
        </template>
        <template #actions="{ item }">
          <template v-if="item.is_read_only">
            <el-button link type="primary" size="small" @click="showDetail(item as CalendarEvent)">查看</el-button>
            <span class="readonly-label">唯讀</span>
          </template>
          <template v-else>
            <el-button link type="primary" size="small" @click="openEvent(item as CalendarEvent)">編輯</el-button>
            <el-button
              link
              type="danger"
              size="small"
              :loading="deletingId === item.id"
              @click="handleDelete(item as CalendarEvent)"
            >
              刪除
            </el-button>
          </template>
        </template>
      </AdminListCards>

      <el-table v-else :data="filteredEvents" stripe style="width: 100%" max-height="600">
        <template #empty>
          <EmptyState variant="inline" :title="emptyTitle" :description="emptyDescription" />
        </template>
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
              :color="eventTypeColor(row.event_type)"
              effect="dark"
              size="small"
              style="border: none; color: #fff"
            >
              {{ typeLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="可見範圍" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="!row.is_official && row.visibility"
              :type="eventVisibilityTagType(row.visibility)"
              size="small"
              :effect="row.visibility === 'parent' ? 'dark' : 'plain'"
            >
              {{ visibilityLabel(row.visibility) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="時間" width="120">
          <template #default="{ row }">{{ timeText(row) }}</template>
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
              <el-button
                link
                type="danger"
                size="small"
                :loading="deletingId === row.id"
                @click="handleDelete(row)"
              >
                刪除
              </el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <CalendarEventFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :initial="dialogInitial"
      :saving="saving"
      :employees="employeeOptions"
      :owner-name="dialogOwnerName"
      :employees-error="employeesError"
      @submit="saveEvent"
    />

    <CalendarEventDetailDialog v-model="detailVisible" :event="selectedEvent" />
    <CalendarImportDialog v-model="importVisible" @imported="refreshAll" />
  </div>
</template>

<style scoped>
.sync-alert {
  margin-bottom: 16px;
}

.feed-error-body {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.calendar-card {
  overflow: visible;
}

.list-card {
  margin-top: 20px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.list-header h3 {
  margin: 0;
}

.list-search {
  width: 220px;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.readonly-label {
  color: var(--text-tertiary);
  font-size: 12px;
}

@media (--to-sm) {
  .list-search {
    width: 100%;
  }
}
</style>
