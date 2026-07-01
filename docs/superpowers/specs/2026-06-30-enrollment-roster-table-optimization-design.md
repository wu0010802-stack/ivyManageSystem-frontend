# 在籍記錄表優化設計

- 日期：2026-06-30
- 範圍：跨前後端（`ivy-frontend` + `ivy-backend`）
- 狀態：設計定案，待寫實作計畫
- 相關前作：`2026-06-29-enrollment-stats-into-student-workbench-design.md`（在籍統計折入學生工作台分頁）

---

## 1. 背景與目標

「在籍記錄表」是模擬紙本花名冊的密集網格表（`EnrollmentRosterTable.vue`），掛在學生工作台
`/students?tab=enrollment` 的「在籍統計」分頁第二子頁籤。園方用它跨班對照、列印核對。

現況痛點：
1. **視覺老舊**：大量硬編碼 hex（`#aaa`/`#fff9db`/`#fffbe6`/`#fafafa`/`#8c8c8c`/`#f8f9fa`），質感不足。
2. **dark mode 破版**：plain `<td>` + 硬編碼底色在 `html.dark` 不翻色（admin 區吃 `useA11yPreference`）。
3. **無互動**：不能篩選、不能搜尋定位、看不到各 tag 人數、點學生無法跳轉。
4. **匯出僅 PDF**：無 Excel；PDF 為純線框、無底色/斑馬紋，tag 僅文字後綴。

**目標**：在「保留密集網格本質」前提下做視覺精緻化 + dark/RWD 修正 + 輕量互動（篩選／搜尋／tag 統計／點學生跳轉／Excel 匯出）+ PDF 排版優化。

## 2. 範圍

**In scope：**
- 前端：`EnrollmentRosterTable.vue` 視覺重塑、搜尋高亮、tag 統計
- 前端：`EnrollmentPanel.vue` 工具列（年級／班級篩選、搜尋框、tag 統計 chips、匯出 Excel 按鈕）
- 前端：點學生 → 跳學生名冊定位（`StudentListPanel.vue` 補讀 `?q=`/`?student_id`）
- 後端：`RosterStudent` 補 `student_id`、Excel 匯出端點、PDF 排版優化

**Out of scope：**
- 不改在籍統計圖表分頁（Tab 1）的既有邏輯
- 不做 schema 異動（純讀，無 migration）
- 不改 axios wrapper / 權限模型

## 3. 現況（關鍵檔案）

| 檔案 | 角色 |
|------|------|
| `ivy-frontend/src/components/enrollment/EnrollmentRosterTable.vue` | 在籍記錄表網格（521 行，純渲染 `props.roster`） |
| `ivy-frontend/src/components/student/workbench/EnrollmentPanel.vue` | 容器，含學年選擇/列印/tab，第二 tab 掛 RosterTable（710 行） |
| `ivy-frontend/src/components/student/workbench/StudentListPanel.vue` | 學生名冊面板（`?tab=roster`），已有姓名搜尋 + 讀 route.query(action/classroom_id) |
| `ivy-frontend/src/api/studentEnrollment.ts` | `getEnrollmentStats/Options/Roster/RosterPdf` |
| `ivy-frontend/src/utils/download.ts` | `downloadFile(url, fallbackName, params)` blob 下載（帶 JWT） |
| `ivy-backend/api/student_enrollment.py` | stats/roster/roster.pdf/options 端點（450 行） |
| `ivy-backend/services/enrollment_roster_pdf.py` | reportlab A4 橫向單頁 PDF 產生器（361 行） |

現有 `RosterStudent`（`api/student_enrollment.py:172`）：`seq / name / status_tag`，**無 student_id**。
roster student query（`:284-300`）只 select `classroom_id / name / status_tag`。
`Student.gender`（`models/classroom.py:145`，`String(10)`，值「男」/「女」可為 null）。

## 4. 設計

### 4.1 後端 — `RosterStudent` 補 `student_id`

- `RosterStudent` Pydantic model 加 `student_id: int`。
- query（`:286-290`）加 select `Student.id`；建構（`:316`）`RosterStudent(seq=i+1, student_id=s.id, name=s.name, status_tag=s.status_tag)`。
- 觸發 OpenAPI 契約變更 → 後端跑 `dump_openapi.py`、前端 `npm run gen:api` 更新 `schema.d.ts`。

### 4.2 後端 — Excel 匯出端點

新增 `GET /student-enrollment/roster.xlsx`：
- 權限：`require_staff_permission(Permission.STUDENTS_READ)`（同 roster.pdf）。
- scope：複用 `get_enrollment_roster(...)`（其 class-scope filter 自動繼承）。
- 為取性別，Excel 路徑的學生 query 補 `Student.gender`（roster API 本身不需動，Excel 端獨立查或擴充共用查詢——實作時擇一，傾向 Excel 端獨立補 gender 以免動 roster response）。
- openpyxl（已在 `requirements.txt`），產**雙工作表**：
  - **「在籍清單」**：欄＝序號 / 年級 / 班級 / 姓名 / 性別 / 狀態（新生|舊生）/ 標記（特教·原民·不足齡，以頓號併列）/ 班導師。每生一列、扁平可再加工。
  - **「統計」**：各班（年級｜班級｜男｜女｜合計）→ 年級小計 → 全園總計 → tag 人數彙總（新生／不足齡／特教／原民）。
- 檔名 `在籍清單_<民國年>_<學期>.xlsx`，`Content-Disposition: attachment; filename*=UTF-8''<quote>`。
- 新增 service `services/enrollment_roster_xlsx.py`（與 PDF 產生器並列），輸入同 roster dict + gender 補充，輸出 bytes。

### 4.3 後端 — PDF 排版優化（`enrollment_roster_pdf.py`）

維持 A4 橫向單頁自適應（縮字級/行高）邏輯不動，僅加質感：
- 表頭 6 列（班序～美師）加淡底色（`colors.HexColor` 淡灰）區隔身體。
- 身體區隔列淡灰斑馬紋（提升橫向對照可讀性）。
- tag 後綴改為加粗（reportlab 黑白，不上色，改用粗體或加框小字）。
- 表尾新增一列「標記統計：新生 X　不足齡 X　特教 X　原民 X」。
- 標題與分隔線微調（字級/間距）。

### 4.4 前端 — `EnrollmentRosterTable.vue` 視覺重塑

精緻化保留密集網格（對應使用者選定的方向）：
- **token 化**：所有硬編碼 hex → design tokens（`--border-color`/`--neutral-*`/`--bg-color-soft`/`--text-*` 等），確保 dark mode 背景翻色正確、文字對比足夠。逐一檢查「有效背景」（plain `<td>` + 硬編碼 hex 在 dark 不翻，須換 token 或加 `html.dark` 窄覆寫）。
- **彩色狀態點**：學生姓名前加彩色圓點取代整格染色（新生綠／不足齡橘／特教紫／原民藍）；原民保留上標「原」。
- **sticky**：表頭（班序～美師列）+ 首欄（序號）固定。
- **hover 整列高亮**：因橫向班欄結構，純 CSS `:hover` 僅單格——以 JS 記 `hoverRow` index，套用整列淡藍。
- **搜尋高亮 + 自動捲動**：新增 prop `highlightKeyword: string`；命中學生格加高亮樣式，首個命中所在班欄 `scrollIntoView`（橫向）。
- **tag 統計**：圖例升級為帶人數（新生 X / 不足齡 X / 特教 X / 原民 X），數字由 `props.roster` computed。

> RosterTable 維持「純渲染 + 高亮」職責；**篩選由 Panel 算好 `displayRoster` 再傳入**（見 4.5），RosterTable 不持有篩選狀態。

### 4.5 前端 — `EnrollmentPanel.vue` 工具列（在籍記錄表 tab）

在「在籍記錄表」tab 內容上方加工具列：
- **年級篩選**（el-select multiple，選項取自 `roster` 的 grade_name 去重）。
- **班級篩選**（el-select multiple，連動：選項依年級篩選後的班）。
- **姓名搜尋框**（el-input + 300ms debounce）→ 綁定 `highlightKeyword` 傳給 RosterTable。
- **tag 統計 chips**：`●新生 N ●不足齡 N ●特教 N ●原民 N`（對應使用者選定 preview），來源同 RosterTable 圖例的 computed。
- **匯出 Excel 按鈕**：呼叫新增 `getEnrollmentRosterXlsx`（走 `downloadFile('/student-enrollment/roster.xlsx', '在籍清單.xlsx', termParams())`）。
- 「列印」「重新整理」「學年學期」沿用。

**`displayRoster` computed**（Panel 內）：依 gradeFilter / classFilter 過濾 `roster.classes`，並**重算** `grade_summaries / grand_total / new_grand_total / old_grand_total` 與 tag 統計，使「所見即所得」（篩選時 footer 統計只反映可見班）。無篩選時等同原 roster。

`getEnrollmentRosterXlsx` 加進 `src/api/studentEnrollment.ts`（`responseType: 'blob'`，比照 `getEnrollmentRosterPdf`）。

### 4.6 前端 — 點學生跳轉

- RosterTable 學生格可點（有 `student_id` 時）→ `emit('select-student', { id, name })`。
- Panel 接住 → `router.push({ path: '/students', query: { tab: 'roster', student_id, q: name } })`。
- `StudentListPanel.vue` 補：`onMounted`/watch route.query 時，若有 `q` 填入 `searchQuery`（沿用既有 search 能力，最小改動）。`student_id` 作為精確定位/高亮預留欄位（本次至少填入搜尋；重名手足由姓名搜出多筆使用者自選）。

### 4.7 dark mode / RWD

- **dark mode**：admin 區吃 `html.dark`。token 化後實機驗證亮/暗兩態；對「不翻色的 plain `<td>` 硬編碼底」加 `html.dark` 窄覆寫（非 `:deep`，scoped 內可 `html.dark .x`）。
- **RWD**：手機端 `.roster-outer` 由橫向並排改為縱向堆疊（員工名單面板移到表格下方、不再固定 160px）；表格區 `overflow-x:auto` 保留可橫向捲動；工具列 `flex-wrap`。

## 5. 資料與型別

- `RosterStudent`：`{ seq, student_id, name, status_tag? }`（後端 + 前端 interface + RosterTable interface 同步）。
- Excel 不改 roster response 結構（性別於 Excel 端獨立補查），故前端 roster 型別僅加 `student_id`。
- OpenAPI：後端改 `RosterStudent` 後 regen `schema.d.ts`，前端 commit。

## 6. 測試策略（TDD，先寫紅燈）

**後端（pytest，掛 `test_db_session`，`-o addopts=""` 關 coverage 加速）：**
- `RosterStudent.student_id` 出現在 `/student-enrollment/roster` response 且值正確。
- `GET /student-enrollment/roster.xlsx`：200、`Content-Type` 為 xlsx、雙工作表名稱、清單列數＝在籍人數、統計頁人數正確、性別欄正確、scope 過濾沿用（受限帳號只見授權班）。
- PDF smoke：`generate_enrollment_roster_pdf` 回非空 bytes、含字體；新增「標記統計」列不報錯（含 0 班 edge case）。

**前端（Vitest）：**
- RosterTable：`highlightKeyword` 命中加高亮 class；tag 統計數字正確；有/無 `student_id` 的點擊行為（emit 與否）。
- Panel：`displayRoster` 依篩選過濾班 + 重算 summaries/tag 統計；匯出按鈕呼叫正確 url/params；點學生 `router.push` 參數正確。
- StudentListPanel：route.query 帶 `q` 時填入搜尋框。
- dark mode / RWD：實機（dev server）目視驗證為主，不寫自動化。

## 7. Commit／部署／風險

- **分開 commit**：後端一筆（student_id + xlsx + pdf）、前端一筆（視覺＋互動＋跳轉），訊息描述同一功能。
- **OpenAPI 漂移**：後端改 response model → `dump_openapi.py` + 前端 `gen:api`，commit `schema.d.ts`；注意跨 repo push race。
- **無 migration**（純讀）。
- **最大踩雷點**：dark mode token 化（plain `<td>` 硬編碼底不翻），逐一追「有效背景」並實機驗證。
- 收尾照 workspace DoD：push + CI 綠 + worktree 清理（本 session 預設併 local main 未 push，依使用者指示）。

## 8. 決策紀錄

1. **Excel 含性別欄** — 是（清單更實用；Excel 端補查 `Student.gender`，不動 roster response）。
2. **年級篩選** — 多選（4 個年級，checkbox 式彈性高），班級連動多選。
3. **點學生跳轉** — 跳學生名冊以姓名搜尋定位 + 後端補 `student_id`（供精確/未來高亮 + Excel 追溯）；不在 roster 頁內開詳情抽屜（成本與後端欄位需求較高）。
4. **篩選語意** — 所見即所得：篩選時 footer 統計與 tag chips 只反映可見班（無篩選＝全園）。
5. **PDF 不上色** — 黑白印表友善，tag 以粗體/小框強化而非彩色。
