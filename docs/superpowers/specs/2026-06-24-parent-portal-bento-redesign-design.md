# 家長端 Bento 儀表板重設計 — 設計規格

- **日期**：2026-06-24
- **範圍**：`ivy-frontend` 家長端 LIFF app（`src/parent/`）
- **分支**：`feat/parent-bento-redesign`（off `main` @ ccddb4ee，獨立 worktree）
- **狀態**：設計定案、待 user review → 轉 writing-plans

---

## 1. 目標與背景

「全面提升家長端 UI/UX，核心日常流程優先，視覺大膽重新想像。」經視覺協作三輪收斂，定案視覺方向為 **A1 · Bento 儀表板 · 冷調石板灰 · 品牌綠 `#0d9053` · 線性圖示（Material Symbols）· 無 emoji**。

### 1.1 與既有 Material 3 遷移的關係（重要框架）

家長端在 **2026-05-13 才剛完成一次大型遷移**：從「IvyKids Family OS（Soft UI / Sky claymorphism / 童彩 6 色）」**完整改寫為 Google Material 3（Material You）**（spec `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md`，P0–P5 全 merge 進 main）。已落地：18 個 `M3*` 元件、`scripts/gen-m3-tokens.mjs` 從 `#0d9053` 機器生成的 `--m3-*` token、Material Symbols Rounded、`ParentLayout` 的 `M3TopAppBar`＋`M3NavigationBar`。

**因此本次重設計不是「丟掉 M3 重來」，而是在 M3 地基上疊一層：**

1. **資訊架構**：把核心頁從「線性卡片串」改為 **Bento 儀表板**（一眼掃完今日狀態 / 清單狀態化）。
2. **Surface 調色**：把暖奶油底改為**冷調石板灰**的中性 surface ramp（A1 定案）。
3. **少量組合元件**：新增 `StatTile / StatusPill / SectionHeader / DashboardHero / ListCard / ParentErrorState`，全部以既有 M3 基元 + design token 組裝。

M3 元件、Material Symbols、token cascade、測試慣例全部沿用，不另立規範。本 spec 延伸 2026-05-13 spec，不取代它。

### 1.2 非目標（Out of scope）

- **不**做 P5 全量 legacy token 清理（42 個 view 仍引用 `--sky-*/--coral-*/--ivy-tile-*`）。本次只動核心 6 頁 + 共用層；其餘 view 透過 token 覆寫「免費」拿到冷調 surface，僅做輕量視覺巡檢、不逐頁重構。
- **不**新增線上金流（後端無付款端點；繳費頁維持「查看繳費方式」資訊型）。
- **不**動 M3 元件、`ParentBottomSheet` / `AppModal` / `ConfirmDialog` / `ParentIcon` 的 props/events/slots（rigid API，見 §7）。
- **不**碰 admin / teacher portal（`src/views/`、`src/router/`）與共用 `design-tokens.css` 的既有值（只**新增** spacing token，見 §3.3）。

---

## 2. 設計原則

1. **一眼可掃（glanceable）**：首頁與清單以 Bento 方格 + 狀態標籤呈現，家長 3 秒內掌握「孩子今天怎樣、我要做什麼」。
2. **單一視覺語言**：冷調 slate 中性 + 品牌綠強調 + 線性 Material Symbols。禁 emoji 當 UI 圖示。
3. **建構於 M3，不另造輪子**：新元件 = M3 基元組裝；圖示一律 `M3Icon`；token 一律 `var(--token)`，view scoped style 禁裸 hex。
4. **三態一致**：每個核心頁都有 loading（skeleton）/ empty（EmptyState）/ error（inline 重試），不再只靠 toast。
5. **可及性內建**：互動 icon 必有 `aria-label`、可點 tile 走 `role=button`、白字綠底用 AA 達標的 action 綠。

---

## 3. 設計系統變更（Design Tokens）

所有 token 變更**只放 `src/parent/styles/globals.css`**（main.ts 載入順序中晚於 `m3-tokens.css`，故可覆寫）與**新增** `design-tokens.css` 的 spacing 缺號。**不手改自動生成的 `m3-tokens.css`**。

### 3.1 綠色：單一色相、兩階明確分工（解「兩種綠」）

審計指出 `#0d9053`（brand）與 `#006d3d`（M3 primary）並存。**解法不是壓成單一 hex，而是定義為同色相的兩階 ramp，並明確分工**（兼顧 a11y）：

| 角色 | 值 | 用途 | 對白字對比 |
|---|---|---|---|
| **品牌展示綠** `--brand-primary` | `#0d9053`（→漸層 `#12b06a`） | Hero 大面積、漸層、大字、裝飾 | ~4.1:1（僅大字/裝飾 OK） |
| **動作綠** `--m3-primary`（M3 生成） | `#006d3d` | M3 filled 按鈕、小字綠底、強調 | ~6:1（AA 全尺寸） |

→ **維持現況兩值，但寫成文件化的「一條品牌綠 ramp 兩個語意」**，消除的是*意外混用*（同情境用錯階），不是色票本身。**明確不採** path-1 把 `--m3-primary` 壓成 `#0d9053`（會使 filled 按鈕白字掉到 4.1:1，未過 AA normal text）。A1 mockup 的按鈕視覺實作上用 action 綠 `#006d3d`（比 mockup 深一點點、更耐讀）。

### 3.2 Surface：冷調石板灰中性 ramp（A1 定案、最大視覺變更）

在 `globals.css` 新增「parent cool-slate surface」覆寫區塊，把**中性 surface / text / border** 一致改為 slate；**保留**飽和 accent（coral/sun/leaf/sky）給 StatusPill 與 tile，使其在 slate 上仍協調。需同時覆寫**兩套被消費的 token**（legacy `--pt-*` 與 M3 `--m3-*`），整個 app 才會一致位移：

| 語意 | Light | Dark | 覆寫的 token（示意） |
|---|---|---|---|
| App 背景 | `#eef1f5` | `#0f141a` | `--m3-background`、`--pt-surface-app` |
| 卡片 surface | `#ffffff` | `#1a212b` | `--m3-surface`、`--pt-surface-card`、`--m3-surface-container*`（五階改 slate tonal） |
| 主文字 | `#0f172a` | `#e7edf3` | `--m3-on-surface`、`--pt-text-strong` |
| 次文字 | `#64748b` | `#9aa7b5` | `--m3-on-surface-variant`、`--pt-text-soft` |
| 三級/footnote | `#94a3b8` | `#6b7886` | `--pt-text-faint` |
| Hairline/border | `#e2e8f0` | `#2a333f` | `--m3-outline-variant`、`--pt-border`、`--pt-hairline` |

> M3 自訂中性 palette 為合法做法；此覆寫等同把 M3 neutral 從「綠味中性」換成「冷味中性」。Dark mode 比照在 `:root[data-theme='dark']` 覆寫（沿用既有 attribute 機制，**不用** `prefers-color-scheme`）。

### 3.3 Spacing：補齊缺號

`design-tokens.css` 缺 `--space-7(28)/9(36)/11(44)`。**新增**這三個（純 additive、四 app 無破壞）。核心 6 頁 scoped style 內的 off-scale 裸 px（如 TodayView hero `30/34px`、ChildProfile avatar `56px`、各處 `18/14px`）改用 `--space-*` / `--text-*` / radius token。

### 3.4 圓角與高度

統一 token 化：tile/卡 `18px`、hero `20–22px`、pill `999px`、M3 按鈕 `100px`（沿用 M3）。高度沿用 `--m3-elev-*`（M3）與既有 `--pt-elev-*`；新 tile 用 `--m3-elev-1` 等。

---

## 4. 元件變更

### 4.1 新增共用元件（`src/parent/components/`，各搭 co-located 測試）

| 元件 | 用途 | 主要 props | 組裝自 |
|---|---|---|---|
| `StatTile.vue` | Bento 統計/狀態小格 | `label, value, sub?, icon?, tone?, clickable?/to?` | `M3Card` + `M3Icon` |
| `StatusPill.vue` | **統一**狀態標籤（取代散落的 `paymentBadge` / fees `statusColor` / `courseStatusMap` 三套配色） | `tone(ok/warn/danger/neutral/info), label, icon?` | 純 span + token |
| `SectionHeader.vue` | 區塊標題 + action slot（取代各處 `<h3 class="pt-section-title">`） | `title`, slot `action` | `.pt-section-title` |
| `DashboardHero.vue` | 首頁 Bento hero（孩子 context + 主狀態 + 品牌綠漸層） | `title, value, status?, sub?`；child 自取 `useChildSelection` | brand 漸層 + `LaurelWreath` |
| `ListCard.vue` | 通用清單卡（icon + 標題 + meta + trailing + CTA），給才藝/繳費列 | `icon, title, meta?, trailing?`；slots | `M3Card` + `M3ListItem` |
| `ParentErrorState.vue` | inline 載入錯誤 + 重試（統一三態的 error）。若 `MobileErrorRetry` 已足夠則直接複用、不新建 | `message?, onRetry` | 既有 `MobileErrorRetry` |

> **StatusPill 是收斂重點**：先把 `utils/activityPayment.paymentBadge`、`fees` 的 `statusColor`、`activity` 的 `courseStatusMap` 統一成單一 `tone` 來源，三頁共用，杜絕配色漂移。

### 4.2 直接複用的既有元件

`M3Card / M3Chip(filter) / M3SegmentedButton / M3Button / M3IconButton / M3Icon / M3NavigationBar / M3TopAppBar / M3ListItem / SkeletonBlock / EmptyState / MobileErrorRetry / PullToRefresh / ChildContextHeader / ChildSelector`。Bottom nav（`M3NavigationBar`，3-tab）與 filter chips（`M3Chip`）已可直接用。

---

## 5. 逐頁重設計（核心日常流程）

> 共同：沿用 `useChildSelection` 子女上下文（勿自管 child id）、`PullToRefresh` wrapper（注意 `.ptr-content` flex/gap）、scrollIntoView 錨點（`data-unpaid-anchor`、`id=act-active/act-upcoming` 不可移除）、既有生命週期 bug fix（TodayView P1-16、ContactBook P1-19 abort）不可回退。

### 5.1 TodayView（今日首頁 · 旗艦）
Bento 儀表板（對齊 mockup 1）：`DashboardHero`（孩子 + 「已入園 08:32」+ 出席正常）置頂跨欄；2 欄 `StatTile` 格（待繳學費 / 待簽文件 / 今日午餐 / 才藝課）；跨欄今日照片 strip；保留今日聯絡簿卡與 `PendingSignBanner`、`PushCta`、`ChildrenStrip`。三態已完整，沿用。

### 5.2 ActivityView（才藝報名）
對齊 mockup 2：`M3SegmentedButton` 切「可報名 / 我的報名」；`ListCard` 課程列 + `StatusPill`（剩 N 位 / 已額滿 / 已報名）+ 對應 CTA（報名 / 候補 / 繳費明細）。**補三態**：加 `SkeletonBlock`（目前載入中空白）、加 `ParentErrorState`（目前只 toast）。衝堂偵測 / 報名時段 fail-open / 防連點 / 一次性管理連結語意不可動。

### 5.3 FeesView（繳費）
對齊 mockup 3：`DashboardHero` 變體強調「本月應繳 $ + 期限」（CTA「查看繳費方式」，非線上付款）；下方 `StatusPill` 分「待繳 / 已繳」清單（`ListCard`）。**補 error 三態**（目前只 toast）。`FeeReceiptSheet` 詳情與複製邏輯沿用。

### 5.4 ContactBookView（聯絡簿）
冷調 surface + `SectionHeader` + `StatusPill`（未讀）；`MonthDateStrip`、incremental render、`useAbortableFetch` 切孩防錯亂全沿用。**補 inline error**（目前只 friendly toast）。

### 5.5 MessagesView（訊息）
冷調 surface + 收件匣列（avatar + 雙行 + 未讀 badge/dot）改用 token 化樣式（修唯一裸 `#fff` L330）。**修 bug**：fetch 失敗時 `finally` 仍標 loaded → 落到 empty 態；改為設 error 旗標並渲染 `ParentErrorState`。

### 5.6 ChildProfileView（孩子檔案）
冷調 surface；子區（timeline / photos）loading 由純文字「載入中…」改 `SkeletonBlock`、error 改 `ParentErrorState`（與主檔一致）；統一 rem/px 混用與 `--pt-surface-mute` 不一致 fallback（`#f3f4f6` vs `#f5fbe6`）；修裸 rgba（L332）。

### 5.7 共用外框
`ParentLayout` 的 `M3TopAppBar` / `M3NavigationBar` 套冷調 surface（透過 token 自動位移，微調 active indicator 對比）。`BrandMark` 保留於 header。

---

## 6. 三態一致性（統一規格）

| 狀態 | 元件 | 規則 |
|---|---|---|
| Loading | `SkeletonBlock`（變體 line/card/row） | 首次載入且無快取資料時顯示；**ActivityView 必補** |
| Empty | `EmptyState` / `pt-empty` | 區分「未綁定子女」「本區無資料」 |
| Error | `ParentErrorState`（複用 `MobileErrorRetry`）| **inline + 重試**，取代純 toast；MessagesView 修「失敗落空態」 |

---

## 7. 約束與不可變式（Invariants）

1. **Rigid API**：`ParentBottomSheet`(7 caller) / `AppModal` / `ConfirmDialog` / `ParentIcon`(全 app) 只能改 template/style，**props/events/slots 不可動**（會破壞 caller 與 ~200 既有測試）。
2. **Element-Plus-free**：`src/parent` 禁靜態 `import 'element-plus'` 與 `<el-*>`（`tests/unit/parent-public-no-element-plus.test.ts` 會擋）；不用 `el-drawer`，用 `ParentBottomSheet`。
3. **TS strict**：禁 `: any`/`as any`（ESLint `no-explicit-any` error，`reportUnusedDisableDirectives` 棘輪）；`@ts-expect-error` 需 ≥3 字說明。日期用 `src/utils/format.ts` 的 `todayISO`/`dateToLocalISO`，禁 `toISOString().slice/split`。
4. **Icon**：一律 `M3Icon`（或既有 caller 經 `ParentIcon`）；裝飾性 `aria-hidden`、互動性 `aria-label`。禁 emoji 當 UI 圖示。禁引回 SVG icon。
5. **`m3-tokens.css` 禁手改**（機器生成）；改色經 source color 重生，或在 `globals.css` 後覆寫。
6. **`#3f7d48` 綠 fallback** 僅 `globals.css` 放行；其餘 `src/parent` 出現即 `parent:audit` 失敗。
7. **測試 teleport 慣例**：家長 sheet 用 `<Teleport to="body">`，測試 `global.stubs.teleport=true`，常一併 stub `ParentIcon:true`。

---

## 8. 測試與防回歸

1. **新元件**：各搭 co-located `__tests__/*.spec`（happy-dom、`tests/setup.js`、teleport stub 慣例）。`StatusPill` tone 對照、`StatTile` clickable a11y、`ParentErrorState` retry emit。
2. **觸及 view**：更新既有 view 測試（`tests/unit/parent/**` 與 `src/parent/**/__tests__/`）。
3. **Gate**（落地前全綠）：`npm run test` → `npm run typecheck`（vue-tsc strict, blocking）→ `npm run lint`（no-explicit-any, blocking）→ `npm run parent:audit`（裸 hex 紅線）→ `npm run lint:tokens`（warn）→ `npm run build`。
4. **建議**（flag，非本次必做）：把 `parent:audit` 加進 `ci.yml`（目前僅本地 gate，不擋 PR）。
5. **視覺驗證**：核心 6 頁逐頁實機/截圖；非核心 ~22 頁做冷調 surface 位移後的巡檢截圖，修明顯衝突（如童彩 tile 在 slate 上的對比）。

---

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| **平行 FE session / 共用 checkout 在 fix 分支**（21 commit 未 push、`perf-fe` worktree 活躍） | 全程在獨立 worktree `feat/parent-bento-redesign`；落地用 `git merge` 讀 live main tip（**不**用 `branch -f`+過時 SHA）；commit 前驗分支。印證記憶 `feedback_verify_branch_before_commit_shared_checkout` / `feedback_branch_f_stale_sha_orphans_parallel_main`。 |
| **全域 surface token 位移波及未重構的 ~22 頁** | accent token 保留；逐頁巡檢截圖修明顯衝突；不做結構改動。 |
| **綠底白字 a11y** | action 綠 `#006d3d`（AA）給按鈕/小字；`#0d9053` 僅大面積/裝飾。 |
| **字體在 LIFF webview** | 沿用既有 `display=block` + fallback（已落地）。 |
| **worktree node_modules** | 實作期處理（symlink 或回主 checkout 跑 gate）；記憶 `feedback_frontend_worktree_node_modules_symlink`。 |
| **動到 rigid API/錨點/生命週期 fix** | §7 列管；改版只動 template/style。 |

---

## 10. 落地階段（交付 writing-plans 細化）

- **P0 Tokens**：綠 ramp 文件化、冷調 surface 覆寫（light+dark）、spacing 7/9/11、圓角 token。跑 `parent:audit` + 視覺 sanity。
- **P1 共用元件**：`StatTile / StatusPill / SectionHeader / DashboardHero / ListCard / ParentErrorState` + 測試。
- **P2 TodayView** Bento 旗艦。
- **P3 ActivityView + FeesView**（清單/交易 + 三態補齊）。
- **P4 ContactBook + Messages + ChildProfile**（含 Messages 失敗落空態修正）。
- **P5 Layout/nav 收尾 + 非核心頁巡檢 + 全 gate 綠 + 實機驗證**。

每階段獨立可驗、可單獨 commit（Conventional Commits、繁中）。完成定義：併 local main（**未** push，push 觸發 Zeabur 前端部署由 user 裁定）+ worktree 收尾。
