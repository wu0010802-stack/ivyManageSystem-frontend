# Admin 全站對齊/置中類視覺瑕疵掃描與修復（2026-07-22）

## 背景與範圍

使用者回報收合側欄圖示不置中，裁定「全站掃一輪同類瑕疵並全修」。範圍限定
**幾何類 polish**（對齊/置中/間距/折行/欄寬/dark 對比），不動文案、流程、功能
（上輪 2026-07-20 admin UI/UX 稽核已處理）。

掃描方法：Chrome 實走 admin 全部主要頁面（~25 頁），檢查 light / dark /
側欄收合狀態；瑕疵以 DOM 量測（getBoundingClientRect / computed style）釘根因，
修復基於 `origin/staging`（b9a408c5），修後於 worktree dev server 逐項複驗。

## 修復清單（前端 8 項 + 後端 1 項）

| # | 瑕疵 | 根因 | 修法 | 檔案 |
|---|------|------|------|------|
| 1 | 收合側欄圖示偏右 12px、超出 active 底塊 | 自訂 margin 12px 使項目剩 40px，EP collapse 的 `padding-left: 20px`（menu-item 與 `.el-menu-tooltip__trigger` 兩層）仍生效 | 收合態歸零兩層 padding + flex 置中 | `AdminSidebar.vue` |
| 2 | 儀表板 8 統計卡僅 1 張有 icon | `icon="Calendar"` 字串傳給 `<component :is>`，局部 import 的 EP icon 解析不到 → 空色塊 | 7 處改 `:icon="X"` 元件綁定；StatCard prop 收窄為 `Component` 讓 typecheck 擋字串 | `HomeView.vue`、`StatCard.vue` |
| 3 | 學生今日任務「學號」114-大-01 折兩行 | width=80 不足 | width=100 | `AttendanceSection.vue` |
| 4 | 學費「繳費日期」2026-03-15 折兩行 | width=105 不足 | width=120 | `FeeRecordsTab.vue` |
| 5 | 家長提問「操作」3 鈕折兩行錯位 | width=200 塞不下 | width=300 | `ActivityInquiryView.vue` |
| 6 | 點名管理「操作」3 鈕折行 | width=200 | width=240 | `ActivityAttendanceView.vue` |
| 7 | 課程管理「編輯/停用」堆疊 | width=130 | width=160 | `ActivityCourseView.vue` |
| 8 | 無障礙面板 dark 下選中字級鈕白底白字 | active 底用 `--el-color-primary-light-9`（dark 未覆寫即近白）— crisp.css 檔頭警告的 defect class | 改 `color-mix(primary 14%, transparent)` 半透明疊底 | `A11yMenu.vue` |
| 9 | 排班「班別」select 脹到 ~700px、時間欄被擠到最右 | 只有班別欄用 min-width，el-table 把全部剩餘寬灌給它 | 時間/調整欄一併改 min-width 分散彈性 | `ScheduleView.vue` |
| 10 | 招生漏斗空欄「尚無此階段卡片」沉底 | 空狀態是 `flex:1` 拖曳區的兄弟節點被推到欄底 | absolute 蓋在拖曳區上置中，`pointer-events:none` 不擋拖入 | `FunnelColumn.vue` |
| 11 | 行事曆請假橫幅顯示 raw code `parental_unpaid` | 後端 `calendar_admin.py` 直接拼 `r.leave_type` | `LEAVE_TYPE_LABELS.get(code, code)` 轉中文（fallback 原樣）；TDD 補測試 | BE `api/calendar_admin.py`（分支 `fix/calendar-leave-label`） |

## 掃描後排除的假陽性（勿再報）

- **員工/帳號列表「狀態」欄空白**：漸進渲染延遲，載入完成後 badge 正常。
- **報名管理「繳費」欄金額沉底**：el-tag 卡在 `el-zoom-in-center-enter-active`
  scale(0)——背景分頁 rAF 節流 artifact，前景使用動畫正常完成。
- **收合瞬間 logo 文字「常春藤管」被裁**：width transition 過程殘影。
- **考核年終「載入失敗」**：dev 資料層問題，非視覺。
- **招生漏斗 dark 下白底欄**：既有 dark 適配缺口（A11y 面板已標注「部分舊頁面
  仍在調整中」），不在本輪幾何範圍。

## 驗證

- FE：`vue-tsc` 綠；Vitest 全庫 5438 passed，15 failed 經乾淨 origin/staging
  worktree 對照確認為 base 既有紅（StudentEditDialog / usePortalStudent /
  ClassroomView×2 / PortalStudentAttendanceView.race / OverviewTab），非本次引入。
- BE：`tests/test_calendar_admin.py` 29 passed（含新增轉譯測試，先紅後綠）。
- 視覺：worktree dev server（:3000）逐項複驗——側欄 8 icon 中心均為 32px
  （側欄正中）、統計卡 icon light/dark 全顯示、兩處折行單行化、三處操作欄
  單行、A11y 選中鈕 dark 可讀、排班/漏斗版面正常。
