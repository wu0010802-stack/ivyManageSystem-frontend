<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'
import type {
  CalendarOptions, DatesSetArg, EventClickArg, EventDropArg, EventInput,
} from '@fullcalendar/core'
import { applyEditable } from '@/composables/useCalendarLayers'

const props = withDefaults(defineProps<{
  events: EventInput[]
  editable?: boolean
}>(), {
  editable: false,
})

const emit = defineEmits<{
  'event-click': [arg: EventClickArg]
  'event-drop': [arg: EventDropArg]
  'dates-set': [arg: DatesSetArg]
}>()

const calendarRef = shallowRef<InstanceType<typeof FullCalendar> | null>(null)

// 手機（≤640px）降為列表視圖 + 精簡工具列；桌機四視圖全套。
const isMobile = ref(false)
let mql: MediaQueryList | null = null
const syncIsMobile = () => { isMobile.value = mql?.matches ?? false }

onMounted(() => {
  mql = window.matchMedia('(max-width: 640px)')
  syncIsMobile()
  mql.addEventListener('change', syncIsMobile)
})
onBeforeUnmount(() => {
  mql?.removeEventListener('change', syncIsMobile)
})

// isMobile 改變時實際切換視圖（initialView 僅 mount 時生效，需主動 changeView）
watch(isMobile, (mobile) => {
  calendarRef.value?.getApi().changeView(mobile ? 'listWeek' : 'dayGridMonth')
})

const fcEvents = computed(() => applyEditable(props.events, props.editable))

const calendarOptions = computed<CalendarOptions>(() => ({
  plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
  initialView: isMobile.value ? 'listWeek' : 'dayGridMonth',
  locale: zhTwLocale,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: isMobile.value
      ? 'dayGridMonth,listWeek'
      : 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
  },
  buttonText: { today: '今天', month: '月', week: '週', day: '日', list: '列表' },
  height: 'auto',
  events: fcEvents.value,
  editable: props.editable, // 全域開拖；個別 event 用 editable:false 鎖（applyEditable 已處理唯讀）
  eventStartEditable: props.editable,
  eventDurationEditable: false,
  datesSet: (arg: DatesSetArg) => emit('dates-set', arg),
  eventClick: (arg: EventClickArg) => emit('event-click', arg),
  eventDrop: (arg: EventDropArg) => emit('event-drop', arg),
}))
</script>

<template>
  <!-- 外包一層：FullCalendar 的根節點就是 .fc，scoped 的 `:deep(.fc)` 只匹配「後代」，
       直接當根節點時選擇器永遠對不上，客製色全部失效（2026-10-12 實測退回 FC 預設深灰鈕） -->
  <div class="calendar-board">
    <FullCalendar ref="calendarRef" :options="calendarOptions" />
  </div>
</template>

<style scoped>
/* FullCalendar 自帶 CSS variables。工具列按鈕走 EP plain 按鈕語彙（白底、細框），
   只有「目前檢視」用主色淡底標示，避免整排實心主色鈕搶走事件本身的注意力。 */
.calendar-board :deep(.fc) {
  --fc-button-text-color: var(--el-text-color-regular);
  --fc-button-bg-color: var(--el-bg-color);
  --fc-button-border-color: var(--el-border-color);
  --fc-button-hover-bg-color: var(--el-fill-color-light);
  --fc-button-hover-border-color: var(--el-border-color-hover);
  --fc-button-active-bg-color: var(--el-color-primary-light-9);
  --fc-button-active-border-color: var(--el-color-primary-light-5);
  --fc-today-bg-color: var(--el-color-primary-light-9);
}

.calendar-board :deep(.fc .fc-button-primary:not(:disabled).fc-button-active) {
  color: var(--el-color-primary);
}

.calendar-board :deep(.fc .fc-button) {
  white-space: nowrap;
}

/* 與 isMobile 的 matchMedia 同一門檻：手機工具列標題縮成一行能讀的大小 */
@media (max-width: 640px) {
  .calendar-board :deep(.fc .fc-toolbar) {
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .calendar-board :deep(.fc .fc-toolbar-title) {
    font-size: var(--text-lg);
  }
}
</style>
