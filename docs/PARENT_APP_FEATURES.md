# 家長端功能總覽（Parent App）

> 本文件整理 IvyKids 家長端（`parent/index.html` entry，網址 `/parent/`）目前提供的全部功能、對應實作技術，以及 LINE LIFF 設定指南。
> **此文件需持續維護**：新增／異動／下架家長端功能時，請同步更新對應章節（見文末「維護指引」）。
>
> 最後整理日期：2026-08-12

---

## 1. 架構速覽

| 項目 | 內容 |
|---|---|
| 前端進入點 | `parent/index.html`（獨立 Vite multi-page entry，非 admin `index.html` 的子路由；build 輸出 `dist/parent/index.html`，2026-08-16 起由 `/parent.html` 改為乾淨網址 `/parent/`，nginx 對舊網址保留 301 相容轉址） |
| 前端路由 | `src/parent/router.ts`，`createWebHashHistory()`（hash 模式，如 `#/announcements`） |
| 正式網址 | `https://ivypreschool.tw/parent/#/<route>`（多租戶下各園所走各自 Host，見 §3） |
| 登入方式 | LINE LIFF（`@line/liff` SDK），無帳密登入 |
| 前端 API 層 | `src/parent/api/*.ts`（axios，統一經 `src/parent/api/index.ts` 封裝） |
| 狀態管理 | Pinia，`src/parent/stores/`（`parentAuth.ts` / `children.ts` / `messages.ts`） |
| 後端 | FastAPI，`ivyManageSystem-backend/api/parent_portal/`，全部掛在 `/api/parent/*` 前綴（發碼端點另在 `/api/guardians/*`） |
| 後端權限模型 | `role='parent'`，無 `permission_names`，全部資料存取以 `Guardian.user_id` 過濾（非 RBAC） |
| 關鍵規格文件 | `ivyManageSystem-backend/docs/spec/SPEC-012_parent-portal-pii.md`（認證、PII、家長端 API 總覽） |

---

## 2. 功能清單

> 表格中「前端」欄為 `src/parent/views/` 下的元件 + 對應 `src/parent/api/` 模組；「後端」欄為 `api/parent_portal/` 下的路由檔。

### 2.1 首頁總覽

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| 今日首頁 | `/home` | 整合出席狀態卡（多寶家庭可切換孩子）、今日聯絡簿摘要、今日動態，並提供「娃娃車／繳費／待簽紀錄」捷徑 | `TodayView.vue`；孩子清單來自 `stores/children.ts` | `home.py`（`home-summary` 聚合端點） |

### 2.2 出缺席與行程

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| 出席查詢 | `/attendance` | 查詢孩子到／缺席紀錄 | `AttendanceView.vue` + `api/attendance.ts` | `attendance.py` |
| 娃娃車即時位置 | `/bus` | 即時定位，掌握接送時間 | `BusTrackingView.vue` + `api/bus.ts` | `bus.py` |
| 請假申請 | `/leaves` | 送出請假申請、查詢假單狀態；家長端提交即自動核准 | `LeavesView.vue` + `api/leaves.ts` | `leaves.py` |
| 本週行程 | `/calendar` | 聚合 events / announcements / fee_due / contact_book / leave / medication 的本週行事曆 | `CalendarView.vue` + `api/calendar.ts` | `calendar.py` |

### 2.3 聯絡與通知

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| 公告 | `/announcements` | 學校／班級公告列表（分頁載入）、未讀數、詳情彈窗 | `AnnouncementsView.vue`（`components/announcements/AnnouncementDetailModal.vue`）+ `api/announcements.ts` | `announcements.py` |
| 聯絡簿 | `/contact-book`、`/contact-book/:entryId` | 老師每日聯絡簿內容與詳情 | `ContactBookView.vue` / `ContactBookDetailView.vue` + `api/contactBook.ts` | `contact_book.py` |
| 訊息（與老師對話） | `/messages`、`/messages/:threadId` | 家長與老師一對一即時對話串 | `MessagesView.vue` / `MessageThreadView.vue` + `api/messages.ts`，狀態存 `stores/messages.ts` | `messages.py` |
| 常見問題助手 | `/assistant` | FAQ 智慧客服 | `AssistantView.vue` + `api/assistant.ts` | `assistant.py` |
| 通知偏好設定 | `/notifications/preferences` | 自訂推播／訊息／公告等通知接收偏好 | `NotificationPrefsView.vue` + `api/notifications.ts` | `notifications.py` |

### 2.4 費用與行政申辦

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| 費用查詢 | `/fees` | 應繳／已繳費用紀錄與繳費證明 | `FeesView.vue` + `api/fees.ts` | `fees.py` |
| 用藥委託 | `/medications`、`/medications/new`、`/medications/:id` | 新增委託用藥單、查詢紀錄與詳情 | `MedicationListView.vue` / `MedicationFormView.vue` / `MedicationDetailView.vue` + `api/medications.ts` | `medications.py` |
| 課後才藝 | `/activity` | 才藝課程線上報名與紀錄 | `ActivityView.vue` + `api/activity.ts` | `activity.py` |
| 待簽紀錄 | `/events`、`/events/:eventId/ack` | 需家長簽收的通知事項，逐筆完成簽收 | `EventsView.vue` / `EventAckView.vue` + `api/events.ts` | `events.py` |
| 事務彙整入口 | `/admin` | 上述請假／繳費／用藥／才藝／待簽 + 孩子檔案的統一入口列表 | `AdminListView.vue`（純前端彙整，無獨立 API） | — |

### 2.5 孩子檔案與成長紀錄

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| 孩子檔案 | `/children/:studentId` | 基本資料總覽，多寶家庭可切換孩子 | `ChildProfileView.vue` + `api/profile.ts` | `profile.py` |
| 成長報告 | `/children/:studentId/reports` | 歷次老師撰寫的成長發展報告 | `ChildReportsView.vue` + `api/childReports.ts` | `growth_reports.py` |
| 照片牆 | `/children/:studentId/photos` | 學校上傳的孩子活動／生活照片 | `ChildPhotosView.vue` + `api/childPhotos.ts` | `photos.py` |
| 健康紀錄 | `/children/:studentId/measurements` | 身高、體重等生長量測歷史 | `ChildMeasurementsView.vue` + `api/childMeasurements.ts` | `measurements.py` |
| （輔助）成長歷程／里程碑 | 無獨立路由，供上述頁面消費 | 學生歷程時間軸／里程碑資料 | `api/childTimeline.ts`、`api/childMilestones.ts` | `timeline.py`、`milestones.py` |

### 2.6 帳號與個資

| 功能 | 路由 | 說明 | 前端實作 | 後端實作 |
|---|---|---|---|---|
| LINE 登入 | `/login` | LIFF SDK 取得 `id_token`，後端委派 LINE 官方 `/verify` 驗簽 | `LoginView.vue` + `services/liff.ts` + `api/auth.ts` | `auth.py` |
| 綁定家長帳號 | `/bind` | 首次登入用行政簽發的一次性綁定碼建立 `User(role='parent')` 與 `Guardian` 關聯 | `BindView.vue` + `api/auth.ts` | `auth.py`（`GuardianBindingCode` 驗證） |
| 加綁子女 | `/bind-additional` | 多寶家庭：同一家長帳號加綁多位子女 | `BindAdditionalView.vue` + `api/auth.ts` | `auth.py` |
| 我的 | `/me` | 個人設定總覽入口，登出、下載個人資料捷徑 | `MeView.vue` | `home.py` / `data_export.py` |
| 個人資料權利專區 | `/me/privacy-rights` | 個資法五權：同意紀錄、申請刪除／更正／停止處理、下載完整個人資料 | `PrivacyRightsView.vue` + `api/consent.ts` | `consent.py`、`dsr.py`、`data_export.py`、`parent_downloads.py` |

### 2.7 系統狀態頁（非家長主動使用功能）

| 功能 | 路由 | 說明 |
|---|---|---|
| 系統維護中 | `/maintenance` | kill-switch：axios 攔截器偵測 `503 + MAINTENANCE_MODE` 時導向，非家長主動點擊的功能頁 |

---

## 3. LINE LIFF 設定指南 — 解決「此園所尚未設定 LIFF ID」

### 3.1 錯誤發生原因

前端 `src/parent/services/liff.ts::resolveLiffId()` 的解析順序：

1. **優先**呼叫 `GET /api/public/tenant-meta`（依 Host 判斷租戶），取後端 `line_configs.liff_id`（**per-tenant，正式作法**）
2. 若 tenant-meta 取不到（灰度未開 / 網路錯誤），退回讀 build-time 環境變數 `VITE_LIFF_ID`（**過渡 fallback，即將於階段 3 移除**）
3. **兩者皆空** → 丟出「此園所尚未設定 LIFF ID，請聯絡園所確認 LINE 設定」

也就是說：多租戶正式環境下，這串訊息代表 **該租戶在 DB 的 `line_configs.liff_id` 是空的**，且沒有（或不該依賴）`VITE_LIFF_ID` fallback。

### 3.2 需要準備的外部設定（LINE Developers Console，一次性、非本系統）

1. 需有一個 **LINE 官方帳號（Messaging API channel）**
2. 在**同一個 Provider** 下建立一個 **LINE Login channel**（⚠ 必須與 Messaging channel 同 Provider，否則 `id_token.sub` 會與 webhook 的 `source.userId` 對不上，家長綁定會失敗）
3. 在該 LINE Login channel 底下新增一個 **LIFF app**：
   - Endpoint URL 設為家長端正式網址：`https://ivypreschool.tw/parent/`（不同租戶填各自 Host）
   - Size 建議 `Full`
   - Scope 勾 `openid`（取得 `id_token` 必要）
4. 記錄下三個值，等一下要填進系統：
   - **LIFF ID**（如 `xxxxxxx-xxxxxxxx`）
   - **LINE Login 頻道 ID**（Channel ID）
   - **LINE Login 頻道密鑰**（Channel Secret）

> 若同時要用 LINE 推播通知功能（公告 / 訊息 push），另外還需要 Messaging API 的 **Channel access token** 與 **Channel secret**（跟 LIFF 是分開兩組憑證）。

### 3.3 在系統裡的設定位置

⚠ **不是**在一般後台「設定」頁的 LINE 分頁（`SettingsLineTab.vue`，路徑通常在後台 `/settings`）—— 那一頁只管**推播用**的 Channel access token / Channel secret / target id，**沒有** LIFF 相關欄位。

**LIFF ID 要在「總部管理」console 設定**（多租戶下每個園所各自一組）：

```
側邊欄「總部管理」→「分校管理」（/platform/tenants）
  → 點進目標園所（/platform/tenants/:id）
  → 分頁「LINE 憑證」（TenantLineTab.vue）
```

該頁需要 `PLATFORM_TENANTS_MANAGE` 權限（只有總部 kind='platform' 租戶的角色會有）。在表單中填入：

| 欄位 | 對應剛剛在 LINE Developers 拿到的值 |
|---|---|
| LINE Login 頻道 ID | Login channel 的 Channel ID |
| LINE Login 頻道密鑰 | Login channel 的 Channel Secret |
| **LIFF ID** | LIFF app 的 LIFF ID |
| （選填）頻道存取權杖 / 頻道密鑰 / 推播對象 target id | Messaging API 憑證，僅推播通知功能需要 |

按「儲存」後：
- 後端會即時 invalidate 該租戶的 tenant-meta 快取（`invalidate_tenant_meta_cache()`），家長端**最多幾秒內**（非舊文件提到的 60 秒上限，儲存當下已主動清快取）就能讀到新 LIFF ID，**不需要重新部署前端**
- 憑證欄位一律加密儲存（`KekEncryptedText`），畫面上讀取只會顯示遮罩尾碼，不會回顯明文

### 3.4 單租戶 / 本機開發的替代做法

若還沒接上多租戶 tenant-meta（例如純本機開發、`VITE_TENANT_BASE_DOMAIN` 未設），可以用過渡 fallback：在 `.env.local` 設定

```
VITE_LIFF_ID=your-liff-app-id
```

但正式多租戶環境**不應長期依賴這個變數**（一個 build 只能綁一組 ID，多租戶下會把 B 校家長導去 A 校的 LINE Login）——正式環境請一律走 §3.3 的總部 console 設定。

### 3.5 排查檢查清單

- [ ] LINE Login channel 與 Messaging channel 是否同一個 Provider？
- [ ] LIFF app 的 Endpoint URL 是否等於該租戶正式網址的 `/parent/`？
- [ ] `/platform/tenants/:id` → LINE 憑證分頁的「LIFF ID」欄是否已顯示非空值？
- [ ] 瀏覽器開發者工具 Network，`GET /api/public/tenant-meta` 回應的 `liff_id` 欄位是否為空？（若系統裡已填但這裡仍空，代表快取或 Host 對應租戶設定有誤，檢查 `branding/tenants.json` 的 `hosts` 是否含該網域）

---

## 4. 維護指引

- 新增／刪除家長端頁面時，同步更新本文件 §2 對應表格（路由、前端檔、後端檔至少三欄）
- 若新增功能牽涉 LINE 憑證或多租戶設定變動，同步檢查 §3 是否需要更新
- 大改版（如整頁重構）可在對應表格列補「備註」欄註明變更版本／PR
- 家長端測試分散在三個樹（`src/parent/**/__tests__/`、`tests/unit/parent/`、`tests/parent/`），改動功能後記得三樹全跑（見 repo 根 `CLAUDE.md`）
