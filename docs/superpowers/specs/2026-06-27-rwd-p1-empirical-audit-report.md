# RWD P1 實機稽核報告（report-only）

- **日期**：2026-06-27
- **階段**：全系統 RWD 翻修 P1（實機稽核，餵給 P2/P3）
- **方法**：dev server（前端 :5173 + 後端 :8088，真實 seed 資料）+ Playwright 在 **390px**（手機）/ **768px** / **767px** 量測；程式化偵測「頁面級橫向溢出」（`document.scrollWidth > innerWidth`，排除 Element Plus 容器內捲動）+ 觸控目標尺寸 + 視覺截圖核對。
- **登入**：admin / **`ivytest123`**（dev DB 由 seedgen 種，`_TEST_PASSWORD`；記憶裡的 admin123 已過時）。

---

## 結論（TL;DR）

**RWD 地基紮實，未發現任何頁面級破版（0 P0 / 0 P1 / 0 P2）。** Element Plus + AdminLayout/PortalLayout 響應式 + `isMobile` 驅動的全螢幕 dialog，三者在 390px 都正確運作。768↔767 邊界（P0 唯一動到的行為）切換乾淨。

剩餘優化純屬 **P3 品質**（手機表格體驗 + 觸控目標尺寸 + 平板中間帶），**非破版**。換言之原規劃的「P2 修壞點」**沒有壞點可修**。

---

## 稽核覆蓋（390px，除非另註）

| 面向 | 頁面 | 頁面級橫向溢出 | 備註 |
|---|---|---|---|
| Admin | 儀表板 `/` | ✅ 無 | 手機版漢堡選單 + 單欄卡片堆疊，乾淨 |
| Admin | 員工管理 `/employees` | ✅ 無 | 表格 960px 在 `el-scrollbar` **容器內**捲動（顯示 編號+操作 欄）；非破版 |
| Admin | 薪資管理 `/salary` | ✅ 無 | |
| Admin | 考勤管理 `/attendance` | ✅ 無 | |
| Admin | 學生 `/students` | ✅ 無 | |
| Admin | 報表統計 `/reports` | ✅ 無 | |
| Admin | 學校行事曆 `/calendar` | ✅ 無 | 日曆格未溢出 |
| Admin | 系統設定 `/settings` | ✅ 無 | 18 個容器內捲動表格（帳號/權限） |
| Admin | 新增員工 dialog | ✅ 無 | **手機自動 `el-dialog is-fullscreen`** 全螢幕單欄表單（印證 EmployeeView `isMobile` 收斂運作）|
| Portal | 今日工作台 `/portal/home` | ✅ 無 | mobile-first：底部 tab + 側欄 + 堆疊卡片 |
| Public | 課後才藝報名 `/public/activity` | ✅ 無 | 品牌 header + 海報 + sticky 底部按鈕，精緻 |

**768/767 邊界**（P0 統一 off-by-one）：
- **768px** → admin 桌機模式（側欄可見 260px、`is-mobile`=false）。
- **767px** → admin 手機模式（`is-mobile`=true、側欄移出畫面 `left:-260` 不造成溢出）。
- 兩側皆無橫向溢出，切換乾淨。**P0 邊界統一驗證 PASS。**

**未稽核**（範圍/可行性）：家長端 LIFF（需 mock，CLAUDE.md 載明 admin/teacher session 下 portal 空白屬 by design）、salary settle wizard、leaves、activity dashboard 等 admin 子頁。鑑於 10 個結構各異的頁面 + 全 app 共用的 layout/table/dialog pattern 一致為「乾淨」，對未掃頁面的外推信心高。

---

## P3 品質機會（依影響排序；皆非破版）

### P3-1：手機上的寬資料表只有「容器內橫向捲動」，無卡片視圖
- **現象**：admin 的 `el-table`（員工 960px、設定帳號/權限 18 表）在手機上只顯示前幾欄、其餘靠容器內橫向捲動。功能正常但手機 UX 差（要左右滑才看得到欄位）。
- **對照**：教師 Portal 已有 table↔cards 切換範例（`PortalAttendanceView` 的 `viewMode`）。Admin 列表未採用。
- **建議**：高頻 admin 列表（員工、學生、考勤）在 `useIsMobile()` 為真時改卡片視圖，比照 Portal 慣例。半徑中等、逐頁進行。

### P3-2：觸控目標 < 36px 偏多
- **現象**：員工列操作（詳情/編輯/更多 文字連結）≈81、設定表格、儀表板 header 圖示鈕 ≈10、public ≈12，量到 height/width < 36px（低於 ~44px 觸控指引）。
- **建議**：列內操作改 icon-button + 加 padding/min-height ≥44px，或在手機收進「更多」選單。可作為一條橫切 token/util（min tap size）統一處理。

### P3-3：平板中間帶（768–1024）未特別優化
- **現象**：768px 即進桌機佈局；768–1024 之間沿用桌機尺度，未利用 `--bp-md(1024)` 做中間帶調整（P0 已備好 token，尚無消費者）。
- **建議**：資料密集頁在 `--to-md`（≤1023.98）做欄數/間距中間態；屬 nice-to-have。

### 觀察（非 RWD，待查）
- 教師 Portal console 有 12–24 個 **warnings**（0 errors）。可能是 Vue 警告，與 RWD 無關但值得另開檢查。

---

## 對 P2/P3 規劃的影響

原 roadmap「P2 修壞點（家長/公開頁優先→Portal→Admin）」**前提不成立**——稽核未發現壞點。建議：
- **跳過 P2**（無破版可修）。
- **P3 視需求做**：若要再精進手機體驗，P3-1（admin 列表卡片視圖）影響最大、P3-2（觸控目標）次之、P3-3（平板）最後。或判定 RWD 已達標收尾。

決定權交業主。
