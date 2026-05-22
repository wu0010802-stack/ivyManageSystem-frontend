# 家長端 ack 術語統一與前端 facade 設計

**日期**：2026-05-22
**範圍**：純前端（ivy-frontend `src/parent/`），後端零變更
**狀態**：spec — 待 user review 後進 writing-plans

---

## 1. 背景與問題

家長端目前混用「簽收／已讀／已確認」三個動詞，且後端 API 欄位命名與 DB 真實欄位語意不一致。具體有三組獨立的 ack 子系統：

| 子系統 | DB 模型/欄位 | API 對外欄位 | UI 文案 | 是否含法律意涵 |
|--------|------------|-------------|--------|--------------|
| 公告 | `AnnouncementParentRead.read_at`、`AnnouncementRead.read_at` | `read_at` | 「已讀 N 人」「尚未有人已讀」 | 否（純統計） |
| 電子聯絡簿 | `StudentContactBookAck.read_at` | **`my_acknowledged_at`** ← 欄名膨脹 | 「已簽收／手動簽收／未簽收／已簽收今日聯絡簿」 | 否（無 deadline、無簽名） |
| 事件需簽閱 | `EventAcknowledgment.acknowledged_at` + `signature_attachment_id` + `signature_uploaded_at` | `acknowledged_at` | 「事件簽收／送出簽收／已簽收」 | **是**（手寫簽名 PNG、`ack_deadline` 後鎖死） |

**核心問題**：聯絡簿那層後端真實欄位是 `read_at`，但 API response 包裝成 `my_acknowledged_at`，UI 又升級成「簽收」——等於把「已讀」這層的東西冒充成「簽收」儀式感，產品語意層層膨脹。真正有稽核重量的只有事件那層。

**附帶問題**：進詳情頁自動 manualAck 無 UI 提示（只 badge 色變），但「簽收」這個動詞會讓家長預期有更顯著的回饋。

---

## 2. 範圍

### In scope（本次做）

- 前端 `src/parent/api/contactBook.ts` 加 transformer，把 `my_acknowledged_at` → `readAt` / `isRead`
- 6 個 view/component 改用 domain 欄位 + 文案統一到「已讀」軌
- `ContactBookDetailView.vue` 自動標記為已讀時靜默化（移除 success toast），badge 視覺進位呈現狀態
- 新增 `tests/parent/api/contactBook.test.ts` 4 函式單測

### Out of scope（不做、列 follow-up）

- 後端 `parent_portal/contact_book.py` response 欄位更名 → 待下一輪 API 重整
- `EventAcknowledgment` 軌道任何字串／行為（保留「簽收」字眼，因為真有 signature + deadline）
- `medications.ts` 內的 acknowledgement 字串 → 需先釐清醫療同意書是否含 signature/deadline 才能決定軌道
- admin 端（公告管理、事件管理）零動
- `MessageThreadView` / `NotificationPrefsView` / `CalendarView` / `ActivityView` 內的「已讀／已確認」統計詞保留

---

## 3. 設計

### §1 術語矩陣

兩條軌道，文案 1:1 對應；未來新增訊息類型也只能落到其中一軌。

| 軌道 | 後端模型 | 前端 domain 欄位 | UI 動詞 | UI 狀態詞 | UI 觸發 | Success Toast |
|------|---------|---------------|--------|---------|--------|--------------|
| **已讀軌（passive）** | `AnnouncementParentRead` / `StudentContactBookAck` | `readAt` / `isRead` | 「標為已讀」 | 「已讀 · 14:32」/「未讀」 | 進詳情自動 + 手動按鈕 | **無**（error 才提示：「標記失敗，請重試」） |
| **簽收軌（active, audit）** | `EventAcknowledgment` | `acknowledgedAt` / `isAcknowledged` | 「送出簽收」 | 「已簽收 · 14:32」/「待簽收」 | 必須手動 + 手寫簽名 | **有**：「已簽收」 |

**判定原則**：有 `ack_deadline` 或 `signature` 才屬簽收軌。聯絡簿兩者都沒有 → 已讀軌。

---

### §2 前端 facade（API 邊界）

只動 `src/parent/api/contactBook.ts`。新增一層 transformer，Vue 元件只看 domain shape。

**新增 type（檔內 export，不放 `_generated/typed.d.ts`，這是前端 domain 不是 OpenAPI 契約）：**

```ts
export interface ContactBookEntry {
  id: number
  date: string
  // ...其他現有欄位從 schema.d.ts ApiResponse 取
  readAt: string | null      // 從 my_acknowledged_at 改名
  isRead: boolean            // 計算欄位，等價 readAt != null
}

export interface AckResponse {
  readAt: string
  alreadyMarked: boolean
}
```

**Transformer（內部 helper，不 export）：**

```ts
function toEntry(raw: ApiContactBookEntry): ContactBookEntry {
  const { my_acknowledged_at, ...rest } = raw
  return { ...rest, readAt: my_acknowledged_at ?? null, isRead: !!my_acknowledged_at }
}

function toAckResponse(raw: ApiAckResponse): AckResponse {
  return { readAt: raw.read_at, alreadyMarked: !!raw.already_marked }
}
```

**API 函式對外簽章改型別（行為不變）：**

- `getTodayContactBook()` → 內部 `toEntry` 包一層
- `listContactBook()` → `.map(toEntry)`
- `getContactBookEntry(id)` → `toEntry`
- `ackContactBookEntry(id)` → `toAckResponse`（HTTP endpoint 路徑 `/ack` 不變）

**邊界規則：**

- 禁止下列檔案再出現 `my_acknowledged_at` 字串：
  - `src/parent/views/ContactBookView.vue`
  - `src/parent/views/ContactBookDetailView.vue`
  - `src/parent/components/contact-book/ContactBookListItem.vue`
  - `src/parent/components/contact-book/ContactBookDayCard.vue`
  - `src/parent/components/contact-book/MonthDateStrip.vue`
  - `src/parent/composables/useTodayTimeline.ts`
- vitest unit test 斷言 transformer 輸出無原 snake_case 殘留
- ESLint 不另加 rule（範圍小，code review + grep 即可）

---

### §3 UI 行為細則

#### 文案與型別逐點對照

| 檔案:行 | Before | After |
|--------|-------|------|
| `ContactBookView.vue:22` | `my_acknowledged_at?: string \| null`（inline type） | 移除整段，改 `import type { ContactBookEntry } from '../api/contactBook'` |
| `ContactBookView.vue:126` | `.filter((e) => !e.my_acknowledged_at)` | `.filter((e) => !e.isRead)` |
| `ContactBookView.vue:152` | `{{ unreadCount }} 則未簽收` | `{{ unreadCount }} 則未讀` |
| `ContactBookDetailView.vue:27` | `my_acknowledged_at?: string \| null` | 同上移除改 import |
| `ContactBookDetailView.vue:164` | `async function manualAck()` | `async function markAsRead()` |
| `ContactBookDetailView.vue:169` | `entry.value.my_acknowledged_at = data.read_at` | `entry.value.readAt = data.readAt; entry.value.isRead = true` |
| `ContactBookDetailView.vue:170` | `if (!(data as { already_marked?: boolean })?.already_marked) toast.success('已簽收今日聯絡簿')` | **整段 if + toast 移除**（不再顯示成功 toast） |
| `ContactBookDetailView.vue:173` | `toast.error(... '簽收失敗')` | `toast.error(... '標記失敗，請重試')` |
| `ContactBookDetailView.vue:218-219` | `if (!entry.value.my_acknowledged_at) await manualAck()` | `if (!entry.value.isRead) await markAsRead()` |
| `ContactBookDetailView.vue:321` | `<!-- 簽收狀態 / 回覆 -->` | `<!-- 已讀狀態 / 回覆 -->` |
| `ContactBookDetailView.vue:325-327` | `<span v-if="entry.my_acknowledged_at" class="ack-badge is-read">已簽收</span>` | `<span v-if="entry.isRead" class="read-badge is-read">已讀 · {{ formatTime(entry.readAt) }}</span>` |
| `ContactBookDetailView.vue:331` | `尚未簽收` | `尚未閱讀` |
| `ContactBookDetailView.vue:335` | `v-if="!entry.my_acknowledged_at"` | `v-if="!entry.isRead"` |
| `ContactBookDetailView.vue:341` | `手動簽收` | `標為已讀` |

#### Badge 視覺進位（靜默回饋）

- `.read-badge.is-read`：背景 `var(--pt-color-success-bg)`、文字 `var(--pt-color-success)`、加 √ icon、加 `· 14:32` 時間（`formatTime` 用既有 `utils/datetime.ts`）
- `.read-badge.is-pending`：outline、文字「尚未閱讀」灰
- 兩態之間 `transition: background 200ms ease`，避免硬切

#### 其他 4 個元件

- `ContactBookListItem.vue` / `ContactBookDayCard.vue` / `MonthDateStrip.vue` / `useTodayTimeline.ts`：
  - 逐檔 grep `my_acknowledged_at\|簽收\|acknowledg`
  - 全部對齊到 domain shape（`isRead` / `readAt`）+ 已讀文案

#### 不動的地方（避免 scope creep）

- `EventAckView.vue` / `EventsView.vue` 內所有「簽收」字眼 → 保留（屬簽收軌）
- `medications.ts` → follow-up 處理
- `MessageThreadView.vue` / `NotificationPrefsView.vue` / `CalendarView.vue` / `ActivityView.vue` 統計詞 → 保留
- admin 端零動

---

### §4 後端 follow-up（不在本次做）

| 項目 | 嚴重度 | 提案 |
|------|-------|------|
| `parent_portal/contact_book.py` response 欄位 `my_acknowledged_at` 與 DB 真實欄位 `read_at` 不一致 | 低（前端 facade 已遮罩） | 下一輪 API 重整時改回 `read_at`，附 1-2 release deprecation window；OpenAPI regen → 前端 facade 同步移除 transformer |
| `medications.ts` ack 字串軌道未定 | 中 | 另起 mini-spec 釐清（用藥同意是否需 signature/deadline → 若需要走簽收軌） |

---

### §5 測試策略

| Layer | 新增測試 | 既有測試影響 |
|-------|---------|------------|
| `parent/api/contactBook.ts` | **新增** `tests/parent/api/contactBook.test.ts`：4 函式各 mock axios raw response，斷言回傳 domain shape（`readAt`/`isRead`），且不含 `my_acknowledged_at` 字串 | 無 |
| `parent/views/ContactBookView` | 既有 spec（若有）跑一次抓 regression | 文案斷言 `未簽收` → `未讀` 需同步更新 |
| `parent/views/ContactBookDetailView` | 既有 spec 跑一次；補一個 case「自動進詳情後 `toast.success` 不被呼叫」 | 若原 spec 斷言 `toast.success` 被呼叫，需刪除 |
| 後端 | **零變更**，全 4600+ pytest 不該動 | — |

---

## 4. 驗收標準

- vitest 全綠（含新測 + 改測）
- `npm run typecheck` 零錯
- `grep -rn "my_acknowledged_at\|簽收" ivy-frontend/src/parent --include="*.vue" --include="*.ts"` 只應命中：
  - `EventAckView.vue`（簽收軌保留）
  - `EventsView.vue`（簽收軌保留）
  - `api/medications.ts`（follow-up）
  - 其餘 0 命中
- 手動 smoke：`./start.sh` 開家長端 → 進聯絡簿詳情 → badge 從 outline 變 filled、無 toast、按鈕消失

---

## 5. 風險與緩解

| 風險 | 機率 | 影響 | 緩解 |
|------|-----|------|------|
| facade 漏網（某元件繼續吃 `my_acknowledged_at`） | 中 | 編譯期可抓（TS strict） + 驗收的 grep gate | TypeScript 改型別後 caller 端會型別錯，typecheck 直接擋 |
| 既有 vitest 斷言文案被改 → 紅 | 高 | 必須同步更新 | 計畫的測試影響欄位已標註，實作時逐個對應 |
| 後端 response 仍是 snake_case → 前端 facade 必須準確 mapping | 中 | runtime 抓不到（會變 undefined） | 新增 contactBook.test.ts 直接驗 mapping；smoke test 走完整路徑 |
| 「靜默 + badge 進位」家長未察覺自己已標記 | 低 | UX 反饋 | badge 加時間戳「已讀 · 14:32」提供明確視覺；手動按鈕仍存在當 fallback |
| 並行 worktree（parent-ia-restructure、parent-child-selector）動到同檔 | 中 | merge conflict | 實作時開新 worktree base 於最新 main；merge 前 rebase；若衝突優先保留 IA restructure 結構，本 spec 文案/型別改動再 reapply |

---

## 6. Scope 估算

- 純前端，7~10 檔（contactBook.ts + 6 view/component + 1 新測試 + 0~2 既有 spec 更新），~1.5h 實作 + ~30min 測試
- 單一 commit；建議 message：`refactor(parent): unify contact book ack terminology to read-track facade`
- 不需開 PR 拆分；可直接走 worktree → main 流程
