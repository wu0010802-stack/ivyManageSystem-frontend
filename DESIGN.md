# Design

本檔記錄 ivy-frontend **現行**視覺系統（由程式碼盤點產出，2026-07-27）。改樣式前先讀這份；token 的單一事實來源是 `src/assets/design-tokens.css`，本檔是導覽不是副本。

## 系統結構

四個角色 app（admin / 教師 portal / 家長 parent / 公開 public）共用同一套尺度 token（字級、間距、圓角、陰影、動效、semantic 色、neutral 階），只有 `--brand-*` accent 各自覆寫：

| 角色 | Accent | 定義處 |
|------|--------|--------|
| Admin | 青藍 `#0284c7`（2026-06-12「沉穩高密度」改版） | `design-tokens.css` `html.ivy-admin` scope |
| Portal | Indigo `#4f46e5`（沿用 default） | `src/styles/portal/soft-ui.css` |
| Parent | 綠 `#0d9053` / `#0caf76`（Material 3 體系，獨立 m3-tokens） | `src/parent/styles/globals.css` |
| Public | 奶油橘 | 各 public view |

> **品牌色備註**：園方品牌色（主綠 `#4EB87A`、深綠 `#2D8F5A` 等）用於對外品牌物，四個 app 的 accent 是經 spec 裁定的獨立決策（admin 刻意避開飽和綠以利長時間閱讀），**不要**未經討論把 app accent 改回品牌綠。

## Token 檔案地圖（import 順序即層疊順序，見 `src/main.ts`）

1. `element-plus/dist/index.css` — EP 基底
2. `src/assets/design-tokens.css` — 尺度與色彩 token（唯一定義 hex 的地方）
3. `src/assets/main.css` — 語意 alias（`--color-primary` → `--brand-primary`）、EP 變數對齊（`--el-color-primary` 系列）、utility class、EP 覆寫、reduced-motion
4. `src/assets/a11y.css` — dark mode／高對比／reduced-motion 下的 override
5. `src/styles/portal/soft-ui.css`、`src/styles/form-hint.css`、`src/assets/crisp.css`
6. `src/assets/breakpoints.media.css` — `@custom-media` 斷點（與 `src/constants/breakpoints.ts` 同步，有 drift guard test）

## 硬規則（新增／修改樣式時）

- **禁止在元件內寫死 hex**：色彩一律 `var(--...)`。現存 1500+ 處寫死 hex 是待清償技術債，分批收斂，不要再增加。
- **Element Plus 主色跟著 `--el-color-primary` 走**：不要寫死 `#409eff` fallback。
- **間距用 `--space-*`、字級用 `--text-*` 或 `.fs-*` utility**：不要新增 inline px。
- **金額／數量欄**：`el-table-column` 加 `class-name="num-cell" align="right"`（tabular-nums 已全域開）。
- **狀態 tag**：用 EP `type=` 的 light effect，文字色已被 main.css 拉到 AA 對比，不要自訂 tag 色。
- **觸控目標**：行動端可互動元素對齊 `--touch-target-min: 44px`（`.tap-target` utility）。
- **動效**：只用 `--transition-*` 時長；裝飾性動畫禁止（reduced-motion 全域降階已存在）。
- **RWD**：斷點一律用 `@media (--to-sm)` 等 custom media，不自創 px。
- **z-index**：用 `--z-*` scale，不隨意填數字。

## 元件詞彙（admin 列表頁標準組合）

列表頁 = `PageHeader` + `AdminListToolbar`（搜尋/篩選 chip/筆數/匯出）+ `el-table`（loading 用 `TableSkeleton`，空狀態 `EmptyState`）+ `el-pagination`（伺服器分頁時）。資料層兩個 pattern：

- **Pattern A 伺服器分頁**：`useTableFilters`（debounce 搜尋 + page/page_size + 競態保護）
- **Pattern B 客端過濾**：`useClientTableFilter`（全載資料，回傳形狀與 A 對齊）

出處 spec：`docs/superpowers/specs/2026-06-17-admin-list-experience-consistency-design.md`。新列表頁**必須**套這組，不要重造搜尋列。

## 元件詞彙（表單對話框標準組合）

全站 `el-dialog` 桌面殼層已由 `main.css` 全域接管（2026-07-30 起）：flex column + **body 內捲**（標題與「取消／儲存」動作列常駐可見）、header/footer 全寬 hairline 分隔線、`--radius-lg` 圓角、`max-height` 自適應視窗。個別 dialog **不要**再自己寫 max-height / overflow / 分隔線。

**表單型 dialog 一律用 `FormDialog`**（`src/components/common/FormDialog.vue`，2026-09-06 起；spec `2026-09-06-admin-form-dialog-defaults-design.md`）：它只管殼層——`size="compact|standardNarrow|standard|wide"` 對應 `FORM_DIALOG_WIDTH`、footer「取消／{動詞}{型}」樣板、`dirty` 關閉保護（走 `confirmDiscardChanges`）、開啟聚焦第一欄、單行輸入 Enter 送出、`scrollToFirstError()`；`el-form`／`rules`／送出仍在使用端。預設 `destroy-on-close`、不允許點遮罩關閉。`main.css` 另有全域預設層：dialog 內非 inline 表單一律堆疊標籤，刻意左右排的短表單在 `el-form` 加 `class="form-labels-inline"`。四指標棘輪 `npm run check:form-dialogs`（裸 `el-dialog` 表單／`label-width`／硬寫 px 寬度／新增鈕誤用）在 CI blocking，只准降不准升。必填與格式規則用 `src/validators/rules.ts`（`required(label, { kind })` 統一「請輸入／請選擇」文案）。自訂 `footer` slot 時，取消鈕必須呼叫 `formDialogRef.value?.requestClose()` 才會走 dirty 保護；footer 未接 `@submit` 的表單請明寫 `:enter-submit="false"`。

表單型 dialog 的內容規範（範例實作：`src/components/recruitment/RecruitmentRecordDialog.vue`；FormDialog 旗艦：`src/views/activity/ActivityCourseView.vue` 課程對話框、`src/components/signoff/SignoffPanel.vue`；分型盤點歷史快照：`docs/analysis/2026-08-18-admin-create-form-inventory.md`）：

- **Admin 桌面表單依 compact／standard／wide 分型，採語意 responsive grid；窄螢幕收回單欄**（2026-08-18 起，取代舊「預設單欄」規範）：
  - **compact**（1–6 欄）：dialog `FORM_DIALOG_WIDTH.compact`（520px），預設單欄；語意成對且短的欄位可雙欄
  - **standard**（7–14 欄）：`standardNarrow`（760px）／`standard`（860px），`label-position="top"` ＋ `.form-grid` 語意兩欄（`main.css` 的 12-col vocabulary，`.fg-12/.fg-8/.fg-6/.fg-4/.fg-3` 直接加在 `el-form-item` 上）。textarea、地址、上傳、alert、checkbox 群與複合控制項一律 `.fg-12` 跨滿列；**依語意配對，不做順序盲目左右交錯**
  - **wide**（15+ 欄）：`wide`（min(1040px, 94vw)）、寬 drawer 或獨立頁，依工作流程選容器（modal 不是預設答案）；左側可加 section navigation，右側 12-col grid；核心區段常駐展開，只有真正低頻的進階資料收合——**不用收合掩蓋不合理的資訊架構**
  - **bulk／repeating**（批次、名單、金額明細、題目）：table/grid/workspace，不硬塞直式表單
  - 寬度常數統一 import `src/constants/formDialog.ts` 的 `FORM_DIALOG_WIDTH`，不逐檔手寫 px
- `el-form label-position="top"`，控制項用**預設尺寸**（勿 `size="small"`，表單不缺這點空間）
- 分段用 `FormSection`（`src/components/common/FormSection.vue`，可收合標頭已是真正的 `<button type="button">`）：核心欄位 `collapsible=false` 常駐，進階欄位收合 + 驗證失敗自動展開並捲至第一個錯誤欄位（機制見 `2026-06-02-form-ux-single-column-collapsible-design.md`）
- `.form-grid` 之外的既有 `el-row :gutter="16"` + `el-col :span="12"` 成對雙欄仍有效——mobile 斷點由 `main.css` 自動收回單欄（`.form-grid` 為 `--to-md` 短欄先收兩欄、`--to-sm` 全收單欄），元件內不用寫 RWD；手機維持既有 95%／fullscreen 行為
- 欄位格式範例用 `.form-hint`／`.form-hint--example`，必填圖例 `required-legend` 置於表單頂部
- 標題沿用 `mode === 'add' ? '新增X' : '編輯X'` 三元慣例
- **新增入口按鈕**：頁面主要新增動作放 `PageHeader` actions 右側，用 `AdminCreateButton`（primary＋EP Plus icon＋「新增{資料類型}」；權限判斷留在 caller）；建立流程 submit 文案「建立{資料類型}」（語意更準的動詞如「發佈」可保留），不可只寫「確認」；**新增動作不可用 `type="success"`**（success 只表成功狀態）；contextual 子資源新增用 default／plain 避免與主動作競爭；同畫面不得兩顆同強度 primary CTA

出處 spec：`docs/superpowers/specs/2026-07-30-admin-form-dialog-shell-design.md`。

## 相關 spec 索引（改動前先查）

- 表單 UX：`2026-06-02-form-ux-single-column-collapsible-design.md`
- 密集表格輸入：`2026-06-23-admin-dense-grid-input-ux-design.md`
- RWD 斷點基礎：`2026-06-26-rwd-foundation-breakpoint-tokens-design.md`
- 無障礙 AA：`2026-06-27-mobile-optimization-phase2-portal-alerts-aa-design.md`
- Admin 配色由來：`2026-06-12-admin-salary-uiux-redesign-design.md`
- 家長端 M3 體系：`2026-05-13-parent-material3-redesign-design.md`
