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

## 相關 spec 索引（改動前先查）

- 表單 UX：`2026-06-02-form-ux-single-column-collapsible-design.md`
- 密集表格輸入：`2026-06-23-admin-dense-grid-input-ux-design.md`
- RWD 斷點基礎：`2026-06-26-rwd-foundation-breakpoint-tokens-design.md`
- 無障礙 AA：`2026-06-27-mobile-optimization-phase2-portal-alerts-aa-design.md`
- Admin 配色由來：`2026-06-12-admin-salary-uiux-redesign-design.md`
- 家長端 M3 體系：`2026-05-13-parent-material3-redesign-design.md`
