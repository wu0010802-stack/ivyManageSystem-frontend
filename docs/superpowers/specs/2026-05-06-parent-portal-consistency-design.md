# 家長端一致性與守衛強化 設計文件

**日期：** 2026-05-06
**Slice：** P1（品牌一致性 + bug 修補）+ P6（路由收斂）合併
**依據：** [audits/2026-05-06-parent-portal-ux-audit.md](../audits/2026-05-06-parent-portal-ux-audit.md)
**前置決策：** A（深層頁不持續高亮 tab）/ c（路由 + axios 雙層守衛 — 已存在，補 catch-all）/ X（單支 branch、多 atomic commits、單一 PR）

---

## 1 · 目的

把家長端 design system 的覆蓋面從「主流程乾淨、末端斷層」拉滿，並修掉 audit 列出的兩條 silent bug（H1/H2）與一條破壞性操作守衛缺失（H5）。同時清掉品牌切換（綠 → 珊瑚）的殘骸與 dark mode 雙寫的維護債，讓接下來的多孩體驗 / 用藥單對齊 / 訊息升級三個 phase 站在乾淨 baseline 上。

**非目標：** 不重排 IA、不改 router 整體結構、不引入 stack-per-tab navigation、不調整任何 view 的功能或資料流。本 slice 只動「視覺 token、CSS 結構、router meta、catch-all 行為、ConfirmDialog 補位、單行 bug 修正」。

---

## 2 · 範圍清單

### In（直接動的 finding）

| audit ID | 一句話 | 投入 |
|---|---|---|
| H1 | 修 ChildProfileView `var(--neutral-0)eb` broken CSS + 整頁 SEVERITY_COLOR / change-card 改走 token | S |
| H2 | 修 HomeView pullRefresh 內 `refreshToday(true)` undefined → 改 `todayRef.value?.refresh()` | XS |
| H3 | ContactBookDetailView 整頁從 hardcoded hex 改走 token（primary/disabled/danger/cell bg 全清） | S |
| H4 | 7 處主按鈕由 `--pt-info-link` 改 `--brand-primary` | S |
| H5 | ContactBookDetailView 刪除回覆補 `ConfirmDialog` | XS |
| H7 | dark mode 雙寫合併：useTheme 在 system 模式下也明確設 `data-theme`，globals.css 只留單一 `[data-theme='dark']` 區塊 | S |
| M1 | 7 處 `var(--brand-primary, #3f7d48)` 綠 fallback → 改 `var(--brand-primary, #FF8B8B)` coral | XS |
| M6 | hardcoded hex sweep：補必要 token + 全頁取代 | M |
| M9 | 8 條深層頁 router 移除 `meta.tab` | XS |
| catch-all | redirect 由 `/login` 改 `/home`（auth guard 自然處理未登入） | XS |
| L4 | AnnouncementsView preview 改用 line-clamp 取代字數截斷 | XS |
| L6 | MoreView「加綁子女」tint 由 `message`(綠) 改 `brand` 或新增 `add` tint | XS |
| L9 | MedicationFormView modal id 由寫死改 `useId()`（同 page 多 modal 安全） | XS |
| L14 | `.pt-stagger` 延遲擴充至 nth-child(8)，超過後落到固定 200ms | XS |
| L15 | ConnectionBanner 註解修正（「橘色 / 淺灰」→「暖黃 / 淺藍」） | XS |

### Out（明確不在本 slice）

- **H6** MedicationFormView 風格對齊（拆 sub-components / BottomSheet 化）→ 留給 P3
- M2/M3/M4/M5/M7/M10/M11/M12/M13/M14/M15/M16/M17/M19/M20、L1/L2/L3/L5/L7/L8/L10/L11/L12/L13/L16/L17 — 留給 P2/P3/P4/P5
- 任何後端改動（含 events `/by-id` 端點 M15）

---

## 3 · 設計決策（含 rationale）

### 3.1 · 深層頁 tab active：方案 A 拿掉 `meta.tab`

**抉擇：** A（拿掉）vs B（依來源動態高亮）vs C（維持）

**選 A 理由：**
- B 需在 router beforeEach 維護 originTab 狀態 + 處理 deep link / 重新整理 / 直接打開等邊界情境，工作量遠超 polish 級
- 真實業界 mobile native app 的「tab 持續高亮」依賴 stack-per-tab navigation；vue-router hash mode 沒有這個能力，硬模擬會留下 edge cases
- A 對應的視覺語意是「我已離開主要分頁」— Twitter/X 行動網頁、LINE 內官方功能也都是這個模式，業界認可
- AppHeader 已有顯性標題（route.meta.title），導航位置不會迷失
- B 的好處（從首頁來能感知）對 LINE LIFF 場景沒那麼關鍵：LIFF 重啟 + Tab Bar 邏輯是次要 nav

**實作：**
- 從以下路由的 `meta` 物件移除 `tab`：
  - `/leaves /fees /events /events/:eventId/ack /medications /medications/new /medications/:id /activity /calendar /contact-book /contact-book/:entryId /children/:studentId /bind-additional /notifications/preferences`
- **保留 `tab` 的：** `/home`、`/attendance`、`/announcements`、`/messages`、`/messages/:threadId`、`/more`（這些是 tab 直接路由 + thread 仍屬 messages 上下文）
- ParentLayout `currentTab = computed(() => route.meta?.tab || '')` — 已支援空字串無高亮，無需改邏輯

### 3.2 · 雙層守衛：c（保留現有 + 補 catch-all）

**現況確認：**
- `main.js:52-63` 已有 `router.beforeEach` 含 `ensureSessionProbed`（boot probe `/parent/me` 處理新 tab cookie 仍有效但 sessionStorage 空的情境）
- `api/index.js:92-125` 已有 401 interceptor + refresh + retry 機制 + `_redirectToLogin`

**唯一改動：** `router.js:140-142` catch-all 由 `redirect: '/login'` 改 `redirect: '/home'`

**理由：**
- 已登入使用者打錯 URL 應落腳功能首頁，不是登入頁
- 未登入時，beforeEach guard 會把 `/home` 攔下來導 `/login`，行為等同舊版
- 動態 redirect (`redirect: () => isAuthed() ? '/home' : '/login'`) 在 vue-router 中需在 module scope 外取 store，會碰到 pinia 初始化順序問題；靜態 `/home` + guard 接手是最乾淨的解法

### 3.3 · `--pt-info-link` 主按鈕誤用 → `--brand-primary`

**邊界判定：** 該保留 `--pt-info-link` 用途的場景：
- ✓ 純連結（`a { color: var(--pt-info-link) }`）
- ✓ 資訊性 chip / tag（如 EventsView event-type chip）
- ✓ 時態語意「資訊」（如出席「事假」chip — 仍保留，因為這是 status，不是動作）

**該改成 `--brand-primary` 的：**
- 主要 CTA 按鈕（送出/簽收/上傳/新增）
- 強調框（如 MedicationListView card.today border）
- AttendanceView 「事假」chip 例外保留 info（這是 status 語意非動作）

**檔案 × 改動：**
| 檔案 | 行 | 現況 | 改成 |
|---|---|---|---|
| MedicationListView.vue | 120 | `.new-btn { background: var(--pt-info-link) }` | `--brand-primary` + `--brand-primary-hover` on active |
| MedicationListView.vue | 124 | `.card.today { border-color: var(--pt-info-link); box-shadow: rgba(44,123,229,.1) }` | border `--brand-primary`，shadow 用 brand-tint rgba |
| MedicationDetailView.vue | 166 | `.upload-btn { background: var(--pt-info-link) }` | `--brand-primary` |
| MedicationFormView.vue | 375 | `.submit { background: var(--brand-primary, var(--pt-info-link)) }` | `--brand-primary, #FF8B8B` |
| EventAckView.vue | 112 | `.submit { background: var(--pt-info-link) }` | `--brand-primary` |
| NotificationPrefsView.vue | 96 | `.back { color: var(--pt-info-link) }` | 移除整顆 `.back` 按鈕（router 已設 `showBack: true`，AppHeader 已會顯示返回鈕，現在 view 內這顆是視覺重複） |
| RegistrationStatusList.vue | 91 | `color: var(--pt-info-link)` | 視內容判定（若是 link 保留，若是 emphasis 改 brand） — 在 plan 階段確認 |

### 3.4 · `#3f7d48` 綠 fallback 全清

7 處 fallback 統一改成新 brand coral：
- `var(--brand-primary, #3f7d48)` → `var(--brand-primary, #FF8B8B)`

理由：
- 完全移除 fallback（讓 var 找不到時落到初始值）會在 token 不慎刪除時讓背景變透明、按鈕消失，比舊綠 fallback 更糟
- 改用新 brand coral 作為 fallback 與當前 design system 同調，永遠不會視覺斷層
- 之後若要再切 brand，sweep 一次即可

**保留例外：** `globals.css:118` 是註解「從深綠 (#3f7d48) → 珊瑚 (#FF8B8B) 的品牌切換」— 歷史說明，不動。

### 3.5 · dark mode 區塊單一化

**現況：** globals.css:211-296 是 `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ... } }`，297-373 是 `:root[data-theme='dark'] { ... }`。兩塊定義同一組 token。

**目標：** 只留 `:root[data-theme='dark']`，刪除 @media 區塊。

**前置改動（useTheme.js）：**

`applyToDOM('system')` 目前是 `removeAttribute('data-theme')`，改為依 `getSystemPrefersDark()` 顯式設 `light`/`dark`。並補 listener：當 preference=`system` 且 OS 偏好變化時更新 attribute。

```js
// 偽碼示意
function applyToDOM(pref) {
  const root = document.documentElement
  const effective = pref === 'system'
    ? (getSystemPrefersDark() ? 'dark' : 'light')
    : pref
  root.setAttribute('data-theme', effective)
}
```

useTheme 的 onChange listener 從「ref 重設 trick」改成直接呼叫 `applyToDOM(preference.value)`。

**為何這個方向：**
- Tailwind / shadcn / Radix 等業界主流 dark mode 實作都是「JS 計算 effective theme + 寫 attribute」單一事實源
- @media 區塊有個天生問題：CSS 內容覆寫順序受 import 順序影響，[data-theme='light'] 想顯式 override 系統暗色偏好時要更高 specificity；單一 attribute 模式天然乾淨
- 副效益：FOUC 風險不變（initTheme 在 createApp 前呼叫已 OK）

**邊界：** SSR 場景不存在（家長 App 純 SPA），不用考慮 hydration mismatch。

### 3.6 · hardcoded hex sweep + token 補位

逐檔處理：

| 檔案 | hardcoded hex | 處理方式 |
|---|---|---|
| ChildProfileView SEVERITY_COLOR | `#fed7aa #9a3412 #fecaca #991b1b` | 新增 3 階 severity tokens（見 §4） |
| ChildProfileView .change-card | `#fbbf24 #78350f` + 修 broken CSS | 改用 `--color-warning-soft / --pt-warning-text-soft`，broken `var(--neutral-0)eb` 直接刪除（背景就用 warning-soft） |
| CalendarView CATEGORY_META | `#0e8e6f #7c3aed` | contact_book 改 `--pt-tint-contact-fg`（leaf）；leave 改 `--pt-tint-event-fg`（grape） |
| ContactBookView | `#cfe6ff #f0f4f8 #ff5252` | today border `--pt-border-strong`；chip bg `--pt-surface-mute`；dot-unread `--color-danger` |
| MedicationListView/DetailView correction status | `#ede4ff #5a3da5` | 用既有 `--pt-tint-medication / --pt-violet-text` |
| EventsView ack badge | `#991b1b` | `--color-danger` |
| AttendanceView 遲到 | `#fff8d6 #7a6500` | 新增 `--pt-tint-late / --pt-tint-late-fg`（見 §4）或併入 sun warning 變體 |
| BindView 漸層 | `linear-gradient(coral → #5fa46a)` | 改 `var(--pt-gradient-brand)` 統一 brand |
| ConnectionBanner fallback | `#fef3c7 #b45309 #dbeafe #1d4ed8` | fallback 順序保持，但跟著 tint token 走（已存在） |

---

## 4 · Token 異動

### 新增到 `globals.css` :root

```css
/* Severity 三階：用於過敏 / 醫療警示 */
--pt-severity-mild-bg:     #FFF4C9;  --pt-severity-mild-fg:     #9C7300;  /* sun-soft */
--pt-severity-mod-bg:      #FFE3E0;  --pt-severity-mod-fg:      #B14545;  /* coral-soft */
--pt-severity-severe-bg:   #FECACA;  --pt-severity-severe-fg:   #991B1B;  /* 比 coral 更強，獨立紅 */

/* 遲到 chip 專用（與 warning 區隔） */
--pt-tint-late:            #FFF4C9;  --pt-tint-late-fg:         #7A6500;
```

dark mode 對應變體在 `[data-theme='dark']` 區塊以半透明形式補上（同既有 tint 模式）。

### 不新增 token 的場景

- 一次性的 mood / bowel emoji label：邊界值，留 hardcoded 但**包進元件常數**（已是 `MOOD_OPTIONS` 常數），不污染 view scoped style
- contact-book detail .cell `#f7f9fc` → 直接用既有 `--pt-surface-mute-soft`，不新增

---

## 5 · 測試策略

家長 App 既有測試（依 commit history）有 Pinia setup + API mock pattern。本 slice 多為 visual / structural 改動，測試覆蓋以以下三類：

### 5.1 · 單元測試（Vitest）

| 改動 | 測試 |
|---|---|
| H2 HomeView pullRefresh | 補一個 test：mock todayRef、呼叫 pullRefresh、斷言 refreshSummary + todayRef.refresh 都被呼叫；舊版 `refreshToday` 不存在 → 應 throw（regression guard） |
| H5 ContactBookDetail 刪除確認 | mock deleteContactBookReply、render 後點刪除→斷言出現 ConfirmDialog 而非直接 API call |
| H7 useTheme system mode 強制設 attribute | mock `matchMedia`、initTheme + preference='system'、斷言 `documentElement.dataset.theme` 有值（非空） |
| 3.2 catch-all → /home | router push to `/random-typo` + 已登入 stub → 斷言 currentRoute = `/home` |

### 5.2 · 視覺迴歸（人工 + Playwright public 頁）

- LoginView / BindView / EventAckView 三個 public 頁啟前端 dev、Playwright 截圖 before/after，肉眼 diff 確認 brand 一致性
- 受保護頁無法走 LIFF，仰賴 Storybook-style 元件單測 + manual smoke test（業主 LINE 帳號）

### 5.3 · Lint / 防回歸 grep

加一條 npm script `parent:audit`：
- `git grep '#3f7d48' src/parent/` 應為 0（除 globals.css 註解外）
- `git grep 'var(--pt-info-link)' src/parent/` 出現必須通過 ESLint inline comment 或受限白名單（連結用法）
- `git grep -E 'background:[^;]*#[0-9a-fA-F]{3,8}' src/parent/` 應接近 0（保留 box-shadow 內的半透明 rgba）

---

## 6 · Commit 切分（單一 branch、單一 PR）

Branch 名：`feat/parent-portal-consistency-v1`（依 memory `feedback_branch_workflow`）

```
1. fix(parent): HomeView pull-to-refresh 呼叫未定義 refreshToday + 補測試         (H2)
2. fix(parent): ContactBookDetail 刪除回覆補 ConfirmDialog                       (H5)
3. fix(parent): ChildProfileView 修 broken CSS background + 整頁 token 化       (H1, M6 ChildProfile 段)
4. style(parent): 主按鈕 7 處由 info-link → brand-primary 並移除 NotificationPrefs 自畫 back (H4)
5. style(parent): #3f7d48 綠 fallback → coral fallback（7 處）                   (M1)
6. style(parent): ContactBookDetail / Calendar / ContactBook / Medication / Events / Attendance / Bind / ConnectionBanner 共 8 檔 hardcoded hex sweep + 新增 severity / late tint tokens  (H3, M6 其餘)
7. refactor(parent): dark mode 區塊單一化 + useTheme system mode 顯式 data-theme (H7)
8. refactor(parent): 深層頁 router meta.tab 拆除 + catch-all redirect /home      (M9, M8 後續)
9. style(parent): 小修補（L4 line-clamp、L6 add tint、L9 useId、L14 stagger 擴充、L15 註解） (L 級)
10. test(parent): parent:audit npm script + grep 防回歸                          (5.3)
```

**H3 → commit 6 對應補充：** ContactBookDetailView 內的 `#4a90e2` primary、`#aac4e2` disabled、`#d33` link-btn、`#f7f9fc` cell bg 全在 commit 6 內處理。整頁無 `--pt-info-link` 主按鈕（直接 hex），所以歸 hex sweep 而非 commit 4。

每個 commit 自完整、單獨可 revert。PR 內可分段 review。

---

## 7 · 風險

1. **3.5 dark mode 切換閃爍** — useTheme 改成 system 也設 attribute 後，第一次 paint 行為 = initTheme 同步呼叫 applyToDOM。FOUC 風險與舊版相同，但若有人 `<html>` initial 沒 data-theme（極短窗口），現在會看到 light → dark 切換。緩解：在 `<head>` 內 inline 一段 micro script 立即依 `matchMedia` 設 data-theme（業界常見技法）。本 slice 暫不做 micro script，留作 follow-up（風險小、僅首次 paint < 100ms）。

2. **3.3 `--pt-info-link` 邊界誤改** — 把連結色全改 brand 會把資訊性連結也染 coral。處理方式：commit 4 內**只改 background / border 的用法**，`color:` 用法逐檔判讀（連結保留、強調改 brand）。RegistrationStatusList.vue:91 在 plan 階段個別評估。

3. **3.6 token 重排造成 dark mode 漏配** — 新增的 severity / late tokens 需在 [data-theme='dark'] 對應區塊補。Commit 7 與 commit 6 順序：先 6（補 token + light）再 7（dark 區塊合併時包含新 token）。

4. **commit 8 `meta.tab` 拆除** — 若 ParentLayout 邏輯有預期 `tab` 一定有值的 implicit 假設，會出現 regression。實際看 ParentLayout currentTab 已 `route.meta?.tab || ''`，安全。但需要 smoke test：從 `/home` → 點 QuickActions「請假」→ tab bar 確認無 tab 高亮。

5. **整體** — 純前端改動、無後端依賴、無 schema 異動。CI `npm run test` + `npm run build` 需綠。

---

## 8 · 與 memory / 既有規範的對齊

- **`feedback_branch_workflow`**：本 slice 純前端，單支前端 branch + 多 atomic commits ✓
- **workspace CLAUDE.md「跨前後端任務」標準**：本 slice 不跨端，不適用
- **Conventional Commits 繁體中文**：commit 訊息照辦
- **memory `project_parent_modern_ui_2026_05_02`**（Soft UI Evolution token-first）：本 slice 是該專案的「最後一哩」，把該方向沒覆蓋的末端頁面拉齊
- **memory `project_parent_acd_optimization_2026_05_03`**（5 views 拆解）：本 slice 不再拆 view，但 ContactBookDetail / MedicationDetail 風格對齊那批被拆過的成果

---

## 9 · 完成定義（DoD）

- [ ] 22 個 view 內 `git grep '#3f7d48'` 為 0（globals.css 註解除外）
- [ ] 22 個 view 內主要按鈕（CTA）無 `var(--pt-info-link)` 用為 background 之處
- [ ] HomeView pull-to-refresh 點下去 today status 卡片數值會更新（手動或測試）
- [ ] ContactBookDetail 刪除回覆按下後出現 ConfirmDialog
- [ ] ChildProfileView「資料有誤？」卡片 visible 有 warning-tinted 背景（不再透明）
- [ ] globals.css 內 `@media (prefers-color-scheme: dark)` 區塊已刪除，dark token 只在 `[data-theme='dark']` 一份
- [ ] router.js 內 8 條深層路由的 `meta` 沒有 `tab` 欄位
- [ ] catch-all redirect 為 `/home`
- [ ] `npm run test` 全綠（含新增 4 條 unit test）
- [ ] `npm run build` 無 warning increase
- [ ] PR 內含 audit findings × commit 對應表（給 reviewer 對照用）

---

## 10 · Open questions

無架構級問題。Plan 階段需個別評估的微決策：
1. `RegistrationStatusList.vue:91` `color: var(--pt-info-link)` 的具體內容用途（連結 vs 強調）— commit 4 內評估
2. `BindView.vue:93` 漸層改 `var(--pt-gradient-brand)` 後是否需要更柔和變體（純 coral 漸層 vs hero 那種 sky→coral）— 若反差太強切回 `pt-gradient-brand-soft` 也接受
3. 是否補 micro script 在 `<head>` 早期設 data-theme（風險 1 緩解）— 預設不做，留 follow-up
