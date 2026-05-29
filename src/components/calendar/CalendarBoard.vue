<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
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
  <FullCalendar ref="calendarRef" :options="calendarOptions" />
</template>

<style scoped>
/* FullCalendar 自帶 CSS variables，在此客製按鈕色（從後台 CalendarView 搬入） */
:deep(.fc) {
  --fc-button-bg-color: var(--el-color-primary, #409eff);
  --fc-button-border-color: var(--el-color-primary, #409eff);
  --fc-button-hover-bg-color: var(--el-color-primary-light-3, #66b1ff);
  --fc-button-hover-border-color: var(--el-color-primary-light-3, #66b1ff);
  --fc-button-active-bg-color: var(--el-color-primary-dark-2, #337ecc);
  --fc-button-active-border-color: var(--el-color-primary-dark-2, #337ecc);
  --fc-today-bg-color: rgba(64, 158, 255, 0.06);
}
</style>
