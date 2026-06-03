# 考核 × 年終 整合工作區 — 設計文件

- 日期：2026-06-03
- 範圍：**純前端**（ivy-frontend），零後端 / API / Pydantic schema / alembic migration 改動
- 類型：導覽與頁面整合（UI 整併），不動任何商業邏輯與計算流程

---

## 1. 背景與目標

目前三個彼此相關的功能散落在兩個選單群組：

| 功能 | 現選單位置 | 現路由 | 現 component |
|------|-----------|--------|-------------|
| 考核管理 | 系統設定 | `/appraisal-management` | `AppraisalManagementView.vue`（內含 4 個 `?tab=` 內層 tab：當期總覽 / 歷史週期 / 考核設定 / 懲處記錄） |
| 年終獎金 | 人事薪資 | `/year_end/cycles` | `yearEnd/YearEndListView.vue`（list，下鑽 detail/grid/config） |
| 考核年終 payout | 人事薪資 | `/year-end/appraisal-payout` | `yearEnd/AppraisalPayoutView.vue`（內含 preview / generated 內層） |

考核分數最終餵入年終 E化引擎的「考核年終」獨立轉帳（CLAUDE.md §10/§11，資料/計算流程**已**整合），但 UI 上仍分散。本案目標：**把三者整併到人事薪資底下的單一工作區頁面**，降低操作切換成本。

**使用者決策（brainstorm 已拍板）：**
- 整合層級：合併成單一工作區頁面（route + tab），非單純選單搬移。
- 外層切換器視覺：`el-segmented` 區段控制（與內層 `el-tabs` 視覺區分，避免 tab 包 tab）。

**非目標（YAGNI）：**
- 不改寫三個被包頁面的內部邏輯 / 版面 / 既有 `?tab=` 與內層狀態。
- 不動後端、API 契約、schema。
- 不動下鑽 detail/grid/config 路由（它們維持獨立路由）。
- 不做資料/計算流程整併（已存在）。

---

## 2. 架構：Thin Shell（包，不改寫）

### 2.1 新 shell 元件 `src/views/AppraisalYearEndView.vue`

- 外層用 **`el-segmented`** 切換 3 個 section，值同步到 query `?section=`：
  - `appraisal` → `<AppraisalManagementView />`
  - `year-end` → `<YearEndListView />`
  - `payout` → `<AppraisalPayoutView />`
- **被包頁面內部完全不動**：外層用 `?section=`、內層 AppraisalManagementView 用 `?tab=`，兩者命名不衝突，可共存於同一 URL（例：`/appraisal-year-end?section=appraisal&tab=settings`）。
- 子頁以 `v-if="activeSection === '<key>'"` **lazy mount**（只掛載目前 section），避免三頁 `onMounted` 同時觸發資料載入。
  - 取捨：切換 section 會 re-mount → 重新抓資料（等同今天三個獨立頁的行為），可接受。未來若要保留狀態再評估 `keep-alive`（本案不做）。
- 區段標籤：`考核管理` / `年終獎金` / `考核年終`。

### 2.2 Section 層權限（每個 segment 各自守門）

| section | 可見條件（沿用現側邊欄/路由 gate） |
|---------|----------------------------------|
| `appraisal` | `SETTINGS_READ \|\| SALARY_READ` |
| `year-end` | `YEAR_END_READ` |
| `payout` | `APPRAISAL_FINALIZE` |

- `availableSections` = 依上表過濾 `[appraisal, year-end, payout]`。
- `el-segmented` 的 options 僅渲染 `availableSections`（無權限的 segment 不出現）。
- **預設 section**：`?section=` 缺漏或指向使用者無權限的 section → fallback 為 `availableSections[0]`，並 `router.replace` 修正 query。
- `availableSections` 為空時（理論上不會發生，因選單入口與路由 gate 已擋）→ 防禦性渲染「無權限」placeholder。

### 2.3 切換 section 的 query 處理

- 切到非 `appraisal` 的 section 時，**清掉 `tab` query**（`tab` 屬於 appraisal 內層）；切回 `appraisal` 時 AppraisalManagementView 自行 resolve 缺漏 tab → 預設 `current`。
- 切換用 `router.replace`（不灌爆瀏覽器歷史，對齊 AppraisalManagementView 既有 `onTabChange` 慣例）。

---

## 3. 路由變更 `src/router/index.ts`

### 3.1 新增 shell 路由

```ts
{
  path: '/appraisal-year-end',
  name: 'appraisal-year-end',
  component: () => import('../views/AppraisalYearEndView.vue'),
  meta: { title: '考核與年終' }
}
```

> 不掛單一 `meta.permission`——本頁承載三種權限，真正 gate 走 §3.3 的 `ROUTE_PERMISSION_RULES`（OR 語意）。

### 3.2 Legacy 路由改為 redirect（書籤 / 舊連結 / 既有 redirect 不死）

用 function redirect 保留 incoming query：

| 舊路由 | 新目標 |
|--------|--------|
| `/appraisal-management` | `/appraisal-year-end?section=appraisal`（merge 既有 `?tab=`） |
| `/appraisal/cycles` | `/appraisal-year-end?section=appraisal&tab=history` |
| `/appraisal/settings` | `/appraisal-year-end?section=appraisal&tab=settings` |
| `/year_end/cycles` | `/appraisal-year-end?section=year-end` |
| `/year-end/appraisal-payout` | `/appraisal-year-end?section=payout` |

範例：
```ts
{ path: '/appraisal-management',
  redirect: (to) => ({ path: '/appraisal-year-end', query: { ...to.query, section: 'appraisal' } }) }
```

### 3.3 下鑽路由維持不動（**不改**）

`/appraisal/cycles/:id`、`/year_end/cycles/:id`、`/year_end/cycles/:id/grid`、`/year_end/cycles/:id/config`、`/year_end/cycles/:id/settlements/:sid` 等維持獨立路由。

- 已驗證：這些下鑽頁返回一律用 `router.back()`（`el-page-header @back`、`← 返回`），**無**硬編碼舊 list 路由 → 整合後從 shell 進入會自然 `back()` 回 shell，不會 orphan。
- `CycleListView` 內 `router.push('/appraisal/cycles/:id')`、`YearEndGridView` 內 settlement 連結等仍指向存在的下鑽路由 → 不受影響。

### 3.4 `ROUTE_PERMISSION_RULES`（`src/constants/permissions.ts`）

新增 4 條 OR 規則（`canAccessRoute` 對「無對照」一律拒絕，必須加，否則整頁被擋）：

```ts
{ path: '/appraisal-year-end', permission: 'SETTINGS_READ' },
{ path: '/appraisal-year-end', permission: 'SALARY_READ' },
{ path: '/appraisal-year-end', permission: 'YEAR_END_READ' },
{ path: '/appraisal-year-end', permission: 'APPRAISAL_FINALIZE' },
```

- 既有 `/appraisal`(prefix)、`/year_end`(prefix)、`/appraisal-management`、`/year-end/appraisal-payout` 規則**保留**（下鑽路由仍需 `/appraisal`、`/year_end` 前綴規則；redirect 路由保留規則無害）。

---

## 4. 側邊欄變更 `src/components/layout/AdminSidebar.vue`

### 4.1 選單項目

- **人事薪資群組（group-leave）**：
  - 移除「年終獎金」(`/year_end/cycles`)、「考核年終 payout」(`/year-end/appraisal-payout`) 兩項。
  - 新增單一項「**考核與年終**」→ `/appraisal-year-end`，置於「薪資管理」之後。
  - `v-if="canView.SETTINGS_READ || canView.SALARY_READ || canView.YEAR_END_READ || canView.APPRAISAL_FINALIZE"`（= 三 section gate 的聯集）。
  - icon 沿用既有（如 `Trophy` / `Medal`）。
- **系統設定群組（group-settings）**：移除「考核管理」(`/appraisal-management`) 項。

### 4.2 群組可見性回歸修補（**兩個既有 bug，必修**）

搬移選單項會破壞既有 `hasVisible*Items` 群組 gate：

1. **`hasVisibleSettingsItems`**：目前 = `SETTINGS_READ || SALARY_READ || ACTIVITY_WRITE`。其中 `SALARY_READ` 僅為 `/appraisal-management` 而存在。搬走後若不拿掉 → **只有 `SALARY_READ` 的使用者會看到空的「系統設定」選單**。
   - 改為：`SETTINGS_READ || ACTIVITY_WRITE`。
2. **`hasVisibleLeaveItems`**：目前不含 `SETTINGS_READ`。新入口落在人事薪資且 `v-if` 含 `SETTINGS_READ`，但群組 gate 不含 → **只有 `SETTINGS_READ`（今天靠系統設定進考核管理）的使用者整個入口消失**。
   - 補上：`... || canView.value.SETTINGS_READ`。

---

## 5. 邊界情境

- Deep link `/appraisal-year-end?section=payout` 直接落在 payout；`?section=` 非法或無權限 → fallback `availableSections[0]` 並 `router.replace` 修正。
- 三 section 只有一個有權限時，`el-segmented` 仍渲染單一選項（或可考慮隱藏切換器，僅顯示內容——實作細節，預設仍渲染以維持一致）。
- shell 本身不發 network request；error handling 由被包頁面各自負責。

---

## 6. 測試（Vitest）

### 6.1 新 `AppraisalYearEndView.spec.ts`
- 依 `getUserInfo` 不同權限集合，`el-segmented` 只渲染有權限的 section。
- `?section=` query ↔ active 值雙向同步；切換 segment → `router.replace` 帶正確 `section`。
- `?section=` 缺漏 / 無權限 → 預設落在 `availableSections[0]`。
- 只有 active section 的子元件被掛載（stub 子元件斷言 presence）；切離 appraisal 時 `tab` query 被清除。
- 子元件含 teleport（el-dialog 等）時，mount 加 `global: { stubs: { teleport: true } }`（對齊 workspace sheet/dialog 測試慣例）。

### 6.2 側邊欄回歸測試（擴充既有 `AdminSidebar` 測試，若無則新增）
- 只有 `SALARY_READ` → 「系統設定」群組**隱藏**（修補後；修補前會顯示空群組）。
- 只有 `SETTINGS_READ` → 「人事薪資」群組顯示且含「考核與年終」入口。
- 只有 `YEAR_END_READ` / 只有 `APPRAISAL_FINALIZE` → 入口可見、shell 內僅對應 section 出現。

---

## 7. Rollout 與風險

- 純前端、無 migration、無 API → 風險低。
- 最大風險 = §4.2 兩個側邊欄群組可見性回歸（已明列 + 測試覆蓋）。
- 向後相容由 §3.2 redirect 保證。
- 影響檔案（預估）：
  - 新增：`src/views/AppraisalYearEndView.vue`、`src/views/__tests__/AppraisalYearEndView.spec.ts`
  - 修改：`src/router/index.ts`、`src/constants/permissions.ts`、`src/components/layout/AdminSidebar.vue`（含其測試）

---

## 8. 後續（out of scope）
- 可選：未來把下鑽 detail/grid/config 改為 shell 的 child route（目前 `router.back()` 已足夠，不做）。
- 可選：`keep-alive` 保留各 section 狀態（本案用 `v-if` lazy mount，不做）。
