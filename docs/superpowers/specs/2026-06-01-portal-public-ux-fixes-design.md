# Portal / Public UX 小修批次 — 2026-06-01

## 背景

來自 2026-06-01 UX audit（Layer A，報告於 workspace `.scratch/ux-audit-2026-06-01.md`）。
從「不需 owner 拍板、低風險、純前端 code-fact」的發現中，由 user 選出本批次 3 項。

## Scope（本批次）

| 代號 | 項目 | 檔案 |
|------|------|------|
| A | 公開頁過期 fallback | `src/views/public/ActivityPublicView.vue` |
| B | 公開頁課程必填常駐引導 | `src/views/public/ActivityPublicView.vue`（+ `CoursePickerSection.vue` 視落點） |
| C1 | 教師端點名頁移除冗餘「載入」按鈕 | `src/views/portal/PortalStudentAttendanceView.vue` |
| C2 | 教師端命名一致性 | `src/router/index.ts`、`src/layouts/PortalLayout.vue`、`src/views/portal/PortalAttendanceView.vue` |

**Out of scope（需拍板或後端配合，本批次不做）**：教師登入 landing 意圖、公開頁個資告知/同意、報名身分找回路徑、教師端錯誤處理統一 + 重試。

## 設計

### A. 公開頁過期 fallback

根因：後端未回傳客製文案時，computed fallback 寫死**會過期的具體值**（最危險 `displayEventDate` → `'2026-02-23'`，今天 2026-06-01 已過期）。

改動（去除所有會過期的硬編碼）：
- `displayEventDate`（:490）fallback `'2026-02-23'` → `''`。模板 :65 已是 `v-if="displayEventDate"`，缺值即**隱藏日期行**，不再渲染過去日期。
- `displayFormCardTitle`（:492-496）：date 為空時不拼接 ` · `（避免尾部殘留 ` · `）。
- `displayTermLabel`（:489）fallback `'114 下學期'` → `''`，模板 :64 `<span class="page-meta-term">` 補 `v-if="displayTermLabel"`（缺值隱藏學期標籤）。
- `displayTitle`（:488）fallback → `'課後才藝報名'`（h1 必須有兜底文案，但去掉會過期的「114 下藝童趣」專名）。
- 海報下載名（:516）/ share title（:523）皆引用 `displayTitle`，自帶兜底，跟隨新 fallback 即可，無需額外改。

驗收：後端缺所有客製欄位時 → h1 顯示「課後才藝報名」、不渲染學期/日期行、`formCardTitle` 無尾部 ` · `。

### B. 公開頁課程必填常駐引導

現狀：`errors.courses` 僅在 `validateForm()`（送出時）填入，送出前無前導提示（與手機號 `phoneTouched` 同樣的延後紅字克制邏輯）。

改動（常駐引導，**不改校驗邏輯**）：
- Step 2 課程區標題加常駐標註「· 必選（至少一門）」，與 Step 3「選填」對稱，讓家長報名時就知道課程必填。
- 落點：Step 2 step 標題（在 `ActivityPublicView.vue` 內，或 `CoursePickerSection` 的標題 slot/prop，依該元件標題結構決定）。
- `validateForm()` / `errors.courses` / 送出後紅字機制**維持不動**。

驗收：未選任何課程時，Step 2 標題旁可見「必選」引導文案（始終顯示，非紅字錯誤）。

### C1. 點名頁冗餘載入按鈕

現狀：`PortalStudentAttendanceView.vue:310` `<el-button>載入</el-button>`；watcher（:230-232）已在 `classroomId`/`dailyDate` 變更時自動 `fetchDailyAttendance`，按鈕多餘且易誤導「需手動點才載入」。

改動：移除該 `el-button`。保留 `daily-filters` 的日期選擇器。

驗收：切換日期/班級仍自動載入（watcher）；無獨立載入按鈕。

### C2. 命名一致性

- `router/index.ts:447` class-hub `meta.title` `'今日工作台'` → `'今日班級工作台'`（對齊側欄 `PortalLayout.vue:408`，消除與 `/home`「今日工作台」撞名）。
- 統一「我的出勤」：側欄 `PortalLayout.vue:360` 為「我的出勤」，`PortalAttendanceView.vue:167` 表頭為「出勤紀錄表」。以側欄（導航入口）為準，將表頭改為「我的出勤」。

驗收：class-hub route title 與側欄一致；出勤頁表頭與側欄 label 一致。

## 測試

- **A**：vitest 驗證 `displayTitle`/`displayTermLabel`/`displayEventDate` fallback——缺值時不含過期具體值、title 為中性文案。（檢查 `ActivityPublicView` 既有 test 擴充，或就近新增 unit test。）
- **B**：vitest 驗證 Step 2 常駐引導文案存在（視元件可測性；若需 mount 整頁成本高，可降級為手測）。
- **C1**：若 `PortalStudentAttendanceView` 有 test，確認移除按鈕後自動載入斷言不破。
- **C2**：純字串改動，以 typecheck + 既有 test 無回歸為準。

## 風險 / 回歸

- 低。純前端、無 schema、無 API 變動。
- A 僅在後端漏給客製欄位時生效（邊緣情境）；後端有值時行為不變。
- 門檻：`vue-tsc` typecheck 0 error + 既有 vitest 全綠（相對 origin/main 無新增 fail）。

## 手測驗收清單

1. 公開頁（後端無客製欄位）→ 不顯示過期日期/學期，h1 為中性文案。
2. 公開頁 Step 2 可見「必選」引導。
3. 點名頁切日期自動載入、無冗餘「載入」按鈕。
4. 教師端側欄 / route title / 出勤表頭命名一致。

## Commit 規劃（分項，Conventional Commits，繁中）

- `fix(public): 移除報名頁會過期的 fallback 文案`（A）
- `feat(public): 報名頁課程區常駐必選引導`（B）
- `refactor(portal): 移除點名頁冗餘載入按鈕`（C1）
- `fix(portal): 統一今日工作台/出勤命名`（C2）
