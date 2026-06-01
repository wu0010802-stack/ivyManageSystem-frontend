# 教師端行事曆統一為後台介面（以後台為準）

- 日期：2026-05-29
- 範圍：純前端（`ivy-frontend`），**零後端變更**
- 分支：`feat/portal-calendar-unify-2026-05-29-frontend`（base `origin/main` 78997d06）

## 目標

把教師端 portal 行事曆（`PortalCalendarView.vue`）的介面改成與後台行事曆（`CalendarView.vue`）相同，並以**結構**保證「以後台為準」——即兩端共用同一個日曆 UI 元件，未來改一次兩邊同步，而非靠紀律維持兩份程式碼。

教師端為**完全唯讀**：只能看、切換月/週/日/列表視圖、點事件看詳情；不能新增/編輯/刪除/拖拉改期、不提供匯出。資料來源維持現狀（portal `getCalendar`：校內事件＋國定假日＋補班日），不引入全校請假/考核/會議等敏感圖層，避免權限外洩。

## 背景：現況差異

| 面向 | 後台 `CalendarView.vue`（611 行） | 教師端 `PortalCalendarView.vue`（410 行） |
|------|-----------------------------------|------------------------------------------|
| 日曆引擎 | FullCalendar 套件 | 手刻 CSS grid 月曆 |
| 檢視模式 | 月 / 週 / 日 / 列表 | 只有月 |
| 圖層工具列 | 有（`CalendarToolbar`，6 層） | 無 |
| 資料來源 | `getAdminFeed`（`CalendarFeedItem`，跨模組含敏感層） | `getCalendar`（`CalendarEvent`，portal 受限資料） |
| 互動 | 新增/編輯/刪除、拖拉改期、匯出 | 唯讀，只能看詳情 |
| 詳情畫面 | `el-descriptions`（inline dialog） | `el-descriptions`（inline dialog，近似但獨立一份） |

### 關鍵資料形狀差異（影響共用元件設計）

- 後台日曆格吃的是 **`CalendarFeedItem`**（`admin_feed`）：`layer / id / title / start / end / all_day / color / link / meta`。
- 教師端 `getCalendar` 回傳 `{ events, official_sync }`，其中 `events` 是 **`CalendarEvent`**：`event_date / end_date / event_type / event_type_label / title / is_all_day / start_time / end_time / location / is_official`。

→ 兩種形狀不同，共用元件應以 FullCalendar 的 `EventInput[]`（最小公約數）為介面，由各自的父層各自把資料轉成 `EventInput[]`。

### 既有可重用資產

- `src/composables/useCalendarLayers.ts`：含 `toFullCalendarEvents(items: CalendarFeedItem[]): EventInput[]`，封裝 FullCalendar 的日期慣例（全天多日 `end` exclusive `+1`、單日省 `end`、時段事件保留 ISO、`editable: layer==='event'`）。**已有測試覆蓋**（`src/composables/__tests__/useCalendarLayers.test.ts`）。
- 既有測試：`useCalendarLayers.test.ts`、`constants/__tests__/calendarLayers.test.ts`、`useScheduleCalendar.test.ts`。
- **無**任何測試覆蓋 `CalendarView.vue` 或 `PortalCalendarView.vue`（皆為 FullCalendar / DOM-heavy view）。

## 架構

### 元件拆解

```
src/components/calendar/
  CalendarBoard.vue            ← 新增：presentational FullCalendar 外殼（兩端共用，"以後台為準" 的單一真相）
  CalendarEventDetailDialog.vue← 新增：唯讀事件詳情 dialog（兩端共用）
  CalendarToolbar.vue          ← 既有：僅後台使用（不變）
  RecurrenceEditor.vue         ← 既有：僅後台使用（不變）
  types.ts                     ← 既有：補一個共用顯示型別 CalendarEventDetail
src/utils/
  portalCalendar.ts            ← 新增：純函式 portalEventToFeedItem(ev): CalendarFeedItem
src/views/
  CalendarView.vue             ← 修改：改用 CalendarBoard + 共用 detail dialog
  views/portal/PortalCalendarView.vue ← 修改：重寫為 CalendarBoard + adapter + 共用 detail dialog
```

### `CalendarBoard.vue`（共用 presentational 元件）

唯一持有 FullCalendar 外觀與設定的地方。

- **Props**
  - `events: EventInput[]`（父層已轉好的 FullCalendar 事件）
  - `editable?: boolean`（預設 `false`）
  - `initialView?: string`（可選；預設由 responsive 邏輯決定）
- **Emits**（原樣轉拋 FullCalendar 的 arg，父層接手語意）
  - `event-click` → `EventClickArg`
  - `event-drop` → `EventDropArg`
  - `dates-set` → `DatesSetArg`
- **獨佔的 FullCalendar 設定**（從後台 `CalendarView.calendarOptions` 原封不動搬入）：`plugins`（dayGrid/timeGrid/list/interaction）、`locale: zhTwLocale`、`buttonText`（今天/月/週/日/列表）、`height: 'auto'`、`:deep(.fc)` CSS 變數樣式。
- **唯讀強制（advisor #1，保護唯讀需求）**：FullCalendar 中 per-event `editable: true` 會**蓋過**全域 `editable: false`。因此：
  - 當 `editable === false` 時，把每個 event 強制覆寫 `editable: false`（`events.map(e => ({ ...e, editable: false }))`），不依賴全域旗標。
  - `eventStartEditable` 僅在 `editable === true` 時開啟；`eventDurationEditable` 維持 `false`（與後台一致）。
  - `event-drop` 只在 `editable === true` 時有意義；唯讀模式下 FC 不會觸發拖拉。
  - 此覆寫抽成可測純函式（例如 `applyEditable(events, editable)`）置於 `CalendarBoard` 或 `utils/portalCalendar.ts`，便於單元測試而不必掛載 FullCalendar。
- **Responsive（桌機/手機兼顧）**：以 `matchMedia('(max-width: 640px)')` 切換並監聽變化：
  - **桌機**：`initialView: 'dayGridMonth'`，`headerToolbar.right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek'`。
  - **手機**：`initialView: 'listWeek'`，`headerToolbar.right: 'dayGridMonth,listWeek'`，`left: 'prev,next today'`。
  - 後台與教師端共用此行為 → 後台亦順帶獲得手機友善（一致性 bonus）。

### `CalendarEventDetailDialog.vue`（共用唯讀詳情）

- **Props**：`modelValue: boolean`（顯示）、`event: CalendarEventDetail | null`。
- **Emits**：`update:modelValue`。
- 內容：`el-descriptions`（標題、類型 tag、官方 tag、日期/區間、時間或全天、地點、說明、資料來源）。
- 兩端共用：後台官方/唯讀列的「查看」與教師端點事件都走它，詳情畫面真正一致。
- 顯示型別 `CalendarEventDetail` 定義在 `src/components/calendar/types.ts`，只含顯示所需欄位（`title / event_type / event_type_label / event_date / end_date / is_all_day / start_time / end_time / location / description / is_official`）。

### `utils/portalCalendar.ts`（不寫平行轉換器，advisor #2）

純函式 `portalEventToFeedItem(ev: CalendarEvent): CalendarFeedItem`：

- `layer: 'event'`
- `id: ev.id`
- `title: ev.title`
- `all_day: ev.is_all_day`
- `start / end`：
  - 全天事件：`start = ev.event_date`、`end = ev.end_date ?? ev.event_date`（**仍為 inclusive 的日期字串**，交給 `toFullCalendarEvents` 再做 `+1` exclusive 處理 — 不在此處重複日期魔法）。
  - 時段事件（`!is_all_day` 且有 `start_time`）：`start = ${event_date}T${start_time}:00`、`end = end_time ? ${event_date}T${end_time}:00 : start`（與 `toFullCalendarEvents` 對時段事件 `end` 維持 inclusive 的慣例一致）。
- `color`：取自 eventType→color 對照表（沿用兩 view 既有的 `eventTypes` 常數；可抽至共用常數避免重複，但維持現有顏色值）。
- `link: null`、`meta: {}`。

教師端轉換鏈：`toFullCalendarEvents(events.map(portalEventToFeedItem))`，再由 `CalendarBoard`（`editable=false`）統一套唯讀覆寫。**FullCalendar 的日期/時段邏輯只有一份**（`toFullCalendarEvents`），這就是「以後台為準」的防漂移保證。

## 教師端頁面結構（`PortalCalendarView.vue` 重寫）

保留：
- sync alert（`official_sync` 警語，本就與後台相同）。
- 小圖例 legend（對唯讀使用者有幫助）。

移除（由 FullCalendar 取代）：
- 手刻 CSS grid 月曆。
- prev/next/今天 自製導覽（改由 FullCalendar headerToolbar 提供）。
- 「本月事件」卡片清單（由 FullCalendar `listWeek` 列表視圖取代）。

新結構：sync alert ＋ `CalendarBoard`（唯讀）＋ legend ＋ 共用 `CalendarEventDetailDialog`。

### 資料抓取與視圖範圍

- `dates-set` 觸發時，依 FullCalendar 提供的可見範圍（`view.activeStart` / `view.activeEnd`）換算所涵蓋的 `(year, month)` 集合。
- 對每個涵蓋月份呼叫 `getCalendar({ year, month })`；**session 內以 `Map<"YYYY-MM", events>` 快取**避免重複抓取；合併後**依事件 id 去重**。
- 如此月/週/日/列表四種視圖在月份交界都不漏事件（解決 `getCalendar` 只接受單月參數的限制，純前端處理，不動後端）。
- `official_sync` 警語取自任一次回應（同警語）。
- 點事件（`event-click`）：用 `rawId`（FullCalendar event id 為 `event:{id}`，原始 id 在 `extendedProps.rawId`）回查原始 `CalendarEvent`，開 `CalendarEventDetailDialog`。

## 後台 `CalendarView.vue` 修改

- 將 `<FullCalendar :options="calendarOptions" />` 換成 `<CalendarBoard :events="fullCalendarEvents" editable @event-click="onEventClick" @event-drop="onEventDrop" @dates-set="onDatesSet" />`。
- `calendarOptions` 中屬於「外觀/視圖/locale/buttonText/樣式」的部分搬進 `CalendarBoard`；後台保留的是資料（`useCalendarLayers` + `getAdminFeed`）與三個 callback 的**業務語意**（`onEventClick` 開編輯或導頁、`onEventDrop` 呼叫 `updateEvent`、`onDatesSet` 重抓 feed）。
- 既有 `CalendarToolbar`（圖層）、事件列表表格＋搜尋、新增/編輯 dialog、匯出按鈕 → **全部保留不動**。
- 後台原本的唯讀詳情 dialog（`detailVisible`）改用共用 `CalendarEventDetailDialog`。
- **必須完整保留**的行為：`editable: true`、`eventStartEditable: true`、`eventDurationEditable: false`、四種視圖、`datesSet`/`eventClick`/`eventDrop` 接線、以及「全域 editable=true 但 per-event `editable:false` 鎖住非 event 層」的拖拉策略。

## 測試（advisor #3）

- **新增** `src/utils/__tests__/portalCalendar.test.ts`：純函式 `portalEventToFeedItem` 單元測試 — 全天單日、全天多日（end inclusive 傳遞）、時段事件（date+time 合併、缺 end_time）、各 `event_type`→color、holiday/補班日類型。
- **新增**（若採可測純函式）`applyEditable(events, editable)` 的單元測試：`editable=false` 時每個 event `editable===false`；`editable=true` 時保留原值。
- 沿用既有 `toFullCalendarEvents` / `useCalendarLayers` / `calendarLayers` 測試，**不**在 jsdom 硬掛 FullCalendar。
- 任何牽涉掛載 `CalendarBoard` 的 SFC 測試一律 `vi.mock('@fullcalendar/vue3')`。

## 回歸驗證（手動，因後台 view 無自動測試）

抽元件後**手動**走後台一輪：
1. 新增事件、編輯事件、刪除事件。
2. 拖拉改期：`event` 層可拖並寫回；其他層（假日/請假/活動/考核/會議）拖拉後 revert 並提示。
3. 圖層切換（`CalendarToolbar` 全選/清除/個別）。
4. 匯出行事曆、匯出假日。
5. 官方/唯讀列「查看」開共用詳情 dialog。
6. 月/週/日/列表四視圖切換、`datesSet` 重抓 feed。
7. 手機寬度（≤640px）下工具列降為精簡、預設 listWeek。

教師端手動驗證：唯讀（無編輯/刪除/拖拉）、四視圖切換、月份交界（週/列表跨月）不漏事件、點事件看詳情、sync alert 與 legend 顯示。

## 規範遵循

- 前端 TS-only：新 SFC 一律 `<script setup lang="ts">`；禁 `any`，用 `unknown` + narrow。
- 一個 commit 只做一件事；commit message 繁體中文、Conventional Commits。
- 不動 `src/api/index.ts` axios wrapper；`getCalendar` 維持現狀（可選擇補型別，但非必要，避免擴大範圍）。

## 不做（Out of Scope / YAGNI）

- 不開放教師編輯/新增/刪除任何事件（維持唯讀）。
- 不新增 portal 端的圖層工具列（資料單一來源，無圖層可篩）。
- 不引入全校請假/考核/會議等敏感圖層到教師端。
- 不改後端、不改 `admin_feed`、不擴充 `getCalendar` 的 query 參數（跨月以前端多次呼叫＋快取＋去重處理）。
- 不重構與本任務無關的程式碼。

## 待後續（Follow-ups）

- 若日後教師端需顯示「教師自己」的請假/排班個人圖層，需後端擴充 portal feed（另案）。
- `getCalendar` 改為接受日期區間以單次抓取跨月資料，可省去前端多月合併（後端另案）。
