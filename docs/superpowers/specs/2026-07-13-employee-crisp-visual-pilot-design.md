# 員工模組視覺改版：精緻 SaaS 皮層試點（Crisp Visual Pilot）

- 日期：2026-07-13
- 狀態：已與 user 於 brainstorming 確認（視覺伴侶 mockup 兩輪：風格三選一取 B、清單頁全頁示意＋頁首統計二選一取「文字統計列」、詳情頁示意通過）
- 範圍：純前端（ivy-frontend），後端零改動、無 migration、無新依賴

## 1. 背景與目標

員工模組自 2026-07-07 起已完成四輪 UX 改版（詳情頁路由化、離職三態、手機卡片化、a11y、URL 化、第三輪體檢），功能與資訊架構已穩定。本輪為**視覺全面美化**：user 裁定員工模組作為全後台**新視覺語言的試點**，做好後再逐步推廣到其他模組（薪資、考勤、招生等）。

選定方向為「**B・精緻 SaaS 風**」：白底＋髮絲線框取代陰影、字階緊縮、outline 膠囊標籤、高資訊密度——Linear / Stripe 後台式的紀律感。主色**維持 admin 現有天藍 `#0284c7`**，不引入新 brand 色（精緻感來自紀律，不是換色）。

原則：**功能與資訊架構不動，只換視覺皮層＋微互動**。前四輪 UX 成果（篩選 chain、URL 化、離開保護、權限守衛、手機卡片…）全數保留。

## 2. 落地架構：`.crisp-surface` 試點皮層

新增 `src/assets/crisp.css`，內含兩部分，**全部 scope 在 `.crisp-surface` class 底下**：

1. **皮層 token**（自訂變數，值錨定既有 `design-tokens.css` 的 neutral 尺度）：
   - 表面／底色：頁底 `--crisp-bg: var(--neutral-50)`（#f8fafc）、卡面 `--crisp-surface: #fff`、髮絲線 `--crisp-hairline: var(--neutral-200)`（#e2e8f0）、次級分隔線 `--neutral-100`
   - 文字四階：`--crisp-text`（#0f172a）／`--crisp-text-secondary`（#475569）／`--crisp-text-muted`（#64748b）／`--crisp-text-faint`（#94a3b8）
   - pill 語意色（outline 膠囊＋色點）：success（邊 #86efac／字 #15803d／點 #22c55e）、warning（#fcd34d／#b45309／#f59e0b）、pending 橘（#fdba74／#c2410c／#f97316）、neutral（#e2e8f0／#94a3b8／#cbd5e1）
2. **Element Plus 元件覆寫**：el-table（表頭淺灰底＋11px 標籤字、行高收斂、hover 態）、el-tag→outline pill、el-card 去陰影改髮絲線、el-input／el-select 髮絲線邊框、el-dialog 頁首頁尾分隔線、el-button 次要按鈕安靜化。

**掛載點**：員工模組的兩個路由根節點——`EmployeeHubView`（涵蓋清單頁＋離職管理）與 `EmployeeDetailView`——根元素加 `crisp-surface` class。

**推廣路徑**：日後其他模組採用＝在該模組根節點加同一個 class；全站收斂時再把規則提升為全域。**不動 `main.css` / `design-tokens.css` 既有值**，試點期間其他模組零影響。

**Teleport 邊界（已知技術細節）**：el-dialog 預設就地渲染（`append-to-body` 未開），會吃到皮層；但 el-select 下拉、el-dropdown 選單、el-tooltip 等 popper 預設 teleport 到 body，**不在** `.crisp-surface` scope 內。試點期間 popper 保留 EP 原生樣式（過場性元件，視覺落差可接受）；若實測突兀，個案用 `popper-class="crisp-popper"` 補掛（crisp.css 一併定義 `.crisp-popper` 規則）。凡有 `append-to-body`／teleport 的 overlay 需要皮層時，同法自掛 class。

## 3. 各 surface 改動清單

### 3.1 清單頁（EmployeeListView）

- **頁首**：標題下加副標「全園名冊、任職資料與離職作業」；統計維持**一行文字列**（user 選定，密度優先），數字改粗體＋`font-variant-numeric: tabular-nums`；HR 待辦 chips 改 outline pill＋色點，選中態改「淺色填底＋1px 內框」（取代現行 el-tag effect dark）。
- **工具列**：搜尋框／狀態篩選／職稱篩選統一髮絲線樣式；「匯出 Excel」由 `type="success"` 綠色**降為安靜次要按鈕**（default plain），讓「＋ 新增員工」成為唯一主 CTA。
- **表格**：
  - 表頭：淺灰底（--neutral-50）＋ 11px、`letter-spacing: .4px`、faint 色標籤字
  - 「教育局職稱」「園內職務」**合併為一欄雙行**呈現（上行職稱、下行職務 muted 小字），釋放橫向空間
  - **新增「年資」欄**：由 `hire_date` 前端計算，格式「X.Y 年」；已離職或缺 `hire_date` 顯示「—」。純函式進 `src/utils/employeeDisplay.ts`（與 statusKeyOf 等同居），補單元測試（跨年／當月到職／未來日期／已離職邊界）
  - 狀態 tag 改**語意色點 pill**；**待離職補顯示預定日**（既有 `resign_date` 欄位，格式「待離職 · M/D」；缺日期則只顯示「待離職」）
  - hover：整列淺灰底＋**左緣 2px 主色條**（inset box-shadow，不佔版面）
  - 已離職列維持現行整列淡化（opacity 機制不動）
- **手機卡片（AdminListCards）**：在皮層 scope 內自動吃到 pill／字階樣式；`employeeCardColumns` 同步加年資欄。IA 不動。

### 3.2 詳情頁（EmployeeDetailView＋六 section）

- 卡片全部去陰影改髮絲線；區塊標題改 11px、`letter-spacing: 1.5px` 的安靜小標
- 內容改**定義列表雙欄網格**（標籤 11px muted 上、值 13px 下，數字 tabular-nums）
- **空值統一淡灰「未填寫」**，不留空白。⚠ 僅適用於「真空值」：權限遮罩欄位維持既有語意（遮罩薪資 null →「無檢視權限」、投保 0 →「未設定」，2026-07-07 改版定案），本輪只調整其淡灰視覺，不得改成「未填寫」措辭
- 左側錨點：目前區塊「左緣 2px 主色條＋淺藍底」；**證照到期數就地標在錨點列**（例「學歷與證照 · 1 即將到期」）
- 待辦就地行動化：薪資未設定顯示「尚未設定 → 前往補登」（連到編輯彈窗薪資 tab）；證照到期在列內以 warning pill 顯示
- 左側摘要欄（頭像／狀態 pill／關鍵欄位／操作鈕）：IA 不動，樣式套皮層

### 3.3 表單彈窗與其他

- EmployeeFormDialog（基本／薪資 tab、變更預覽）、OffboardingModal、OffboardingView：套皮層（分隔線、輸入框、按鈕、tag、表格），結構與流程零改動
- 空狀態（EmptyState）與骨架屏（TableSkeleton）：在 scope 內吃到皮層變數即可，不改元件本體

## 4. 深色模式

`html.dark .crisp-surface` 完整覆寫一套暗色值：頁底（≈#0f172a 系）、卡面（≈#1e293b）、髮絲線（≈#334155）、文字四階（slate-200 起往下）、pill 語意色改暗底適配（提高明度、降飽和）。

**機制性防坑**（07-11 報表改版教訓：`html.ivy-admin` 釘死淺色 hex 蓋過 EP dark 變數→dark 下白底白字）：皮層內**所有**顏色一律走自己的 `--crisp-*` 變數、dark 只覆寫變數值；**不得**直接引用 EP `--el-color-primary-light-N` 系列或寫死淺色 hex 於規則右值。

## 5. 明確不做（Non-goals）

- 不改任何 API／後端；不新增權限；無 migration
- 不改資訊架構與互動流程（篩選、URL 化、離開保護、權限守衛等前四輪成果全保留）
- 不動其他模組與全域樣式檔（main.css／design-tokens.css／a11y.css）既有值；新增規則只進 crisp.css
- 不引入新依賴、新字型
- 頁首統計不做「可點擊統計方塊」（已比稿淘汰，維持文字列）

## 6. 測試與驗證

- **既有兩棵測試樹全綠為底線**（`src/**/__tests__` 與 `tests/`；兩樹有同名元件測試檔，一併跑）。表格合併欄／年資欄會動到欄位斷言的測試，隨改隨修
- 新增純邏輯單元測試：年資計算（跨年／當月到職／缺 hire_date／已離職）、待離職預定日格式化
- `vue-tsc` 0 errors、ESLint 0 errors
- 瀏覽器實測（user 起 dev server 後）：清單／詳情／表單／離職管理四 surface，light＋dark 各一輪；對比度抽查 WCAG AA（尤其 faint 文字與 pill 邊框色）
- 已知限制：本環境 browser 工具無法縮到 <768 視口，手機版以 CSS 層核實＋交 user 真機驗收

## 7. 風險與緩解

| 風險 | 緩解 |
|------|------|
| EP 覆寫與既有全域規則打架（如 main.css 手機 el-dialog 95% 規則） | 皮層規則全部 scope 在 `.crisp-surface`；specificity 爭議用 `document.styleSheets` runtime 查證（07-11 教訓） |
| 表格欄位變動破壞兩樹既有測試 | 動欄位的 task 明列「grep 兩棵樹同名測試檔一併跑」 |
| dark 模式白底白字 | §4 機制性規範：只用 --crisp-* 變數，禁 EP light-N／寫死 hex |
| teleport popper 吃不到皮層 | §2 已定案：預設保留 EP 原生，突兀個案補 popper-class |
| 試點與其他模組視覺落差 | user 已知情接受（試點策略本身的代價），推廣路徑見 §2 |

## 8. 決策紀錄

1. 風格三選一（A 暖綠品牌化／B 精緻 SaaS／C 柔和層次卡片）→ **B**（user 於視覺伴侶點選＋終端確認）
2. 頁首統計二選一（文字統計列／可點擊統計方塊）→ **文字統計列**（維持現行 IA、密度優先）
3. 詳情頁 B 風格示意 → 通過，摘要欄與五區塊 IA 不動
4. 主色維持 `#0284c7`，不引入官網綠色系（品牌化方向已淘汰）
5. 落地方式：`.crisp-surface` scoped 皮層（試點可推廣、不污染全域）
