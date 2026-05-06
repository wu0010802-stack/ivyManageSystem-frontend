# 教師端 Portal 大 polish — Phase 5 設計（簡化版）

## 背景

`PortalScheduleView.vue` 701 行，承載教師個人排班 + 換班請求功能：月度日曆（7×6）、換班發起 / 回覆 / 取消、待我回覆 + 我發起的兩個 tab。`calendarWeeks` 已是 computed，但完整邏輯（含 today / 邊界判定）散在主檔。

## 範圍

### 必做

**PortalScheduleView 拆解**：701 → ~250 行 + 4 子元件 + 1 composable。

**子元件**（放 `src/views/portal/components/schedule/`）：

| 元件 | 預估行數 | 職責 |
|---|---|---|
| `ScheduleMonthHeader.vue` | ~80 | 月份切換 + summary（總工時 / 排班天數） |
| `ScheduleCalendarGrid.vue` | ~180 | 7×6 月曆網格（含 mobile 80px+ 格子） |
| `ScheduleSwapTable.vue` | ~120 | 換班申請列表（待回覆 + 我發起 2 tab） |
| `ScheduleSwapDialog.vue` | ~150 | 換班發起/回覆（mobile 用 TeacherBottomSheet，desktop 保 el-dialog） |

**Composable**：

`src/composables/useScheduleCalendar.js`（~70 行）：
- `calendarWeeks(scheduleData, year, month)` computed
- `isToday(day)` / `isFutureDate(dateStr)` helpers
- 預計算 `_todayStr` / `_todayMidnight` 避免每 render 重建

**mobile UX**：
- 日曆格子高度從 65px 提升到 80px+，加大字體、touch target 對齊 44px
- 換班 dialog 在 mobile 改用 TeacherBottomSheet（phase 1 已建）

**vitest 覆蓋**：4 子元件 + composable 各 4-7 條 test，預期新增 ~25 條。

### YAGNI 砍掉

- ❌ 換班列表分頁（目前資料量小，無實測卡頓）

---

## Branch / PR

`feat/teacher-acd-v1-5-schedule` from `feat/teacher-acd-v1-4-attendance`（純前端）。

---

## 驗收

- [ ] PortalScheduleView 主檔 < 280 行
- [ ] 4 子元件 + composable 建立、emit 清楚
- [ ] mobile 換班 dialog 改 TeacherBottomSheet
- [ ] 日曆 mobile 格子 ≥ 80px
- [ ] 既有 910 vitest 全綠 + 新 ~25 條
- [ ] dev mode mobile + desktop 手動驗證

---

## 風險

| 風險 | 緩解 |
|---|---|
| TeacherBottomSheet 首次套用 mobile dialog 邏輯不同（footer slot / size） | 用 BottomSheet 的 default snap='full'；form/footer 用其自帶 slot；測試 mobile / desktop 切換 |
| useScheduleCalendar 抽出後 today / dateStr 邏輯漂移 | composable 補 unit test 覆蓋 weeks / isToday / isFutureDate 三個函式 |
| ScheduleSwapDialog 兩種 layout（dialog vs sheet）容易重複邏輯 | dialog/sheet 用同一 form 子模板，外層用 `v-if="isMobile"` 切換 wrapper |

---

## 預估工作量

~6-8 小時。
