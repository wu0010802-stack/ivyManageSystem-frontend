# 員工考勤管理 → 月結工作台重做 設計文件

- 日期：2026-06-16
- 範圍：員工考勤管理（管理端 `/attendance`），跨前後端
- 性質：前端版面/操作重做為主 + 後端匯入預覽端點與一個正確性修補
- 相關 repo：`ivy-frontend`（主）、`ivy-backend`（匯入預覽 + 解析後端化 + shift-aware 修補）

---

## 1. 背景與目標

現況 `src/views/AttendanceView.vue`（635 行）是「匯入打卡 / 考勤查詢 / 異常批次處理」三個各自獨立的分頁：

- 查詢表無分頁（`max-height` 滾動承載整月）、篩選只有年/月/員工下拉（前端本地 filter）、無法在表上補打卡。
- 異常處理要「查詢 → 勾選 → 批次確認」多步，看不出整月還剩哪些待辦、單筆缺乏脈絡。
- 匯入在前端硬編 7 欄 CSV 解析（`AttendanceView.vue:57-89`），出錯只回一串字串，匯完才知道出事。

使用者選定的優化方向：**介面/操作體驗** + **正確性/穩定性**。

目標：把員工考勤管理重做成「**月結工作台**」——選月份後一頁看完全員出勤、把異常逐筆掃乾淨、就地補打卡，並修掉匯入路徑殘留的 shift-aware 正確性缺口。

### 正確性現況（已查證，2026-06-16）

對抗式查證後，先前擔心的多數正確性問題**已在前幾輪修好，本案不再處理**：

- ✅ **旗標 vs status 雙來源脫鉤**：所有寫 `Attendance.status` 的路徑（補打卡核准、請假同步、手填、匯入）改完都呼叫 `sync_attendance_flags` 同步布林旗標；partial-leave 的遲到時段在寫入時已扣掉，薪資讀到正確值。**不動。**
- ✅ **status 開放值域**：`String(40)` 對最長 34 字夠用且有測試釘住（`test_attendance_status_length_2026_06_16.py`）；無 `== 'late'` 漏判複合值的地方。**不動。**
- ⚠️ **唯一殘留真 bug（本案處理）**：`compute_shift_aware_status`（`utils/attendance_calc.py:243`）只在「有 shift_data」時套用。**CSV 匯入路徑**（`api/attendance/upload.py:921-962`，完全不查班別）與**無排班資料的 Excel 路徑**（`upload.py:367-417`）仍用 `employee.work_start_time or "08:00"` / `work_end_time or "17:00"` 當基準（`models/employee.py:93-94` 預設即 08:00/17:00）。後果：一位 13:00–22:00 的晚班教師若 `work_start_time` 留在預設且不在排班表，匯入會被誤算約 300 分鐘假遲到，連帶薪資誤扣。

---

## 2. 範圍

### In scope
- 重做管理端 `/attendance` 為三欄月結工作台（取代現有 `AttendanceView.vue`）。
- 後端：新增「匯入預覽（解析 + 逐列檢核、不寫入）」端點；匯入解析後端化（CSV/Excel 同路徑）。
- 後端：修補匯入路徑 shift-aware 缺口（CSV/無排班 Excel 改用員工自訂工時建立 datetime 基準、含跨夜 +1 日 normalize）。
- 逐筆異常處理（補打卡並重算 / 接受扣款 / 特休抵銷 / 豁免）的前端操作面 + 後端必要的單筆處理端點能力。
- 行動裝置退化版型（三欄 → 分頁）。

### Out of scope（明確不做）
- 排班管理 `/schedule`、學生出席 `/student-attendance`、教師端/家長端 portal —— 皆不動。
- 員工自助打卡（punch in/out）—— 維持 Excel/CSV 匯入 + 補打卡審批模型，不新增自助打卡。
- 效能重構（薪資端逐員工全載、匯入 N+1）—— 使用者本案未選效能方向；除非順手且零風險，否則不碰。
- 旗標/status/長度等已修項目。
- 申訴（dispute）流程 —— 由老師端發起，工作台只顯示狀態。

---

## 3. 設計決策摘要（brainstorm 結論）

| 決策點 | 選定 | 理由 |
|--------|------|------|
| 資訊架構 | **月結工作台**（取代三分頁） | 貼 HR「選月 → 看全員 → 清異常 → 就地修」的實際流程，對齊既有薪資月結嚮導風格 |
| 版面 | **三欄全常駐**：名冊 ｜ 異常佇列 ｜ 明細/處理 | ~23 人一頁放得下；老手最快；桌機後台作業可接受高密度 |
| 處理流程 | **佇列逐筆卡 + 自動跳下一筆**（可「看整月」臨時展開） | 月結=把待辦掃乾淨，最少點擊 |
| 匯入 | **先預覽核對、再確認匯入**（後端解析） | 解掉前端解析脆弱 + 匯入前看見問題列 + 順手套 shift-aware |

---

## 4. 前端架構

路由不變：`/attendance`（`src/router/index.ts:125`），權限 `ATTENDANCE_READ`（讀）/ `ATTENDANCE_WRITE`（寫入動作守衛）。新頁面取代 `AttendanceView.vue`。

### 4.1 元件分解（單一職責 + 清楚介面）

```
views/AttendanceWorkspaceView.vue        // 容器：版面骨架、三欄協調、行動裝置退化
└─ composables/useAttendanceWorkspace.ts  // 狀態機（唯一狀態來源）
components/attendance/
├─ WorkspaceHeader.vue        // 月份選擇 ◀▶ + KPI(全勤/遲到/缺卡/待處理異常) + 匯入/匯出鈕
├─ RosterColumn.vue           // ① 名冊：姓名 + 月狀態徽章(✓/遲N/缺N/異常N)，搜尋、排序(預設異常數↓)；點選 → 載入該人整月到 ③
├─ AnomalyQueueColumn.vue     // ② 異常佇列：全月待辦(姓名/日期/類型/預估扣款)，篩選(類型/已處理)，排序；點一筆 → ③ 開逐筆卡
├─ DetailColumn.vue           // ③ 明細/處理：兩種模式
│   ├─ ResolveCard.vue        //    逐筆卡：脈絡(當日排班/有無請假/預估扣款) + 補打卡 inline + 4 動作 + ◀第 n/N 筆▶ + 送出自動前進
│   └─ EmployeeMonthPanel.vue //    看整月：該人月曆/列表，異常日標紅，可就地修(由名冊點選或卡片「看整月」展開)
└─ ImportPreviewDialog.vue    // 匯入：選來源(上傳/貼上) → 後端解析回傳預覽 → 逐列檢核 → 確認匯入
```

每個元件的契約：
- **RosterColumn**：input = roster 摘要陣列、selectedEmployeeId、filter；emit `select(employeeId)`。不含資料抓取。
- **AnomalyQueueColumn**：input = anomaly items、selectedAnomalyId、filter；emit `select(anomalyId)`、`filterChange`。
- **ResolveCard**：input = 單筆 anomaly + 其脈絡（排班、請假、預估扣款）；emit `resolve({action, payload})`、`next`/`prev`。動作集固定 4 種。
- **ImportPreviewDialog**：input = open/月份；內部呼叫 preview → commit；emit `imported(summary)`（觸發工作台重載 + 異常進佇列）。

### 4.2 狀態（`useAttendanceWorkspace`）

唯一狀態來源，集中管理：`year/month`、`roster[]`、`anomalyQueue[]`、`selectedEmployeeId`、`selectedAnomalyId`、`detailMode('resolve'|'month')`、`kpis`、各 loading 旗標、`queueIndex`（逐筆卡 auto-advance 用）。三欄都從這裡讀，透過事件回寫——欄位元件本身不互相耦合。

### 4.3 資料來源（盡量重用既有端點）

| 工作台需求 | 端點 | 狀態 |
|-----------|------|------|
| ① 名冊 + 月狀態摘要 | `GET /attendance/summary` | 既有（每員工月統計） |
| ② 異常佇列（全月） | `GET /attendance/anomalies` | 既有（含 pending/confirmed 統計與 items） |
| ③ 某人整月明細 | `GET /attendance/records`（year/month/employee_id）/ `GET /attendance/calendar` | 既有 |
| 補打卡（手填重算） | `POST /attendance/record` | 既有（含薪資封存守衛、self-guard、merge+sync 旗標） |
| 接受/豁免 | `POST /attendance/anomalies/batch-confirm`（admin_accept/admin_waive） | 既有（傳單一 id 即可逐筆） |
| **特休抵銷（use_pto）逐筆** | （需確認/擴充：現 batch-confirm 僅允許 admin_accept/admin_waive，見 `anomalies.py:201-204`） | **待規劃確認** |
| 匯出月報 / 異常 Excel | `/exports/attendance`、`/attendance/anomalies/export` | 既有 |
| **匯入預覽** | `POST /attendance/upload/preview`（新） | **新增** |
| 匯入確認 | 既有 `POST /attendance/upload`(Excel) / `upload-csv`，或預覽後一條 commit | 規劃時定 |

> 註：工作台多數靠既有端點即可組裝；新增工作主要是匯入預覽端點 + 一個正確性修補。**逐筆「特休抵銷」是否需擴充 batch-confirm 的允許動作**留待 writing-plans 階段以程式碼確認後定案。

### 4.4 行動裝置退化
三欄在窄螢幕（`useIsMobile`，沿用既有 composable）退化為單欄分頁：[名冊] [異常] [明細]，明細以全螢幕呈現。桌機維持三欄。

---

## 5. 後端變更（`ivy-backend`）

### 5.1 匯入預覽端點（新）
`POST /attendance/upload/preview`：接受上傳檔或貼上文字 → 後端解析（標題列對應欄位，CSV/Excel 同一解析路徑，重用 `services/attendance_parser.py`）→ **不寫入** DB，回傳逐列結果：
- 每列：員工（比對 employee_number/姓名）、日期、上/下班、**依排班判定的狀態**、檢核標記之一：`可匯入` / `找不到員工` / `日期無效` / `該月薪資已封存(跳過)` / `將覆蓋既有`。
- 彙總：可匯入 N / 有問題 M / 將覆蓋 K。

前端 `ImportPreviewDialog` 據此渲染；確認後才走 commit。前端不再硬編解析。

### 5.2 正確性修補（shift-aware 缺口）
讓 CSV 匯入（`upload.py:921-962`）與無排班資料的 Excel 路徑（`upload.py:367-417`）也走 `compute_shift_aware_status`：
- 以員工自訂 `work_start_time/work_end_time` 建 `shift_start_dt/shift_end_dt`（`datetime.combine(date, 時間)`），跨夜（end<=start）時 end +1 日 normalize，與既有 shift 路徑一致（`upload.py:456-457`）。
- 預覽端點與實際 commit 走**同一份**狀態判定，確保預覽所見即匯入所得。
- **TDD**：先補一個能重現「13:00 上班 CSV 匯入被誤算 ~300 分假遲到」的回歸測試（RED），再修（GREEN）。

### 5.3 保留的既有守衛（不可破壞）
- 薪資封存守衛：寫入/刪除前檢查該月是否封存（`records.py:64-147`），預覽要把封存月標「跳過」。
- self-guard：admin 不可寫自己考勤（`utils/attendance_guards.py`），預覽/匯入/補打卡沿用。
- 5 年保存期不可刪（`records.py:48`，勞基法 §30）。
- 寫入路徑 merge 請假 + `sync_attendance_flags` 同步旗標——補打卡/匯入既有路徑已含，重構時保持。

---

## 6. 資料流（典型月結）

1. 進 `/attendance` → 選月份 → header 載入 KPI、RosterColumn 載 summary、AnomalyQueueColumn 載 anomalies。
2. 缺資料 → 點「匯入」→ ImportPreviewDialog：上傳/貼上 → preview → 核對 → 確認匯入 → 工作台重載，異常進佇列。
3. 點異常佇列第一筆 → ③ 開 ResolveCard（脈絡 + 4 動作）→ 補打卡並重算 / 接受 / 特休抵銷 / 豁免 → 送出 → 自動跳下一筆。
4. 需要脈絡時點「看整月」或點名冊上的人 → ③ 切 EmployeeMonthPanel。
5. 清空佇列 → 匯出月報 / 交給薪資月結。

---

## 7. 錯誤處理

- 找不到員工 / 日期無效 / 該月封存：在預覽逐列標示，不阻斷整批；可只匯正常列或下載問題清單。
- 寫入碰封存月：後端 403，前端轉成明確訊息（沿用 `useErrorNotify`）。
- self-guard 觸發：明確提示「不可處理本人考勤」。
- 補打卡重算後狀態變更：即時回寫該列 + 從佇列移除已解決項，KPI 同步更新。

---

## 8. 權限
- 讀：`ATTENDANCE_READ`（路由 gate，`ROUTE_PERMISSION_RULES`）。
- 寫（補打卡/接受/豁免/匯入）：以 `ATTENDANCE_WRITE` 守衛動作鈕與 API；前端 `hasPermission` 判定（注意 teacher 角色短路，工作台是管理端不受影響）。
- 新增/變更端點若涉及權限，後端 `Permission` enum 與前端 `PERMISSION_NAMES` 兩端同步。

## 9. 測試策略
- 後端（pytest）：
  - 匯入預覽端點：可匯入/找不到員工/日期無效/封存跳過/將覆蓋 各情境。
  - shift-aware 修補：**先寫 RED 回歸**（晚班 13:00–22:00 CSV 匯入不應誤判遲到），再修。
  - 守衛回歸：封存月、self-guard、5 年保存。
- 前端（vitest）：`useAttendanceWorkspace` 狀態轉移（選人/選異常/auto-advance/解決後移除）、各欄元件渲染與 emit、ImportPreviewDialog 預覽→確認流。
- 跨端整合：`start.sh` 起兩端實點一次月結流程（可納入 e2e critical-path）。

## 10. 分階段交付（建議，writing-plans 細化）
1. **後端先行**：匯入預覽端點 + 解析後端化 + shift-aware 修補（含 TDD）。先定 API 契約 → pytest → `dump_openapi` + 前端 `gen:api`。
2. **前端骨架**：`AttendanceWorkspaceView` + `useAttendanceWorkspace` + 三欄空殼接既有端點（讀）。
3. **前端處理面**：ResolveCard 逐筆卡 + 4 動作 + auto-advance + 看整月。
4. **前端匯入**：ImportPreviewDialog 接預覽端點。
5. **行動退化 + 收尾**：窄螢幕分頁、移除舊 `AttendanceView.vue`、回歸測試、整合驗證。
   - 前後端各自分開 commit；遵守 workspace「完成 = push + CI 綠 + worktree remove」收尾紀律。

## 11. 待業主/規劃階段確認
- **逐筆「特休抵銷」（use_pto）**是否要在管理端逐筆卡提供（現 batch-confirm 僅 admin_accept/admin_waive）；若要則擴充後端允許動作 + 對應 PTO 餘額檢查。
- 「將覆蓋既有」是否預設勾選匯入，或需逐列確認。
- 名冊預設排序（異常數↓ vs 姓名）與 KPI 要顯示哪幾項。
- 是否把此工作台流程納入 `e2e/` critical-path smoke。
```
