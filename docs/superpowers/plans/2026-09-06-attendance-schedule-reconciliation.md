# 排班與出勤整合實作計畫

**目標：** 依使用者 2026-09-06 已確認設計，整合管理端班表與出勤核對，不依賴教師換班申請。
**架構：** 既有週班表及每日覆寫繼續作為依據；新增唯讀核對與具版本檢查的每日調班確認。原始打卡不因建議或調班修改。全租戶共用且依 Host 隔離。
**技術：** FastAPI、SQLAlchemy、Vue 3、Element Plus、OpenAPI。

## 契約
- POST /attendance/reconciliation/preview：start_date/end_date 最多 31 天；可選 complete_start_date/complete_end_date 表示使用者本次明確確認的完整資料區間，必早於今日。需 ATTENDANCE_READ 及 SCHEDULE。
- 回傳全員人日 rows、原班時段、打卡、狀態、理由、候選班別、版本與 shift_types。狀態涵蓋 matched、possible_shift_change、missing_punch、suspected_absence、data_incomplete、leave、off_day、unscheduled_attendance、anomaly。
- POST /attendance/reconciliation/confirm-shift：items 1–2 筆同日 employee_id/date/shift_type_id/day_off/version，加 reason。需 ATTENDANCE_WRITE 及 SCHEDULE；重讀版本、租戶、封存與自我裁定守衛；409 要重新核對。原子寫每日班表、重算出勤、標記薪資待重算及稽核。

## 執行
- [x] 後端先以 tests/test_attendance_reconciliation.py 建立班別候選、缺列、請假排休、租戶、版本與封存失敗案例，再補 schemas/attendance_reconciliation.py、services/attendance_reconciliation.py、api/attendance/reconciliation.py 與路由註冊。
- [x] 前端先測 useAttendanceReconciliation：缺資料時不送完整性聲明、較晚回應不覆蓋新查詢、失敗清除舊建議、確認只送當前版本，之後新增 wrapper/composable/panel。
- [x] 前端 AttendanceScheduleHubView 共用入口，保留 /attendance 和 /schedule 權限及 deep link；各 pane 僅在具有權限時掛載。
- [x] 匯入後進核對且重置完整性聲明，原異常／補卡／匯出能力保留。
- [x] 後端 targeted pytest/Ruff → dump OpenAPI → 前端產 schema → targeted Vitest/typecheck/changed-path lint → 唯讀跨端與金流語意審查。

## 限制與驗收
不 commit/push/deploy，不讀 env/PII，不碰真 DB。測試依序跑。跨日調休不自動判定，缺勤只能疑似，未知班表及不完整資料不得顯示為確認缺勤；不改薪資公式。完整性聲明不持久化，重新匯入或換範圍需重確認。
