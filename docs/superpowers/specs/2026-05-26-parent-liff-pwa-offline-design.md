# 家長端 LIFF PWA + 離線寫入佇列設計

**Date**: 2026-05-26
**Status**: Phase 2 complete / pending user merge + push（Phase 0 spike skipped by user, Phase 1+2 implemented + automated tests green）
**Repos affected**: ivy-frontend（主體）+ ivy-backend（Phase 2 前置 task）
**Related memory**: [[project_parent_line_refresh_token_2026_05_03]]（30 天 LINE refresh token）

---

## 1 · 背景

家長端 LIFF（`parent.html` entry）目前在 PWA / 離線能力上有兩個缺口：

1. **PWA 缺 manifest**：`parent.html` 沒有 `<link rel="manifest">`，theme/icon 跟 admin manifest 不一致（admin `#3f7d48` vs parent `#0d9053`），無法當家長品牌 PWA 加到主畫面。
2. **零離線寫入能力**：教師端 `src/utils/offlineQueue.ts` IndexedDB pending_ops + flush 完整，家長端零引用。`useConnectionStatus.ts` 只更新 ref 顯示 banner，沒寫 IndexedDB。

風險：家長在地鐵/山區開 LIFF 想留訊息 / ack 通知 / 申請請假，當下沒 queue 機制 → 操作失敗、體驗碎裂，**直接打 PRODUCT.md「碎片時間打開」成功指標**。

**校正 explore 過程的誤判（重要）**：原 finding 提到 `navigateFallbackDenylist: [/^\/parent\.html/, /^\/parent\//]` 把家長端排除 PWA — 此處被誤解。denylist 是擋 **SPA navigation fallback**（避免 admin `index.html` 被回傳給家長路徑），不是擋 PWA 全功能。事實上 `vite.config.js:359-461` 已經為家長端 9 個 GET API 配好 runtime caching 規則。**真實 gap** 在 manifest 缺、SW 是否真的註冊到 parent.html 待驗證、寫入端零 queue 機制。

## 2 · 目標 / 非目標

### 2.1 目標

- **Phase 0 (spike, 1 day)**：以實機驗證 LIFF webview 的 PWA 相容假設（SW / IndexedDB / install），交付 spike report。
- **Phase 1 (0.5-1 day)**：補家長獨立 PWA manifest + 驗證既有 SW runtime caching 對 parent.html scope 生效，使外部瀏覽器使用者可加到主畫面。
- **Phase 2 (2-3 day)**：5 個高頻、可異步、低風險的家長寫入動作接 IndexedDB queue，flush 5 trigger 點，含 client_request_id + DB UNIQUE constraint 防重送髒資料。

### 2.2 非目標（明寫避 scope creep）

- 後端 idempotency middleware（`Idempotency-Key` header / Redis cache）— v1 用 client_request_id + DB UNIQUE 解決
- 後端離線使用 metric endpoint — 觀測靠既有 Sentry breadcrumbs
- Install prompt UI（`beforeinstallprompt` handling）— LIFF webview 不會 fire
- 含附件 op 的離線 queue（文字+照片）— 純文字 queue，附件離線阻擋，文字部分可由 view 層自存 sessionStorage 草稿
- 教師端 `src/utils/offlineQueue.ts` 機制重構 — 只擴 `OP_KINDS`、不動其他
- 家長端 refresh token 機制 — 沿用 [[project_parent_line_refresh_token_2026_05_03]] 既有路徑
- `notifications.ts` preferences offline queue — 設定類，使用者期望即生效，收益低
- 家長端 `child_measurement` / `medication_order` offline queue — 前者家長端 read-only，後者高責任明示阻擋

## 3 · Phase 結構

```
Phase 0 spike (1d) ─→ Phase 1 PWA shell (0.5-1d) ─→ Phase 2 offline queue (2-3d)
                                    ↑                       ↑
                          報告寫進 spec §10               BE 前置先 ship
```

Phase 0 結果影響 Phase 1 **價值規模**（不影響 Phase 1 是否上線）。Phase 2 純 IndexedDB，**不依賴** SW，無論 spike 結論如何 Phase 2 都能上。

## 4 · Phase 0 — LIFF webview spike

### 4.1 測試 matrix（4 機種 × 5 測項 = 20 cell）

| 測項 \ 環境 | iOS LINE webview | Android LINE webview | iOS Safari 外部 | Android Chrome 外部 |
|---|---|---|---|---|
| SW 註冊成功 + scope=/ 涵蓋 parent.html | | | | |
| SW 第二次開啟（webview 重建）persist | | | | |
| `caches` API 可讀寫 | | | | |
| IndexedDB 切回前景仍 persist（30 秒背景） | | | | |
| `<link rel="manifest">` served 正確（200 + JSON） | | | | |

### 4.2 手測腳本（每 cell）

1. 開 parent.html（外部瀏覽器 / LIFF 內各一）
2. 飛航 toggle / 切到背景 30 秒
3. devtools 遠端 debug（USB iOS Safari Web Inspector / Android Chrome `chrome://inspect`）
4. 觀察 Application tab → Service Workers / IndexedDB / Cache Storage
5. 記錄每 cell 結論（✅ / ❌ / partial+notes）

### 4.3 交付

- 報告寫到 `.scratch/parent-pwa-liff-spike-YYYY-MM-DD.md`
- spec §10「實測結論」章節貼回精簡版（不要 raw log，只放 matrix + 影響 Phase 1 的 contingency）

### 4.4 結論的三種可能與 Phase 1 對應

| spike 結論 | Phase 1 對應 |
|---|---|
| 全綠 | 照 §5 原計畫，加 manifest + register SW + 驗證 cache 在 LIFF 內生效 |
| iOS LINE SW 不可用 / Android LINE SW 可用（**最可能**） | Phase 1 manifest+SW 仍上；spec §10 註記「iOS LINE 使用者不享 SW cache，僅外部瀏覽器有」；Phase 2 不受影響 |
| 兩平台 LINE SW 都不可用（悲觀） | Phase 1 縮水成「只補 manifest 給外部瀏覽器」；SW 註冊改條件式 `if 'serviceWorker' in navigator && !isLiffWebview`；Phase 2 同樣不影響 |

## 5 · Phase 1 — PWA shell

### 5.1 新增 `public/parent.webmanifest`

```json
{
  "name": "常春藤家長 App",
  "short_name": "家長 App",
  "description": "常春藤幼兒園家長端",
  "theme_color": "#0d9053",
  "background_color": "#ffffff",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": "/parent.html",
  "scope": "/parent/",
  "icons": [
    { "src": "/parent-pwa-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/parent-pwa-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/parent-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### 5.2 修改 `parent.html`

- 加 `<link rel="manifest" href="/parent.webmanifest">`
- 視 spike 結論決定是否手動加 `<script type="module" src="/registerSW.js"></script>`（如果 vite-plugin-pwa `autoUpdate` 模式沒自動 inject）

### 5.3 Icon asset risk

家長端 brand icon（192/512/maskable）尚未備齊。**fallback**：Phase 1 先用 admin pwa-* icon 上線，icon swap 留 Phase 1 尾巴或 follow-up。spec 內不卡 Phase 1 是否帶 brand icon ship。

### 5.4 驗收

- iPhone Safari 外部瀏覽器開 parent.html → 加到主畫面 → 圖示是家長 brand、theme color `#0d9053`
- 飛航 → 從主畫面開家長 App → home / announcements / calendar 至少一頁不白屏（既有 9 條 runtime caching 規則生效）
- `curl /parent.webmanifest` 回 200 + JSON

## 6 · Phase 2 — Offline write queue

### 6.1 Queue 對象（5 個 kind）

| kind | 對應 endpoint | 是否冪等 | 附件處理 |
|---|---|---|---|
| `PARENT_MESSAGE` | `sendThreadMessage(threadId, payload)` | ❌ 非冪等 → client_request_id | 含 file 不 queue |
| `CONTACT_BOOK_REPLY` | `replyContactBook(entryId, body)` | ❌ 非冪等 → client_request_id | 純文字 |
| `CONTACT_BOOK_ACK` | `ackContactBook(entryId)` | ✅ 天然冪等 | 純動作 |
| `EVENT_ACK` | `acknowledgeEvent(eventId, payload)` | ✅ 應冪等（BE 驗證） | 不 queue 含簽名 blob 路徑 |
| `PARENT_LEAVE_REQUEST` | `createLeave(payload)` | ❌ 非冪等 → client_request_id | 含 attachment 不 queue |

**不 queue 的端點**：`createMedicationOrder`（醫療責任）/`uploadMedicationPhoto`、`uploadAckSignature`、`uploadLeaveAttachment`（附件 v1 阻擋）/ `notifications.ts`（偏好設定）/ `childMeasurements`（家長 read-only）。

### 6.2 Components

#### 6.2.1 `src/utils/offlineQueue.ts`（修改 — 既有教師端模組）

- API 不變，向後相容（教師端 `attendanceSync.ts` 不需改）
- 擴 `OP_KINDS` 從 `{ CLASS_ATTENDANCE }` → `{ CLASS_ATTENDANCE, PARENT_MESSAGE, CONTACT_BOOK_REPLY, CONTACT_BOOK_ACK, EVENT_ACK, PARENT_LEAVE_REQUEST }`
- 既有 IndexedDB schema 不升版（DB_VERSION=1，store=pending_ops，記錄已有 kind 欄）

#### 6.2.2 `vite.config.js` chunk 規則調整

`manualChunks` 加一條讓 `offlineQueue.ts` 落 shared-common chunk：

```js
if (
    id.includes('/src/utils/format.ts') ||
    id.includes('/src/utils/apiDedupe.ts') ||
    id.includes('/src/utils/offlineQueue.ts') ||   // ← 新增
    id.includes('/src/composables/useCachedAsync.ts') ||
    id.includes('/src/components/common/MobileErrorRetry.vue')
) {
    return 'shared-common'
}
```

admin bundle ↑ ~200B（kind 字串），parent bundle 已拉 shared-common 無新增成本。

#### 6.2.3 `src/parent/utils/parentOfflineQueue.ts`（新增 facade）

職責：thin wrapper，注入 client_request_id + 從 parentAuth store 抓 user_id + dispatch saveFn。

```ts
// 介面草稿（plan 階段細修）
export interface ParentEnqueueArgs {
  kind: ParentOpKind
  payload: Record<string, unknown>  // 不含 client_request_id，facade 注入
  meta?: Record<string, unknown>    // UI 顯示用
}

export async function enqueueParent(args: ParentEnqueueArgs): Promise<{ id: string }>

export async function flushParentQueue(
  kind: ParentOpKind
): Promise<FlushResult>

export async function flushAllParent(): Promise<FlushResult>
// 內部 debounce 1s 防 5 個 trigger 同時打
```

`SAVE_FN_BY_KIND` dispatch table 把 kind 映射到對應 api module 的呼叫。

#### 6.2.4 `src/parent/components/ParentOfflineIndicator.vue`（新增）

掛在 parent 主 layout，三狀態：
- 0 筆 pending + 0 needs_review → 隱藏
- N 筆 pending → 顯示「N 筆等待同步」+ 點按手動 flush
- K 筆 needs_review → 顯示「K 筆無法同步」+ 點開 `ElMessageBox` 列詳情，每筆兩個按鈕「重試 / 聯絡管理員」（**不提供「丟棄」**避免家長誤刪資料）

#### 6.2.5 BE 前置 task — Alembic migration + 3 router

**Codebase 既有 pattern 校正（plan 階段發現）**：`parent_messages` 表已有 `client_request_id String(64)` 欄位 + partial UNIQUE index（migration `20260429_l7i8j9k0l1m2_parent_message_tables.py`），對應 endpoint `api/parent_portal/messages.py` 已實作 idempotent replay（透過 `append_message()` helper 回 `replayed` flag + response `"idempotent_replay"` field）。沿用此 pattern 取代原 spec 預想的新欄位。

**Migration**（一支，例如 `paroff01_parent_offline_client_request_id`）—— 只需處理 2 表（**訊息表已存在**）：

```sql
ALTER TABLE student_contact_book_replies ADD COLUMN client_request_id VARCHAR(64) NULL;
CREATE UNIQUE INDEX ix_student_contact_book_replies_client_request_id
    ON student_contact_book_replies (client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE student_leave_requests ADD COLUMN client_request_id VARCHAR(64) NULL;
CREATE UNIQUE INDEX ix_student_leave_requests_client_request_id
    ON student_leave_requests (client_request_id) WHERE client_request_id IS NOT NULL;
```

**Partial UNIQUE** 不影響舊紀錄（`client_request_id IS NULL` 時不受 UNIQUE 約束）。

**Router endpoint 改造（只 2 個 endpoint 需要改）**：
- `api/parent_portal/messages.py` ← **已支援 client_request_id idempotency**，**不需改**
- `api/parent_portal/contact_book.py` reply POST ← 加 `client_request_id: Optional[str]` 欄位，INSERT 觸發 23505 → SELECT `WHERE client_request_id=?` → 回原紀錄 200
- `api/parent_portal/leaves.py` create POST ← 同 pattern
- pytest 每新 endpoint 2 test：正常 POST / 重複 POST 同 client_request_id

**Rollout 順序**：BE migration + endpoint 先 ship → 前端 Phase 2 後上。避免前端送 `client_request_id` 但 BE 仍舊版 silent ignore。

### 6.3 Data flow

#### 6.3.1 Enqueue

```
家長按「送出」
   ↓
view 檢查 navigator.onLine + payload 含 file?
   ↓
├─ online + 無附件 → 直接 axios POST（不 enqueue）→ 200 → toast.success
├─ online + 有附件 → 直接 axios POST + uploadAttachment
├─ offline + 有附件 → toast.warn 阻擋（含附件需連線）→ return
└─ offline + 無附件 → enqueueParent({ kind, payload, meta })
                       ↓
                  注入 payload.client_request_id = crypto.randomUUID()
                       ↓
                  IndexedDB ivy-offline.pending_ops put
                       ↓
                  UI 樂觀更新（inline tag「等待同步」）+ Indicator 計數+1
                       ↓
                  **立即 trigger flush 一次**（緩解 LIFF eviction risk）
```

#### 6.3.2 Flush

5 個 trigger 收斂到 `flushAllParent()`（內 debounce 1s）：
1. `window.addEventListener('online')`
2. `parent main.ts` boot 時跑一次（hydrate session 之後）
3. `document.addEventListener('visibilitychange')` + `visibilityState==='visible'`
4. 各 view `onMounted` by kind（MessageThread / ContactBookDetail / EventAck / Leaves / Today 等）
5. `ParentOfflineIndicator` 手動點按

逐筆 op 處理：
- saveFn 200 → `removeOp` → succeeded++
- saveFn 23505（已收過）→ `removeOp` → succeeded++（視同成功）
- saveFn 401 → 走 axios refresh interceptor → 重試一次
  - 成功 → `removeOp`、繼續下一筆
  - 仍 401（refresh 也炸了）→ `auth_failed=true`、break 整輪、剩下 op 計入 `kept`、UI 提示重登 LINE
- saveFn 403 → `updateOp { status: 'needs_review', last_error }`（學生轉班 / 權限變更）
- saveFn 4xx → `attempts++`，≥5 標 needs_review
- saveFn 5xx / 網路錯 → `attempts++`，kept

回傳 `{ succeeded, needs_review, kept, auth_failed }`。

### 6.4 5 個 view 接入

| view | 寫入動作 | enqueue kind |
|---|---|---|
| `MessageThreadView.vue` | 送訊息 | `PARENT_MESSAGE` |
| `ContactBookDetailView.vue` | 回應 / ack | `CONTACT_BOOK_REPLY` / `CONTACT_BOOK_ACK` |
| `EventAckView.vue` | 事件確認（不含簽名）| `EVENT_ACK` |
| `LeavesView.vue` | 新申請（不含附件）| `PARENT_LEAVE_REQUEST` |
| `ContactBookView.vue` | 列表上的快速 ack | `CONTACT_BOOK_ACK` |

每個 view 改：
- import `enqueueParent`、`flushParentQueue`
- 送出 handler 內加 online/offline 分支
- 加 `onMounted` 觸發對應 kind 的 flush
- 樂觀 UI 顯示 inline「等待同步」tag

### 6.5 含附件 op 的暫存（view 層責任）

v1 不集中設計，由 view 各自決定：
- 訊息 / 聯絡簿 / 請假等 view 在離線含附件被阻擋時，可把文字部分暫存 `sessionStorage`，下次進頁面 prefill input。
- 不進 IndexedDB queue。
- v1 先做 `MessageThreadView`，其他 view 看 follow-up 需求。

## 7 · 錯誤處理與邊角

### 7.1 Idempotency

- partial UNIQUE INDEX 不影響舊紀錄
- UUIDv4 衝撞 1/2^122 可忽略
- flush 中 client crash → op 仍在 IndexedDB；BE 已收過 → 23505 視同成功 removeOp

### 7.2 Auth 過期 — 跟教師端設計分歧

教師端 `attendanceSync.ts` 401 是 break + `auth_failed=true`（不嘗試 refresh，因為 token 過期常代表 session 已死）。

家長端不同：30 天 LINE refresh token（[[project_parent_line_refresh_token_2026_05_03]]）能跨 session 救回。**家長端策略**：

- 遇 401 → 依賴既有 `parent/api/index.ts` axios refresh interceptor 跑 refresh once → 重試一次
- 成功 → 繼續 flush
- 仍 401 → `auth_failed=true`、break、UI 提示重登 LINE

**不重新實作 refresh**，完全靠 axios interceptor 避免 race。

### 7.3 LIFF webview eviction

iOS LINE 罕見 force kill webview 可能清 site data，op 消失家長以為送了。**緩解**：
- enqueue 後立即 try flush 一次（線上時也試），縮短 IndexedDB 滯留時間
- 樂觀 UI 顯示「等待同步」tag，家長至少看得到狀態未完
- Phase 0 spike 必測「切出去 30 秒回來 op 還在嗎」

**接受 v1 risk**：不做 server-side draft saving。

### 7.4 同 device 多 LINE 帳號切換

- op `user_id` partition（取 `parentAuth.user.user_id`）
- flush 只跑當前 `user_id` 的紀錄（既有 `listOps({ userId })` 路徑）
- `listOtherUsersPendingOps` 顯示「其他帳號 N 筆待同步、請該家長重新登入」

### 7.5 Needs_review UX

- ParentOfflineIndicator 點開 `ElMessageBox` 列每筆 `{ kind, created_at, last_error, meta }`
- 每筆兩個按鈕：「重試」（reset attempts=0、status=pending）/ 「聯絡管理員」（開 messages thread 或顯示電話）
- **不提供「丟棄」**：家長按下去資料無法復原

## 8 · Testing

### 8.1 Phase 0 spike

- 不寫 unit test（spike 性質 = 真機觀察）
- 交付 `.scratch/parent-pwa-liff-spike-YYYY-MM-DD.md`，20 cell 至少 16 個有結論
- 結論精簡版貼回 spec §10

### 8.2 Phase 1

- vitest：`parent.html` snapshot 含 manifest link（或 build 後 dist 抓 snapshot test）
- 手測：build → curl /parent.html | grep manifest / curl /parent.webmanifest
- 外部瀏覽器加到主畫面驗 icon + theme
- 飛航從主畫面開 → home/announcements/calendar 不白屏

### 8.3 Phase 2

**Frontend vitest**：

- `parentOfflineQueue.test.ts`：
  - `enqueueParent` 自動注入 client_request_id（UUID v4 regex）
  - userId 從 parentAuth store 抓
  - `flushParentQueue` 23505 視同成功 removeOp
  - 401 走 refresh 路徑（mock axios）
  - 403 → needs_review
  - 5xx → attempts++ ≥5 → needs_review
  - `listOtherUsersPendingOps` 跨帳號 partition

- `ParentOfflineIndicator.test.ts`：
  - 0 pending → 不顯示
  - N pending → 顯示「N 筆等待同步」
  - K needs_review → 顯示「K 筆無法同步」
  - 點按手動 flush 觸發

- 5 view 各 1 個 offline path test：offline 時送出走 enqueue 而非 axios POST

**Backend pytest**：

- 每 endpoint（3 個）2 test：正常 POST 含 client_request_id → 200 + persisted；重複 POST 同 client_request_id → 200 + 回原紀錄 + row count 不變
- migration test：upgrade + downgrade idempotent

### 8.4 手測 acceptance（Phase 2 收尾）

1. 飛航 → 開家長 App → 發 5 筆訊息 → Indicator 顯示「5 筆等待同步」
2. 解除飛航 → 自動 flush → 訊息送出、Indicator 消失
3. 飛航 → 發 1 筆 → 解除飛航前 kill app → 重開 → boot flush → 訊息送出
4. 線上發訊息 → BE 收到 → IndexedDB 不應有對應紀錄（不 enqueue）
5. 同 device LINE 換帳號 → A 的 pending 不被 B 送出、Indicator 顯示「其他帳號待同步」提示

## 9 · Acceptance criteria

- **Phase 0**：spike report 完成，20 cell ≥ 16 個有結論
- **Phase 1**：iPhone Safari 加到主畫面 + theme/icon 是家長 brand（or admin fallback icon）；飛航從主畫面開不白屏
- **Phase 2**：§8.4 五條手測通過 + vitest 全綠 + BE pytest 全綠 + 既有測試零 regression（CLAUDE.md 規範）

## 10 · 實測結論（Phase 0 spike 後回填）

> TODO: Phase 0 完成後在此填入 4×5 matrix 精簡版 + Phase 1 對應結論。

## 11 · Risk register

| Risk | 機率 | 影響 | 緩解 |
|---|---|---|---|
| iOS LINE webview SW 不可用 | 中 | Phase 1 縮水成只對外部瀏覽器有用 | §4.4 contingency |
| LIFF eviction 清 IndexedDB | 低 | op 消失（家長以為送了） | enqueue 後立刻 try flush + 樂觀 UI tag |
| client_request_id migration lock 表 | 低 | 短暫 503 | 低寫頻率表、deploy off-peak |
| 家長 brand icon 未備齊 | 中 | Phase 1 用 admin icon 上線 | Phase 1 內 icon swap fallback / follow-up |
| 同 device 換帳號 op 混淆 | 低 | 罕見 | userId partition 既有機制 |
| EVENT_ACK BE 並非冪等 | 低 | 重送導致重複 ack 紀錄 | Phase 2 plan 階段先 grep BE 確認語意，若非冪等加入 client_request_id 範圍 |
| BE migration deploy 跟前端 ship 順序錯 | 低 | 前端送 client_request_id 但 BE 仍舊版 silent ignore | rollout 順序 §6.2.5 + 前端先驗 BE 已 ready |

## 12 · 開放問題（plan 階段 verify）

1. **`EVENT_ACK` endpoint** 是否冪等？plan 階段 grep BE 確認，若非則加入 client_request_id migration 範圍。
2. **vite-plugin-pwa autoUpdate 是否 inject `registerSW.js` 到 parent.html**？Phase 0 spike 順便驗證。
3. **家長 brand icon asset 來源**：設計師有沒有現成 192/512/maskable？沒有 → fallback admin icon。
4. **`useConnectionStatus` 既有 WS 狀態**是否要納入 flush trigger（WS 重連即 flush）？v1 暫不納入，靠 5 trigger 已足。

## 13 · Out of scope（重申）

詳見 §2.2。

## 14 · 參考

- 教師端參考：`src/utils/offlineQueue.ts`、`src/utils/attendanceSync.ts`、`src/components/OfflineIndicator.vue`、`src/views/portal/PortalStudentAttendanceView.vue`
- 既有 SW config：`vite.config.js:179-461`
- 家長端進入點：`parent.html`、`src/parent/main.ts`
- 既有家長離線 banner：`src/parent/composables/useConnectionStatus.ts`
- 跨前後端規範：workspace 根 `CLAUDE.md` §「跨前後端變更流程（SOP）」
