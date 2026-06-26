# 手機端優化 Phase 1 — 共用基建 Quick Wins

- **日期**：2026-06-26
- **狀態**：設計待審
- **總綱**：`2026-06-26-mobile-optimization-roadmap.md`（破口修復軌；本檔為其 Phase 1）
- **互補軌**：`2026-06-26-rwd-foundation-breakpoint-tokens-design.md`（RWD 斷點管線軌，見 §4 協調）

---

## 1. 目標與範圍

用**最少、最低風險**的改動，關掉影響最廣、跨三端的系統性手機破口，並折進唯一 P0 的功能可達性。所有改動**限定在共用基建層 + 單一 Portal layout 入口**，不重設計任何頁面、不碰業務邏輯。

涵蓋主題（總綱編號）：**T2、T3（根因+Portal bottom-nav）、T4、T12（除 isMobile 收斂）、T1（漢堡鍵 opener 部分）**。

### 非目標（明確排除，留後續期）
- T1 放學接送提醒鏈（AudioContext/WS/推播）→ **Phase 2**。
- T6 WCAG AA 顏色（含 `.pt-action-btn` `#0d9053`）→ **Phase 2**。
- T5 表格卡片化、T8 dialog/drawer 響應式、T9 觸控目標 → **Phase 3**。
- T7/T10/T11 家長設計系統、對話頁、效能 → **Phase 4**。
- **isMobile composable 收斂、斷點 token、postcss custom-media → RWD 斷點管線軌（本軌不碰）**。
- T3 的 admin sidebar / batch-toolbar safe-area inset 補丁（per-page）→ 隨 Phase 3 各頁深修時順手補；Phase 1 只做 `index.html` 根因 + Portal bottom-nav（與漢堡鍵同檔同批）。

---

## 2. 設計：7 個改動

> 每處皆已讀真實程式碼核實「現況」。

### C1 — `index.html` 補 `viewport-fit=cover`、修 `theme-color`、加 `<noscript>`（T3 根因 + T12）
- **現況**（`index.html:9-10`）：`<meta name="viewport" content="width=device-width, initial-scale=1.0">`（缺 `viewport-fit=cover`）、`theme-color` = 舊綠 `#3f7d48`；無 `<noscript>`。`parent.html`/`public.html` 兩者皆已對齊 `viewport-fit=cover` + `#0d9053`。
- **改動**：
  1. viewport 末加 `, viewport-fit=cover`。
  2. `theme-color` 改為 admin 品牌色 **`#4f46e5`**（= `design-tokens.css:178` `--brand-primary` admin indigo；`index.html` 為 admin+portal 共用 entry，靜態取 admin 主色。動態 per-entry 著色留後期）。
  3. `<body>` 內加 `<noscript>` fallback（簡短中文提示 + 不可用說明）。
- **為什麼**：iOS 規則下無 `viewport-fit=cover` 時 `env(safe-area-inset-*)` **一律解析為 0**。`index.html` 同時承載 admin 與 Portal（`PortalLayout`），故 `main.css`/`PortalLayout`/`TeacherBottomSheet` 既有的所有 safe-area 規則在此 entry 下**補了等於沒補**。改這一行 → 整批 env() 規則在 iPhone 瀏海機 / PWA standalone 立即生效。
- **風險**：極低。桌機/無安全區裝置 `env()` 回 0，無回退。

### C2 — iOS 輸入框 16px 保底（T2，三端最普遍痛點）
- **現況**：家長端手寫表單 14–15px（`MessageComposer.vue:124`、`LeaveForm.vue:153-163` 等），已 16px 的 `M3TextField` 零使用；Portal/Admin 的 `el-input` 預設 14px。iOS Safari / LINE LIFF WebView 對 `font-size<16px` 的 `input/textarea/select` 聚焦時自動放大整頁且不縮回。
- **改動**：
  1. **家長端** `src/parent/styles/globals.css` 加全域保底：`input, textarea, select { font-size: 16px; }`（視覺嫌大用 `line-height` 壓，不動字重）。
  2. **Portal/Admin** `src/assets/main.css` 加：
     ```css
     @media (max-width: 767.98px) {
       .el-input__inner, .el-textarea__inner, .el-select__wrapper input { font-size: 16px; }
     }
     ```
     （只手機放大，桌機維持 14px 密度；`767.98px` = RWD canonical `MOBILE_MAX_PX`，見 §4）。
- **為什麼**：消除「每次點欄位畫面就放大、版面位移、送出鍵被擠出」，遍及所有送出型流程。`LoginView` 既有特例已驗證此手法有效。
- **不可**用 `maximum-scale=1` 關縮放（傷無障礙）。
- **風險**：低。桌機不受影響；手機字稍大屬預期改善。

### C3 — 全域 `box-sizing: border-box` reset（T12）
- **現況**：四份全域 CSS 皆**無** `*{box-sizing:border-box}`（已確認），box-sizing 僅散在約 20 個元件。`design-tokens.css` 被 **admin/parent/public 三端 entry 皆 import**。
- **改動**：`src/assets/design-tokens.css` 最前面（`:root` 之前）加：
  ```css
  *, *::before, *::after { box-sizing: border-box; }
  ```
- **為什麼**：消除窄機含 padding 的全寬卡片/輸入框 content-box 撐破容器產生的橫向捲動。一次跨三端生效。
- **風險**：中低（本 Phase 最需驗證項）。少數元件可能原本靠 content-box 算寬 → build 後跑三端視覺回歸（含家長端三測試樹）確認無破版；如發現個案，該元件局部 `box-sizing:content-box` 還原。

### C4 — `.el-card:hover` 觸控守衛（T12）
- **現況**（`src/assets/main.css:166-169`）：`.el-card:hover { transform: translateY(-2px); ... }` 無 hover 能力守衛。
- **改動**：包進 `@media (hover: hover) and (pointer: fine) { ... }`。
- **為什麼**：觸控裝置點過卡片後 `:hover` 卡在抬起狀態（手機無真正 hover）。
- **風險**：極低。

### C5 — chunk self-heal 三端統一（T4）
- **現況**：self-heal（偵測 ChunkLoadError → 清 SW+caches → reload，`sessionStorage` flag 防迴圈）**只在** `src/main.ts:7-37`；`src/parent/main.ts` 與 `src/public/main.ts` **皆無**（已逐檔確認）。三端路由全動態 import，部署後 chunk hash 變、舊 SW 命中死 chunk → parent/public 直接白屏無法自救。
- **改動**：
  1. 抽 `src/main.ts:7-37` 邏輯成 `src/utils/chunkSelfHeal.ts`，export：
     - `looksLikeChunkLoadError(message: string): boolean`（純函式，可單測）
     - `installChunkSelfHeal(): void`（掛 `error` / `unhandledrejection` 兩個 listener）
  2. `src/main.ts` 移除 inline 版、改呼叫 `installChunkSelfHeal()`（行為不變）。
  3. `src/parent/main.ts`、`src/public/main.ts` 開頭各 `installChunkSelfHeal()` 一次。
- **風險**：低。admin 行為等價（同一份邏輯）；新 util 有單元測試。

### C6 — PWA 離線收斂（T4）
- **現況**（`vite.config.js:296-317`）：`navigateFallbackDenylist: [/^\/parent\.html/, /^\/parent\//]`（**未**排除 `/public`）；`globPatterns` 只 precache `index.html`/`main-*`（**未含** `parent.html`/`public.html`）。→ 家長/public 離線或弱網重整報名頁被餵 admin 外殼。
- **改動**：
  1. `navigateFallbackDenylist` 加 `/^\/public\.html/`、`/^\/public\//`。
  2. `globPatterns` 加 `'parent.html'`、`'public.html'`（app-shell HTML 精快取；其 app chunk 已由既有 `/assets/*` runtimeCaching StaleWhileRevalidate 覆蓋，無需額外 glob）。
- **為什麼**：家長端是 100% LIFF 弱網受眾、public 是招生收入入口頁，卻拿到最差離線保障。
- **風險**：低。需 build 後 DevTools offline 驗 parent/public 可離線開啟、不被導向 admin 外殼。

### C7 — P0：Portal 漢堡鍵 opener + bottom-nav safe-area（T1 opener 部分 + T3）
- **現況**（`PortalLayout.vue`）：手機側欄 `el-aside`（:304）靠 `sidebarOpen`（:42）切換，overlay（:302 `@click="closeSidebar"`）、`.sidebar-open`/`.sidebar-hidden` class、`closeSidebar`（:218）、`@select="closeSidebar"`（:316，點選單即關）**都已就緒**——但全檔 `sidebarOpen` **只被設為 false**（:46 桌機、:219 closeSidebar），header（:475-511 `.header-left`）**無漢堡鍵** → 加班/補打卡/薪資/學校行事曆四個只在側欄選單的功能，在任何手機路徑都**沒有入口**（唯一 P0）。另 `.bottom-nav`（:813-824）`height:60px; bottom:0` 無 safe-area padding。
- **改動**（**additive only**，見 §4 協調）：
  1. `.header-left`（`<h3>` 前）加一個 `v-if="isMobile"` 的漢堡 `<button>`，`@click="sidebarOpen = true"`，命中區 ≥44×44px，`aria-label="開啟選單"`、`aria-expanded` 綁 `sidebarOpen`、`aria-controls` 指向側欄。沿用 Element Plus icon（如 `<Fold/>`/`<Menu/>`）。
  2. `.bottom-nav` 加 `padding-bottom: env(safe-area-inset-bottom);` 與 `height: calc(60px + env(safe-area-inset-bottom));`；同步把 `.psp-fab`（:~964 `bottom:76px`）改 `bottom: calc(76px + env(safe-area-inset-bottom))`、並確認 `el-main` 內容底部留白清過加高後的底欄（如有 padding-bottom 一併加 env()）。
- **為什麼**：opener 一加，既有側欄機制（overlay/動畫/點選即關）即恢復 → 四功能手機可達；bottom-nav safe-area 讓 iPhone home indicator 不再壓住底部 5 個 tab（需與 C1 同時生效）。
- **風險**：低。純 additive；不動 `isMobile`/`checkMobile`/resize（RWD P0 範圍）。

---

## 3. 測試策略

| 改動 | 驗證 |
|---|---|
| C5 chunkSelfHeal | **TDD 純函式**：`src/utils/__tests__/chunkSelfHeal.spec.ts` — `looksLikeChunkLoadError` 命中 5 種訊息樣式、拒絕無關訊息；`installChunkSelfHeal` 以 mock `window`/`sessionStorage` 驗 listener 掛載 + flag 防迴圈 |
| C7 漢堡鍵 | `PortalLayout` 元件測試：手機（mock `isMobile=true`）渲染漢堡鍵、`click` → `sidebarOpen=true`、`.sidebar-open` class 出現；桌機不渲染漢堡鍵 |
| C1/C2/C3/C4/C6 | 偏 CSS/HTML/build：① `npm run typecheck` + `npm run build` 必過、② build 後 grep dist 確認 PWA denylist/globPatterns 生效、③ DevTools/Playwright device emulation（iPhone 視窗）截圖驗：safe-area 底欄不被壓、輸入聚焦不放大、box-sizing 無橫向溢出、offline 可開 parent/public |
| 全體回歸 | `npm run test`（**含家長端三測試樹** `src/parent`、`tests/unit/parent`、`tests/parent`，依 sibling-sweep 慣例）全綠 |

---

## 4. 兩軌協調（與 RWD 斷點管線軌）

1. **`PortalLayout.vue`**：本 Phase C7 **只做 additive**（template 加漢堡鍵、CSS 加 bottom-nav safe-area），**不碰** `isMobile` ref / `checkMobile` / resize listener（:41-46,181,213）——那是 RWD P0 的重構範圍。兩軌同檔不同區，落地先後皆可乾淨 merge。
2. **新增 `@media`**：C2 的手機 `@media` **寫死 `max-width: 767.98px`**（= RWD `MOBILE_MAX_PX`），不自行接 postcss custom-media（那是 RWD P0 基建）。待 RWD P0 落地，其 sweep 會把這條一併轉成 `@media (--to-sm)`。
3. **互不阻塞**：兩軌內容幾乎 disjoint，可平行進行；本 Phase 不依賴 RWD P0 先落地。

---

## 5. 風險與緩解

| 風險 | 緩解 |
|---|---|
| C3 全域 box-sizing 改動波及既有靠 content-box 的元件 | build + 三端視覺回歸（含家長三測試樹）；個案局部還原 content-box |
| C1 theme-color 在 portal 路徑下與 portal 主色不符（共用 entry 取了 admin indigo） | 可接受：靜態值僅影響 app 載入前的瀏覽器 chrome 著色；動態 per-entry 著色為後期 polish |
| C6 globPatterns 改動讓 SW install 變重 | 只加 2 個 HTML（app chunk 走既有 runtime cache）；build 後驗 precache manifest 大小 |
| C7 bottom-nav 加高後內容/FAB 被遮 | 同批調整 `.psp-fab` 與 `el-main` 底部留白並截圖驗證 |
| 共用 main 多 session 並行 | commit 前 `git add` **只加本任務檔**、不 `-A`；遇鎖先確認無 active git 程序 |

## 6. 交付定義（DoD）

- C1–C7 落地；`chunkSelfHeal` 單元測試 + `PortalLayout` 漢堡鍵測試綠。
- `npm run typecheck` / `npm run test` / `npm run build` 全綠（含家長三測試樹）。
- DevTools iPhone emulation 截圖佐證：safe-area 生效、輸入不放大、無橫向溢出、parent/public 可離線開。
- 視覺回歸：除「手機輸入字級變 16px」與「安全區留白」外無非預期變化。
- commit 分開、Conventional Commits、繁中訊息、`Co-Authored-By` trailer。
- 收尾依 workspace DoD：push + CI 綠（後端不涉及，僅前端）。

## 7. Commit 切分（建議）

1. `fix(mobile): index.html 補 viewport-fit=cover + theme-color + noscript`（C1）
2. `fix(mobile): iOS 輸入框 16px 保底消除聚焦放大`（C2）
3. `fix(mobile): 全域 box-sizing reset + el-card hover 觸控守衛`（C3+C4）
4. `refactor(pwa): chunk self-heal 抽共用 util 三端統一`（C5）
5. `fix(pwa): 離線 fallback 排除 /public + 精快取 parent/public app-shell`（C6）
6. `fix(portal): 手機漢堡鍵恢復側欄功能可達 + bottom-nav safe-area`（C7，解 P0）
