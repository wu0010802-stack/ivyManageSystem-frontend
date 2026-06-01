# 教師端行事曆統一為後台介面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把教師端 portal 行事曆改成與後台行事曆相同的 FullCalendar 介面（唯讀），並以共用元件結構保證「以後台為準」。

**Architecture:** 抽出共用 presentational 元件 `CalendarBoard.vue`（FullCalendar 外殼）與 `CalendarEventDetailDialog.vue`（唯讀詳情），後台與教師端都用它。教師端用純函式 `portalEventToFeedItem` 把 portal 資料轉成 `CalendarFeedItem`，再重用既有已測的 `toFullCalendarEvents`，避免日期邏輯漂移。唯讀由 `CalendarBoard` 的 `applyEditable` 集中強制（FullCalendar per-event editable 會蓋過全域，必須逐 event 鎖死）。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、FullCalendar v6（@fullcalendar/vue3）、Element Plus、Vitest、vue-tsc。純前端（`ivy-frontend`），零後端變更。

**Spec:** `docs/superpowers/specs/2026-05-29-portal-calendar-unify-with-admin-design.md`

**慣例提醒：**
- 全程在 worktree `.claude/worktrees/portal-calendar-unify-2026-05-29`（分支 `feat/portal-calendar-unify-2026-05-29-frontend`），用絕對路徑或 `git -C` 操作。
- 只 `git add` 指定檔案，**絕不** `git add -A`/`git add .`（repo 有 pre-existing 的 `node_modules` 追蹤殘留與其他 worktree 目錄）。
- TS-only：禁 `any`；新 SFC 一律 `<script setup lang="ts">`。
- 每個 commit 一件事，繁體中文 Conventional Commits，結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 單檔測試：`npx vitest run <path>`；全測：`npm test`；型別：`npm run typecheck`；建置：`npm run build`。

---

### Task 1: 共用事件類型常數 `calendarEventTypes`

把後台 `CalendarView` 與教師端 `PortalCalendarView` 各自重複的 `eventTypes` 陣列抽成單一常數，並提供顏色查詢 helper（供 `portalEventToFeedItem` 用）。

**Files:**
- Create: `src/constants/calendarEventTypes.ts`
- Test: `src/constants/__tests__/calendarEventTypes.test.ts`

- [ ] **Step 1: 寫失敗測試**

`src/constants/__tests__/calendarEventTypes.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { EVENT_TYPES, eventTypeColor, eventTypeDef } from '../calendarEventTypes'

describe('calendarEventTypes', () => {
  it('保留 5 個正規事件類型且順序固定', () => {
    expect(EVENT_TYPES.map((t) => t.value)).toEqual([
      'meeting', 'activity', 'holiday', 'makeup_workday', 'general',
    ])
  })

  it('eventTypeColor 回傳對應顏色', () => {
    expect(eventTypeColor('holiday')).toBe('#e6a23c')
    expect(eventTypeColor('meeting')).toBe('#409eff')
  })

  it('eventTypeColor 對未知/undefined 回退灰色', () => {
    expect(eventTypeColor('nope')).toBe('#909399')
    expect(eventTypeColor(undefined)).toBe('#909399')
  })

  it('eventTypeDef 回傳 label + color，未知回 undefined', () => {
    expect(eventTypeDef('activity')).toEqual({ value: 'activity', label: '活動', color: '#67c23a' })
    expect(eventTypeDef('nope')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/constants/__tests__/calendarEventTypes.test.ts`
Expected: FAIL（找不到模組 `../calendarEventTypes`）

- [ ] **Step 3: 寫實作**

`src/constants/calendarEventTypes.ts`：

```ts
/**
 * 行事曆事件類型常數（meeting/activity/holiday/makeup_workday/general）。
 * 後台 CalendarView、教師端 PortalCalendarView 與 portalEventToFeedItem 共用，
 * 避免顏色/標籤多處重複。
 *
 * 注意：此 taxonomy（事件 event_type）與 calendarLayers.ts 的 LAYER_*（跨模組 layer）
 * 是不同概念，勿混用。
 */
export interface EventTypeDef {
  value: string
  label: string
  color: string
}

export const EVENT_TYPES: readonly EventTypeDef[] = [
  { value: 'meeting', label: '會議', color: '#409eff' },
  { value: 'activity', label: '活動', color: '#67c23a' },
  { value: 'holiday', label: '國定假日', color: '#e6a23c' },
  { value: 'makeup_workday', label: '補班日', color: '#8b5cf6' },
  { value: 'general', label: '一般', color: '#909399' },
] as const

const EVENT_TYPE_MAP: Record<string, EventTypeDef> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t]),
)

export function eventTypeDef(type: string | undefined): EventTypeDef | undefined {
  return type ? EVENT_TYPE_MAP[type] : undefined
}

/** 取事件類型顏色；未知/缺省回退灰色（與 general 同色）。 */
export function eventTypeColor(type: string | undefined): string {
  return eventTypeDef(type)?.color ?? '#909399'
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/constants/__tests__/calendarEventTypes.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/constants/calendarEventTypes.ts src/constants/__tests__/calendarEventTypes.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增共用事件類型常數 calendarEventTypes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 唯讀強制 helper `applyEditable`

FullCalendar 中 per-event `editable:true` 會蓋過全域 `editable:false`。教師端唯讀需逐 event 強制 `editable:false`。把它做成可測純函式，與 `toFullCalendarEvents` 同住 `useCalendarLayers.ts`（同為 FC EventInput transform）。

**Files:**
- Modify: `src/composables/useCalendarLayers.ts`（新增 export `applyEditable`）
- Test: `src/composables/__tests__/useCalendarLayers.test.ts`（append + 改 import）

- [ ] **Step 1: 寫失敗測試**

在 `src/composables/__tests__/useCalendarLayers.test.ts` 檔尾追加：

```ts
import { applyEditable } from '../useCalendarLayers'

describe('applyEditable', () => {
  it('editable=false 時逐 event 強制 editable:false', () => {
    const out = applyEditable(
      [{ id: 'a', editable: true }, { id: 'b', editable: false }],
      false,
    )
    expect(out.every((e) => e.editable === false)).toBe(true)
  })

  it('editable=true 時原樣返回（保留 per-event editable）', () => {
    const input = [{ id: 'a', editable: true }, { id: 'b', editable: false }]
    expect(applyEditable(input, true)).toBe(input)
  })
})
```

> 註：`import` 可放檔頭與既有 import 合併，或如上獨立一行（vitest 允許重複從同模組 import 不同符號；若 lint 抱怨重複 import，改成把 `applyEditable` 併入第 2 行既有的 `import { useCalendarLayers, toFullCalendarEvents } from '../useCalendarLayers'`）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useCalendarLayers.test.ts`
Expected: FAIL（`applyEditable` 未匯出）

- [ ] **Step 3: 寫實作**

在 `src/composables/useCalendarLayers.ts` 的 `toFullCalendarEvents` 函式之後新增：

```ts
/**
 * 唯讀強制：FullCalendar per-event editable:true 會蓋過全域 editable:false。
 * 唯讀模式（editable=false）需逐 event 強制 editable:false，不能只靠全域旗標。
 * editable=true 時原樣返回，保留 toFullCalendarEvents 設定的 per-layer editable。
 */
export function applyEditable(events: EventInput[], editable: boolean): EventInput[] {
  if (editable) return events
  return events.map((e) => ({ ...e, editable: false }))
}
```

（`EventInput` 型別已在檔頭 `import type { EventInput } from '@fullcalendar/core'` 匯入，無需新增 import。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useCalendarLayers.test.ts`
Expected: PASS（既有 + 新增 applyEditable 2 tests 全綠）

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/composables/useCalendarLayers.ts src/composables/__tests__/useCalendarLayers.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增 applyEditable 唯讀強制 helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: portal 資料 adapter `portalEventToFeedItem`

把 portal `getCalendar` 回傳的 `CalendarEvent` 轉成既有 `CalendarFeedItem`（layer 一律 `'event'`），再交給 `toFullCalendarEvents`。刻意不在此重做 FullCalendar 的日期魔法（全天多日 +1 exclusive），那是 `toFullCalendarEvents` 的單一責任。

**Files:**
- Create: `src/utils/portalCalendar.ts`
- Test: `tests/unit/utils/portalCalendar.test.ts`

- [ ] **Step 1: 寫失敗測試**

`tests/unit/utils/portalCalendar.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { portalEventToFeedItem } from '@/utils/portalCalendar'

describe('portalEventToFeedItem', () => {
  it('全天單日事件', () => {
    const item = portalEventToFeedItem({
      id: 1, title: '校慶', event_date: '2026-05-19', is_all_day: true, event_type: 'activity',
    })
    expect(item).toMatchObject({
      layer: 'event', id: 1, title: '校慶',
      start: '2026-05-19', end: '2026-05-19', all_day: true,
      color: '#67c23a', link: null,
    })
  })

  it('全天多日事件保持 end inclusive（由 toFullCalendarEvents 做 +1）', () => {
    const item = portalEventToFeedItem({
      id: 2, title: '連假', event_date: '2026-05-19', end_date: '2026-05-21', is_all_day: true,
    })
    expect(item.start).toBe('2026-05-19')
    expect(item.end).toBe('2026-05-21')
    expect(item.all_day).toBe(true)
  })

  it('時段事件合併 date + time 成 ISO datetime', () => {
    const item = portalEventToFeedItem({
      id: 3, title: '會議', event_date: '2026-05-19',
      is_all_day: false, start_time: '09:30', end_time: '11:00', event_type: 'meeting',
    })
    expect(item.start).toBe('2026-05-19T09:30:00')
    expect(item.end).toBe('2026-05-19T11:00:00')
    expect(item.all_day).toBe(false)
    expect(item.color).toBe('#409eff')
  })

  it('時段事件缺 end_time 時 end 退回等於 start', () => {
    const item = portalEventToFeedItem({
      id: 4, title: '提醒', event_date: '2026-05-19', is_all_day: false, start_time: '08:00',
    })
    expect(item.start).toBe('2026-05-19T08:00:00')
    expect(item.end).toBe('2026-05-19T08:00:00')
  })

  it('is_all_day 為 undefined 時預設全天', () => {
    const item = portalEventToFeedItem({ id: 5, title: 'x', event_date: '2026-05-19' })
    expect(item.all_day).toBe(true)
    expect(item.start).toBe('2026-05-19')
  })

  it('holiday / makeup_workday 顏色', () => {
    expect(portalEventToFeedItem({ event_date: '2026-05-19', event_type: 'holiday' }).color).toBe('#e6a23c')
    expect(portalEventToFeedItem({ event_date: '2026-05-19', event_type: 'makeup_workday' }).color).toBe('#8b5cf6')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/utils/portalCalendar.test.ts`
Expected: FAIL（找不到 `@/utils/portalCalendar`）

- [ ] **Step 3: 寫實作**

`src/utils/portalCalendar.ts`：

```ts
import type { CalendarFeedItem } from '@/api/calendar'
import { eventTypeColor } from '@/constants/calendarEventTypes'

/** portal getCalendar 回傳的單筆事件（與後台 events/calendar-feed 同形狀）。 */
export interface PortalCalendarEvent {
  id?: number
  title?: string
  event_date?: string
  end_date?: string | null
  event_type?: string
  event_type_label?: string
  is_all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  description?: string | null
  is_official?: boolean
  [key: string]: unknown
}

/**
 * 把 portal CalendarEvent 轉成 CalendarFeedItem（layer 一律 'event'），
 * 之後交給既有 toFullCalendarEvents 做 FullCalendar 日期轉換。
 *
 * 刻意「不」在此重做日期魔法（全天多日 +1 exclusive）— 那是 toFullCalendarEvents
 * 的單一責任，避免邏輯漂移（spec「以後台為準」防漂移核心）。
 * - 全天：start/end 維持 inclusive 日期字串（end 缺省回退 start）。
 * - 時段：合併 event_date + start_time/end_time 成 ISO datetime（end 缺則等於 start，
 *   與 toFullCalendarEvents 對時段事件 end inclusive 的慣例一致）。
 */
export function portalEventToFeedItem(ev: PortalCalendarEvent): CalendarFeedItem {
  const allDay = ev.is_all_day !== false // undefined 視為全天（與既有 portal 行為一致）
  const date = ev.event_date ?? ''
  let start: string
  let end: string
  if (allDay) {
    start = date
    end = ev.end_date || date
  } else {
    start = ev.start_time ? `${date}T${ev.start_time}:00` : date
    end = ev.end_time ? `${date}T${ev.end_time}:00` : start
  }
  return {
    layer: 'event',
    id: ev.id ?? `${date}-${ev.title ?? ''}`,
    title: ev.title ?? '',
    start,
    end,
    all_day: allDay,
    color: eventTypeColor(ev.event_type),
    link: null,
    meta: {},
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/utils/portalCalendar.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/utils/portalCalendar.ts tests/unit/utils/portalCalendar.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增 portalEventToFeedItem adapter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 共用詳情型別 `CalendarEventDetail`

**Files:**
- Modify: `src/components/calendar/types.ts`（append type）

- [ ] **Step 1: 新增型別**

在 `src/components/calendar/types.ts` 檔尾追加：

```ts
/** 共用唯讀事件詳情 dialog 的顯示型別。 */
export interface CalendarEventDetail {
  title?: string
  event_type?: string
  event_type_label?: string
  event_date?: string
  end_date?: string | null
  is_all_day?: boolean
  start_time?: string | null
  end_time?: string | null
  location?: string | null
  description?: string | null
  is_official?: boolean
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error（純新增型別，不影響既有）

- [ ] **Step 3: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/components/calendar/types.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增 CalendarEventDetail 共用詳情型別

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 共用唯讀詳情 dialog `CalendarEventDetailDialog.vue`

後台官方/唯讀列「查看」與教師端點事件都走它，詳情畫面真正一致。採 Element Plus，沿用 `CalendarToolbar.vue` 的 `modelValue` + emit 慣例（不引入 defineModel，與既有元件一致）。

**Files:**
- Create: `src/components/calendar/CalendarEventDetailDialog.vue`

> 不寫掛載測試：el-dialog 走 teleport-to-body 在 jsdom 較脆弱，且 advisor 指引「測純邏輯、不硬掛 SFC」。以 typecheck + build + 手動驗證覆蓋。

- [ ] **Step 1: 建立元件**

`src/components/calendar/CalendarEventDetailDialog.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { eventTypeColor } from '@/constants/calendarEventTypes'
import type { CalendarEventDetail } from './types'

const props = defineProps<{
  modelValue: boolean
  event: CalendarEventDetail | null
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
</script>

<template>
  <el-dialog v-model="visible" title="事件詳情" width="460px">
    <template v-if="props.event">
      <el-descriptions :column="1" border>
        <el-descriptions-item label="標題">
          <span>{{ props.event.title }}</span>
          <el-tag v-if="props.event.is_official" size="small" type="info" style="margin-left: 8px">官方</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="類型">
          <el-tag
            :color="eventTypeColor(props.event.event_type)"
            effect="dark"
            size="small"
            style="border: none; color: #fff"
          >
            {{ props.event.event_type_label }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="日期">
          {{ props.event.event_date }}
          <template v-if="props.event.end_date && props.event.end_date !== props.event.event_date">
            ~ {{ props.event.end_date }}
          </template>
        </el-descriptions-item>
        <el-descriptions-item label="時間">
          <span v-if="props.event.is_all_day">全天</span>
          <span v-else>{{ props.event.start_time }} - {{ props.event.end_time }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="地點">{{ props.event.location || '—' }}</el-descriptions-item>
        <el-descriptions-item label="說明">{{ props.event.description || '—' }}</el-descriptions-item>
        <el-descriptions-item label="資料來源">
          {{ props.event.is_official ? '官方同步（唯讀）' : '校內事件' }}
        </el-descriptions-item>
      </el-descriptions>
    </template>
    <template #footer>
      <el-button @click="visible = false">關閉</el-button>
    </template>
  </el-dialog>
</template>
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 3: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/components/calendar/CalendarEventDetailDialog.vue
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增共用唯讀詳情 dialog CalendarEventDetailDialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 共用日曆外殼 `CalendarBoard.vue`

唯一持有 FullCalendar 外觀/設定的元件。Props `events`（已轉好的 EventInput）+ `editable`（預設 false）；emit `event-click`/`event-drop`/`dates-set`。唯讀逐 event 鎖死（`applyEditable`）。responsive：桌機四視圖，手機（≤640px）降 listWeek + 精簡工具列。`:deep(.fc)` 樣式從後台搬入。

**Files:**
- Create: `src/components/calendar/CalendarBoard.vue`

> 不寫掛載測試：掛載 FullCalendar 於 jsdom 成本高；唯讀邏輯已由 Task 2 `applyEditable` 單元測試覆蓋，其餘以 typecheck + build + 手動驗證。若日後要掛載測試，務必 `vi.mock('@fullcalendar/vue3')`。

- [ ] **Step 1: 建立元件**

`src/components/calendar/CalendarBoard.vue`：

```vue
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
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 3: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/components/calendar/CalendarBoard.vue
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 新增共用日曆外殼 CalendarBoard（FullCalendar + 唯讀 + responsive）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 後台 `CalendarView.vue` 改用共用元件

把後台的 inline FullCalendar 換成 `CalendarBoard`、inline 詳情 dialog 換成 `CalendarEventDetailDialog`、本地 `eventTypes` 換成共用常數。**業務邏輯（新增/編輯/刪除/拖拉/匯出/圖層/事件表格）完全保留**。

**Files:**
- Modify: `src/views/CalendarView.vue`

> 此為 surgical refactor，逐處替換。改完務必 typecheck + build + 手動回歸（Task 9）。

- [ ] **Step 1: 改 imports（第 1–25 行區塊）**

把第 2 行 `import { computed, onMounted, reactive, ref, shallowRef } from 'vue'` 改為（移除 `onMounted`、`shallowRef` — 下面會刪掉用到它們的程式）：

```ts
import { computed, reactive, ref } from 'vue'
```

移除這些行（FullCalendar 外殼已移入 CalendarBoard）：

```ts
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'
```

把型別 import（第 11–16 行）由：

```ts
import type {
  CalendarOptions,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from '@fullcalendar/core'
```

改為（移除 `CalendarOptions`，其餘 handler 仍用）：

```ts
import type {
  DatesSetArg,
  EventClickArg,
  EventDropArg,
} from '@fullcalendar/core'
```

在 import 區塊末（`import type { CalendarLayer } from '@/api/calendar'` 之後）新增：

```ts
import CalendarBoard from '@/components/calendar/CalendarBoard.vue'
import CalendarEventDetailDialog from '@/components/calendar/CalendarEventDetailDialog.vue'
import { EVENT_TYPES } from '@/constants/calendarEventTypes'
```

- [ ] **Step 2: CalendarEvent interface 補欄位（第 27–41 行）**

在 `interface CalendarEvent { ... }` 內、`is_read_only?: boolean` 之後新增兩行（讓它能直接傳給 `CalendarEventDetail` prop，且本就是 API 回傳欄位 — 表格已用 `row.event_type_label` / `row.is_official`）：

```ts
  event_type_label?: string
  is_official?: boolean
```

- [ ] **Step 3: 移除 calendarRef（第 64 行）**

刪除：

```ts
const calendarRef = shallowRef<InstanceType<typeof FullCalendar> | null>(null)
```

- [ ] **Step 4: eventTypes 改用共用常數（第 75–82 行）**

把：

```ts
const eventTypes = [
  { value: 'meeting', label: '會議', color: '#409eff' },
  { value: 'activity', label: '活動', color: '#67c23a' },
  { value: 'holiday', label: '國定假日', color: '#e6a23c' },
  { value: 'makeup_workday', label: '補班日', color: '#8b5cf6' },
  { value: 'general', label: '一般', color: '#909399' },
]
const eventTypeMap = Object.fromEntries(eventTypes.map((item) => [item.value, item]))
```

改為（沿用 `eventTypes` 名稱讓 template 的 `eventTypes.filter(...)` 不用改）：

```ts
const eventTypes = EVENT_TYPES
const eventTypeMap = Object.fromEntries(eventTypes.map((item) => [item.value, item]))
```

- [ ] **Step 5: 移除 calendarOptions computed（第 372–396 行）與空 onMounted（第 398–401 行）**

刪除整個 `const calendarOptions = computed<CalendarOptions>(() => ({ ... }))` 區塊，以及檔尾的：

```ts
// 初始 viewRange 由 FullCalendar 的 datesSet 觸發；無需在這先 fetch
// fullCalendarEvents → filteredItems → enabledLayers 是純 computed chain，
// 重新計算會自動串到 FC events option。
onMounted(() => {})
```

（`onDatesSet` / `onEventClick` / `onEventDrop` / `fmtHHMM` 等 handler **保留不動**。）

- [ ] **Step 6: template 換 FullCalendar（第 425 行）**

把：

```vue
<FullCalendar ref="calendarRef" :options="calendarOptions" />
```

改為：

```vue
<CalendarBoard
  :events="fullCalendarEvents"
  editable
  @event-click="onEventClick"
  @event-drop="onEventDrop"
  @dates-set="onDatesSet"
/>
```

- [ ] **Step 7: template 換詳情 dialog（第 529–566 行）**

把整個 `<el-dialog v-model="detailVisible" title="事件詳情" ...> ... </el-dialog>` 區塊替換為：

```vue
<CalendarEventDetailDialog v-model="detailVisible" :event="selectedEvent" />
```

- [ ] **Step 8: 移除重複的 :deep(.fc) 樣式（第 601–610 行）**

刪除 `<style scoped>` 內的整段：

```css
/* FullCalendar 自帶 CSS variables，可在這客製按鈕色 */
:deep(.fc) {
  --fc-button-bg-color: var(--el-color-primary, #409eff);
  --fc-button-border-color: var(--el-color-primary, #409eff);
  --fc-button-hover-bg-color: var(--el-color-primary-light-3, #66b1ff);
  --fc-button-hover-border-color: var(--el-color-primary-light-3, #66b1ff);
  --fc-button-active-bg-color: var(--el-color-primary-dark-2, #337ecc);
  --fc-button-active-border-color: var(--el-color-primary-dark-2, #337ecc);
  --fc-today-bg-color: rgba(64, 158, 255, 0.06);
}
```

（其餘樣式 `.sync-alert` / `.calendar-card` / `.list-header` / `.title-cell` / `.readonly-label` 保留。`:deep(.fc)` 移到子元件 CalendarBoard 後，留在父層 scoped style 也選不到子元件內的 .fc。）

- [ ] **Step 9: typecheck**

Run: `npm run typecheck`
Expected: 0 error（若報 `selectedEvent` 不可賦值給 `CalendarEventDetail`，回頭確認 Step 2 已補 `event_type_label` / `is_official`）

- [ ] **Step 10: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/views/CalendarView.vue
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "refactor: 後台 CalendarView 改用共用 CalendarBoard 與詳情 dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 重寫教師端 `PortalCalendarView.vue`

唯讀 FullCalendar（透過 CalendarBoard）+ portal 資料 adapter + 共用詳情 dialog + legend。移除手刻月曆格、自製 prev/next/今天 nav、「本月事件」卡片清單。跨可見範圍多月抓取、依 id 去重、月份快取。

**Files:**
- Modify（整檔重寫）: `src/views/portal/PortalCalendarView.vue`

- [ ] **Step 1: 整檔覆寫**

`src/views/portal/PortalCalendarView.vue` 全部內容換成：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import { getCalendar } from '@/api/portal'
import { apiError } from '@/utils/error'
import { toFullCalendarEvents } from '@/composables/useCalendarLayers'
import { portalEventToFeedItem, type PortalCalendarEvent } from '@/utils/portalCalendar'
import { EVENT_TYPES } from '@/constants/calendarEventTypes'
import CalendarBoard from '@/components/calendar/CalendarBoard.vue'
import CalendarEventDetailDialog from '@/components/calendar/CalendarEventDetailDialog.vue'
import type { CalendarEventDetail } from '@/components/calendar/types'

interface OfficialSync { warning?: string; [key: string]: unknown }

const loading = ref(false)
const officialSync = ref<OfficialSync | null>(null)

// 月份快取 "YYYY-MM" → 該月事件，避免切視圖/月份重複抓取
const monthCache = new Map<string, PortalCalendarEvent[]>()
// 目前可見範圍涵蓋月份的事件（合併去重後）
const events = ref<PortalCalendarEvent[]>([])

const officialSyncAlertType = computed(() => (officialSync.value?.warning ? 'warning' : 'info'))
const officialSyncMessage = computed(() =>
  officialSync.value?.warning
    ? officialSync.value.warning
    : '此行事曆與後台同步，包含校內事件、國定假日與補班日。',
)

const fcEvents = computed<EventInput[]>(() =>
  toFullCalendarEvents(events.value.map(portalEventToFeedItem)),
)

// 與 portalEventToFeedItem 的 id fallback 完全對齊（真實事件都有 id，此為防呆）
const evKey = (ev: PortalCalendarEvent): string | number =>
  ev.id ?? `${ev.event_date ?? ''}-${ev.title ?? ''}`

const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

// 取 [start, end] 範圍涵蓋的所有 (year, month)（end 取 activeEnd，可能小幅多含一月，無害且有快取）
function monthsInRange(start: Date, end: Date): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    out.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 })
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

async function fetchMonth(y: number, m: number): Promise<void> {
  const key = monthKey(y, m)
  if (monthCache.has(key)) return
  const res = await getCalendar({ year: y, month: m })
  const data = res.data as { events?: PortalCalendarEvent[]; official_sync?: OfficialSync }
  monthCache.set(key, data.events || [])
  if (data.official_sync !== undefined) officialSync.value = data.official_sync
}

function rebuildEvents(months: Array<{ y: number; m: number }>): void {
  const seen = new Set<string | number>()
  const merged: PortalCalendarEvent[] = []
  for (const { y, m } of months) {
    for (const ev of monthCache.get(monthKey(y, m)) || []) {
      const k = evKey(ev)
      if (seen.has(k)) continue
      seen.add(k)
      merged.push(ev)
    }
  }
  events.value = merged
}

async function onDatesSet(arg: DatesSetArg): Promise<void> {
  loading.value = true
  try {
    const months = monthsInRange(arg.view.activeStart, arg.view.activeEnd)
    await Promise.all(months.map((mm) => fetchMonth(mm.y, mm.m)))
    rebuildEvents(months)
  } catch (error) {
    ElMessage.error(apiError(error, '載入失敗'))
  } finally {
    loading.value = false
  }
}

// 詳情
const detailVisible = ref(false)
const selectedEvent = ref<CalendarEventDetail | null>(null)

function onEventClick(arg: EventClickArg): void {
  const rawId = arg.event.extendedProps.rawId
  const ev = events.value.find((e) => evKey(e) === rawId)
  if (ev) {
    selectedEvent.value = ev
    detailVisible.value = true
  }
}
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

    <CalendarBoard
      :events="fcEvents"
      @event-click="onEventClick"
      @dates-set="onDatesSet"
    />

    <!-- Legend -->
    <div class="legend">
      <span v-for="t in EVENT_TYPES" :key="t.value" class="legend-item">
        <span class="legend-dot" :style="{ backgroundColor: t.color }"></span>
        {{ t.label }}
      </span>
    </div>

    <CalendarEventDetailDialog v-model="detailVisible" :event="selectedEvent" />
  </div>
</template>

<style scoped>
.portal-calendar {
  padding: 10px;
}

.sync-alert {
  margin-bottom: var(--space-4);
}

.legend {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-3);
  flex-wrap: wrap;
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
</style>
```

> 註：不需 `onMounted` 抓資料 — `CalendarBoard` 掛載時 FullCalendar 會自動 fire 一次 `datesSet`，觸發 `onDatesSet` 抓當前範圍。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 3: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 add src/views/portal/PortalCalendarView.vue
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 commit -m "feat: 教師端行事曆改用與後台相同的 CalendarBoard（唯讀）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 全套驗證（測試 + 型別 + 建置 + 手動回歸）

**Files:** 無（驗證）

- [ ] **Step 1: 全測試**

Run: `npm test`
Expected: 全綠；相對 baseline **無新增 fail**。新增測試：calendarEventTypes(4) + applyEditable(2) + portalCalendar(6)。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error

- [ ] **Step 3: build**

Run: `npm run build`
Expected: 成功（無型別/匯入錯誤）

- [ ] **Step 4: 手動回歸 — 後台行事曆**（`start.sh` 起 dev server，登入後台 `/calendar`）

逐項確認（因後台 view 無自動測試）：
1. 月/週/日/列表四視圖切換正常；中文按鈕「今天/月/週/日/列表」。
2. 新增事件 → 出現在日曆與事件表格。
3. 編輯事件、刪除事件正常。
4. 拖拉改期：`event` 層事件可拖並寫回；假日/請假/活動/考核/會議層拖拉後 revert 並提示「此項目不能拖拉改期」。
5. 圖層工具列全選/清除/個別切換正常（localStorage 記憶）。
6. 匯出行事曆、匯出假日正常。
7. 官方/唯讀列點「查看」→ 開共用詳情 dialog，顯示「資料來源：官方同步（唯讀）」。
8. 視窗縮到 ≤640px：工具列降為精簡、預設 listWeek。

- [ ] **Step 5: 手動驗證 — 教師端行事曆**（教師帳號登入 portal `/portal/calendar`）

1. 行事曆顯示校內事件＋國定假日＋補班日，顏色與圖例一致。
2. **唯讀**：無新增/編輯/刪除按鈕；事件不可拖拉。
3. 四視圖切換；手機寬度降 listWeek。
4. 點事件 → 開詳情 dialog（與後台同一元件）。
5. 月份交界：切到週/列表視圖跨兩個月時，兩月事件都顯示不漏。
6. sync alert 警語與圖例顯示正常。

- [ ] **Step 6: 最終確認 commit 樹乾淨**

Run: `git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/portal-calendar-unify-2026-05-29 status --porcelain`
Expected: 僅 pre-existing 的 ` D node_modules`（無關殘留），無其他未提交業務檔。

---

## 完成後（交給 user）

- merge `feat/portal-calendar-unify-2026-05-29-frontend` → main、push。
- worktree 清理：`git worktree remove`。
- 本變更純前端、零後端，**不需** OpenAPI codegen（未動契約）。

## Out of Scope（不做）

- 不開放教師編輯任何事件。
- 不在教師端加圖層工具列（單一資料來源）。
- 不引入全校請假/考核/會議敏感圖層到教師端。
- 不改後端、不擴充 `getCalendar` query（跨月以前端多次呼叫＋快取＋去重）。
- 不重構與本任務無關的程式碼。
