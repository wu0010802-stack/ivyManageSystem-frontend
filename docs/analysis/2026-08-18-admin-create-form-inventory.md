> **歷史快照（2026-09-06 自 commit 17215c3a 還原）**：本檔是 2026-08-18 分型盤點的原文，
> 「處置」欄描述的全站遷移 commit 已於 2026-09-03 棄用（與 staging 衝突過多）。
> 現行做法為機會式遷移，優先序與守衛見
> `docs/superpowers/specs/2026-09-06-admin-form-dialog-defaults-design.md` §7；
> 2026-08-13 之後新增的 fees／bus／POS／enrollment 表單不在本表內。

# Admin「新增／建立」入口與表單全站盤點

> **實作狀態（2026-08-18 第二、三階段完成）**：本表所有標 **migrate／migrate-light** 的列已全數實作完成（＝migrated），標 **keep** 的列保留現況（理由見各列），標 **deferred** 的 4 列（fees 在途批次）維持待辦。基礎設施：`main.css` 的 `.form-grid`/`.fg-*` vocabulary、`src/constants/formDialog.ts` 的 `FORM_DIALOG_WIDTH`、`AdminCreateButton.vue`、`FormSectionNav.vue`（wide 左導覽）、`FormSection` 收合標頭改真 `<button>`。旗艦：ClassroomView（standardNarrow）、AnnouncementView（standard＋IA 重排）、StudentEditDialog（wide＋section nav）、EmployeeFormDialog（wide，dirty/preview/reason gate 全保留）、SurveyFormView（workspace＋sticky 設定欄＋未儲存警告）。驗證：typecheck／lint／lint:tokens／check:a11y 全綠；全套 Vitest 除 `tests/unit/api/attendance.test.js` 一筆（他人 attendance 在途批次自身的既有紅）外全綠。

- 日期：2026-08-18
- 範圍：Admin 後台（`src/views/**` 排除 `portal/`；`src/components/**` 排除 portal／parent／public／kiosk 專用）
- 目的：桌面優先（1280–1920px）表單分型重整的第一階段盤點。第二、三階段的按鈕統一與 compact／standard／wide 分型規則見任務說明；本檔為逐列處置依據。
- 方法：兩輪關鍵字掃描（新增/建立 + 加入/邀請/指派/登記/填寫/開立/新建/建檔/Plus icon）覆蓋 `src/views` 約 170 檔與 `src/components` 約 70 個 dialog/drawer 候選檔，逐檔確認；router 全文比對獨立新增路由；`EmptyState` 元件 21 處與 `el-empty` 原生用法全掃。

## 分型定義（本次採用）

| 分型 | 欄位數 | 容器 | 版面 |
|---|---|---|---|
| **compact** | 1–6 | dialog 480–560px | 預設單欄；語意成對短欄位可雙欄 |
| **standard** | 7–14 | dialog 760–920px | `label-position="top"`＋語意兩欄 grid；textarea／上傳／alert／checkbox 群跨滿列 |
| **wide** | 15+ | dialog 960–1120px／寬 drawer／獨立頁 | 左 section nav＋右 12-col 語意 grid；核心常駐、低頻收合 |
| **workspace / bulk** | 動態、重複列 | 獨立頁／寬容器 | table/grid 工作區，不硬塞直式表單 |

處置標記：**migrate**（第二三階段改版面）、**migrate-light**（僅統一按鈕／文案／寬度 token，版面近乎不動）、**keep**（保留現況，附理由）、**deferred**（⚠在途修改檔，本批不動，待該批收斂後補）。

> ⚠在途：git 工作樹現有他人未 commit 的 attendance／fees 批次（含 `FeeTemplateDialog.vue`、`FeeGenerateModal.vue`、`RefundSuggestModal.vue`、`FeeRecordsTab.vue`、`AdminListToolbar.vue`、`ImportPreviewDialog.vue` 等）。這些檔一律 deferred，僅記錄現況。

---

## 一、人事薪資（員工／出勤／請假／加班／薪資／考核）

| # | Route／頁面 | 按鈕（檔:行） | 表單檔 | 資料類型 | 欄位數 | 現容器 | label | 建議分型 | 處置 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/employees` | `EmployeeListView.vue:403`（PageHeader，primary＋Plus ✓） | `components/employee/EmployeeFormDialog.vue`（＋`EmployeeFormBasic` 47 欄、`EmployeeFormSalary` 32 欄） | 員工 | ≈79（tabs） | dialog 800px（mobile fullscreen） | top | **wide** | **migrate**：拓寬至 1040–1120，tab 內容改 12-col 語意 grid＋左 section nav（tab 內）。**必須保留**：basic／salary 分開儲存、`useEmployeeFormDirty`、`EmployeeChangesPreviewDialog`、reason gate、離開警告（`before-close` 已有）。編輯模式 el-tabs 結構不動 |
| 2 | `/overtime` | `OvertimeView.vue:425`（toolbar，**success 誤用**＋Plus） | 同檔 inline `:664` | 加班紀錄 | 8 | dialog 550px | left 100px | **standard** | **migrate**：760px、label-top、語意兩欄（員工+日期／起+訖／時數+補休），原因 textarea 跨列；success→primary |
| 3 | `/overtime`（批次） | `OvertimeView.vue:422`（primary plain＋Plus ✓ contextual） | `components/overtime/BatchOvertimeDialog.vue` | 加班（批次） | 14＋批次列 | dialog 720px top=5vh | left 100px | **bulk** | **migrate**：寬度升 920–1040，出席名單維持 table 批次列；上方條件區改語意兩欄 |
| 4 | `/overtime`（園務會議） | `MeetingManagementPanel.vue`（新增會議鈕） | 同檔 2 個 dialog | 會議紀錄 | 各 6–7 | dialog 700px／500px | left 100px | **standard** | **migrate-light**：對齊寬度 token 與 label-top；submit「確認建立」已合規 |
| 5 | `/leaves` | `LeaveView.vue:497`（toolbar，**success 誤用**＋Plus） | 同檔 inline `:755` | 請假申請 | 8–10（動態模式） | dialog 550px | left 100px | **standard** | **migrate**：760px、label-top、語意兩欄（員工+假別／起+訖）；配額提示、每日排班展開、請假模式 radio 動態欄位全保留；success→primary |
| 6 | `/calendar` | `CalendarView.vue:376`（PageHeader primary，無 icon） | 同檔 inline `:454` | 行事曆事件 | 9 | dialog 550px | left 80px | **standard** | **migrate**：760px 語意兩欄（起+訖日／起+訖時間）；`RecurrenceEditor` 跨列；補 Plus icon |
| 7 | `/schedule` | —（複製週／批次匯入／每日調整均非新建） | — | — | — | — | — | — | **keep**：無新增入口（狀態調整不在本次範圍） |
| 8 | `/salary`（懲處） | `DisciplinaryPanel.vue:199`（primary＋Plus ✓） | 同檔 inline `:268` | 懲處紀錄 | 5 | dialog 500px | left 90px | **compact** | **migrate-light**：label-top＋寬度 token；類型連動預設扣款保留 |
| 9 | 才藝薪資 | `ArtTeacherPayrollPanel.vue:266`（primary＋Plus ✓） | 同檔 inline | 才藝薪資明細 | 6–7 | dialog 540px | left 100px | **compact** | **migrate-light**：label-top；金額欄右對齊 |
| 10 | 才藝薪資（匯入） | `ArtTeacherPayrollPanel.vue:267`（success＋Upload） | 同檔 upload dialog | 明細批次匯入 | 上傳型 | dialog | — | **bulk** | **keep**：匯入型，success 表匯入動作非新增主 CTA，惟建議降為 default+Upload（第二階段裁定） |
| 11 | 薪資快照 | `SalarySnapshotDialog.vue:154`（檢視 dialog 內 primary small） | `ElMessageBox.prompt` | 快照＋備註 | 1 | MessageBox | — | — | **keep**：單欄位補拍動作，prompt 是正確重量 |
| 12 | `/employees`（離職） | `OffboardingView.vue:312`＋`:420` empty CTA（primary） | 同檔 inline `:427` | 離職檢核發起 | 1 | dialog 420px | — | **compact** | **keep**：極簡選人後導入 drawer 檢核流程，重量正確；僅統一 submit 文案 |
| 13 | `/employees/:id`（證照） | `CredentialsSection.vue`（tab 內「新增學歷／證照／合約」contextual） | 同檔子 dialog | 學歷/證照/合約 | 各 ≈11 | dialog 560px（mobile fullscreen） | left 110px | **standard** | **migrate**：760px、label-top、語意兩欄；三 kind 共用結構不動 |
| 14 | `/appraisal-year-end`（週期 ×3 入口） | `CurrentSemesterOverview.vue:589`（empty CTA default）、`CycleListView.vue:165`（primary＋Plus ✓）＋`:189`（empty CTA primary）、`YearlyEnrollmentTargetSection.vue:247/337`（empty CTA default） | 共用 `appraisal/components/CreateCycleDialog.vue` | 考核週期 | 4 | dialog 520px | left 120px | **compact** | **migrate-light**：label-top＋寬度 token。empty CTA 與 toolbar 主鈕並存頁（CycleListView）注意單一 primary 原則 |
| 15 | 考核規則 | `ScoringRulesPanel.vue:157`（列內「編輯」，語意=建立新版） | `RuleEditorDialog.vue` | 規則新版本 | 動態（TIER 有階梯 repeat 列） | dialog 640px | left 120px | **standard＋bulk 列** | **migrate**：760px、label-top；階梯列改 grid 對齊；footer「建立新版」文案已合規 |
| 16 | 獎金率 | `BonusRatesPanel.vue:163`（primary） | 同檔 inline `:206` | 獎金率版本 | 4 | dialog 480px | left 100px | **compact** | **migrate-light**；`confirmWithReason` 二次確認保留 |
| 17 | 機構活動 | `InstitutionEventPanel.vue:380`（「登記機構活動」） | 同檔 inline `:439` | 機構活動＋缺席名單 | 6＋全員 switch 列 | dialog 700px top=5vh | left 100px | **standard＋bulk 列** | **migrate**：860px；上方 6 欄語意兩欄，缺席名單改成可掃讀的多欄 grid（全員 switch 屬批次列，不塞單欄） |
| 18 | 年終週期 | `YearEndListView.vue:188`（PageHeader primary＋Plus ✓，權限 tooltip 包裝） | 同檔 inline `:252` | 年終結算週期 | 4 | dialog 520px | left 120px | **compact** | **migrate-light**：label-top |
| 19 | 年終例外匯入 | `YearEndListView.vue:195`（dropdown-item＋Upload） | 同檔 inline `:265` | 經營績效匯入 | 上傳＋6 | dialog 640px | left 160px | **bulk** | **keep**：fallback 匯入入口，重量正確 |

## 二、學生與班級

| # | Route／頁面 | 按鈕 | 表單檔 | 資料類型 | 欄位數 | 現容器 | label | 建議分型 | 處置 |
|---|---|---|---|---|---|---|---|---|---|
| 20 | `/students`（工作台）＋`/classrooms` drawer＋學生詳情 | `workbench/StudentListPanel.vue`／`ClassroomStudentDrawer.vue`／`StudentDetailPanel.vue` 各 caller | `components/student/StudentEditDialog.vue` | 學生 | 41（權限 v-if） | dialog 560px | top | **wide** | **migrate（旗艦示範）**：1000–1040px、左 section nav（核心／家長／緊急／健康／其他／政府申報，錯誤徽章沿用）＋右 12-col 語意 grid；核心常駐、收合機制與 `sectionForStudentField` 對照表保留；submit「確認」→「建立學生／儲存變更」 |
| 21 | `/classrooms` | `ClassroomView.vue:436`（PageHeader primary＋Plus ✓）＋`:571` empty CTA（同強度 primary ⚠） | 同檔 inline `:577` | 班級 | 9–10 | dialog 720px | left 110px（教師欄覆寫 90px） | **standard（窄端）** | **migrate**：760px、label-top、語意兩欄＋教師指派三欄一列（短 select 群）；empty CTA 與 header 主鈕同 primary 並存——空狀態時列表不渲染故實際不同時出現，保留但註記 |
| 22 | `/students/year-plan` | `YearPlanWorkspaceView.vue:20`（toolbar **default type**，頁面主動作應 primary） | `enrollment/planning/PlanClassEditDialog.vue` | 編班計畫班級 | 12 | dialog 480px | left 90px | **standard** | **migrate**：760px、label-top、語意兩欄；按鈕升 primary＋Plus |
| 23 | `/student-assessments` | `StudentAssessmentView.vue:213`（primary，**文字「＋」**） | 同檔 inline `:298` | 評量記錄 | 9 | dialog 580px | left 100px | **standard** | **migrate**：760px、label-top、語意兩欄（班級+學生／學期+類型／領域+評等+日期）；「＋」改 Plus icon |
| 24 | `/student-incidents` | `StudentIncidentView.vue:235`（primary，**文字「＋」**） | 同檔 inline `:342` | 事件紀錄 | 8 | dialog 560px | left 90px | **standard** | **migrate**：同上；「＋」改 Plus icon |
| 25 | 學生詳情（評量） | `RecordsTab.vue`／`AssessmentSection.vue`（contextual） | `student/AssessmentEditorDialog.vue` | 評量記錄 | 20 | dialog 580px | top | **wide（下限）** | **migrate**：920–960px、語意兩欄＋量表群組跨列；與 #23 表單語彙統一 |
| 26 | 學生詳情（事件） | `RecordsTab.vue`／`IncidentSection.vue`（contextual） | `student/IncidentEditorDialog.vue` | 事件記錄 | 20 | dialog 560px | top | **wide（下限）** | **migrate**：同上 |
| 27 | 學生詳情（異動/聯絡補登） | `RecordsTab.vue` | `student/ChangeLogEditorDialog.vue` | 異動紀錄 | 12 | dialog 520px | left 90px | **standard** | **migrate**：760px、label-top；reason 欄保留 |
| 28 | 學生詳情（聯繫） | `CommunicationTab.vue` | `student/CommunicationEditorDialog.vue` | 聯繫紀錄 | 10 | dialog 560px | left 90px | **standard** | **migrate** |
| 29 | 學生詳情（監護人） | `BasicInfoTab.vue` | `student/GuardianManager.vue` | 監護人 | 8 | dialog 520px | left 90px | **standard** | **migrate**：760px（姓名+關係／電話+Email 成對） |
| 30 | 學生詳情（量測） | `portfolio/MeasurementsSection.vue` | `student/MeasurementEditorDialog.vue` | 生長量測 | 14 | dialog 480px | top | **standard** | **migrate**：760px；數值欄（身高/體重/頭圍）短欄三欄一列 |
| 31 | 學生詳情（里程碑） | `MilestonesTab.vue` | `student/MilestoneEditorDialog.vue` | 里程碑 | 10 | dialog 500px | right 100px | **standard** | **migrate**：label-position right→top |
| 32 | 學生詳情（身障文件） | `StudentDetailPanel.vue` | `student/StudentDisabilityDocsPanel.vue` | 身障文件 | 10 | dialog 520px | left 100px | **standard** | **migrate**：上傳欄跨列 |
| 33 | 學生詳情（成長報告） | `GrowthReportTab.vue` | `student/GrowthReportGenerateDialog.vue` | 成長報告生成 | 8 | dialog 480px | right 100px | **standard（窄端）** | **migrate-light**：label-top；submit「建立並生成」已合規 |
| 34 | 學生詳情（生命週期） | `StudentDetailPanel.vue` | `student/LifecycleTransitionDialog.vue` | 畢業/離園轉換 | 8 | dialog 520px | left 90px | compact/standard 邊界 | **keep**：危險狀態轉換、單欄聚焦是刻意設計；僅統一 focus-visible／loading 樣式 |
| 35 | 學生詳情（在學證明） | `student/StudentEnrollmentCertButton.vue` | 同檔 dialog | 在學證明 PDF | 6 | dialog 420px | left 80px | **compact** | **keep**：產生文件非建檔；寬度已合 compact |
| 36 | `/growth-books` | `GrowthBooksView.vue:285/332`（產生／批次產生） | 無表單（直接 API＋輪詢） | 成長冊 | 0 | — | — | — | **keep**：無表單設計是刻意（條件取自頁面篩選）；`GrowthBookCurationDrawer`（drawer 60%，策展勾選）亦 keep |
| 37 | `/dismissal-queue` | `DismissalQueueView.vue:519`（primary＋Plus ✓） | 同檔 inline `:700` | 接送通知 | 3 | dialog 420px | left 80px | **compact** | **keep**：主互動是點學生 chip 一鍵建立，dialog 是備援路徑（程式碼註解明講） |
| 38 | `/bus-routes` | `BusRoutesView.vue:247`（default） | `ElMessageBox.prompt` | 娃娃車路線 | 1 | MessageBox | — | — | **keep**：路線不可改名不可刪，先確認名稱的輕量 prompt 是刻意設計 |
| 39 | `/students/admissions`（訪視） | `AdmissionsRecordsPanel.vue`／`FunnelAddVisit.vue` | `recruitment/RecruitmentRecordDialog.vue`（**2026-07-30 殼層旗艦**） | 招生訪視 | ≈20（40 個 form 節點） | dialog 680px | top＋成對雙欄＋FormSection | standard | **migrate-light**：僅拓寬 680→760–800 並沿用既有結構；此檔是現行規範樣板，勿大改 |
| 40 | 招生（轉正式生） | `AdmissionsRecordsPanel.vue` | `recruitment/RecruitmentConvertDialog.vue` | 訪客轉學生 | 2 | dialog 520px | left 110px | **compact** | **keep** |
| 41 | 招生（保留座位） | `AdmissionsRecordsPanel.vue` | `recruitment/ReserveSeatDialog.vue` | 座位保留 | 6 | dialog 420px | top | **compact** | **keep**；footer 三鈕（釋放/取消/確認）順序注意「取消」居中的既有設計，第二階段統一時保留語意 |
| 42 | 招生（校區） | `RecruitmentStatsPanel.vue` | `recruitment/RecruitmentCampusDialog.vue` | 校區 | 10 | dialog 540px size=small | left 100px | **standard** | **migrate**：移除 `size="small"`（violates 殼層 spec）、760px、label-top |
| 43 | 招生（登記月份） | `AdmissionsRecordsPanel.vue` | `recruitment/RecruitmentMonthDialog.vue` | 登記月份 | 1＋清單 | dialog 420px | — | — | **keep**：清單管理＋mini 輸入，重量正確 |
| 44 | 招生（漏斗轉換） | `funnel/FunnelBoard.vue` | `funnel/TransitionConfirmDialog.vue` | 階段轉換 | 1（依 mode） | dialog 480px | top | — | **keep**：mode 驅動確認框 |
| 45 | `/students/sign-documents`（範本） | `TemplateManagementPanel.vue`（contextual） | 同檔 dialog | 簽署文件範本 | 8 | dialog 900px | top | **standard** | **migrate-light**：寬度已達標，補語意兩欄與 grid vocabulary |
| 46 | `/students/sign-documents`（發送） | `TrackingPanel.vue` | 同檔 dispatch dialog | 發送簽署 | 2＋選取列 | dialog 700px＋el-steps 三步 | — | **bulk** | **keep**：step 流程是正確容器 |
| 47 | `/admin/gov-reports/iep` | `IepView.vue:48`（primary，無 icon） | 同頁 inline form（獨立頁） | IEP 草稿 | 動態＋2 組 repeat 列 | 獨立頁 el-form | left 120px | **workspace** | **migrate-light**：已是獨立頁＋dirty tracking；統一 repeat 列按鈕（「＋ 新增目標／成員」文字＋改 Plus icon）、label-top、grid 對齊 |
| 48 | `/admin/gov-reports/subsidies` | `SubsidiesView.vue:9`（**success 誤用**） | 同檔 inline `:91` | 補助申領 | 6 | dialog 520px | left 100px | **compact** | **migrate-light**：success→primary、label-top |
| 49 | 學生詳情（費用調整） | `student/tabs/FeesTab.vue` | `fees/AdjustmentEditDialog.vue` | 費用調整項 | 3–4（內嵌 mini form） | dialog 600px | 自訂 flex | — | **keep-with-reason**：清單＋mini 新增混合型；如要重整併入 fees 在途批次後再議 |

## 三、園務行政／才藝／問卷／接送

| # | Route／頁面 | 按鈕 | 表單檔 | 資料類型 | 欄位數 | 現容器 | label | 建議分型 | 處置 |
|---|---|---|---|---|---|---|---|---|---|
| 50 | `/announcements` | `AnnouncementView.vue:450`（PageHeader primary，無 icon） | 同檔 inline `:588` | 公告 | ≈12（含上傳） | dialog 600px | left 80px | **standard（旗艦示範）** | **migrate**：860px、label-top、FormSection 取代 el-divider、語意兩欄（優先級+置頂／發佈+到期）、附件與家長端 radio 與內容 textarea 跨列；submit「發佈」保留（比「建立」更準確）；補 Plus icon |
| 51 | `/calendar` → 見 #6 | | | | | | | | |
| 52 | `/finance-signoffs` | `SignoffPanel.vue`（contextual） | 同檔 dialog | 簽核單 | 16（含上傳×7 訊號） | dialog 600px | top | **wide（下限）** | **migrate**：920–960px 語意兩欄；金額欄右對齊；footer「關閉／儲存」→「取消／建立簽核單」 |
| 53 | 簽收（簽署） | `SignoffPanel.vue` | `SignoffSignDialog.vue` | 簽收 | canvas＋上傳 tabs | dialog 540px | — | — | **keep**：簽名板特化容器 |
| 54 | `/activity/settings`（課程） | `ActivityCourseView.vue:16`（toolbar primary，無 icon） | 同檔 inline `:128` | 才藝課程 | ≈12（含上傳/checkbox 群/複選） | dialog **480px**（全站最擠） | left 90px | **standard** | **migrate**：860px、label-top、語意兩欄（名稱+價格／堂數+容量／講師+負責老師／星期+起訖時間）；年級 checkbox 群、說明、DM 上傳跨列；補 Plus icon |
| 55 | `/activity/settings`（用品） | `ActivitySupplyView.vue:7`（primary，無 icon） | 同檔 inline `:36` | 才藝用品 | 2 | dialog 400px | left 90px | **compact** | **migrate-light**：480px token、label-top、補 Plus icon |
| 56 | `/activity/attendance` | `ActivityAttendanceView.vue:10`（primary＋Plus ✓） | 同檔 inline `:143` | 點名場次 | 3 | dialog 400px | left 80px | **compact** | **migrate-light**：480px token、label-top |
| 57 | `/activity/attendance`（批次） | `ActivityAttendanceView.vue:5`（default＋Calendar，contextual ✓） | `views/activity/components/SessionBatchDialog.vue` | 場次批次 | 5＋預覽 | dialog 720px | left 90px | **bulk** | **keep**：已有逐日勾選預覽＋「共將建立 N 場」動態 submit，是 bulk 分型的現成佳例 |
| 58 | `/activity/registrations` | `ActivityRegistrationView.vue:46`（primary＋Plus ✓） | `activity/RegistrationCreateDialog.vue` | 才藝報名 | 16 | dialog 560px | top | **wide（下限）** | **migrate**：920–960px 語意兩欄；純新增無編輯共用，改動風險低 |
| 59 | 報名詳情（繳費/退費） | `ActivityRegistrationView.vue:337`（drawer 內 **success 誤用** small／danger small） | `activity/RegistrationPaymentDialog.vue` | 繳費/退費紀錄 | 8 | dialog 400px | left 90px | **compact＋** | **migrate-light**：560px、label-top；繳費鈕 success→primary（drawer 內 contextual 可用 plain）；退費 danger 保留 |
| 60 | 報名詳情（加課/加購） | `ActivityRegistrationView.vue:344/393`（primary link small＋Plus ✓ contextual） | `RegistrationAddCourseDialog.vue`／`RegistrationAddSupplyDialog.vue` | 加選課程/用品 | 各 2 | dialog 480px | left 90px | **compact** | **keep** |
| 61 | 報名（強行收件/重比對） | `RegistrationRematchForceDialog.vue` | 同檔 | 收件轉換 | 4 | dialog 520px | right 90px | — | **keep**：mode 驅動確認流程；label right→top 順手統一即可（migrate-light） |
| 62 | `/activity/pos` | `POSPaymentPanel.vue`（內嵌面板） | 同檔 | POS 收款/退費 | 內嵌自訂 | el-card 工作區 | — | **workspace** | **keep**：POS 是既有工作區分型 |
| 63 | `/surveys` | `SurveyListView.vue:10`（primary「建立調查」→ router.push） | `surveys/SurveyFormView.vue`（`/surveys/new`，唯一獨立新增路由） | 問卷 | 動態題目 repeat | 獨立頁 | 混合 | **workspace** | **migrate**：改桌面工作區——主內容（題目編輯 grid）＋sticky 設定側欄（標題/期間/對象/發佈設定）；`lockStructure` 鎖定機制保留 |
| 64 | `/pickup-authorizations`／`/bus-monitor` 等 | — | — | — | — | — | — | — | **keep**：無新增入口（核銷/檢視類） |

## 四、Dashboard 快速新增（`/` HomeView）

入口：`QuickAddMenu.vue`（primary＋Plus＋dropdown ✓），7 項依權限過濾；5 項開 dialog、2 項（員工/招生）跳轉。

| # | 元件 | 資料類型 | 欄位數 | 現容器 | label | 建議分型 | 處置 |
|---|---|---|---|---|---|---|---|
| 65 | `quick-add/QuickClassroomDialog.vue` | 班級 | 6 | dialog 480px | left 90px | **compact** | **migrate-light**：label-top＋寬度 token；快速新增刻意精簡欄位，不擴 standard |
| 66 | `quick-add/QuickAnnouncementDialog.vue` | 公告 | 8 | dialog 520px | left 80px | **compact＋** | **migrate-light**：560px、label-top；成對短欄雙欄 |
| 67 | `quick-add/QuickStudentDialog.vue` | 學生 | 8 | dialog 520px | left 80px | **compact＋** | **migrate-light**：同上 |
| 68 | `quick-add/QuickLeaveDialog.vue` | 請假 | 12 | dialog 540px | left 80px | **standard（窄端）** | **migrate-light**：640px、label-top、成對雙欄（起+訖）；「快速」語意優先，不上 760 |
| 69 | `quick-add/QuickOvertimeDialog.vue` | 加班 | 10 | dialog 520px | left 80px | **standard（窄端）** | **migrate-light**：同上 |

共用 `useQuickAddSubmit.ts`（成功 toast＋「前往管理頁」連結）不動。

## 五、系統設定／平台總部

| # | Route／頁面 | 按鈕 | 表單檔 | 資料類型 | 欄位數 | 現容器 | label | 建議分型 | 處置 |
|---|---|---|---|---|---|---|---|---|---|
| 70 | `/settings/accounts` | `SettingsAccountsTab.vue`（新增帳號 primary） | 同檔 dialog ① | 帳號 | 8 | dialog 600px | top | **standard** | **migrate**：760px 語意兩欄（帳號+姓名／角色+員工）；「建立」submit 已合規；密碼提示同步後端規範不動 |
| 71 | `/settings/accounts`（另存自訂角色） | 同檔 dialog ⑤ | 自訂角色 | 4 | dialog 440px | top | **compact** | **keep** |
| 72 | `/settings/roles` | `SettingsRolesView.vue:179`（primary，`data-testid="add-role"`） | 同檔 inline `:227` | 角色 | 3 | dialog 480px | left 80px | **compact** | **migrate-light**：label-top；code 即時驗證保留 |
| 73 | `/settings`（班別） | `SettingsShiftTab.vue` | 同檔 dialog | 班別 | 8 | dialog 450px | left 100px | **standard（窄端）** | **migrate**：640–760px、成對時間欄雙欄 |
| 74 | `/settings`（隱私政策版本） | `PolicyVersionsView.vue:85`（primary） | 同檔 inline `:108` | 政策版本 | 4 | dialog 520px | left 100px | **compact** | **migrate-light**：label-top；重簽署 alert 保留 |
| 75 | `/platform/tenants` | `PlatformTenantsView.vue:10`（primary「建立分校」） | 同檔 inline `:91` | 租戶 | 5 | dialog 560px | left 120px | **compact** | **keep-with-reason**：兩段式閘門（dry-run→確認建立，CT-X-12）與一次性密碼結果 dialog 是安全設計，版面不動；僅統一 label-top（migrate-light 級） |
| 76 | 學生費用（範本） | `FeeTemplateManageDrawer.vue`（contextual） | `fees/FeeTemplateDialog.vue` ⚠在途 | 學費範本 | 22 | dialog 560px | top | **wide** | **deferred**：fees 批次在途；收斂後按 wide 遷移 |
| 77 | 學生費用（產單） | `FeeTemplateTab.vue` | `fees/FeeGenerateModal.vue` ⚠在途 | 批次產單 | 6＋預覽 | dialog 700px | left 100px | **bulk** | **deferred**；兩段式 preview→confirm 已是 bulk 佳例 |
| 78 | 學生費用（收款） | `FeeRecordsTab.vue` ⚠在途 | 同檔 payForm dialog | 收款登記 | 8 | dialog 440px | top | **compact＋** | **deferred** |
| 79 | 學生費用（退費） | `RefundSuggestModal.vue` ⚠在途 | 同檔 | 退費 | 12（兩階段） | dialog 640px | left 100px | — | **deferred**＋keep-with-reason：兩階段 review 狀態機不動 |

## 六、按鈕層問題清單（第二階段修正依據）

1. **success 誤用為新增主鈕（4 處）**：`OvertimeView.vue:425`、`LeaveView.vue:497`、`SubsidiesView.vue:9`、`ActivityRegistrationView.vue:337`（新增繳費）→ 一律改 primary（drawer 內 contextual 可 plain）。
2. **文字「＋」模擬 icon（4 處）**：`StudentAssessmentView.vue:213`、`StudentIncidentView.vue:235`（主鈕）、`IepView.vue:104/127`（repeat 列小鈕）→ 改 `:icon="Plus"`。
3. **主新增鈕缺 icon**：`CalendarView.vue:376`、`AnnouncementView.vue:450`、`ActivityCourseView.vue:16`、`ActivitySupplyView.vue:7`、`SettingsRolesView.vue:179`、`SurveyListView.vue:10`、`PlatformTenantsView.vue:10`、`IepView.vue:48`、`BonusRatesPanel.vue:163` 等 → 統一補 Plus。
4. **主動作誤用 default type**：`YearPlanWorkspaceView.vue:20`（新增班級）、`BusRoutesView.vue:247`（keep，prompt 型輕量入口可續用 default——第二階段裁定）、appraisal 兩處 empty CTA default（`CurrentSemesterOverview.vue:589`、`YearlyEnrollmentTargetSection.vue:247/337`——空狀態唯一動作應 primary）。
5. **submit 文案不一**：現況混用「確認／儲存／送出／發佈／確認新增／確認建立」。目標：建立流程一律「建立{資料類型}」（既有更精準動詞如「發佈」「確認退費」「建立並生成」保留）；編輯一律「儲存變更」或「儲存」。
6. **empty state CTA 現況**：自製 `EmptyState.vue`（action slot）21 處使用中 0 處帶新增 CTA；EP `el-empty` 帶新增 CTA 共 5 頁（ClassroomView、CycleListView、OffboardingView、CurrentSemesterOverview、YearlyEnrollmentTargetSection）。第二階段統一：空狀態 CTA 允許與 header 主鈕同動作，但同畫面不得出現兩顆同強度 primary（實務上空狀態時列表區不渲染主鈕，多數頁天然滿足；逐頁驗證）。
7. **`AdminCreateButton` 共用元件評估**：建議建立薄封裝（primary＋Plus＋「新增{型}」slot），權限判斷留在 caller（`v-if="canWrite"` 現況已如此）。採用清單=上表所有 migrate 列的入口鈕；`RecruitmentRecordDialog` 等 contextual 小鈕不強制。

## 七、特殊機制保護清單（遷移時不可破壞）

- `EmployeeFormDialog`：basic/salary 分端點存檔、`useEmployeeFormDirty`、`EmployeeChangesPreviewDialog`、reason gate、`useFormDraft`、before-close 攔截。
- `StudentEditDialog`／`RecruitmentRecordDialog`／`EmployeeFormBasic`：FormSection 錯誤展開機制與 `sectionFor*Field` 對照表、`scrollToField`。
- `PlatformTenantsView`：dry-run 閘門與 blockers 清單。
- `SessionBatchDialog`／`FeeGenerateModal`：兩段 preview→confirm。
- `RefundSuggestModal`：isBlocked／編輯／reviewing 三態機。
- `LeaveView`：配額查詢與每日排班展開；`QuickAddMenu` 權限過濾。
- 手機行為：`main.css` 的 95%／fullscreen 與 el-col 收單欄規則全站沿用，元件內不重寫 RWD。

## 八、統計與覆蓋聲明

- 盤點列數：**79**（含 deferred 4、keep 約 24、migrate/migrate-light 約 48、無表單/範圍註記 3）。
- 分型分佈（建議）：compact ≈ 22、standard ≈ 27、wide ≈ 7、workspace/bulk ≈ 12、keep 特化容器 ≈ 11。
- 獨立新增路由僅 `/surveys/new` 一組；其餘全部走 dialog。
- `src/views` 約 170 檔與 `src/components` 約 70 個 dialog 候選檔均經兩輪關鍵字＋逐檔確認；`StudentFeeView.vue`、`AttendanceWorkspaceView.vue`（⚠在途）本身無新增入口。純編輯（`RegistrationEditBasicDialog`）、純檢視、駁回/核准、狀態批次變更（離園/轉班）等非「建立」入口已列排除，不在本次範圍但視覺語彙將於第三階段順帶受益於全域規則。
