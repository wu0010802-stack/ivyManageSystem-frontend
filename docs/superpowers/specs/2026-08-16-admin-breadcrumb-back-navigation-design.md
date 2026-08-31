# 管理端「返回上一層」導航設計

- 日期：2026-08-16
- 範圍：管理端（admin）全站；教師端 Portal、家長端 Parent 不在本次範圍
- 基準分支：`origin/staging` @ `48ae3086`（工作分支 `feat/admin-breadcrumb-back-navigation`）

---

## 1. 問題

管理端頂列顯示「薪資管理 / 自主成長獎勵金」這類路徑字串，但**父層點不動**。使用者要離開子頁只能靠側邊欄或快捷鍵，深層工作區（年終結算、POS 稽核）則連側邊欄都不高亮。

### 1.1 根因

`src/components/layout/AdminHeader.vue:20-23` 是管理端唯一的標題渲染點：

```vue
<h1 v-if="pageTitle" class="page-title">
  <span v-if="parentTitle" class="page-title__parent">{{ parentTitle }} / </span>
  <span>{{ pageTitle }}</span>
</h1>
```

資料來源只有兩行 computed（`:178-179`）：`route.meta.title` 與 `route.meta.parentTitle`。

`meta.parentTitle` 是 router 裡**逐條手寫的中文字面字串**（staging 共 18 處：`'薪資管理'` ×6、`MODULE_TERMS.activity` ×9、`'活動調查'` ×3），**不指向任何 route name 或 path**。因此父層不是「忘了加連結」，而是**沒有可導航的資訊**。

佐證：全庫 `meta.parent` 零命中；`meta.breadcrumb` / `meta.breadcrumbExtra` 有消費端（`AppraisalYearEndLayout.vue:45-51`）但宣告端為 0，是 dead code。

### 1.2 現況缺口

| 類別 | 數量 | 內容 |
|---|---|---|
| A. 有父層字串但不可點 | 18 條路由 + 考核年終子樹 19 節點（`el-breadcrumb` 未帶 `:to`） | 本次主要目標 |
| B. 明顯子頁但無回頭路 | 真死巷 6 條、孤兒 5 條 | 見 §5 |
| C. 有返回但實作各異 | 12 處自刻 | 文案 15 種、箭頭 5 種實作、位置 4 種 |

C 類細節：文案含「返回／返回員工列表／回清單／回工作台／回名冊／回到學生列表／取消」等 15 種；箭頭有 EP `ArrowLeft` 元件、`<el-icon>` 包裹、裸 glyph `←`、Material Symbols、inline SVG、無箭頭六種寫法；位置散在左上、右上（與操作按鈕混列）、頁面正中央、`MoreFilled` 下拉內。

---

## 2. 已定案決策

| # | 決策 | 選擇 | 理由 |
|---|---|---|---|
| D1 | 返回語意 | **固定回父層頁面**，非 `router.back()` | 麵包屑標準語意；從搜尋／通知／外部連結進入時行為一致，不依賴 history 堆疊 |
| D2 | 範圍 | 管理端全站 | Portal／Parent 為行動優先，返回模式不同（Parent 已有 `M3TopAppBar` 的 `showBack` 機制），另案處理 |
| D3 | 呈現 | `‹ 薪資管理 / 自主成長獎勵金`，父層可點、hover 變主綠 | 加箭頭提高可發現性；純 hover 變色使用者不滑過去不會知道可點 |
| D4 | 資料來源 | **`NAVIGATION_MANIFEST` 反查** | 側邊欄與權限守衛的既有單一事實來源，一處改動涵蓋全站，且自動補上 74 條目前無父層字串的頁 |
| D5 | 交付深度 | 三階段全做（A→B→C），分批 commit | — |
| D6 | 一級頁規則 | **不顯示父層**——頂列出現的父層一律可點 | 避免「有些灰字能點、有些不能」，這正是本次問題的成因 |

---

## 3. 父層解析演算法

### 3.1 規則（依序判定，先命中者勝）

給定當前 `route.path`：

1. **自己是側邊欄項目** → 無父層。
   判定：`route.path` 完全等於某個 manifest 選單項的 `routePath`（`menu` 非空且 `routePath !== null`）。
2. **`meta.parent` 明示** → 以該路徑為父層（escape hatch，優先於自動反查，供 manifest 涵蓋不到的路由使用）。
3. **最長前綴反查** → 找最長的選單項 `routePath` 使 `route.path.startsWith(routePath + '/')`，該項即父層。
   要求尾隨 `/` 可避免 `/student-attendance` 誤配到 `/students`。
4. **父層是 redirect 容器 → 撤銷**（見 §3.2）。
5. 以上皆無 → 無父層，只顯示頁名（維持現狀）。

**顯示文字**優先序：manifest 選單項 `title` > 目標路由 `meta.title` > 不顯示。
**導航目標**：父層 `routePath`（`meta.parent` 情形為其值），以 `<router-link>` 呈現。

### 3.2 redirect 容器撤銷規則

若父層路由本身是**純容器**（router record 帶 `redirect`、自身無內容），點下去會被 redirect，可能落回使用者原本那頁 = 「點了沒反應」。

判定：`router.resolve(parentPath).matched.at(-1)?.redirect` 存在 → 視為容器 → 不顯示父層。

適用對象（staging 實測）：

| 父層 | redirect 行為 | 受影響子頁 |
|---|---|---|
| `/bus` | `hasPermission('BUS_READ') ? '/bus/monitor' : '/bus/routes'` | `/bus/monitor`、`/bus/history`、`/bus/routes` |
| `/workbench` | 權限感知 redirect | `/workbench/approvals`、`/workbench/high-risk` |
| `/appraisal-year-end` | `resolveLegacySectionQuery` 舊 query 相容層 | 子樹 19 節點 |

這三個模組都已有模組內橫向導覽（`el-segmented` / `el-tabs`），且側邊欄該項高亮，離開模組走側邊欄即可——不構成死巷。**唯一例外**是 `/appraisal-year-end/year-end/cycles/:id`（深層工作區），以 `meta.parent` 明示處理（§5）。

### 3.3 邊界案例驗證表

| 當前路徑 | 命中規則 | 結果 |
|---|---|---|
| `/salary/growth-contract` | 3 → `/salary` | **‹ 薪資管理** / 自主成長獎勵金 |
| `/salary/history`、`/simulate`、`/settings`、`/recruitment-bonus` | 3 → `/salary` | **‹ 薪資管理** / …（B-1 死巷自動解除） |
| `/employees/:id` | 3 → `/employees` | **‹ 員工管理** / 員工詳情 |
| `/students/profile/:id` | 3 → `/students` | **‹ 學生** / 學生檔案 |
| `/platform/tenants/:id` | 3 → `/platform/tenants` | **‹ 分校管理** / 分校詳情 |
| `/surveys/new`、`/surveys/:id`、`/surveys/:id/edit` | 3 → `/surveys` | **‹ 調查管理** / …（文案由「活動調查」改為「調查管理」，指向實際可回的頁） |
| `/activity/dashboard`、`/activity/pos`、`/activity/pos/approval`、`/settings/accounts`、`/admin/gov-reports/*` | 1（自己是選單項） | 無父層 |
| `/activity/audit/pos-unlock` | 2（`meta.parent: '/activity/pos'`） | **‹ POS 收銀** / POS 異常稽核軌跡 |
| `/bus/monitor`、`/bus/history`、`/bus/routes` | 3 → `/bus`，被 4 撤銷 | 無父層（模組內 segmented 導航） |
| `/workbench/approvals`、`/workbench/high-risk` | 3 → `/workbench`，被 4 撤銷 | 無父層（layout tabs 導航） |
| `/appraisal-year-end/**` | 3 → `/appraisal-year-end`，被 4 撤銷 | 無父層（segmented 導航） |
| `/appraisal-year-end/year-end/cycles/:id` | 2（`meta.parent: '/appraisal-year-end/year-end'`） | **‹ 年終** / 結算工作區 |
| `/`、`/employees`、`/attendance` 等一級頁 | 1 | 無父層 |
| `/profile`、`/change-password` | 5 | 無父層（現狀維持） |

### 3.4 實作位置

新增 `deriveBreadcrumbParents(m: NavigationManifest)` 於 `src/constants/navigation/derive.ts`，輸出 `{ path, title }[]`（僅含 `menu` 非空且 `routePath !== null` 的選單項，依 path 長度降冪排序），於 `src/constants/navigation/index.ts` module-level 執行一次，與既有 `SIDEBAR_TREE` / `ACTIVE_MENU_PATHS` 同源。

`AdminHeader.vue` 新增 `parentLink` computed 套用 §3.1 規則，模板改為：

```vue
<h1 v-if="pageTitle" class="page-title">
  <router-link v-if="parentLink" :to="parentLink.path" class="page-title__parent">
    <el-icon class="page-title__back-icon"><ArrowLeft /></el-icon>{{ parentLink.title }}
  </router-link>
  <span v-if="parentLink" class="page-title__sep"> / </span>
  <span>{{ pageTitle }}</span>
</h1>
```

樣式：父層維持 `--text-tertiary`，`:hover` / `:focus-visible` 轉管理端 primary token（實作時取 `AdminHeader` 既有變數，不新增色值、不寫死品牌色）並加底線；`.page-title` 既有 `user-select: none`（`:314`）對連結不影響可點性，保留。`<router-link>` 天然支援 Cmd/Ctrl+click 開新分頁與鍵盤 focus。

窄螢幕：`.page-title__parent` 於行動版（`isMobile`）保留但父層文字以 `max-width` + `text-overflow: ellipsis` 收斂，箭頭不省略（箭頭才是可點提示）。

### 3.5 `meta.parentTitle` 退場

18 條 `meta.parentTitle` 全數移除，`AdminHeader` 同步移除該欄位的讀取，改由反查產生。移除後 `MODULE_TERMS.activity` ×9 那組父層會消失（因 `/activity/*` 九條都是選單項，命中規則 1）——此為 D6 的預期結果。

**不保留過渡相容分支**：留一個永不觸發的 `parentTitle` fallback 只會複製 `meta.breadcrumb` 那個 dead code 的錯誤（§1.1）。改以測試凍結宣告數為 0（§7 測試 4）。

---

## 4. 階段一：麵包屑父層可點

改動：
- `src/constants/navigation/derive.ts`：新增 `deriveBreadcrumbParents`
- `src/constants/navigation/index.ts`：export `BREADCRUMB_PARENTS`
- `src/components/layout/AdminHeader.vue`：`parentLink` computed + 模板 + 樣式
- `src/router/index.ts`：移除 18 處 `meta.parentTitle`；新增 2 處 `meta.parent`（`/activity/audit/pos-unlock`、`/appraisal-year-end/year-end/cycles/:id`）

涵蓋：管理端全部帶 component 路由。

---

## 5. 階段二：補齊死巷與孤兒頁

階段一自動解除的死巷：`/salary/history`、`/salary/simulate`、`/salary/settings`、`/surveys/:id`（→ 各自父層可點）。

本階段處理剩餘項目：

| 路由 | 現況 | 處置 |
|---|---|---|
| `/activity/audit/pos-unlock` | 4 段 path、單一入口、側邊欄不高亮 | `meta.parent: '/activity/pos'`（階段一已含） |
| `/appraisal-year-end/year-end/cycles/:id` | 外層 segmented 因 `activeKey` 同值而點不動 | `meta.parent: '/appraisal-year-end/year-end'`（階段一已含） |
| `/student-attendance` | 有入口（`HomeView` tile、`StudentDetailPanel`）、無返回、側邊欄不高亮 | `meta.parent: '/students'` |
| `/student-leaves` | **全 repo 無任何 in-app 入口** | `meta.parent: '/students'`；**入口缺失另案**（見 §8） |
| `/student-assessments` | 同上 | 同上 |
| `/student-incidents` | 同上 | 同上 |
| `/profile` | 入口僅 header 下拉、側邊欄不高亮 | 不設父層（下拉選單本身是明確入口，且無合適父層） |

**不列入處理**（已有等效導航，非死巷）：
- B-3 的 `/appraisal-year-end` 子樹 19 條、`/workbench` 2 條、`/bus` 3 條——模組內 `el-segmented` / `el-tabs` 橫向導覽 + 側邊欄高亮。
- `/change-password`——強制改密碼守衛落點，成功後 `router.push('/')`。

---

## 6. 階段三：收斂既有 12 處自刻返回

原則：**頂列麵包屑成為管理端唯一的「回上一層」機制**。頁內與其功能重複的返回鍵移除；語意不同者（表單取消、wizard 上一步、流程結果頁 CTA）保留但統一文案與樣式。

| # | 位置 | 現況 | 處置 |
|---|---|---|---|
| 1 | `EmployeeDetailView.vue:133-135,163-165` | 「返回員工列表」`el-button link` + `ArrowLeft`，含 history 空堆疊 fallback | **移除**（麵包屑「‹ 員工管理」取代） |
| 2 | `StudentDetailPanel.vue:298-336` | 「返回」`el-button text` + 可點 breadcrumb；無 context 時 `router.back()` **無空堆疊防護** | **移除頁內 breadcrumb**（麵包屑「‹ 學生」取代）；返回鍵**改為只在 `fromContext==='classroom'` 時渲染**、文案「回班級名冊」——該分支是「回到來源班級並保留選取」的帶狀態動線，麵包屑的固定父層表達不了；無 context 時的 `router.back()` 分支**刪除**（消除無防護 back） |
| 3 | `StudentSummaryHeader.vue:135` | 藏在 `MoreFilled` 下拉的「回到學生列表」 | **移除**（下拉不是返回該在的位置） |
| 4 | `PlatformTenantDetailView.vue:10` | 「回清單」default 按鈕、無圖示、置於 `PageHeader #actions` 右上與「停用」混列 | **移除**（麵包屑「‹ 分校管理」取代） |
| 5 | `SalarySettleView.vue:11` | 「← 回工作台」裸 glyph 箭頭、右上 actions 區 | **移除**（麵包屑「‹ 薪資管理」取代，目標同為 `/salary`） |
| 6 | `settle/StepExport.vue:44` | 「回工作台」`type="primary"`、`el-result #extra` 頁面中央 | **保留**（流程完成後的主要 CTA，非返回鍵）；文案統一為「回薪資管理」 |
| 7 | `SurveyFormView.vue:72` | 「取消」→ `router.back()`，無空堆疊防護、無 dirty 確認 | **保留**（表單取消語意），但改 `router.push('/surveys')` 固定目標並補 dirty 確認 |
| 8 | `AppraisalYearEndLayout.vue:41-68` | 頁內 `el-breadcrumb`，項目未帶 `:to` 全不可點 | **移除**（segmented 已表達區段；根層「考核與年終」與側邊欄高亮重複） |
| 9 | `ClassroomStudentDrawer.vue:462-463` | 僅 mobile「回名冊」，操作本地 state | **保留**（抽屜內視圖切換，非路由返回） |
| 10 | `OffboardingModal.vue:205-209` | wizard「上一步」 | **保留**（步驟 −1） |
| 11 | `TrackingPanel.vue:128` | wizard「上一步」 | **保留** |
| 12 | `KioskPunchView.vue:142,148` | 同一 `reset()` 在確認階段叫「取消」、成功階段叫「返回」 | **統一文案**（`bare` 頁無頂列，維持頁內鍵） |

文案規範（管理端）：
- 麵包屑父層＝選單項名稱，不加「返回」前綴。
- 保留的頁內鍵：表單取消一律「取消」；wizard 一律「上一步」；流程結果 CTA 用「回<目的地名稱>」。
- 廢除「回清單／回工作台／回名冊／回到學生列表」等自由文案。

---

## 7. 測試策略

`AdminHeader.spec.ts` 目前僅 2 個 case（導覽開關 a11y、焦點還原），對 `pageTitle` / `parentTitle` **零斷言**。

新增測試：

1. **`derive.spec.ts` — `deriveBreadcrumbParents`**：輸出僅含 `menu` 非空且 `routePath !== null` 的項；依 path 長度降冪排序。
2. **父層解析單元測試**（抽為純函式 `resolveBreadcrumbParent(path, parents, resolveRoute)` 便於測試）：涵蓋 §3.3 全部 15 列邊界案例，逐列斷言。特別包含：
   - `/student-attendance` **不得**匹配 `/students`（尾隨 `/` 規則）
   - `/activity/pos/approval` 因自己是選單項 → 無父層
   - `/bus/monitor` 因父層是 redirect 容器 → 無父層
3. **`AdminHeader.spec.ts`**：父層渲染為 `<router-link>` 且 `to` 正確；無父層時不渲染連結與分隔符；hover/focus 樣式類別存在。
4. **router 凍結測試**：`meta.parentTitle` 宣告數 === 0（防止新頁面回頭走手寫字串老路）。
5. **完整性守衛**：所有帶 component 的 admin 路由，其解析結果必為「無父層」或「父層為可導航且非容器的路徑」——不得產生指向不存在路由的連結。

回歸：`AdminSidebar.bus.test.ts`、`manifestIntegrity.test.ts`、`manifestRouteParity.test.ts` 因動到 `derive.ts` / `manifest` 匯出面須全綠。

---

## 8. 不在本次範圍

1. **教師端 Portal 與家長端 Parent**（D2）。Portal 有 7 條真死巷、Parent 有 2 條（`/announcements`、`/me/privacy-rights`），另案。
2. **孤兒路由的「入口」缺失**：`/student-leaves`、`/student-assessments`、`/student-incidents` 全 repo 無任何 in-app 入口。本次只補出口（父層），是否納入側邊欄是產品決策。
3. **頂列標題與頁內 `PageHeader` 標題重複**：例如 `/salary/growth-contract` 頂列「薪資管理 / 自主成長獎勵金」，頁內 `PageHeader` 再一個同名大標。屬標題資訊架構問題，48 支檔案受影響，另案。
4. **側邊欄高亮缺失**：`/student-attendance` 等 8 條路由側邊欄零高亮，與本次父層機制正交。
5. **`StudentDetailPanel.vue:318` 硬寫「學生管理」**違反 `moduleTerms.ts:32-36` 用語規範——該處 breadcrumb 於階段三移除後問題自然消失。

---

## 9. 風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| 移除 `parentTitle` 後某些頁父層消失 | `/activity/*` 9 條失去「課後才藝」前綴 | D6 已裁定為預期行為；側邊欄群組仍高亮 |
| 反查產生指向無權限路由的連結 | 點擊後被權限守衛擋下 | 父層一律是側邊欄項目，使用者能看到該項目才代表有權限；另由測試 5 保證路徑存在。**不另加權限過濾**——側邊欄可見性已是同一份 manifest 決定 |
| 階段三移除頁內返回鍵造成使用者一時找不到 | 習慣改變 | 麵包屑位置全站固定且帶箭頭；分批 commit，可單獨回退 |
| `router.resolve` 對動態參數路由的行為 | 容器判定誤判 | 測試 2 覆蓋 `/appraisal-year-end/year-end/cycles/:id` 等含參數路徑 |
| staging 為共用整合分支 | 升 prod 時會帶上其他 session 的 commit | 依 workspace CLAUDE.md 分支規則，升 prod 前逐筆核對 `git log main..staging` |
