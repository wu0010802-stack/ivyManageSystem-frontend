---
name: ui-design-preview
description: 改動或新增 UI 頁面前，先產出與實際畫面一致的靜態 HTML 設計稿（含 sidebar、header 完整 app shell 與簡單互動），開給使用者確認後才動手實作。觸發時機：使用者要求新增頁面、改版面、調 UIUX、加欄位/按鈕/dialog、重排 layout 等任何會改變畫面外觀的需求。純邏輯修改（不影響畫面）不觸發。
user-invocable: true
---

# UI Design Preview（先看設計稿，確認後才實作）

任何**會改變畫面外觀**的需求（新頁面、改版、加欄位/按鈕/dialog、重排 layout），
一律先產出靜態 HTML 設計稿給使用者過目。**使用者明確說 OK 之前，禁止動 `src/` 的任何檔案。**

> 例外：使用者明確說「直接改，不用看稿」，或改動為純文案/錯字級微調，可跳過。

## 核心原則

1. **視覺保真**：設計稿必須長得跟實際系統一樣——同樣的 sidebar、header、色票、字級、間距。使用者看的是「改完會長怎樣」，不是抽象 wireframe。
2. **標出差異**：本次變動的區塊用 `.mock-changed`（紫色虛線框）+ `.mock-badge`（✦ 新增 / ✦ 變更）標註，讓使用者一眼看出哪裡動了。右下角控制列可切換標註顯隱。
3. **前後對比**：改既有頁面時，同一份稿要內含**改前現況**——變更區塊放兩份相鄰版本，改前包 `.mock-before`、改後包 `.mock-after`，右下角控制列「改後 / 改前現況」即時切換。全新頁面沒有改前，都不包即可（切換鈕會自動隱藏）。
4. **可以互動**：tab 切換、dialog 開關、submenu 展開等簡單互動用 vanilla JS 做出來，幫助理解操作流程；不需要真資料與真狀態。
5. **確認閘門**：設計稿開給使用者後**停下來等回饋**。有修改意見就改稿再開，反覆到 OK 為止；OK 之後才進實作。

## 流程

### Step 1：判斷端別

| 端 | Shell 來源 | 模板 |
|---|---|---|
| **Admin 管理端**（最常見） | `src/layouts/AdminLayout.vue` | ✅ 用 `references/admin-shell-template.html` |
| 教師 Portal（`/portal/*`） | `src/layouts/PortalLayout.vue`（含 mobile tab bar，Soft UI，indigo `#4f46e5`） | 無現成模板，先讀 layout + `src/styles/portal/soft-ui.css` 自行拼 shell |
| 家長端 | `src/parent/layouts/`（Material 3，綠 `#0d9053`） | 同上，讀 `src/parent/styles/` |
| 公開報名頁 | `src/public/` | 同上 |

### Step 2：蒐集現況（動筆前必做）

- **改既有頁**：讀對應的 `src/views/**/*.vue`，把現況版面搬進設計稿（不是憑空重畫），再疊上變更。現況版面同時就是前後對比的「改前」素材（`.mock-before`），不要省略。
- **新頁面**：讀 `DESIGN.md` 的元件詞彙——列表頁標準組合是 `PageHeader` + `AdminListToolbar` + `el-table` + `el-pagination`；表單用 dialog 標準組合。新頁設計稿應遵循同樣詞彙。
- **涉及選單變動**：選單唯一事實來源是 `src/constants/navigation/manifest.ts`。設計稿的 sidebar 要反映變動後的選單（新項目加 `.mock-changed` 標註）。
- **不確定現況長相時**：dev server 有跑的話（port 5173），用 Playwright MCP 截圖實際頁面對照；或看 repo 根目錄與 `.playwright-mcp/` 的既有截圖。
- **對照 token**：模板頭部的 token 值是 `src/assets/design-tokens.css` 的快照（2026-07-31），若懷疑漂移，開原檔核對（admin scope 在 `html.ivy-admin` 區塊）。

### Step 3：產出設計稿

1. 複製模板 `references/admin-shell-template.html`，存到
   `docs/mockups/YYYY-MM-DD-<slug>.html`（`YYYY-MM-DD` 用今天日期；同需求迭代改同一檔，不要開新檔）。
2. 替換 `{{PAGE_TITLE}}` / `{{PARENT_TITLE}}`（麵包屑，無上層群組就把整個 `<span class="parent-title">` 拿掉）。
3. Sidebar：把 `is-active` 放到本頁對應項目、所屬群組 `<div class="submenu">` 加 `is-open`。
4. 內容區（`PAGE CONTENT HERE`）用模板內建的 `ep-*` 樣式拼頁面：
   `ep-button`（`--primary` / `is-plain` / `--small` / `--text`）、`ep-input`、`ep-card`、
   `ep-table`、`ep-tag`（success/warning/danger/info）、`ep-pagination`、
   `ep-dialog`（`openDialog(id)` / `closeDialog(id)` 已內建）、`ep-form-item`、
   `page-header`、`list-toolbar`。缺的元件樣式自行補在 `<style>` 尾端，視覺對齊 Element Plus。
5. 填**擬真假資料**（真實格式的中文姓名、日期、金額），別用 lorem ipsum 或「測試1」。
6. 變更處加標註（見核心原則 2）。
7. 改既有頁面時做前後對比（見核心原則 3）：變更區塊的改前現況包 `.mock-before`、改後包 `.mock-after` 相鄰放置；沒動到的區塊不包（兩視圖共用）。sidebar 選單有增刪時同樣適用（新項目 `.mock-after`、被移除項目 `.mock-before`）。

### Step 4：開稿等確認（停下來）

```bash
open docs/mockups/YYYY-MM-DD-<slug>.html
```

回報使用者：這次設計稿改了/新增了哪些區塊（對照標註）、有哪些互動可以點、右下角可切換「改前現況 / 改後」對照。
然後**結束回合等回饋**。有意見 → 改同一個檔 → 再 `open` → 重複到 OK。

### Step 5：確認後實作

使用者說 OK 後才動 `src/`：

- 涉及新頁面 / 選單項 / 權限 → **先跑 `.claude/skills/admin-page-lifecycle/SKILL.md`**。
- 實作時遵守 repo 規範：色彩一律 `var(--…)` **禁止寫死 hex**（stylelint 會擋）、間距用 `--space-*`、`<script setup lang="ts">`、觸控目標 ≥ 44px。設計稿裡的 hex 只是快照，**不可**複製進 `src/`。
- 實作完成後可用 Playwright MCP 截圖與設計稿並排對照，確認一致。

## 設計稿檔案規則

- 位置：`docs/mockups/`，命名 `YYYY-MM-DD-<slug>.html`（slug 用英文 kebab-case，如 `2026-08-01-student-health-tab.html`）。
- **完全自足**：單一 HTML 檔、無任何外部資源（CDN/字型/圖片皆不可），對外開也能看。
- 設計稿是溝通產物不是程式碼：允許 hex、允許 inline style、不跑 lint。
- 多視窗狀態（如 dialog 開啟前後）優先用互動呈現；互動做不到的（hover 提示、drag 中間態）可在同頁下方多放一份靜態快照區塊並標註。
