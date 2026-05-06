# 教師端 Portal 大 polish — Phase 4 設計（簡化版）

## 背景

`PortalAttendanceView.vue` 967 行，承載教師月度出勤表：sticky 月份切換、統計卡（5 個指標）、桌面 table / mobile cards 雙視圖、IntersectionObserver-based sticky bar、「今日」scroll 定位。已有本地 `sheetCache = new Map()`（永久 cache）。

## 範圍

### 必做

**PortalAttendanceView 拆解**：967 → ~280 行 + 4 子元件，職責清楚分離。

**子元件**（放 `src/views/portal/components/attendance/`）：

| 元件 | 預估行數 | 職責 |
|---|---|---|
| `AttendanceMonthSticky.vue` | ~120 | sticky 月份 bar + 上下月切換 / 「今日」按鈕 / IntersectionObserver 觀察邏輯 |
| `AttendanceStatsRow.vue` | ~80 | 月度統計（5 指標：出勤天數 / 平均工時 / 遲到 / 早退 / 缺勤；套既有 StatCard） |
| `AttendanceCardsView.vue` | ~150 | mobile 卡片視圖（每天一卡） |
| `AttendanceTableView.vue` | ~150 | 桌面表格視圖（el-table） |

主檔 `PortalAttendanceView` 預估 ~250-300 行：state（query / sheetData / viewMode / loading）、cache 邏輯、isMobile resize、orchestration。

**StatCard 套用**：5 個 `<div class="stat-item">` 改為 `<StatCard>` 元件（既有 `src/components/common/StatCard.vue`），保留 4 種 tone（normal / warning / danger）對應 stat 類型。

**vitest 覆蓋**：4 子元件各 4-7 條 test（render / props / emit），主檔 view-level test 4-5 條（mount / month switch / loading state / mobile detect）。預期新增 ~25 條 vitest。

### YAGNI 砍掉（spec 原寫但不做）

| 原 spec 項目 | 砍掉原因 |
|---|---|
| 替換 sheetCache 為 usePortalCache | 既有「過去月份永久 cache」對唯讀 view 合理；usePortalCache 5min TTL 不適合；換 risk 高 |
| el-table-v2 虛擬列表 | 30 天 × 1 employee = 30 row，沒卡頓問題 |
| useAttendanceMonth composable | state hoist 到主檔即可，獨立 composable 增加複雜度沒實質收益 |

---

## Branch / PR 策略

- 純前端：`feat/teacher-acd-v1-4-attendance` from `feat/teacher-acd-v1-3-contact-book`
- 後端無變更
- Phase 1-3 merge 後此 branch rebase main

---

## 驗收標準

- [ ] PortalAttendanceView 主檔 < 320 行
- [ ] 4 子元件全部建立，emit 事件清楚
- [ ] StatCard 套用於 5 個統計指標
- [ ] 既有功能不變：sticky bar / 「今日」scroll / mobile cards / desktop table 切換
- [ ] sheetCache 邏輯保留（不換）
- [ ] 全 vitest ~905-915 綠（881 + 25）
- [ ] dev mode 手動驗證 mobile + desktop 兩個 viewport

---

## 風險與緩解

| 風險 | 緩解 |
|---|---|
| sticky bar IntersectionObserver 邏輯抽出時 ref 失效 | 把 `topSentinel` ref 用 expose 或 prop pass-back；測試驗 sticky 顯示/隱藏 |
| viewMode resize 邏輯散落 | 主檔保留 isMobile + viewMode reactive；子元件純展示，不自管 viewMode |
| StatCard tone API 不對齊既有 stat-item warning/danger 類別 | StatCard 已有 5 種 tone，直接 map（warning → warning，danger → danger）|

---

## 預估工作量

- 純前端：~6-8 小時
- 4 子元件 + 主檔 refactor + ~25 條 vitest
