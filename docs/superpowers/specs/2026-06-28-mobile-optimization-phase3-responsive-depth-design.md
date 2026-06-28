# 手機端優化 Phase 3 — 響應式版面深修（drawer 響應式 + portal 卡片化）

- **日期**：2026-06-28
- **狀態**：設計待審
- **總綱**：`2026-06-26-mobile-optimization-roadmap.md`（破口修復軌；本檔為 Phase 3）
- **前置**：Phase 1（共用基建）、Phase 2（接送+AA）已併入 FE main。
- **互補軌**：RWD 軌已落地 P0（斷點）/ P1（實機稽核零破版）/ P3（AdminListCards + 3 頁卡片化 + AdminHeader 觸控 + 平板中間帶）。

---

## 1. 緣由與範圍重新界定

本 Phase 對應 roadmap 的 T5（表格卡片化）、T8（dialog/drawer 溢出）、T9（觸控目標）。但在動工前對當前 main 重核，發現**平行 RWD 軌已收斂掉大半**：

- **RWD P1 實機稽核（Playwright 真實量 `scrollWidth>innerWidth`）結論「0 P0/P1/P2 破版」**：admin 寬表是「容器內橫向捲動」（功能正常非破版）、手機 `el-dialog` 自動 `is-fullscreen`。
- **RWD P3 已建共用元件 `src/components/common/AdminListCards.vue`** 並接入 `EmployeeView`/`StudentAttendanceView`/`SettingsAccountsTab` 3 頁卡片化、`AdminHeader` 圖示鈕觸控 ≥44px、平板中間帶。

因此 Phase 3 **重新界定為「延續 RWD P3 的 follow-up」**，只做 RWD 軌刻意未做、且經程式碼核實仍成立的部分：

| 做 | 不做（理由） |
|---|---|
| **A1**：2 個 portal drawer 寫死 px size 的 isMobile 響應式（**T8 真破口**，RWD P1 只測 dialog 未測 drawer）| admin el-table 卡片化（RWD P3 已做 3 頁）|
| **A2**：`PortalIncidentView` + `PortalPunchCorrectionView` 用 `AdminListCards` 卡片化（**T5 推廣**）| `AdminHeader` 觸控（RWD P3 已做）|
| **A3**：A2 卡片化順帶解決該兩頁手機列操作觸控目標（**T9 隨之達標**）| **薪資 `StepReview`（50 欄）不卡片化**（見 §2）|

**非目標（明確排除）**：
- 不重做 RWD P3 已完成項。
- 薪資 `StepReview` / 其他超寬財務覆核表不卡片化（§2 理由）。
- public 頁 ~12 個觸控目標、其餘 admin/portal 列表卡片化 → follow-up（有界，比照 RWD P3 §7）。
- 不動後端、不碰 RWD 斷點 token / dark-mode token。

## 2. 設計判斷：薪資 StepReview 不卡片化

稽核原把 `StepReview`（薪資覆核，**50 個 `el-table-column`**、~2700px）列為 T5 代表。但**超寬財務覆核表卡片化會更難用**：

- 覆核工作本質是「跨欄橫向比對」（薪資各項 vs 應發 vs 實發）；拆成「每員工一張卡 + 50 個 label/value」會變成極長垂直清單，喪失比對能力。
- RWD P1 實機已確認它「能捲、功能正常」（非破版）。
- 卡片化適合「中等欄數、每列是一個實體」的列表，不適合密集財務矩陣。

**結論**：保持橫向捲動，不卡片化。未來若要改善，方向是 sticky 首欄（列 follow-up），非卡片化。

## 3. A1 — portal drawer 響應式（T8 真破口）

**現況（已核實當前 main）**：`el-drawer` 不像 `el-dialog` 有 isMobile 自動 fullscreen，兩個 portal drawer 寫死 px size > 390px 手機寬：
- `src/views/portal/components/contactBook/ContactBookEntryDrawer.vue:134` `size="520px"`
- `src/views/portal/components/activity/ActivityRollcallDrawer.vue:63` `size="460px"`

**改動**：
- 各檔加 `import { useIsMobile } from '@/composables/useIsMobile'` + `const { isMobile } = useIsMobile()`。
- drawer `size` 改 `:size="isMobile ? '100%' : '520px'"`（ContactBook）/ `'460px'`（ActivityRollcall）——保留各自原桌機值。
- 順手把 drawer 內寫死寬度的控制項改為窄機安全：`ContactBookEntryDrawer` 的 `style="width: 220px"` select（:151,:185）→ 加 `max-width: 100%`；`ActivityRollcallDrawer` 的 `min-width: 140px`（:98）→ 改 `min-width: 0` 或 `max-width:100%`，避免在 100% 寬 drawer 的窄內距下仍撐出。

## 4. A2 — portal 卡片化（T5 推廣，重用 AdminListCards）

**重用既有元件**：`src/components/common/AdminListCards.vue`（RWD P3 建，dumb presentational + design token）。介面：
```ts
props: { items, columns: {label,prop,formatter?}[], rowKey, loading?, emptyText? }
slots: #title="{item}" / #actions="{item}" / #empty / #cell-${prop}="{item}"
```
portal 與 admin 共用同一套 design token（`soft-ui.css`），可跨端共用，統一卡片範式。

**整合 pattern（比照 RWD P3 的 EmployeeView，兩頁一致）**：
1. 加 `useIsMobile()`。
2. 既有 `<el-table>` 包 `v-if="!isMobile"`。
3. 加 `<AdminListCards v-else :items="<list>" :columns="cardColumns" row-key="id" :loading="loading">`，`#title`、`#actions`（重用原操作鈕 markup，含權限判斷）、必要時 `#cell-<prop>`（重用原欄位 formatter/狀態色票）。
4. 定義 `cardColumns` config（從現有 el-table-column 的 label/prop 抽，formatter 重用頁面既有顯示邏輯，不另寫）。

| 頁面 | el-table 欄數 | 卡片標題 | 來源 |
|---|---|---|---|
| `PortalIncidentView.vue`（`:185` el-table）| 11 | 學生姓名（或發生時間）| 事件列表，每列一事件 |
| `PortalPunchCorrectionView.vue`（`:122` el-table）| ~8 | 申請日期（或補正類型）| 補打卡申請，每列一申請 |

> 卡片標題/欄位的精確選擇於 plan 階段依各頁實際 column 定案；formatter 一律重用頁面既有函式。

## 5. A3 — 觸控目標（T9，隨 A2 解決）

`AdminListCards` 卡片內 `#actions` 區按鈕 scoped 樣式內建 `min-height:44px`（RWD P3 已驗）。故 A2 一旦卡片化，Incident/PunchCorrection 兩頁的**手機列操作觸控目標自動達標**，無需額外工作。其餘頁面/public 觸控目標列 follow-up。

## 6. 兩軌 / 平行協調
- 本 Phase 觸及 `PortalIncidentView`/`PortalPunchCorrectionView`/2 個 drawer（portal 區，較少被別軌動）+ 重用（不修改）`AdminListCards`。
- **隔離 worktree 實作**，最後對 live main `git merge` 讀當前 tip、衝突即停手。
- 不碰 RWD 斷點 token / dark-mode token / RWD P3 已改的 3 頁。

## 7. 測試策略
- **A1 drawer**：元件測試 mock `useIsMobile` 可控 ref，斷言 `isMobile=true` 時 drawer `size="100%"`、`false` 時原 px（比照 RWD P0/P3 的 mock matchMedia pattern：`setMobileViewport`）。
- **A2 卡片化**：每頁整合測試 mock `useIsMobile`，斷言 `isMobile=true` 渲染 `AdminListCards`（含操作鈕存在、權限判斷保留）、`false` 渲染 `el-table`（比照 `EmployeeView.cardview.spec.ts`）。
- **回歸**：全量 `npm run test`（注意家長三測試樹，但本 Phase 不動家長元件）+ `npm run typecheck` + `npm run build` 全綠。
- **實機**：dev server 390/768/1024px 截圖核對放**實作後 DoD**（比照 RWD P3；設計階段採程式碼證據 + RWD P1 既有實機結論）。

## 8. 交付定義（DoD）
- A1：2 drawer 手機 size 響應式 + 內部控制項窄機安全；元件測試綠。
- A2：Incident/PunchCorrection 手機顯示 AdminListCards、桌機顯示 el-table；整合測試綠。
- A3：兩頁卡片操作 ≥44px（隨 AdminListCards 達標）。
- `npm run test` / `typecheck` / `build` 全綠。
- 隔離 worktree；commit 分開、Conventional Commits、繁中、`Co-Authored-By` trailer；併 live main（未 push，由 user 決定 push 時機）；實機 390/768/1024 截圖核對列 DoD。
