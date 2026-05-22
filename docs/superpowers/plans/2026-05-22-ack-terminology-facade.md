# 聯絡簿 ack 術語統一為已讀軌 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把家長端聯絡簿從「冒充簽收軌」拉回已讀軌——前端 facade 把後端 `my_acknowledged_at` mapping 成 `readAt`/`isRead`，6 個 view/component 文案統一為「已讀／未讀」，詳情頁自動標記改為靜默 + badge 視覺進位。

**Architecture:** 純前端、後端零變更。`src/parent/api/contactBook.ts` 加 transformer 把 raw response 的 snake_case + 「簽收」誤稱欄位包裝成 camelCase domain shape；Vue 元件全面切換到 domain shape，文案改用「已讀」軌語言。事件簽閱（`EventAcknowledgment`）保留「簽收」字眼不動，與聯絡簿明確劃界。

**Tech Stack:** Vue 3 SFC `<script setup lang="ts">`、Vitest、TypeScript strict。

**參考 spec：** `docs/superpowers/specs/2026-05-22-ack-terminology-facade-design.md`

---

## 預備：開新 worktree

- [ ] **Step 0: 從最新 main 開 worktree**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin
git worktree add .claude/worktrees/ack-terminology-2026-05-22-frontend \
  -b feat/ack-terminology-facade-2026-05-22 origin/main
cd .claude/worktrees/ack-terminology-2026-05-22-frontend
npm ci  # 必用 npm 10.9.8，11 會 EUSAGE
```

預期：worktree 建好、`node_modules` 完成、`npm run typecheck` 在動工前先跑一次基準（應 0 錯）。

---

## Task 1: 在 `contactBook.ts` 加 facade types + transformers（TDD）

**Files:**
- Modify: `src/parent/api/contactBook.ts`（41 行 → ~95 行）
- Test: `tests/unit/parent/contactBook.test.js`（既有檔擴充）

**Spec 對應：** §2 前端 facade

### Step 1.1: 先擴充既有測試（紅）

- [ ] **Step 1.1**：在 `tests/unit/parent/contactBook.test.js` 既有 describe 區塊底部加入 transformer 測試

打開 `tests/unit/parent/contactBook.test.js`，在最後一個 `it(...)` 結束、`describe` 收尾 `})` 前插入：

```js
  describe('domain shape mapping', () => {
    it('getTodayContactBook 把 my_acknowledged_at 轉為 readAt/isRead', async () => {
      apiMock.get.mockResolvedValue({
        data: {
          entry: {
            id: 1,
            log_date: '2026-05-22',
            my_acknowledged_at: '2026-05-22T14:32:00',
            mood: 'happy',
          },
        },
      })
      const res = await getTodayContactBook(42)
      expect(res.data.entry).toMatchObject({
        id: 1,
        readAt: '2026-05-22T14:32:00',
        isRead: true,
        mood: 'happy',
      })
      expect(res.data.entry).not.toHaveProperty('my_acknowledged_at')
    })

    it('getTodayContactBook entry=null 時不爆', async () => {
      apiMock.get.mockResolvedValue({ data: { entry: null } })
      const res = await getTodayContactBook(42)
      expect(res.data.entry).toBeNull()
    })

    it('listContactBook 對 entries[] 逐筆轉換', async () => {
      apiMock.get.mockResolvedValue({
        data: {
          entries: [
            { id: 1, my_acknowledged_at: null },
            { id: 2, my_acknowledged_at: '2026-05-22T10:00:00' },
          ],
        },
      })
      const res = await listContactBook(7)
      expect(res.data.entries).toEqual([
        expect.objectContaining({ id: 1, readAt: null, isRead: false }),
        expect.objectContaining({ id: 2, readAt: '2026-05-22T10:00:00', isRead: true }),
      ])
      res.data.entries.forEach((e) => {
        expect(e).not.toHaveProperty('my_acknowledged_at')
      })
    })

    it('getContactBookDetail 轉換單筆 entry', async () => {
      apiMock.get.mockResolvedValue({
        data: { id: 99, my_acknowledged_at: '2026-05-22T08:00:00', mood: 'ok' },
      })
      const res = await getContactBookDetail(99)
      expect(res.data).toMatchObject({ id: 99, readAt: '2026-05-22T08:00:00', isRead: true })
      expect(res.data).not.toHaveProperty('my_acknowledged_at')
    })

    it('ackContactBook 轉換 read_at/already_marked → readAt/alreadyMarked', async () => {
      apiMock.post.mockResolvedValue({
        data: { read_at: '2026-05-22T14:32:00', already_marked: false },
      })
      const res = await ackContactBook(99)
      expect(res.data).toEqual({ readAt: '2026-05-22T14:32:00', alreadyMarked: false })
      expect(res.data).not.toHaveProperty('read_at')
      expect(res.data).not.toHaveProperty('already_marked')
    })

    it('ackContactBook already_marked=true 路徑', async () => {
      apiMock.post.mockResolvedValue({
        data: { already_marked: true, read_at: '2026-05-22T08:00:00' },
      })
      const res = await ackContactBook(99)
      expect(res.data).toEqual({ readAt: '2026-05-22T08:00:00', alreadyMarked: true })
    })
  })
```

### Step 1.2: 跑測試確認紅

- [ ] **Step 1.2**

Run:
```bash
npx vitest run tests/unit/parent/contactBook.test.js
```

Expected: 6 個新測試 FAIL（`readAt is undefined` 之類）；既有測試 PASS。

### Step 1.3: 改 `contactBook.ts` 加 facade

- [ ] **Step 1.3**

把 `src/parent/api/contactBook.ts` 整檔取代為：

```ts
/**
 * 家長端每日聯絡簿 API（v3.1 Phase 1）。
 *
 * 對應後端 api/parent_portal/contact_book.py。
 *
 * 本檔包含 facade：把後端 response 的 my_acknowledged_at / read_at /
 * already_marked 轉成 domain shape（readAt / isRead / alreadyMarked），
 * 讓 Vue 元件只看到統一的「已讀」軌語意，與公告對齊。
 *
 * 設計 spec：docs/superpowers/specs/2026-05-22-ack-terminology-facade-design.md
 */

import api from './index'

export interface ContactBookEntry {
  id: number | string
  log_date?: string
  student_id?: number
  mood?: string
  meal_lunch?: number | null
  meal_snack?: number | null
  nap_minutes?: number | null
  temperature_c?: number | null
  bowel?: string
  learning_highlight?: string
  teacher_note?: string
  photos?: unknown[]
  replies?: unknown[]
  readAt: string | null
  isRead: boolean
  [key: string]: unknown
}

export interface AckResponse {
  readAt: string | null
  alreadyMarked: boolean
}

interface RawEntry {
  my_acknowledged_at?: string | null
  [key: string]: unknown
}

interface RawAckResponse {
  read_at?: string | null
  already_marked?: boolean
  [key: string]: unknown
}

function toEntry(raw: RawEntry | null | undefined): ContactBookEntry | null {
  if (!raw) return null
  const { my_acknowledged_at, ...rest } = raw
  return {
    ...rest,
    readAt: my_acknowledged_at ?? null,
    isRead: !!my_acknowledged_at,
  } as ContactBookEntry
}

function toAckResponse(raw: RawAckResponse): AckResponse {
  return {
    readAt: raw.read_at ?? null,
    alreadyMarked: !!raw.already_marked,
  }
}

export async function getTodayContactBook(studentId: number, config: unknown = {}) {
  const res = await api.get('/parent/contact-book/today', {
    params: { student_id: studentId },
    ...(config as object),
  })
  return {
    ...res,
    data: { ...res.data, entry: toEntry(res.data?.entry) },
  }
}

export async function listContactBook(
  studentId: number,
  { from, to, limit = 30 }: { from?: string; to?: string; limit?: number } = {},
  config: unknown = {},
) {
  const res = await api.get('/parent/contact-book', {
    params: { student_id: studentId, from, to, limit },
    ...(config as object),
  })
  const rawEntries: RawEntry[] = res.data?.entries || []
  return {
    ...res,
    data: { ...res.data, entries: rawEntries.map((e) => toEntry(e)!).filter(Boolean) },
  }
}

export async function getContactBookDetail(entryId: number) {
  const res = await api.get(`/parent/contact-book/${entryId}`)
  return { ...res, data: toEntry(res.data) }
}

export async function ackContactBook(entryId: number) {
  const res = await api.post(`/parent/contact-book/${entryId}/ack`)
  return { ...res, data: toAckResponse(res.data || {}) }
}

export function replyContactBook(entryId: number, body: unknown) {
  return api.post(`/parent/contact-book/${entryId}/reply`, { body })
}

export function deleteContactBookReply(entryId: number, replyId: number) {
  return api.delete(`/parent/contact-book/${entryId}/replies/${replyId}`)
}
```

### Step 1.4: 跑測試確認綠

- [ ] **Step 1.4**

Run:
```bash
npx vitest run tests/unit/parent/contactBook.test.js
```

Expected: 全綠（既有 6 個 + 新 6 個 = 12 個 it）。

### Step 1.5: typecheck

- [ ] **Step 1.5**

Run:
```bash
npm run typecheck 2>&1 | grep -E "contactBook|ContactBook" || echo "no type errors in contact-book scope"
```

Expected: 印 `no type errors in contact-book scope` 或無 contactBook 相關錯誤（其他檔案會有錯——下一個 task 才修）。

### Step 1.6: commit

- [ ] **Step 1.6**

```bash
git add src/parent/api/contactBook.ts tests/unit/parent/contactBook.test.js
git commit -m "$(cat <<'EOF'
feat(parent): contactBook facade 包 readAt/isRead/alreadyMarked

把後端 my_acknowledged_at/read_at/already_marked 在 api 層轉成
domain shape，下游 view 元件只看 camelCase「已讀」軌語意。

EOF
)"
```

---

## Task 2: `ContactBookView.vue` 切到 domain shape + 文案改「未讀」

**Files:**
- Modify: `src/parent/views/ContactBookView.vue:19-24, 40-42, 125-127, 152`
- Test: `tests/unit/parent/views/ContactBookView.test.js`（若文案有斷言才動）

**Spec 對應：** §3 ContactBookView.vue 三條對照

### Step 2.1: 先看既有測試對該 view 文案的斷言

- [ ] **Step 2.1**

```bash
grep -n "未簽收\|簽收\|my_acknowledged_at\|isRead\|readAt" tests/unit/parent/views/ContactBookView.test.js tests/unit/parent/views/ContactBookView.routerNav.spec.js 2>/dev/null
```

如果命中「未簽收」就把它改成「未讀」、命中 `my_acknowledged_at` 就改成 `isRead`/`readAt`（同步 Step 2.4 之後）。如果 0 命中可略過測試更新。

### Step 2.2: 改 `ContactBookView.vue` 的 inline type 與引用

- [ ] **Step 2.2**

在 `src/parent/views/ContactBookView.vue`：

**取代 lines 19-24（inline type）：**
```ts
interface CbEntry {
  id: number | string
  log_date?: string
  my_acknowledged_at?: string | null
  [key: string]: unknown
}
```

為：
```ts
import type { ContactBookEntry as CbEntry } from '../api/contactBook'
```

並從 import 區塊中移除原本的 inline type（如有殘留）。

### Step 2.3: 改 unreadCount

- [ ] **Step 2.3**

在 lines 125-127，把：
```ts
const unreadCount = computed(() =>
  allEntries.value.filter((e) => !e.my_acknowledged_at).length,
)
```

改為：
```ts
const unreadCount = computed(() =>
  allEntries.value.filter((e) => !e.isRead).length,
)
```

### Step 2.4: 改 pill 文案

- [ ] **Step 2.4**

line 152：
```html
<span v-if="unreadCount > 0" class="unread-pill">{{ unreadCount }} 則未簽收</span>
```

改為：
```html
<span v-if="unreadCount > 0" class="unread-pill">{{ unreadCount }} 則未讀</span>
```

### Step 2.5: typecheck

- [ ] **Step 2.5**

```bash
npm run typecheck 2>&1 | grep "ContactBookView" || echo "ContactBookView OK"
```

Expected: `ContactBookView OK`（剩下 DetailView/Components 的錯誤後續 task 處理）。

### Step 2.6: 跑該 view 的測試

- [ ] **Step 2.6**

```bash
npx vitest run tests/unit/parent/views/ContactBookView.test.js tests/unit/parent/views/ContactBookView.routerNav.spec.js
```

Expected: 全綠（如 Step 2.1 已同步文案斷言）。

### Step 2.7: commit

- [ ] **Step 2.7**

```bash
git add src/parent/views/ContactBookView.vue tests/unit/parent/views/ContactBookView.test.js tests/unit/parent/views/ContactBookView.routerNav.spec.js
git commit -m "$(cat <<'EOF'
refactor(parent): ContactBookView 切到 domain shape + 文案改未讀

EOF
)"
```

（若兩個 test 檔未實際修改，git add 它們是 no-op，安全）

---

## Task 3: `ContactBookDetailView.vue` rename + 靜默化 + badge 進位

**Files:**
- Modify: `src/parent/views/ContactBookDetailView.vue:18-39, 164-177, 216-221, 321-341`
- Test: `tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js`（檢視；可能不需動，因該測只看 deleteReply）

**Spec 對應：** §3 ContactBookDetailView.vue 全部對照 + §1 靜默回饋

### Step 3.1: 先看既有測試影響

- [ ] **Step 3.1**

```bash
grep -n "manualAck\|已簽收\|未簽收\|簽收\|my_acknowledged_at\|toast.success" tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```

預期：deleteReply 測試純測 reply 流程，無 ack 相關斷言 → 不需改測。若有命中按下方對照同步改。

### Step 3.2: 改 inline type

- [ ] **Step 3.2**

在 `src/parent/views/ContactBookDetailView.vue` lines 18-39 區塊：

**移除 `CbEntry` 整個 interface（lines 24-39）**：
```ts
interface CbEntry {
  student_id?: number
  log_date?: string
  my_acknowledged_at?: string | null
  mood?: string
  meal_lunch?: number | null
  meal_snack?: number | null
  nap_minutes?: number | null
  temperature_c?: number | null
  bowel?: string
  learning_highlight?: string
  teacher_note?: string
  photos?: unknown[]
  replies?: Reply[]
  [key: string]: unknown
}
```

**保留 `Reply` interface（lines 18-22）。**

在現有 import 區塊（line 9 之後）加：
```ts
import type { ContactBookEntry as CbEntry } from '../api/contactBook'
```

### Step 3.3: rename `manualAck` → `markAsRead` 並靜默化

- [ ] **Step 3.3**

把 lines 164-177 整個 `async function manualAck()` 取代為：

```ts
async function markAsRead() {
  if (acking.value) return
  acking.value = true
  try {
    const { data } = await ackContactBook(entryId.value)
    if (entry.value) {
      entry.value.readAt = data.readAt
      entry.value.isRead = true
    }
    // 已讀軌：成功不跳 toast（被動行為，與「已讀」語意一致）
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '標記失敗，請重試'))
  } finally {
    acking.value = false
  }
}
```

### Step 3.4: 改 loadAndMark

- [ ] **Step 3.4**

lines 216-221：
```ts
async function loadAndMark() {
  await fetchData()
  if (entry.value && !entry.value.my_acknowledged_at) {
    await manualAck()
  }
}
```

改為：
```ts
async function loadAndMark() {
  await fetchData()
  if (entry.value && !entry.value.isRead) {
    await markAsRead()
  }
}
```

### Step 3.5: 改 badge 區塊（template）+ 按鈕

- [ ] **Step 3.5**

把 lines 321-341 區塊整段取代。先在 `<script setup>` 末尾（其他 function 之後）加 `formatTime` helper：

```ts
function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}
```

template 區塊 lines 321-341 把：

```html
      <!-- 簽收狀態 / 回覆 -->
      <section class="ack-section">
        <div class="ack-row">
          <div class="ack-status">
            <span v-if="entry.my_acknowledged_at" class="ack-badge is-read">
              <span class="dot" />
              已簽收
            </span>
            <span v-else class="ack-badge is-pending">
              <span class="dot" />
              尚未簽收
            </span>
          </div>
          <button
            v-if="!entry.my_acknowledged_at"
            type="button"
            class="ack-button"
            :disabled="acking"
            @click="manualAck"
          >
            手動簽收
          </button>
```

取代為：

```html
      <!-- 已讀狀態 / 回覆 -->
      <section class="ack-section">
        <div class="ack-row">
          <div class="ack-status">
            <span v-if="entry.isRead" class="read-badge is-read">
              <span class="dot" />
              已讀 · {{ formatTime(entry.readAt) }}
            </span>
            <span v-else class="read-badge is-pending">
              <span class="dot" />
              尚未閱讀
            </span>
          </div>
          <button
            v-if="!entry.isRead"
            type="button"
            class="read-button"
            :disabled="acking"
            @click="markAsRead"
          >
            標為已讀
          </button>
```

### Step 3.6: 同步 CSS class rename + 加 transition

- [ ] **Step 3.6**

在 `<style scoped>`（或同檔 style 區塊）找原 `.ack-badge` / `.ack-button` 樣式（grep 找 class name），把：

- `.ack-badge` → `.read-badge`
- `.ack-button` → `.read-button`

並在 `.read-badge` 樣式底加：
```css
.read-badge {
  transition: background-color 200ms ease, color 200ms ease;
}
.read-badge.is-read {
  background-color: var(--pt-color-success-bg, #e8f5e9);
  color: var(--pt-color-success, #2e7d32);
}
```

若原 `.ack-badge.is-read` 有自訂顏色，保留意圖只改 class name。若 token 變數不存在，先 hardcoded 顏色（family-friendly green），實作完成後評估是否抽 token。

### Step 3.7: 跑該 view 既有測試

- [ ] **Step 3.7**

```bash
npx vitest run tests/unit/parent/views/ContactBookDetailView.deleteReply.test.js
```

Expected: 全綠（deleteReply 流程未動）。

### Step 3.8: typecheck

- [ ] **Step 3.8**

```bash
npm run typecheck 2>&1 | grep "ContactBookDetailView" || echo "ContactBookDetailView OK"
```

Expected: `ContactBookDetailView OK`。

### Step 3.9: commit

- [ ] **Step 3.9**

```bash
git add src/parent/views/ContactBookDetailView.vue
git commit -m "$(cat <<'EOF'
refactor(parent): 聯絡簿詳情頁切已讀軌

- manualAck → markAsRead，成功靜默（被動行為與已讀語意一致）
- badge「已簽收/尚未簽收」→「已讀 · HH:MM/尚未閱讀」加時間戳
- 按鈕「手動簽收」→「標為已讀」
- error toast 文案「簽收失敗」→「標記失敗，請重試」

EOF
)"
```

---

## Task 4: 3 個 component 改 domain shape + aria-label 文案

**Files:**
- Modify: `src/parent/components/contact-book/ContactBookListItem.vue:8, 19, 57`
- Modify: `src/parent/components/contact-book/ContactBookDayCard.vue:14, 42, 70-71`
- Modify: `src/parent/components/contact-book/MonthDateStrip.vue:7, 96`

**Spec 對應：** §3「其他 4 個元件」

> 註：spec 列了 `useTodayTimeline.ts`，但實掃發現該檔的 `acknowledged_at` 屬接送（dismissal）系統 status，與聯絡簿無關，**不在本 task 範圍**。

### Step 4.1: ContactBookListItem.vue

- [ ] **Step 4.1**

打開 `src/parent/components/contact-book/ContactBookListItem.vue`：

**line 8**（inline type 欄位）：
```ts
my_acknowledged_at?: string | null
```
→
```ts
isRead?: boolean
```

> 若該 type 是更大的 interface，把它整個改成 `import type { ContactBookEntry } from '@/parent/api/contactBook'` 並改 props 型別；若只有少量欄位 inline，直接就地改即可。實作時用 grep 看 interface 範圍決定。

**line 19**：
```ts
const isUnread = computed<boolean>(() => !props.entry?.my_acknowledged_at)
```
→
```ts
const isUnread = computed<boolean>(() => !props.entry?.isRead)
```

**line 57**（aria-label）：
```html
<span v-if="isUnread" class="unread-dot" aria-label="未簽收" />
```
→
```html
<span v-if="isUnread" class="unread-dot" aria-label="未讀" />
```

### Step 4.2: ContactBookDayCard.vue

- [ ] **Step 4.2**

打開 `src/parent/components/contact-book/ContactBookDayCard.vue`：

**line 14**（同 4.1 規則）：
```ts
my_acknowledged_at?: string | null
```
→
```ts
isRead?: boolean
```

**line 42**：
```ts
const isUnread = computed<boolean>(() => !props.entry?.my_acknowledged_at)
```
→
```ts
const isUnread = computed<boolean>(() => !props.entry?.isRead)
```

**lines 70-71**：
```html
<span v-if="isUnread" class="unread-dot" aria-label="尚未簽收" />
<span v-else class="read-check" aria-label="已簽收">
```
→
```html
<span v-if="isUnread" class="unread-dot" aria-label="尚未閱讀" />
<span v-else class="read-check" aria-label="已讀">
```

### Step 4.3: MonthDateStrip.vue

- [ ] **Step 4.3**

打開 `src/parent/components/contact-book/MonthDateStrip.vue`：

**line 7**：
```ts
my_acknowledged_at?: string | null
```
→
```ts
isRead?: boolean
```

**line 96**：
```ts
      !entriesByDate.value.get(d.iso)?.my_acknowledged_at,
```
→
```ts
      !entriesByDate.value.get(d.iso)?.isRead,
```

### Step 4.4: typecheck

- [ ] **Step 4.4**

```bash
npm run typecheck 2>&1 | tail -30
```

Expected: 0 錯（若仍有錯，多半是 spec 之外的場景——例如某個 collateral 仍引用 `my_acknowledged_at`，按錯誤訊息逐一修）。

### Step 4.5: vitest 全套

- [ ] **Step 4.5**

```bash
npx vitest run
```

Expected: 全綠（基準應對齊 main 上的 pass/fail count；本 PR 不該新增任何 fail）。

### Step 4.6: commit

- [ ] **Step 4.6**

```bash
git add src/parent/components/contact-book/ContactBookListItem.vue \
        src/parent/components/contact-book/ContactBookDayCard.vue \
        src/parent/components/contact-book/MonthDateStrip.vue
git commit -m "$(cat <<'EOF'
refactor(parent): 聯絡簿 3 元件切 isRead + aria-label 改已讀軌

EOF
)"
```

---

## Task 5: 驗收（grep gate + smoke）

**Files:** 無新增；只跑檢查。

### Step 5.1: grep gate

- [ ] **Step 5.1**

```bash
grep -rn "my_acknowledged_at" src/parent --include="*.vue" --include="*.ts" 2>/dev/null
```

Expected: **僅** `src/parent/api/contactBook.ts` 內 transformer 出現（`my_acknowledged_at, ...rest`）；其他檔 0 命中。

```bash
grep -rn "簽收" src/parent --include="*.vue" --include="*.ts" 2>/dev/null
```

Expected: 命中應只有：
- `src/parent/views/EventAckView.vue`（簽收軌保留）
- `src/parent/views/EventsView.vue`（簽收軌保留）
- `src/parent/api/medications.ts`（follow-up 未處理）

如果命中其他檔，回去補修。

### Step 5.2: build

- [ ] **Step 5.2**

```bash
npm run build 2>&1 | tail -20
```

Expected: build 成功，無錯。

### Step 5.3: smoke 手測（本機）

- [ ] **Step 5.3**

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

開瀏覽器 `http://localhost:5173/parent`，登入家長帳號：

驗證項：
- 進「聯絡簿」首頁：若有未讀，標籤顯示「N 則未讀」（非「未簽收」）
- 點任一未讀進詳情：badge 從 outline「尚未閱讀」**過渡**到 filled「已讀 · HH:MM」（200ms）；**無 toast 彈出**
- 該日列表項與月曆 dot 隨之消失
- 再進同一筆：直接是 filled「已讀 · HH:MM」、按鈕已不在；無 toast

若任一項失敗，回對應 task 補。

### Step 5.4: 推 PR

- [ ] **Step 5.4**

```bash
git push -u origin feat/ack-terminology-facade-2026-05-22
gh pr create --title "refactor(parent): 聯絡簿 ack 術語統一為已讀軌" --body "$(cat <<'EOF'
## Summary

- 前端 facade：`contactBook.ts` 把後端 `my_acknowledged_at`/`read_at`/`already_marked` 轉成 `readAt`/`isRead`/`alreadyMarked`
- 6 個 view/component 文案統一到「已讀」軌（「已簽收/未簽收」→「已讀/未讀/尚未閱讀」）
- 詳情頁自動標記改靜默（被動行為與「已讀」語意一致），badge 進位含時間戳
- 事件簽閱（`EventAcknowledgment`）保留「簽收」字眼**不動**（屬簽收軌，有手寫簽名 + ack_deadline）

設計 spec: `docs/superpowers/specs/2026-05-22-ack-terminology-facade-design.md`

## Test plan

- [x] vitest 全綠（含新增 6 條 facade transformer 測試）
- [x] typecheck 0 錯
- [x] grep gate：`my_acknowledged_at` 僅 facade 一處；`簽收` 僅 EventAck/Events/medications 三檔
- [x] 本機 smoke：聯絡簿首頁→詳情頁過渡/靜默/badge 三項手測

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review 記錄

**Spec coverage：**
- §1 術語矩陣 → Task 2/3/4 文案改動覆蓋 ✓
- §2 facade → Task 1 ✓
- §3 ContactBookView → Task 2 ✓
- §3 ContactBookDetailView → Task 3 ✓
- §3 3 個元件 → Task 4 ✓
- §3 useTodayTimeline → spec 誤列，已在 Task 4 註記排除 ✓
- §4 後端 follow-up → spec 已列、計畫不做 ✓
- §5 測試策略 → Task 1 新增 + Task 2/3 既有跑一次 ✓

**Placeholder scan：** 無 TBD/TODO；formatTime helper 完整給 code；CSS token 缺時的 fallback 已寫；grep gate 條件明確。

**Type consistency：** `markAsRead`（rename from `manualAck`）在 Task 3 Step 3.3、3.5、3.6 名稱一致；`readAt`/`isRead`/`alreadyMarked` 在 Task 1/2/3/4 名稱一致；`ContactBookEntry` 與 `AckResponse` 在 facade 定義、在 view import。
