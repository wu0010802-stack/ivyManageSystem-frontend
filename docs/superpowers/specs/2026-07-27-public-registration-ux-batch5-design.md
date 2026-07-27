# Public 報名頁 UX 修繕（第五批）設計

- 日期：2026-07-27
- 範圍：`src/views/public/ActivityPublicView.vue`（報名，2643 行）、`ActivityPublicQueryView.vue`（查詢/修改，1442 行）
- 性質：純前端；家長手機端為主要情境
- 來源：2026-07-27 逐行體檢（另一半：AuditLog search 跨 repo 已於同批完成）

## 1. 修繕清單（依痛度排序）

### #1（P1）public bundle 的 `--text-secondary`/`--text-tertiary` 未定義

`src/public/main.ts` 只 import `design-tokens.css`，但兩支 view 共 6 處使用只定義在 `main.css` 的 `--text-*` 變數 → 實際渲染為 fallback/繼承色，非設計指定色（disabled 按鈕文字、額滿 badge、頁尾等）。**修法**：在兩頁各自的 local token 區塊補定義（對齊各自色票的次要文字色），不 import `main.css`（會拖入 Element Plus 覆寫，public 端無 EP）。

### #2（P1）touch target 未達 44px

- View：`.review-edit-button`（~22px，Step 3 唯一返回編輯入口）、`.btn-actions-row .btn`（~31px）
- Query：`.mode-tab`（40px，高頻切換）、`.btn.btn-sm`（40px，候補確認/放棄——誤觸代價高）
**修法**：min-height 44px（或 padding 擴大點擊區），視覺大小可用內距微調維持。

### #3（P2）Query 頁 a11y 空白區

- 查詢結果/錯誤區塊無 `aria-live`、查詢後無 focus 管理（View 頁有 `focusFirstError` 範式可循）
- `role="tablist"/"tab"` 缺 `aria-controls` + `tabpanel`
- validation 訊息缺 `role="alert"`（View 頁等價元件有，兩頁不一致）
**修法**：結果區 `aria-live="polite"`；查詢完成 focus 移至結果區塊（tabindex="-1" + focus()）；補齊 tab 語意與 role="alert"。

### #4（P2）必填欄位純視覺 `*`（兩頁）

`novalidate` 全自訂驗證下無 `aria-required`。**修法**：必填 input 補 `aria-required="true"`（不加原生 required，避免與自訂驗證雙軌）。

### #5（P2）兩頁 CTA 色互相矛盾

View 頁已裁定移除橙色 CTA 改綠（style 註解明載）；Query 頁 `--color-cta` 仍是橙 `#ea580c`。**修法**：Query 頁 CTA 對齊 View 頁綠系（`#0d9053`/hover 深綠），一併把 `--color-primary` 對齊 View 的 `#0d9053`（兩頁現為不同綠）。其餘色票差異記 backlog 不本批統一。

### #6（P3）多步表單無離開防護（兩頁）

**修法**：表單 dirty 時掛 `beforeunload`（`onMounted` 加、`onBeforeUnmount` 移除；dirty 判定用「任一必填欄位有值」或既有 dirty 旗標）。**不做** localStorage draft（家長 PII 落地本機需另議，記 backlog）。

### #7（P3）順手項

View 頁 1767/1860 兩處裸寫 `#e5e7eb`（同檔已有 `--color-border-muted` 同值）改用變數；Query 頁 4 處 `#f9fafb` 抽成 local token。其餘散裝 hex 不本批處理。

## 2. 非目標

- 兩頁色票全面統一／收斂到 shared tokens（牽動品牌視覺，需業主看過）
- localStorage draft 暫存（PII 考量另議）
- 子元件（CoursePickerSection 等）體檢與修繕

## 3. 驗證

- 兩頁既有測試綠；a11y 屬性以元件測試斷言（aria-required / role / aria-live 存在性）
- Gate 同前批：typecheck baseline、eslint 全量、全套 vitest、build
- CSS-only 項不強造測試，diff 逐處核對
