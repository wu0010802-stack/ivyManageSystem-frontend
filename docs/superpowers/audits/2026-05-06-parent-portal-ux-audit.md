# 家長端 UX/UI 健檢報告

**日期：** 2026-05-06（同日 M8 更正）
**範圍：** `ivy-frontend/src/parent/`（`/parent.html` 子應用）

> **更正（2026-05-06）：** 原 M8 「catch-all + 無 navigation guard」判斷錯誤。實際上 `src/parent/main.js:52-63` 已有完整 navigation guard（含 ensureSessionProbed 處理新 tab cookie 仍有效但 store 空的情境），`src/parent/api/index.js:92-119` 已有 401 interceptor + refresh + retry。雙層守衛已實作，僅 catch-all redirect 邏輯可優化（未登入 typo → /login 合理；已登入 typo → 也被丟去 /login 不合理，應改 redirect /home 讓 guard 自然處理）。M8 降為小調整，與「catch-all 收斂」併入 P6 但工作量改 S。
**方法：** 靜態審查 22 個 view、17 個 component、7 個 composable、3 個 store、router、styles，並交叉檢查最近 5 波改造（家長入口 2.0、polish、Soft UI Evolution、ACD 拆解、refresh token）的落地一致性。
**未做：** 真實互動截圖（家長端純 LIFF 登入，dev bypass 成本不划算）。文中關於互動體感的判斷仍以程式碼為據，但「實機點下去到底順不順」需後續實測驗證。

---

## 摘要

家長端設計系統與基礎建設高度成熟：`globals.css` 已具備完整的 Sunny Skyline token、dark mode、reduced-motion、shimmer、stagger、press-scale、pt-card 等 utility；`ParentBottomSheet` 設計到 360 行涵蓋 snap points / focus trap / keyboard mode；`useTodayStatusCache` 是 SWR + BroadcastChannel + visibility hook 的完整實作；`usePullToRefresh` 阻尼曲線、頂部判定、touchmove preventDefault、reduced-motion 全顧及。

但**設計系統的覆蓋面在「主流程末端」斷層**：MedicationForm/Detail、ContactBookDetail、EventAck、NotificationPrefs 這幾頁仍是早期 hardcoded hex + `--pt-info-link`(藍) 主按鈕的時代風格，跟 home/leaves/fees/activity 那批 token 化乾淨的頁面接不上。最近一次 brand 從綠 → 珊瑚的切換留下了 7 處 `#3f7d48` 綠 fallback 殘骸；CSS sweep 還碰巧把一條 `background: #fffbeb` 改壞成 `background: var(--neutral-0)eb`（CSS 解析失敗）。

**主軸建議：先做品牌一致性收斂 + 修 broken CSS + 修 HomeView pull-to-refresh bug，全 small 投入但見光快**；接著挑「MedicationForm 風格對齊」或「多孩家庭體驗強化」其中一條做下一個 phase。

---

## 軸別速查（粗估，部分 finding 跨軸）

| 軸 | 高 | 中 | 低 |
|---|---|---|---|
| A 視覺一致性 | H1 H3 H4 H7 | M1 M6 M12 M13 M18 M20 | L1 L4 L5 L6 L9 L14 L15 |
| B 資訊架構/導航 | — | M3 M4 M5 M8 M9 M11 | L7 L16 |
| C 主要流程 | H2 H5 H6 | M2 M7 M14 | L3 L12 L13 L17 |
| D 行動原生感 | — | M10 M16 M17 M19 | L2 L8 L10 |
| E 效能感 | — | M15 | L11 |

**合計：7 高 / 20 中 / 17 低 = 44 條**

---

## 高嚴重度（建議下一個 sprint 內處理）

### H1 · ChildProfileView 有一條已壞掉的 CSS · A 視覺
- **位置：** `src/parent/views/ChildProfileView.vue:265`
- **現況：**
  ```css
  .change-card {
    background: var(--neutral-0)eb;   /* ← 解析失敗，整條 background 規則作廢 */
    border: 1px solid #fbbf24;
  }
  ```
- **判讀：** 應為早期的 `background: #fffbeb;`（warm 黃白），sweep 自動把 `#fff` 換成 `var(--neutral-0)` 卻留下 `eb`。CSS 解析器會直接丟掉這條規則 → `.change-card` 變成預設透明，視覺上「資料有誤？」這張 warning 卡片完全沒有黃底。
- **同檔還有：** `.change-text { color: #78350f }`、`.primary-btn { background: var(--pt-warning-text-mid) }`、SEVERITY_COLOR 三組 hardcoded hex（`#fed7aa #9a3412 #fecaca #991b1b`）。整頁都沒走 token。
- **嚴重度：** HIGH（顯性 bug + 整頁脫離 design system）
- **投入：** S（半天內可完成）

### H2 · HomeView pull-to-refresh 會 throw ReferenceError · C 流程
- **位置：** `src/parent/views/HomeView.vue:69-74`
- **現況：**
  ```js
  async function pullRefresh() {
    await Promise.all([
      refreshSummary(true),
      refreshToday(true),   // ← 此函式從未在 setup() 內定義
    ])
  }
  ```
- **判讀：** `todayRef.value?.refresh()` 是正確路徑（line 65 的 refresh 函式有用），但 pullRefresh 內呼叫的 `refreshToday` 從來沒被宣告。家長在首頁實際下拉刷新會 throw、`PullToRefresh` 內部 `console.warn('refresh failed')` 然後收回 indicator — 視覺上看起來「成功」但 today status 根本沒重抓。
- **嚴重度：** HIGH（首頁主功能 silent failure）
- **投入：** S（一行修正，把 `refreshToday(true)` 改為 `todayRef.value?.refresh()`）

### H3 · ContactBookDetailView 整頁脫離 design system · A 視覺
- **位置：** `src/parent/views/ContactBookDetailView.vue:235-243`
- **現況：** primary 按鈕 `background: #4a90e2` (藍)、disabled `#aac4e2`、刪除 link `color: #d33`、cell 背景 `#f7f9fc`。整頁完全沒用 token。家長進「聯絡簿詳情」會看到一個跟 brand coral 完全不搭的藍色「送出回覆」按鈕。
- **嚴重度：** HIGH（高頻使用頁、與 brand 嚴重斷裂）
- **投入：** S

### H4 · 主按鈕誤用 `--pt-info-link`(藍) · A 視覺
- **位置：**
  - `MedicationListView.vue:120` `.new-btn`
  - `MedicationListView.vue:124` `.card.today` border
  - `MedicationDetailView.vue:166` `.upload-btn`
  - `EventAckView.vue:112` `.submit`
  - `NotificationPrefsView.vue:96` `.back`
  - `MedicationFormView.vue:375` `.submit` 二層 fallback
- **判讀：** `--pt-info-link` 是 sky-700 (#2D6F8E) 設計用途為「資訊類連結色」，被誤用成「主要動作」按鈕底色。家長點「+ 新增用藥單」「上傳照片」「簽收」「儲存通知偏好」會看到藍色 CTA，跟首頁/請假/才藝/繳費的 coral CTA 不一致。
- **嚴重度：** HIGH（多個 high-stakes 動作的視覺品牌斷裂）
- **投入：** S

### H5 · ContactBookDetailView 刪除回覆無確認 · C 流程
- **位置：** `src/parent/views/ContactBookDetailView.vue:84-91`
- **現況：** `removeReply(replyId)` 直接呼叫 API 刪除，UI 只一個 `<button class="link-btn">刪除</button>` 在 meta 裡面。
- **判讀：** 同 app 其他破壞性操作（刪附件、取消請假、登出、撤回訊息、刪用藥照片）都有 `ConfirmDialog`，唯獨這裡沒守衛，誤點即刪。
- **嚴重度：** HIGH（破壞性操作守衛缺失）
- **投入：** S

### H6 · MedicationFormView 風格脫離家長 App 主流程 · A/C 軸
- **位置：** `src/parent/views/MedicationFormView.vue` 整檔
- **現況：** 直接 raw `<input>`/`<select>`/`<textarea>` 排在頁面上、沒卡片包裝、沒 ChildSelector、沒 Hero、沒 BottomSheet。其他主流程（請假、活動報名、訊息）已全部抽 sub-component + 卡片 + Hero + Sheet 化。
- **嚴重度：** HIGH（雖無 bug，但跟同類流程 UX 落差最大）
- **投入：** M（半天到一天，要拆 components/home/ 風格的子元件）

### H7 · CSS dark mode 區塊雙寫 · A 視覺（維護債）
- **位置：** `src/parent/styles/globals.css:211-296` (`@media prefers-color-scheme:dark`) 與 297-373 (`[data-theme='dark']`)
- **現況：** 兩個區塊定義同一組 token，內容幾乎一字不差。新增/修改任何一個 token 都需同步兩處，維護成本翻倍且容易漂移。
- **嚴重度：** HIGH（隱性債，下次新增 token 必中地雷）
- **投入：** S（合併用 CSS selector group：`@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {...} } :root[data-theme='dark'] {...}` 共用 mixin 或抽成單獨 `dark-tokens.css` 用 `@import` 兩次）

---

## 中嚴重度

### M1 · `#3f7d48` 綠 fallback 散落 7 處 · A
- `toast.js:39` `bg: 'var(--brand-primary, #3f7d48)'`
- `ConfirmDialog.vue:133`、`AppHeader.vue:80`、`PullToRefresh.vue:165`、`LeavesView.vue:406`、`globals.css:384`（focus outline）
- 品牌已切到 coral，這些 fallback 永遠不會觸發（`--brand-primary` 一定有定義），但若某天有人錯刪 token，落地就是綠 — 跟頁面其他元素混色。建議全清成 fallback 用 coral 或拿掉。
- **投入：** S

### M2 · ActivityView Hero 「即將開始」恆顯示 0 · C
- `ActivityView.vue:77` `const upcomingCount = computed(() => 0)` 寫死。
- 註解寫「MVP：後端 course response 無 start_date」，但 hero 顯示「0 場即將開始」對家長傳達訊息錯誤。要嘛接後端欄位，要嘛把 hero 該欄位先拿掉。
- **投入：** S（拿掉）/ M（後端補欄位）

### M3 · FeesView Hero 用「全家庭加總」、ChildSelector 切換 Hero 不變 · B
- `FeesView.vue:53-65` Hero 的 unpaid/overdue/nearestDue 全來自 `summary.totals`（家庭級），但 ChildSelector 切換只影響下方 `records` 列表。
- 家長切換到「小明」期望看到「小明的應繳」，現在看到的是「兩個小孩加總」，違反直覺。
- **修法：** 切 ChildSelector 時 Hero 也跟著改顯該小孩的 totals（已有 `myTotals` computed，直接餵）。
- **投入：** S

### M4 · ActivityView Tab=「可報名課程」時 ChildSelector 沒功能但仍顯示 · B
- 報名是先選課再選學生（in sheet），這時上方 ChildSelector 切換不影響任何顯示內容。
- **修法：** Tab=new 時隱藏 ChildSelector，或把 sheet 內的學生選擇前置到外面。
- **投入：** S

### M5 · HomeView 區塊順序：ChildrenStrip 在 TodoCenter 之後 · B
- 多孩家庭家長想切小孩看待辦，目前要先滑過 todo 才看到 ChildrenStrip。
- **修法：** 順序改 Hero → PushCta → ChildrenStrip → TodayStatus → TodoCenter → QuickActions；或把 ChildSelector 拉到 AppHeader actions slot 全站化（已有 `<slot name="actions" />` 預留）。
- **投入：** S–M

### M6 · 大量 hardcoded hex 沒走 token · A
彙整：
- `ChildProfileView.vue` SEVERITY_COLOR `#fed7aa #9a3412 #fecaca #991b1b`、`.change-card` `#fbbf24 #78350f`
- `CalendarView.vue` CATEGORY_META `#0e8e6f #7c3aed`
- `ContactBookView.vue` `#cfe6ff #f0f4f8 #ff5252`
- `MedicationListView.vue / MedicationDetailView.vue` status.correction `#ede4ff #5a3da5`
- `EventsView.vue` ack badge `#991b1b`
- `AttendanceView.vue:96` 遲到色 `#fff8d6 #7a6500`
- `BindView.vue:93` `linear-gradient(... #5fa46a 100%)` (coral → 綠混色)
- `ConnectionBanner.vue:80,83` fallback `#fef3c7 #b45309 #dbeafe #1d4ed8`
- **投入：** M（全表彙整 + 在 globals.css 補對應語意 token + sweep）

### M7 · AttendanceView 月份切換體驗弱 · C
- 用 `‹ ›` 字元當箭頭、無 ARIA label、無「跳到今天」、無年月直選。
- 老師端 portal 的考勤頁已經做了「sticky 月份條 + 今日跳轉」(memory project_attendance / commit `eef13afb`)，家長端沒對齊。
- **投入：** M

### ~~M8 · catch-all + 無 navigation guard · B~~ （更正：誤判）
- ~~原描述：「目前完全沒 navigation guard」~~
- **實況：** `main.js:52-63` 已有 navigation guard（含 boot probe），`api/index.js:92-119` 有 401 interceptor + refresh。雙層守衛已實作。
- **保留事項：** catch-all `redirect: '/login'` 對「已登入但打錯 URL」的使用者仍會丟到登入頁；建議改 redirect `/home`，guard 自然處理未登入轉 login。降為 S 投入小調整。

### M9 · 「請假」深層頁 tab active 為「更多」· B
- `router.js` 把 `/leaves /fees /events /medications /activity /calendar /contact-book` 全部 `meta.tab = 'more'` 或 `'home'`。
- 家長從首頁 QuickActions 點「請假」→ 進入頁面「更多」tab 高亮 — 違反「我從首頁來」直覺。
- **修法：** 「請假」「用藥」「才藝」這類首頁 QuickAction 直達頁，meta.tab 應動態跟使用者來源；或維持當前 tab not changed（不切高亮）。
- **投入：** S（router.js 加判斷或乾脆 meta.tab 不設）

### M10 · MessageThreadView 訊息體驗距離原生 IM 還遠 · C/D
- `messages computed` 每次 reactive 觸發都 `[...].reverse()`，100+ 筆會 reactivity 連鎖
- 「載入更早訊息」是按鈕，無 infinite scroll up
- 無「滾到底部」「typing indicator」「已讀回執」「複製/引用回覆」
- thread height 用 `calc(100dvh - 64px)` 假設 tabbar=64px 但 safe-area 會變
- **投入：** L（單獨一個 phase 規模）

### M11 · 多孩家庭 ChildSelector 隱形 · B
- `ChildSelector.vue:14` `v-if="items.length > 1"` — 單孩家庭看不到任何 indicator。
- 家長加綁第二個小孩後第一次進首頁，沒人提示「上下兩張卡是兩個小孩」。
- 也沒有「邀請綁定第二個小孩」CTA 在這裡（要進「更多」→ 加綁）。
- **投入：** S–M

### M12 · ChildSelector chip 用 brand-primary 全填 · A
- `ChildSelector.vue:56-60` `.chip.active` 整個 coral 全填，跟 todo / quick action 用 `--brand-primary-soft` (淡 coral) 不一致 — 整頁兩種 brand 強度。
- **投入：** S

### M13 · CalendarView holiday 用 calendar icon · A
- `CalendarView.vue:14-22` 註解寫「holiday 暫無沙灘 icon，先以 calendar 替代」。導致 event/holiday 在列表中視覺辨識度低。
- ParentIcon 加一個 `holiday` icon 或 `umbrella` / `palm-tree`。
- **投入：** S

### M14 · EventsView 多小孩待簽要重複進 modal · C
- `openAck` 一次處理一個小孩，多小孩待簽要重複進。
- 「快速簽閱」按鈕已顯示 `(N 位待簽)`，但點下去只簽一個。
- **修法：** modal 內提供「全部子女一鍵簽閱」（共用 signature_name）。
- **投入：** M

### M15 · EventAckView listEvents() 抓全部再 find · E
- `EventAckView.vue:27-30` 為了取單一 event，整批 `listEvents()` 再 array.find。家長家庭有大量 events 時浪費頻寬。
- **修法：** 後端加 `GET /api/parent/events/:id` 或前端 store cache 之間互通。
- **投入：** S（前端 cache）/ M（後端新增端點）

### M16 · ContactBookDetailView 圖片用 `<a target="_blank">` 開新分頁 · D
- 行動裝置 LIFF webview 內開新分頁體驗差（不一定能返回）。
- **修法：** 內建 lightbox / pinch-zoom viewer。
- **投入：** M

### M17 · CalendarView 「days」select 偏好不記住 · D
- 每次進都預設 7 天，不存 preference。
- **投入：** S（localStorage 一行）

### M18 · ContactBookView「歷史聯絡簿」title 用 inline style margin-top · A
- 顯示一條 inline `style="margin-top:24px"` 在 template — 跟其他 section title 規格不一致。
- **投入：** XS

### M19 · useChildSelection 用 sessionStorage · D
- `STORAGE_KEY = 'parent_selected_student_id_v1'` 存 sessionStorage — 關閉視窗 / LIFF 重啟丟失。家長每次進 LINE 重選一次。
- localStorage 較合適（家長「主要關注」的小孩通常固定）。
- **投入：** S

### M20 · TodayStatusCards chip 過多時換行 · A
- attendance + leave + medication + dismissal + 4 個 chip 在小螢幕（<360px）會多次換行；缺優先序設計。
- 「不舒服 mood」「體溫高」應強調但目前同色階。
- **投入：** S–M

---

## 低嚴重度（背景修補）

### L1 · HomeHero greeting 18-5 都「晚安」覆蓋 11 小時 · A
22:00 後可改「夜深了，記得早點休息」；目前 `< 5` 才有此分支但 5–4 之間反而沒有。

### L2 · AttendanceView statusColor 鍵用中文 · D
`{ '出席': ..., '缺席': ... }` — 將來 i18n 必砍掉重寫。

### L3 · CalendarView dayLabel 只標「今日/明日」· C
第 3 天起直接顯日期，缺「後天」「3 天後」漸進語意。

### L4 · AnnouncementsView preview 截 60 字不分中英 · A
中文 60 字可能 90 字寬，英文 60 字偏短。建議 graphmenecount 或固定 width + line-clamp。

### L5 · MessagesView avatar 取 `name.slice(0,1)` · A
英文老師 "Mr. Smith" → 'M'，無辨識度。建議改 `firstChar(name)` 或上彩色 hash。

### L6 · MoreView「加綁子女」tint=message · A
icon=plus + tint=message(綠) 跟「加新項目」語意不對；建議改 `tint=brand` 或新增 `tint=add`。

### L7 · NotificationPrefsView `.back` 與 AppHeader showBack 重複 · B
router 沒設 showBack=true 所以 AppHeader 不顯返回，這頁自己畫一個藍色「← 返回」— 可改 router meta + 移除 inline back。

### L8 · ConnectionBanner retry 用 `window.location.reload()` · D
暴力 reload，會丟失 form state。建議 emit `retry` 給上層 / 觸發 axios retry queue。

### L9 · MedicationFormView labelled-by 用寫死 ID · A
`labelled-by="allergy-modal-title"` 寫死 — 同 page 多 modal 同 ID 衝突風險（這頁目前 OK，但 pattern 不安全）。

### L10 · sticky AppHeader/ConnectionBanner offset 計算 · D
`top: calc(var(--header-height, 52px) + env(safe-area-inset-top, 0))` — `--header-height` 從未在 token 內定義，永遠落到 fallback 52px，但 AppHeader 實際是 `min-height:52px + padding-top: env(safe-area-inset-top)`，iOS notch 機種 banner 可能蓋到 header 下緣。

### L11 · PullToRefresh `.ptr-content` `will-change: transform` 永久 · E
應該只在 dragging/refreshing 時開啟 will-change，閒置時拿掉以省 GPU layer。

### L12 · ChildProfileView goMessages 寫 sessionStorage prefill 但 MessagesView 不讀 · C
死碼。要嘛實作 prefill，要嘛拿掉註解+程式碼。

### L13 · NotificationPrefsView checkbox 預設值規則隱晦 · C
`prefs[ev] !== false` — null/undefined 都當 true。後端應回明確 boolean。

### L14 · `.pt-stagger` 子層延遲只到 nth-child(6) · A
第 7 個之後 stagger 延遲固定 200ms（無遞增）。todo 超過 6 條時動畫斷層。

### L15 · ConnectionBanner 註解與實作不一致 · A（文檔老化）
註解寫「橘色 / 淺灰」但實際 fallback 是 `#fef3c7 #dbeafe`(暖黃 / 淺藍)。

### L16 · MoreView 缺「APP 版本」「服務條款」「隱私政策」· B
通常行動 App 在「更多」會有這三項；缺失時家長想看版本 / 條款無入口。

### L17 · MedicationDetailView 沒「停用此用藥單」· C
家長提交了用藥單後若孩子不需吃藥（例：當天好了），無法通知老師「跳過」— 必須走訊息。

---

## 推薦下一個 phase（請挑 1–2）

每個 phase 都假設要走完整 brainstorming → writing-plans → executing-plans 流程；以下只列範圍與粗估投入。

### P1 · 品牌一致性收斂 + bug 修補（建議優先做）
- 範圍：H1（修 broken CSS）+ H2（修 pull-to-refresh）+ H3（ContactBookDetail 改 token）+ H4（主按鈕改 brand）+ H5（補 ConfirmDialog）+ H7（合併 dark mode 區塊）+ M1/M6（清 fallback / 補 token）+ L4/L6/L9/L14/L15
- 投入：S × 多 = 約 1.5–2 天
- 風險：低；無功能改動，純視覺 + 一個 silent bug
- 輸出：design system 完整覆蓋 22 個 view + dark mode 維護債清掉

### P2 · 多孩家庭體驗強化
- 範圍：M3（FeesView Hero 對齊 ChildSelector）+ M4（ActivityView Tab=new 隱藏）+ M5（ChildrenStrip 順序）+ M11（單孩 CTA）+ M12（chip 用 soft）+ M14（EventsView 一鍵全簽）+ M19（localStorage 偏好）+ ChildSelector 加頭貼識別
- 投入：M × 多 = 約 2–3 天
- 風險：中；FeesView Hero / ActivityView Tab IA 改動可能要先跟業主對齊

### P3 · MedicationForm 對齊主流程風格
- 範圍：H6（拆 sub-components） + 在 BottomSheet 化 + 加 ChildSelector + 用 LeaveForm pattern
- 投入：M = 約 2–3 天
- 風險：低；單頁範圍

### P4 · 訊息體驗升級（完整 IM）
- 範圍：M10 全部子項 + 已讀回執 + typing + 複製/引用
- 投入：L = 約 5–7 天（含後端配合 typing + read receipt API）
- 風險：高；需後端配合 + e2e 測試 + Service Worker push 整合

### P5 · 行事曆 / 聯絡簿圖片體驗
- 範圍：M13（holiday icon）+ M16（lightbox）+ M17（preference 記憶）+ CalendarView 月曆視圖切換
- 投入：M = 約 2–3 天

### P6 · 路由 / 認證守衛強化（隱性債）
- 範圍：M8（auth guard）+ M9（深層頁 tab active 邏輯）+ catch-all 收斂
- 投入：S–M = 約 1 天
- 適合跟 P1 合併執行（同樣低風險、影響全面）

---

## 我的建議

**P1 + P6 合併做為下一個 phase（總 2–3 天，全 small/medium 投入）**，理由：
1. 兩者都是「修補」性質，無功能爭議，做完家長端 design system 覆蓋率與健壯度立刻拉滿
2. P1 的 H1/H2/H5 是有實際使用者影響的 bug，不是單純 polish
3. 做完後 P2/P3/P4/P5 任挑一個都站在乾淨的 baseline 上
4. P3 雖然單頁但本質上跟 P2 有重疊（多孩 + ChildSelector），建議放在 P2 之後合做

如果你想直接挑「使用者最有感」的，**P2 多孩體驗** 影響面最大但需要 IA 對齊；**P3 用藥單** 改善最 visible 但只服務有用藥小孩的家庭。

請選 P1+P6（推薦）/ P2 / P3 / P4 / P5 / 其他組合，我會以選定範圍重新進 brainstorming → 寫 spec → writing-plans。
