# 手機端優化 — 總綱 Roadmap（破口修復軌）

- **日期**：2026-06-26
- **狀態**：roadmap 待審；Phase 1 已另立 spec（見 §5）
- **性質**：本軌 = **「破口修復」軌**——以實機可見的手機端壞點為對象。與既有 **「RWD 斷點管線」軌**（`2026-06-26-rwd-foundation-breakpoint-tokens-design.md`）為**互補兩軌**，非競爭（見 §6 兩軌定位與協調）。

---

## 1. 緣由

User 提出「優化整體手機端」，範圍涵蓋三端（家長端 LIFF / 教師 Portal / 管理端 Admin）× 四面向（版面響應式 / 觸控互動 / 效能載入 / 視覺一致性）。為避免憑空假設（系統已有 87 檔 `@media`、20 檔 `isMobile`，並非全壞），先以 **21 個 agent、134 個 finding** 的對抗式稽核摸清實況，再據此排修復路線。

## 2. 稽核方法與結果

- **方法**：Foundation（跨端基建）→ 3 端 × 4 面向 = 12 個 finder 平行讀真實程式碼 → 完整性 critic 補掃缺口 → 合成去重分級。
- **結果**：134 finding。**P0 ×1、P1 ×34、P2 ×58、P3 ×41**。
- **每個 finding 皆有 `file:line` 佐證**；本檔 §4 的主題為去重後的工作流。

### 2.1 三端總評

| 端 | 評級 | 一句話 |
|---|---|---|
| **教師 Portal** | 🔴 **差** | 老師最常在手機現場用，卻有 **4 個功能在手機上完全沒入口**（唯一 P0）、放學接送提醒在 iPhone 三條鏈全斷、多個結果表/抽屜窄機溢出 |
| **管理端 Admin** | 🟠 待加強 | 桌機導向可接受，但 `viewport-fit` 缺失害 safe-area 全失效、20 欄寬表「能捲不可用」、Element Plus 整包拖慢首屏 |
| **家長端 Parent** | 🟡 尚可 | 行動優先、有 M3 設計系統與 `dvh`/`visualViewport` 正解，但**設計系統只搭一半**、表單全手寫 14px 觸發 iOS 放大、Bento 冷改色溫打架、主 CTA/狀態色多處未過 AA |

## 3. 修復順序原則

由「最廣、最低風險、最高槓桿」往「需設計決策、大範圍」推進：
1. 先關掉**跨三端的系統性根因**（一個改動修整批）。
2. 再解**致命可用性**（P0 功能可達、安全關鍵提醒）。
3. 再做**版面深修**（需共用元件）。
4. 最後**設計系統收斂與效能**（需設計決策，逐期認可）。

## 4. 主題清單（12 個工作流，去重後）

> sev = 嚴重度；eff = 工作量（S 單檔 / M 跨數檔 / L 需設計決策或大範圍 / XL）。

| # | sev/eff | 端 | 主題 | 代表位置 |
|---|---|---|---|---|
| T1 | **P0**/L | portal | Portal 手機端 4 功能到不了 + 放學接送提醒鏈 iPhone 失效 | `PortalLayout.vue:42,219,304`、`PortalDismissalCallsView.vue:62-291` |
| T2 | P1/M | 三端 | iOS/LINE WebView 輸入框 <16px 聚焦自動放大整頁 | `parent/styles/globals.css`、`index.html:9`、`design-tokens.css:24` |
| T3 | P1/M | admin·portal | `index.html` 缺 `viewport-fit=cover` → safe-area 整批失效（根因） | `index.html:9`、`PortalLayout.vue:813-824`、`AdminSidebar.vue:504-512` |
| T4 | P1/M | portal·parent | PWA 離線 self-heal 只裝在 admin，parent/public 部署後白屏 | `parent/main.ts`、`public/main.ts`、`vite.config.js:296-317` |
| T5 | P1/L | admin·portal | 資料密集表格手機「能捲不可用」，缺共用響應式表格/卡片化 | `salary/settle/StepReview.vue:59-270`、`EmployeeView.vue:929-988` |
| T6 | P1/M | 三端 | 狀態徽章與主 CTA/文字色大面積未過 WCAG AA | `patterns.css:145-162`、`StatusPill.vue:32`、`AuditLogView.vue:670-679` |
| T7 | P2/L | parent | 家長端設計系統「只搭一半」：M3 零採用 + Bento 色溫衝突 + 多套按鈕/字級 | `globals.css:243-286`、`patterns.css:35-41`、`typography.css:21-134` |
| T8 | P2/M | portal·admin | 窄機溢出：固定 px dialog/drawer/容器 + `100vh`（缺 `dvh`） | `ContactBookEntryDrawer.vue:130-134`、`AdminLayout.vue:107,112` |
| T9 | P2/M | 三端 | 觸控目標 <44px 與巢狀/相鄰危險按鈕 | `M3IconButton.vue:64-78`、`EmployeeView.vue:946-975` |
| T10 | P2/M | parent | 對話頁三重破壞：tab bar 遮輸入 + 無 visualViewport 補償 + 不自動捲底 | `parent/router.ts:48-52`、`MessageThreadView.vue:139-178` |
| T11 | P2/L | 三端 | 首屏效能：render-blocking 字型 / EP 整包 / 過大 LCP 圖 / 過度併發請求 | `parent.html:23-25`、`LoginView.vue:184`、`ChildPhotosView.vue:33` |
| T12 | P3/S | shared·admin | shared CSS 缺 box-sizing reset + hover 卡住 + theme-color 不一致 + 無 noscript | `design-tokens.css`、`main.css:166-169`、`index.html:10` |

## 5. 分期路線圖（破口修復軌）

| Phase | 目標 | 主題 | 狀態 |
|---|---|---|---|
| **Phase 1｜共用基建 Quick Wins** | 用最少改動關掉影響最廣、跨三端的系統性破口 + 折進唯一 P0 入口 | T2、T3（根因+Portal bottom-nav）、T4、T12（除 isMobile 收斂）、T1（漢堡鍵 opener 部分） | **已立 spec**：`2026-06-26-mobile-optimization-phase1-shared-infra-design.md` |
| **Phase 2｜Portal 致命可用性 + AA** | 放學接送提醒在 iPhone 真的響；徽章/CTA 過 AA | T1（提醒鏈）、T6 | 待 spec |
| **Phase 3｜響應式版面深修** | 共用 `ResponsiveTable`/`DataCardList`；dialog·drawer 響應式；觸控目標 | T5、T8、T9 | 待 spec |
| **Phase 4｜家長端設計系統收斂 + 對話頁 + 效能** | 扶正 M3、收 Bento 色溫衝突、修對話頁、降首屏成本 | T7、T10、T11 | 待 spec |

> 每期各自獨立成 spec → plan → 實作 → 上線；逐期取得 user 認可。

## 6. 兩軌定位與協調（與 RWD 斷點管線軌）

| | RWD 斷點管線軌（既有，design+plan 已 commit、未實作） | 本軌：破口修復 |
|---|---|---|
| 本質 | 斷點 token 統一 + isMobile DRY 收斂 + 768 off-by-one | 實機可見的手機破口修復 |
| 畫面 | **明示「零變化」** | **就是要改掉壞掉的畫面** |
| 文件 | `2026-06-26-rwd-foundation-breakpoint-tokens-design.md` + `plans/2026-06-26-rwd-foundation-breakpoint-tokens.md` | 本檔 + 各 Phase spec |

**兩個碰撞點，本軌的處置**：
1. **`PortalLayout.vue`**：RWD P0 會把手刻 `isMobile` ref → `useIsMobile()` + `watch`；本軌 Phase 1 在同檔加漢堡 opener 與 `.bottom-nav` safe-area。→ **本軌只做 additive 改動**（template 加按鈕、CSS 加 safe-area），**不碰** `isMobile` ref / `checkMobile` / resize listener（那是 RWD P0 的範圍）。兩者落地順序無所謂、同檔不同區可乾淨 merge。
2. **新增 `@media`**：RWD P0 會把 `sm` 邊界 `@media` 收斂成 `@media (--to-sm)`（767.98px）。本軌 Phase 1 新增的手機 `@media`（iOS input 16px）**一律寫 `@media (max-width: 767.98px)`**（= RWD canonical `MOBILE_MAX_PX`），待 RWD P0 落地後其 sweep 會自然轉成 `--to-sm`。本軌**不自行接 postcss**（那是 RWD P0 的基建）。

## 7. 稽核佐證

完整 134 finding（含每筆 `file:line`/機制/修法/信心）原始輸出存於本 session 工作流結果；若 Phase 2/3/4 需逐筆回溯，可請 Claude 重新導出或重跑稽核 workflow。
