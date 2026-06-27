# RWD 優化 — P3 品質掃除（手機表格卡片視圖 + 觸控目標 + 平板中間帶）

- **日期**：2026-06-27
- **狀態**：設計待審
- **範圍**：全系統 RWD 翻修第四階段。P0 地基已完成併入 main；P1 實機稽核確認**無破版**（見 `2026-06-27-rwd-p1-empirical-audit-report.md`），故跳過 P2，直接做 P3 品質。三個子項：P3-1 手機卡片視圖、P3-2 觸控目標 ≥44px、P3-3 平板中間帶。

---

## 1. 背景（來自 P1 稽核）

- admin 列表全是逐頁手寫 `<el-table-column>`，**無泛型 table↔card 共用元件**；手機上靠 Element Plus `el-scrollbar` 容器內橫向捲動（功能正常但要左右滑）。
- 教師 Portal `PortalAttendanceView` 有 `viewMode + watch(useIsMobile)` 自動切 table↔cards 的**骨架範式**，但月曆型、props 非泛型，不能直接搬。
- 操作欄全是 `el-button link size="small"` 文字連結，觸控目標 <36px。
- P0 已備好斷點 token：`--to-sm`(≤767.98)、`--to-md`(≤1023.98)、`--bp-md`(≥1024)、JS `useIsMobile()`（`MOBILE_MAX_PX=767.98`）。**P3 全程消費這套，不新增斷點。**

## 2. 目標

1. **P3-1**：抽**薄泛型** `AdminListCards` 卡片元件，套用到 3 個高價值 admin 列表（員工 `EmployeeView`、學生出席班級層 `StudentAttendanceView`、帳號 `SettingsAccountsTab`），手機顯示卡片、桌機維持表格，沿用 Portal 的 `useIsMobile` watch 範式。
2. **P3-2**：手機（`@media (--to-sm)`）下關鍵互動控制觸控目標 ≥44px——**有界**：AdminListCards 卡片內操作 + AdminHeader 圖示鈕。
3. **P3-3**：平板中間帶（768–1024）用 `--to-md` 對 1–2 個資料密集 grid 做中間態（欄數/間距）。

非目標：不一次處理全 repo 90+ el-table（只 3 頁）；不做全站觸控目標 audit（只有界範圍）；不改桌機外觀（卡片只在手機出現）。

## 3. 設計

### 3.1 P3-1 共用元件 `src/components/common/AdminListCards.vue`
**dumb presentational**，不自帶斷點判斷（由各頁 `v-if` 控制何時顯示，比照 Portal）：
```ts
// props
defineProps<{
  items: Record<string, unknown>[]
  columns: { label: string; prop: string; formatter?: (item: any) => string }[]
  rowKey: string                 // item 唯一鍵欄位名
  loading?: boolean
  emptyText?: string
}>()
// slots: #title="{ item }"（卡片標題，可選；無則用第一欄）、#actions="{ item }"（操作區）
```
- 每筆 item render 成一張卡片：標題（`#title` 或第一欄值，醒目）→ 其餘 `columns` 的 label/value 列（formatter 可選）→ `#actions` 操作區（底部，全寬、按鈕 ≥44px）。
- `loading` → 用既有 `TableSkeleton`/骨架；`items` 空 → `emptyText`（預設「目前沒有資料」），比照 `EmptyState`。
- 卡片用既有 design token（`--color-*`/`--space-*`/圓角/陰影），不硬編色（對齊 `feedback_dark_darker_token_overload`：用會翻色的 token）。
- 樣式 scoped；卡片容器 grid 單欄（手機）；`@media (--bp-md)` 可選 2 欄（平板/桌機若被用到，但本元件預設只在手機出現故單欄為主）。

### 3.2 各頁整合（3 頁，pattern 一致）
每頁：
1. 取 `const { isMobile } = useIsMobile()`（EmployeeView 已有；另兩頁新增）。
2. 既有 `<el-table>` 包 `v-if="!isMobile"`。
3. 加 `<AdminListCards v-else :items :columns :row-key>` + `#actions` slot **重用原操作欄 markup**（同樣的詳情/編輯/更多 按鈕，移進 slot）。
4. 定義 `cardColumns` config（從現有 el-table-column 的 label/prop 抽出；formatter 對齊原欄位顯示邏輯）。

| 頁面 | 表格 | 卡片標題 | cardColumns（label）|
|---|---|---|---|
| `EmployeeView.vue`（主清單 `:935`，操作 `:955`）| 員工主表 ~7 欄 | 姓名 | 編號 / 教育局系統 / 職位 / 到職日 / 狀態 |
| `StudentAttendanceView.vue`（班級層 `:462`）| 班級出席 ~13 欄 | 班級 | 在籍 / 已點名 / 未點名 / 出席率 / 點名完成率 / 狀態 |
| `SettingsAccountsTab.vue`（帳號表）| 帳號 7 欄 | 帳號 | 員工姓名 / 角色 / 權限 / 狀態 / 最後登入 |

> 只動主列表。EmployeeView 的學歷/證照/合約/考勤子表、StudentAttendanceView 的學生月統計表、StudentEnrollment 純統計表**不在本次**（子表多在 dialog 內、半徑大）。

### 3.3 P3-2 觸控目標（有界）
- AdminListCards 卡片內 `#actions` 區的按鈕：`min-height: 44px`（元件 scoped 樣式內建，故 3 頁卡片操作自動達標）。
- `AdminHeader.vue` 的 header 圖示鈕（搜尋/通知/無障礙/帳號等，P1 量到 ~10 個 <36px）：加 `@media (--to-sm)` 規則使其 `min-width/height: 44px`（手機才放大，桌機不變）。
- **不做**全站 `.el-button` blanket 放大（會壞密集桌機 UI）。其餘頁面 audit 列 follow-up。

### 3.4 P3-3 平板中間帶（最小具體）
- 對 **2 個** 資料密集 grid 加 `@media (--to-md)`（768–1023.98）中間態：
  - 儀表板「學校概況」4 欄統計卡（`HomeView`/dashboard）→ 中間帶 2 欄（手機 1 欄 / 平板 2 欄 / 桌機 4 欄）。
  - AdminListCards 的卡片 grid → 平板帶 2 欄（手機 1 欄）。
- 屬 nice-to-have；若實作時發現該 grid 已用 `auto-fit minmax` 自動處理就跳過、文件化。

## 4. 測試
- **AdminListCards 單元測試**（`src/components/common/__tests__/AdminListCards.spec.ts`）：給 items+columns render 出 N 張卡片、每卡含 columns 的 label/value、`#title`/`#actions` slot 正確、loading 顯示骨架、空 items 顯示 emptyText、按鈕 ≥44px（讀 computed style 或 class 斷言）。
- **各頁整合測試**：mock `useIsMobile` 可控 ref，斷言 `isMobile=true` 時渲染 AdminListCards、`false` 時渲染 el-table（比照 P0 Task 5 的 mock pattern）。注意 SettingsAccountsTab 屬家長端以外 admin，但測試走標準 mount。
- **回歸**：`npm run test`（注意家長端三測試樹，但本次不動家長元件）+ `npm run typecheck` + `npm run build`。
- **實機驗證**：dev server 在 390/768/1024px 各頁截圖核對（沿用 P1 方法）。

## 5. 風險與緩解
| 風險 | 緩解 |
|---|---|
| 各頁操作欄 markup 移進 slot 時漏掉某動作/權限判斷 | 逐頁 diff 對照原操作欄；整合測試斷言動作按鈕存在 |
| cardColumns formatter 與原欄位顯示不一致（狀態色票/日期格式）| formatter 直接重用頁面既有的顯示函式，不另寫 |
| AdminListCards 變成肥元件（塞太多頁面特例）| 保持 dumb presentational + slot；頁面特例留在頁面 slot 內，不進元件 |
| P3-2 header 放大破壞桌機 | 規則包在 `@media (--to-sm)`，桌機不受影響 |
| 觸控 ≥44px 斷言在 happy-dom 量不到實際 px | 改斷言 class/min-height 樣式存在，或註記實機驗證 |

## 6. 交付定義（DoD）
- `AdminListCards.vue` + 測試落地；3 頁手機顯示卡片、桌機顯示表格，整合測試綠。
- P3-2：卡片操作 + AdminHeader 圖示鈕手機 ≥44px。
- P3-3：≥1 個 grid 有平板中間態（或文件化已自動處理）。
- `npm run test` / `typecheck` / `build` 全綠；實機 390/768/1024 截圖核對無回歸。
- commit 分開、Conventional Commits、繁中。

## 7. 後續（不在本 spec）
- 其餘 admin 列表（leaves/overtime/classroom…）卡片視圖（依需求逐頁）。
- 全站觸控目標 audit。
- 教師 Portal console warnings（P1 觀察，非 RWD）另查。
