# 家長端資訊架構重組（3-tab IA）

**Spec 日期**：2026-05-22
**Repo**：ivy-frontend
**Branch 規劃**：`feat/parent-ia-restructure-2026-05-22-frontend`（單一 repo，可拆 sub-PR）
**目標**：將家長端 LIFF app 的主導航從目前「Home / Family / Messages / Me」4-tab 重組為 **「Home / Messages / Admin」3-tab + Me drawer**，砍掉語意模糊的 Family tab、收斂 15 個低頻 view 至「孩子檔案」二級頁，並把「待簽事件」從散落入口拉到 Home 頂部 sticky banner，提升家長「打開就知道該做什麼」的體驗。
**前置依賴**：`2026-05-13-parent-material3-redesign-design.md` 的 M3 token、`M3NavigationBar`、`M3TopAppBar` 等核心元件已落地（admin 與部分 view 已 M3 化，本 spec 以此為基礎）。

---

## 1. 動機與問題盤點

### 1.1 現況

家長端共 27 個 view（`src/parent/views/*.vue`），4 個主 tab：

| Tab | 涵蓋 view | 觀察 |
|---|---|---|
| **home** | TodayView | 1 view |
| **family** | Announcements / Attendance / Leaves / Events / EventAck / MedicationList / MedicationDetail / MedicationForm / Activity / Calendar / ContactBook / ContactBookDetail / FamilyView | **13 view**，語意混雜 |
| **messages** | Messages / MessageThread | 2 view |
| **me** | Me / Fees / NotificationPrefs / BindAdditional / ChildProfile（+ ChildReports / ChildPhotos / ChildMeasurements 無 tab） | 4–7 view |

其他不在 tab 的：Login / Bind / Assistant。

### 1.2 三個結構性問題

1. **`family` tab 是「行政工作列」不是「孩子故事」**——它同時包含請假、繳費、用藥、才藝、簽收這些「行政為方便」的功能，也包含聯絡簿、行事曆、出勤這些「孩子日常」內容。家長心智上沒有對應的單一概念。
2. **待簽事件分散且不顯眼**——`EventsView` 列表 + `EventAckView` 簽收頁埋在 family tab 第 N 層，家長很容易漏簽。
3. **低頻檔案類 view 佔用注意力**——ChildProfile / ChildPhotos / ChildReports / ChildMeasurements 一年看不到 5 次卻散落在 me/無 tab，造成 me drawer 既是「個人設定」又是「孩子檔案入口」雙語意。

### 1.3 用戶研究輸入

本 spec 不依賴新做的用戶訪談，而是以下既有訊號的綜合：
- `2026-05-13-parent-material3-redesign-design.md` §2 提到「家長日常路徑：打開 → 看今日 → 回訊息」三步為主。
- `2026-04-27-parent-portal-optimization-design.md` 提到家長 P1 痛點是「待簽訊息漏簽」「找不到請假入口」。
- LIFF 環境下手機螢幕首屏只 6.5 吋，4 tab 標籤已擠到 8 字以下難以辨識（已 M3 化但仍受限）。

---

## 2. 目標 IA（拍板）

### 2.1 三個 Tab

```
┌─ Home（家） ─────────────────┐  ┌─ Messages（訊） ────────┐  ┌─ Admin（事） ──────────┐
│ ⚠ 待簽 N 件 [攔截 banner]    │  │ 🔍 搜尋                 │  │ 請假 · Leaves          │
│ ── Today ─────────────────── │  │ ── 私訊+公告混排 ────── │  │ 繳費 · Fees            │
│  · 今日出勤 ✅              │  │ ● 王老師 13:42          │  │ 用藥委託 · Medications │
│  · 今日行程 / 餐點 / 午睡   │  │ ○ 林園長 [全班] 05/21   │  │ 課後才藝 · Activity    │
│  · 待繳費提醒（若有）       │  │ ○ 系統公告 05/20        │  │ 待簽紀錄 · Events      │
│ ── ContactBook ──────────── │  │                         │  │ ─────────────────────── │
│  · 今日聯絡簿               │  │                         │  │ 孩子檔案 ›             │
│  · 歷史時序（吸收 Family）  │  │                         │  │  · 基本資料            │
│ ── Footer 連結 ──────────── │  │                         │  │  · 健康紀錄            │
│  · 行事曆 ›                 │  │                         │  │  · 成長照片            │
│                              │  │                         │  │  · 學習報告            │
│                              │  │                         │  │  · 出勤紀錄            │
└──────────────────────────────┘  └─────────────────────────┘  └────────────────────────┘
   [家]      [訊] ②     [事]
```

### 2.2 不佔 tab 的 view

| View | 進入路徑 | 備註 |
|---|---|---|
| `MeView` | 右上 avatar tap → drawer | 設定/個人資料/登出 |
| `NotificationPrefsView` | Me drawer → 通知設定 | 從 me tab 移出 |
| `BindAdditionalView` | Me drawer → 綁定其他孩子 | 從 me tab 移出 |
| `AssistantView` | Home/Messages 頂部 🔍 icon | 取消獨立入口，併進搜尋 |
| `LoginView` | 未登入時 | 不變 |
| `BindView` | 首次登入流程 | 不變 |

### 2.3 砍掉的 view

- **`FamilyView.vue`**——時間軸概念與 `ContactBookView` 重疊，併進 ContactBook 歷史時序往下滑即是。砍檔不留 redirect（與 ContactBook 同義）。

---

## 3. View → Tab 對照表（完整 27 view）

| # | View | 目前 tab | **新 tab** | 進入路徑 | 變更類型 |
|---|---|---|---|---|---|
| 1 | TodayView | home | **Home** | 主頁 | 主頁擴充（加 banner / 出勤一行 / contact-book 內嵌） |
| 2 | ContactBookView | family | **Home** | 主頁下半 + 「歷史」入口 | 從 family 移入 Home |
| 3 | ContactBookDetailView | family | **Home** | ContactBook → 單日 | tab 改 home |
| 4 | CalendarView | family | **Home** | Home 底部「行事曆 ›」 | tab 改 home，移除主導航 |
| 5 | FamilyView | family | **刪除** | — | **砍檔**，併進 ContactBook 歷史 |
| 6 | MessagesView | messages | **Messages** | 主頁 | 不變（加 🔍 與 NotificationPrefs 入口） |
| 7 | MessageThreadView | messages | **Messages** | Messages → thread | 不變 |
| 8 | AnnouncementsView | family | **Messages** | 與私訊混排 | 從 family 移入 Messages（list 合併） |
| 9 | AssistantView | — | **Messages** | 🔍 icon | 改為 modal/全屏搜尋觸發 |
| 10 | LeavesView | family | **Admin** | 主列表 | tab 改 admin |
| 11 | FeesView | me | **Admin** | 主列表 | tab 改 admin |
| 12 | MedicationListView | family | **Admin** | 主列表 | tab 改 admin |
| 13 | MedicationDetailView | family | **Admin** | List → 單筆 | tab 改 admin |
| 14 | MedicationFormView | family | **Admin** | List → 新增/編輯 | tab 改 admin |
| 15 | ActivityView | family | **Admin** | 主列表 | tab 改 admin |
| 16 | EventsView | family | **Admin** | 主列表「待簽紀錄」 | tab 改 admin |
| 17 | EventAckView | family | **Admin** | Home banner + Events list 入口 | **雙入口**（行動 + 歷史） |
| 18 | AttendanceView | family | **Admin** | 孩子檔案 → 出勤 | tab 改 admin，**今日狀態顯示於 Home** |
| 19 | ChildProfileView | me | **Admin** | 孩子檔案 主頁 | 升級為「孩子檔案」二級入口 |
| 20 | ChildPhotosView | — | **Admin** | 孩子檔案 → 照片 | 補 tab=admin |
| 21 | ChildReportsView | — | **Admin** | 孩子檔案 → 報告 | 補 tab=admin |
| 22 | ChildMeasurementsView | — | **Admin** | 孩子檔案 → 健康 | 補 tab=admin |
| 23 | MeView | me | **drawer** | 右上 avatar | 從 tab 改 drawer |
| 24 | NotificationPrefsView | me | **drawer** | Me → 通知設定 | 同上 |
| 25 | BindAdditionalView | me | **drawer** | Me → 綁定其他孩子 | 同上 |
| 26 | LoginView | — | **流程** | 未登入 | 不變 |
| 27 | BindView | — | **流程** | 首次登入 | 不變 |

**統計**：27 view → 砍 1（Family） = 26 view；4 tab → 3 tab + 1 drawer；無新增 view。

---

## 4. 關鍵設計決策（拍板紀錄）

### 4.1 待簽 banner，不是 badge

待簽事件用 Home 頂部黃底 ⚠ sticky banner（「待簽 N 件 [檢視]」），**不是** Messages tab 上的紅點。理由：

- 紅點與「未讀私訊」共用會稀釋簽收的緊迫感。
- 銀行 app / 學校通知類 app 慣例：「必須行動」走頂部 banner、「待閱讀」走 badge。
- 簽完當天 banner 隱藏；未簽 N+1 天該 banner 加重視覺（顏色升級至 error container）。

實作：Home 頂部 sticky 區，從 `EventsView` 資料源取 `status=pending` 列表，count > 0 才渲染。

### 4.2 Messages 私訊與公告混排，不分 tab

list 內以同一條時序顯示，差別在頭像：
- ●（深綠圓頭像）= 老師私訊
- ○（淺綠系統 icon）= 公告/全班通知
- meta 行附「[全班]」標籤區隔

不用 sub-tab 切換是因為家長忘記「上次訊息在哪邊」是常見 friction，混排可消除這個成本。

### 4.3 Attendance 折衷方案

- **今日出勤**一行字顯示於 Home 的 Today 區塊（「✅ 9:02 入園 by 王老師」）——日常確認在 Home 完成。
- **月份歷史**才進 Admin → 孩子檔案 → 出勤——少數情境（月底課時對帳、爭議查證）。
- 因此 AttendanceView **不**升到 Admin 主列表，避免主列表雜訊。

### 4.4 Family view 砍掉，不 redirect

`/family` 路徑直接刪除（不留 `redirect: '/contact-book'`）。理由：
- Family timeline 概念已被 ContactBook 歷史時序吸收，redirect 會讓 LIFF rich menu 或舊書籤誤導向，不如直接 404 fallback 至 `/home`。
- 砍檔同時刪除 `i18n` 內 `family` 字串、bottom nav 第二欄。

### 4.5 Assistant 不佔 tab，併進搜尋

`AssistantView` 改造為「全屏搜尋 + AI 助手 modal」，從 Home/Messages 頂部 🔍 觸發。原本 `tab` meta 拿掉，路徑 `/assistant` 保留但改 `meta.modal: true`。

### 4.6 為什麼不做 4-tab「Home / Inbox / Admin / Me」

替代方案：把 Me 也拉出來成 4-tab。**否決**理由：
- Me 內容是設定類（NotificationPrefs / BindAdditional / 登出），日常打開率 < 5%。
- 拉出來變成 4-tab 等於回到目前的擁擠狀態。
- 右上 avatar drawer 是 LIFF / 行動 app 對「個人」的標準慣例（Gmail / LINE / Slack 皆同）。

---

## 5. Router 改動清單

### 5.1 新增/改 path

| Path | 變化 |
|---|---|
| `/family` | **刪除**（不留 redirect） |
| `/assistant` | 保留路徑，meta 加 `modal: true`，移除 `tab` |
| `/notifications/preferences` | tab 從 `me` 改為 `drawer` 語意（meta 加 `inDrawer: true`） |
| `/bind-additional` | 同上 |
| `/contact-book` | tab 從 `family` 改 `home` |
| `/contact-book/:entryId` | 同上 |
| `/calendar` | 同上 |
| `/announcements` | tab 從 `family` 改 `messages` |
| `/leaves` | tab 從 `family` 改 `admin` |
| `/fees` | tab 從 `me` 改 `admin` |
| `/medications` 系列 3 條 | tab 從 `family` 改 `admin` |
| `/activity` | tab 從 `family` 改 `admin` |
| `/events` | tab 從 `family` 改 `admin` |
| `/events/:eventId/ack` | tab 從 `family` 改 `admin` |
| `/attendance` | tab 從 `family` 改 `admin` |
| `/children/:studentId` | tab 從 `me` 改 `admin` |
| `/children/:studentId/reports` | meta 加 `tab: 'admin'` |
| `/children/:studentId/photos` | 同上 |
| `/children/:studentId/measurements` | 同上 + 補 `title: '健康紀錄'` |

### 5.2 新增 catch-all 與書籤遷移

- `/:pathMatch(.*)*` 維持 redirect `/home`。
- 不需要為 `/family` 加特殊 redirect（直接走 404 fallback）。

### 5.3 Bottom navigation 元件改動

`components/parent/M3NavigationBar.vue`（或現名）由 4 項改 3 項：
- 移除「family」項。
- 新增「admin」項（icon 候選：`assignment` 或 `dashboard`，labels 候選：「事務」「申辦」「管理」）。
- `home` 與 `messages` 兩項不變，但 messages 改用 badge 顯示「未讀私訊+未讀公告」總數（不含待簽，待簽走 Home banner）。

**Tab 標籤命名候選**（需與設計確認）：
- 家 / 訊 / 事
- Home / Inbox / Tasks
- 首頁 / 訊息 / 申辦

---

## 6. 元件與檔案改動

### 6.1 新增元件

| 元件 | 路徑 | 用途 |
|---|---|---|
| `PendingSignBanner.vue` | `src/parent/components/home/` | Home 頂部待簽 banner，從 events store 拉 pending count |
| `TodayAttendanceLine.vue` | `src/parent/components/home/` | Home Today 區塊內「今日出勤」一行 |
| `AdminMenuList.vue` | `src/parent/components/admin/` | Admin tab 主列表（請假/繳費/用藥/才藝/簽收 5 項 + 孩子檔案二級入口） |
| `ChildProfileMenu.vue` | `src/parent/components/admin/` | 「孩子檔案 ›」二級頁的 sub-menu（5 項：基本/健康/照片/報告/出勤） |
| `MessagesSearchBar.vue` | `src/parent/components/messages/` | Messages 頂部 🔍，觸發 Assistant modal |
| `MeDrawer.vue` | `src/parent/components/layout/` | 取代 MeView 作為頂部 avatar 觸發的 drawer |

### 6.2 改動元件

| 元件 | 改動 |
|---|---|
| `M3NavigationBar.vue` | 4 → 3 項；badge 規則調整 |
| `TodayView.vue` | 加入 PendingSignBanner + TodayAttendanceLine + ContactBook 內嵌區 |
| `MessagesView.vue` | list 加公告混排（fetch announcements + 私訊合併排序），加頂部 🔍 |
| `AnnouncementsView.vue` | 評估直接砍檔（如果 MessagesView 完全吸收），或保留為 detail 頁 |
| `AssistantView.vue` | 改為 modal 樣式（移除 page header，加關閉按鈕） |
| `ChildProfileView.vue` | 升級為「孩子檔案 ›」二級頁主頁，子頁透過 ChildProfileMenu 進入 |
| `parent/router.ts` | 大量 tab meta 重寫（見 §5.1） |
| `i18n/parent/zh-TW.ts` | 砍 family 字串、加 admin / drawer 字串 |

### 6.3 砍檔

- `src/parent/views/FamilyView.vue`
- `i18n` 內 `tab.family` / `family.*` keys

---

## 7. 分階段策略（建議拆 PR）

可拆 4 個 sub-PR，每個獨立 review、互不阻塞：

| Phase | 範圍 | 預估 commits | 風險 |
|---|---|---|---|
| **A** Bottom nav 重組 + Family 砍 | M3NavigationBar 4→3、router tab meta 全部改、FamilyView 刪除、i18n 同步 | 3–4 | **MID**（全部 view 視覺受影響） |
| **B** Home 擴充 | PendingSignBanner + TodayAttendanceLine + ContactBook 內嵌 + Calendar footer 連結 | 3–4 | LOW |
| **C** Messages 混排 + Search | AnnouncementsView 合併、MessagesSearchBar、Assistant modal 化 | 3–4 | MID（資料源合併） |
| **D** Admin 列表 + 孩子檔案二級 | AdminMenuList、ChildProfileMenu、MeDrawer、Me 從 tab 移除 | 3–4 | LOW |

**依賴**：A 必須先 merge（其他 phase 都會碰 tab meta），B/C/D 可並行。

**總計**：12–16 commits、4 PR、估 1.5–2 週工時。

---

## 8. 測試策略

### 8.1 Vitest（新增）

- `PendingSignBanner.test.ts`：count=0 不渲染、count>0 渲染、過 24h 升級顏色。
- `MessagesView.test.ts`（擴充）：私訊+公告混排排序、未讀 badge 計算不含待簽。
- `AdminMenuList.test.ts`：5 項主列表 + 孩子檔案入口、待繳費數連動。
- `parent/router.test.ts`：所有 path 的 `tab` meta 對應正確；`/family` 不存在會 redirect 至 `/home`。

### 8.2 Playwright E2E（建議加 follow-up）

- 從首頁打開 → 看到待簽 banner → 點擊 → 進 EventAck → 簽收 → 回首頁 banner 消失。
- 從 Messages list 點公告 → 進 AnnouncementsView detail（或 inline）→ 返回 → 私訊仍在列表。
- Admin → 孩子檔案 → 出勤 → 返回 → tab 仍在 admin。
- 砍 Family 後 `/family` 走 404 fallback 至 `/home`。

E2E 暫不接 CI（與 workspace `e2e/` 慣例對齊），merge 前手動跑。

---

## 9. 風險與緩解

| 風險 | 機率 | 緩解 |
|---|---|---|
| LIFF rich menu 直接 deep-link 到 `/family` 或舊路徑 | MID | 部署前 audit LIFF rich menu 設定（line-bot MCP 可查），改寫指向 `/home` |
| 家長已習慣 family tab，3-tab 改版引發抱怨 | MID | A phase merge 後留 grace 期（一週公告 + 首次打開 onboarding tip） |
| Messages 公告混排打散家長對「公告分類」的心智 | LOW | 公告以 `[全班]` / `[系統]` chip 區分，並保留 AnnouncementsView 作為 archive 入口 |
| 待簽 banner 過於侵入造成「banner blindness」 | LOW | 簽完即消失；只有 pending > 0 才顯示；同一事件不重複出現 |
| 砍 Family 影響某些 deep-link 分享（line message 內貼 `/family/...`） | LOW | grep `'/family'` 全 codebase + LIFF / 行銷文案 audit |

---

## 10. 非目標（out of scope）

- **不**重做 Material 3 token 或元件（沿用 `2026-05-13-parent-material3-redesign-design.md` 成果）。
- **不**改後端 API（純前端 IA 重組，資料源不變）。
- **不**動 LIFF 整合 / auth store / 業務邏輯。
- **不**做用戶研究新訪談（依賴既有訊號）。
- **不**改 admin / teacher portal。
- **不**做 i18n 新語系（只動 zh-TW）。

---

## 11. 待 user 確認的開放問題

1. **Tab 標籤字** 「家 / 訊 / 事」 vs 「首頁 / 訊息 / 申辦」 vs 「Home / Inbox / Tasks」——選哪個？
2. **AnnouncementsView 是否完全砍掉**——MessagesView 吸收後，公告詳情頁要不要保留？傾向保留為 detail 頁（list 進入）。
3. **Admin tab icon** ——`assignment` / `dashboard` / `list` / `task_alt` 哪個語意最準？
4. **LIFF rich menu 配置** ——是否要同步調整（line-bot MCP 可查現況）？
5. **GA / 行銷文案** 是否引用過 `/family` 路徑——需先 audit。

---

## 12. 完成定義（Definition of Done）

- [ ] A phase merge 後 bottom nav 顯示 3 tab
- [ ] FamilyView 砍檔，`/family` 走 404 fallback
- [ ] Home 顯示 PendingSignBanner（pending > 0 時）+ 今日出勤一行
- [ ] Messages 私訊與公告混排，🔍 觸發 Assistant modal
- [ ] Admin 主列表 5 項 + 孩子檔案二級入口
- [ ] Me 從 tab 移除，改為右上 avatar drawer
- [ ] NotificationPrefs / BindAdditional 進 Me drawer 二級
- [ ] 所有 router meta `tab` 對齊 §5.1
- [ ] vitest 新增 4 file 全綠
- [ ] vitest 全 suite 零 regression
- [ ] build 通過、typecheck 通過
- [ ] LIFF rich menu 已 audit 並配套調整（如需）

---

## 13. 預估工時

| 項目 | 估時 |
|---|---|
| Phase A（nav 重組） | 4–6h |
| Phase B（Home 擴充） | 6–8h |
| Phase C（Messages 混排 + Search） | 6–8h |
| Phase D（Admin 列表 + drawer） | 6–8h |
| Vitest 新增/擴充 | 4–6h |
| E2E + 手測 + LIFF audit | 4h |
| **總計** | **30–40h（約 1.5–2 週）** |

---

## 14. 後續 follow-up（非本 spec 範圍）

- **用戶研究**：3 tab 上線後 2 週收集行為資料（GA event：tab 點擊分布、待簽 banner CTR、Messages 公告 vs 私訊互動率），驗證假設。
- **教師 portal 同步**：教師端目前也有「Family / Messages」類似結構，是否套同樣 IA。
- **Admin tab 個性化**：依角色（單寶 vs 多寶家長 / 是否報名才藝）動態排序 Admin 列表。
- **EventAck 推播強化**：與 LINE bot push 整合，未簽超過 72h 主動推播。

---

**Spec 完整性**：本 spec 為「結構性 IA 重組」design doc，不含實作細節（元件 props、CSS、Pinia store 改動）。實作 plan 待 A/B/C/D 各 phase 開工前另寫 plan doc，命名為 `2026-05-22-parent-ia-restructure-phase-{a,b,c,d}-plan.md`。
