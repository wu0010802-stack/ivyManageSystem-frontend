# 家長端首屏任務流收斂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把家長端首頁重複三處的待辦資訊收斂成單一「待辦」清單，並補齊事務頁與我的頁的入口斷裂，全程零後端變更。

**Architecture:** 新增一個 `useParentTodos` composable 聚合三個既有資料來源（home summary、入學文件簽署、臨時接送授權），由首頁 `HomeTodoList` 與事務頁 `AdminListView` 共用；娃娃車兩格從首頁抽成 `HomeBusRow`；今日動態時間軸刪掉被寫死塞進「晚一些」桶的五種待辦事件與「尚未到校」占位事件。首頁頂部區塊整塊凍結不動。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Pinia、Vue Router、Vitest ＋ @vue/test-utils、Vite。家長端專用 M3 元件庫（`src/parent/components/m3/`），禁 Element Plus。

**Spec:** `docs/superpowers/plans/../specs/2026-09-02-parent-home-todo-consolidation-design.md`（同 repo：`docs/superpowers/specs/2026-09-02-parent-home-todo-consolidation-design.md`）

## Global Constraints

- **工作目錄**：`~/Desktop/ivy-frontend/.claude/worktrees/parent-home-todo`，分支 `feat/parent-home-todo-consolidation`，底座 `origin/staging` @ `2fe63c14`。所有指令都在此 worktree 內執行。
- **首頁頂部區塊零 diff**：`src/parent/components/home/HomeHeroHeader.vue`、`src/parent/components/home/QuickActionsBar.vue`、`src/parent/utils/quickActionModules.ts`、`src/parent/composables/useQuickActionSlots.ts` 四檔本分支不得有任何改動（owner 裁定）。
- **零後端變更**：不改 `ivy-backend` 任何檔案，不重跑 OpenAPI codegen，`src/api/_generated/` 不動。
- **Element-Plus-free**：`src/parent/` 內禁止 `import 'element-plus'` 與 `<el-*>`；禁止靜態 import `@/components/common/EmptyState.vue`（會把 admin-core chunk 拖進首屏）。允許 `@/components/common/MobileErrorRetry.vue`（既有首屏元件已在用）。
- **TS strict**：禁 `: any` 與 `as any`（ESLint `no-explicit-any` 為 error）。`@ts-expect-error` 需附 ≥3 字說明。日期一律用 `@/utils/format` 的 `todayISO`／`dateToLocalISO` 或 `@/utils/taipeiTime`，禁 `toISOString().slice/split`。
- **Icon 限自架子集既有 glyph**：只可用 `payments`、`history_edu`、`mark_email_read`、`fact_check`、`palette`、`hail`、`event_busy`、`campaign`、`chevron_right`、`directions_bus`、`help`（`help` 需在 Task 7 先確認子集內存在，不存在則改用 `mark_email_read` 以外的既有 glyph，見該 Task 步驟）。
- **文案守則**（`DESIGN.md`）：全繁體中文、不用驚嘆號收尾、不用 em dash「—」於正文。固定用詞：`/events`＝「待簽文件」、`/sign`＝「入學文件簽署」、離園＝「已離園」、later 桶＝「傍晚」。
- **快取鍵前綴**：新 `useCachedAsync` key 一律以 `parent/` 開頭，登出時 `invalidateCachedAsync('parent/')` 才清得到。
- **測試兩棵樹**：`src/parent/**/__tests__/`（新測試放這裡）與 `tests/unit/parent/`（既有測試，改動元件行為時必須同步檢查）。
- **驗證指令**：測試 `npx vitest run <path>`；lint `npm run lint`；build **必須** `npm run build`（含 chunk gate），**不可**用 `npx vite build`。
- **typecheck 必須加大 heap**：直接跑 `npm run typecheck` 會在這台機器 OOM 崩潰（node 進程 abort，輸出一長串 stack trace，看起來像 crash 而不是型別錯誤）。一律用：
  ```bash
  NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck
  ```
  成功時只會印出兩行指令 echo、沒有其他輸出。看到 `LoadEnvironment` 之類的 stack trace 就是 OOM，不是你的程式碼有問題，加上 `NODE_OPTIONS` 重跑。
- **測試 stub 要用 `findComponent({ name })` 找的話，stub 物件必須自己寫 `name`**：inline stub 物件不會自動帶元件名，少了它 `findComponent` 只會拿到空 wrapper，接著 `.vm` 就丟 `Cannot call vm on an empty VueWrapper`。這是 Task 3 踩過的坑，修法是在 stub 物件加一行 `name: 'XxxComponent',`，斷言本身不用動。
- **Commit**：Conventional Commits、繁體中文訊息、一律路徑限定（共用 checkout 有平行 session，裸 commit 會掃走別人的 staged 檔案）。**旗標必須排在 `--` 之前**，否則 git 把 `-m` 與訊息當成 pathspec 而失敗：
  ```bash
  # 對：訊息寫進暫存檔再用 -F（多行訊息最穩）
  git commit -F /tmp/ivy-msg.txt -- <路徑1> <路徑2>

  # 錯：-m 落在 -- 之後會被當成路徑
  git commit -- <路徑> -m "訊息"
  ```
  每個 commit 訊息結尾加上：
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
  ```

---

## File Structure

**新增**

| 檔案 | 責任 |
|------|------|
| `src/parent/composables/useParentTodos.ts` | 聚合三來源、產生固定順序的待辦列陣列，首頁與事務頁唯一真源 |
| `src/parent/composables/__tests__/useParentTodos.test.ts` | 上者的單元測試 |
| `src/parent/components/home/HomeTodoList.vue` | 首頁「待辦」區塊的呈現（清單、三態、a11y） |
| `src/parent/components/home/__tests__/HomeTodoList.test.ts` | 上者的元件測試 |
| `src/parent/components/home/HomeBusRow.vue` | 首頁娃娃車兩種 tile ＋「今天不搭」sheet 的完整互動 |
| `src/parent/components/home/__tests__/HomeBusRow.test.ts` | 上者的元件測試（含 race guard 與雙擊重入） |

**修改**

| 檔案 | 改什麼 |
|------|--------|
| `src/parent/composables/useHomeSummary.ts` | `HomeBadges` 補 `pendingSurveyCount`；`adminTabBadge` 加計；註解說明與待辦清單的差異 |
| `src/parent/composables/useTodayTimeline.ts` | 刪五種 summary 衍生事件、刪「尚未到校」占位事件、桶標籤改「傍晚」、離園改「已離園」 |
| `src/parent/views/TodayView.vue` | 移除橫幅／bento／四格 tile／bus 邏輯／pickup 與 signDoc 抓取；掛 `HomeTodoList`／`HomeBusRow` |
| `src/parent/views/AdminListView.vue` | 十項目表、改用 `useParentTodos` 取兩個非 summary 計數、`pendingSurveyCount` 改讀 badges |
| `src/parent/views/MeView.vue` | 刪費用卡與其 `useCachedAsync`、刪「費用查詢」、加「常見問題」 |
| `src/parent/router.ts` | `/assistant` 的 meta 補 `tab: 'me'` |
| `src/parent/styles/globals.css` | 刪兩個橫幅的專用樣式（若有） |

**刪除**（含兩棵樹對應測試）

- `src/parent/components/home/PendingSignBanner.vue`
- `src/parent/components/home/PendingSurveyBanner.vue`
- `src/parent/components/me/FeeSummaryCard.vue`
- `src/parent/components/__tests__/PendingSurveyBanner.test.ts`
- `tests/unit/parent/components/home/PendingSignBanner.test.js`
- `tests/unit/parent/components/me/FeeSummaryCard.test.js`

---

### Task 1: `useParentTodos` composable

**Files:**
- Create: `src/parent/composables/useParentTodos.ts`
- Test: `src/parent/composables/__tests__/useParentTodos.test.ts`

**Interfaces:**
- Consumes: `useHomeSummary()`（既有，`src/parent/composables/useHomeSummary.ts`，回傳 `{ summary, badges, error, pending, refresh }`）；`listMySignRequests()`（既有，`src/parent/api/signDocuments.ts`，回傳 `AxiosResponse<{ pending: unknown[]; signed: unknown[] }>`）；`listPickupAuthorizations({ status })`（既有，`src/parent/api/pickup.ts`，回傳 `AxiosResponse<{ items?: unknown[] }>`）；`useCachedAsync(key, fetcher, { ttl, immediate })`（既有，`src/composables/useCachedAsync.ts`）。
- Produces:
  ```ts
  export type ParentTodoKey =
    | 'fees' | 'signDocs' | 'eventAcks' | 'surveys'
    | 'promotions' | 'pickup' | 'leaveReviews' | 'announcements'
  export type ParentTodoTone = 'alert' | 'action' | 'info'
  export interface ParentTodo {
    key: ParentTodoKey
    label: string
    count: number
    sub?: string
    tone: ParentTodoTone
    icon: string
    to: string
  }
  export const SIGN_DOCS_CACHE_KEY = 'parent/sign-requests/mine'
  export const PICKUP_ACTIVE_CACHE_KEY = 'parent/pickup/active'
  export function useParentTodos(options?: { immediate?: boolean }): {
    todos: ComputedRef<ParentTodo[]>
    actionCount: ComputedRef<number>
    signDocsCount: ComputedRef<number>
    pickupActiveCount: ComputedRef<number>
    pending: ComputedRef<boolean>
    error: ComputedRef<unknown>
    refresh: () => Promise<void>
  }
  ```

- [ ] **Step 1: 寫失敗測試**

Create `src/parent/composables/__tests__/useParentTodos.test.ts`:

```ts
/**
 * useParentTodos — 家長端待辦清單的唯一真源。
 *
 * 重整前同一筆待辦最多出現三次（首頁頂部橫幅、首頁 bento 方格、今日動態），
 * 每處各自從 summary 讀欄位、各自做 null guard。這支把八種待辦收斂成一份
 * 固定順序的陣列，首頁與事務頁共用。
 *
 * 涵蓋：
 *  - 八種列各自取對欄位、count 為 0 不產生列
 *  - 固定順序（不因逾期而重排）
 *  - 逾期走 alert tone、sub 改顯示逾期金額
 *  - 部分來源失敗時，其餘來源已有的列照常渲染
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const summaryRef = ref<Record<string, unknown> | null>(null)
const summaryError = ref<unknown>(null)
const summaryPending = ref(false)
const refreshSummary = vi.fn()

vi.mock('@/parent/composables/useHomeSummary', () => ({
  HOME_SUMMARY_CACHE_KEY: 'parent/today/summary',
  useHomeSummary: () => ({
    summary: summaryRef,
    error: summaryError,
    pending: summaryPending,
    refresh: refreshSummary,
  }),
}))

const listMySignRequests = vi.fn()
const listPickupAuthorizations = vi.fn()
vi.mock('@/parent/api/signDocuments', () => ({
  listMySignRequests: (...a: unknown[]) => listMySignRequests(...a),
}))
vi.mock('@/parent/api/pickup', () => ({
  listPickupAuthorizations: (...a: unknown[]) => listPickupAuthorizations(...a),
}))

import { useParentTodos } from '@/parent/composables/useParentTodos'
import { _resetCacheForTesting } from '@/composables/useCachedAsync'

function setSummary(overrides: Record<string, unknown> = {}) {
  summaryRef.value = {
    unread_announcements: 0,
    fees: { outstanding_count: 0, outstanding: 0, overdue: 0 },
    pending_event_acks: 0,
    pending_survey_count: 0,
    pending_activity_promotions: 0,
    recent_leave_reviews: 0,
    ...overrides,
  }
}

/** 等待 composable 內兩支 fetch 的 microtask 收斂 */
async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  _resetCacheForTesting()
  vi.clearAllMocks()
  summaryError.value = null
  summaryPending.value = false
  listMySignRequests.mockResolvedValue({ data: { pending: [], signed: [] } })
  listPickupAuthorizations.mockResolvedValue({ data: { items: [] } })
  setSummary()
})

describe('useParentTodos 列的產生條件', () => {
  it('全部為 0：不產生任何待辦列', async () => {
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value).toEqual([])
  })

  it('待繳學費未逾期：tone=action，sub 顯示筆數', async () => {
    setSummary({ fees: { outstanding_count: 2, outstanding: 3600, overdue: 0 } })
    const { todos } = useParentTodos()
    await flush()
    const fees = todos.value.find((t) => t.key === 'fees')
    expect(fees).toBeTruthy()
    expect(fees!.label).toBe('待繳學費')
    expect(fees!.count).toBe(2)
    expect(fees!.tone).toBe('action')
    expect(fees!.sub).toBe('2 筆')
    expect(fees!.to).toBe('/fees')
  })

  it('待繳學費有逾期：tone=alert，sub 顯示逾期金額', async () => {
    setSummary({ fees: { outstanding_count: 2, outstanding: 3600, overdue: 1200 } })
    const { todos } = useParentTodos()
    await flush()
    const fees = todos.value.find((t) => t.key === 'fees')!
    expect(fees.tone).toBe('alert')
    expect(fees.sub).toContain('逾期')
    expect(fees.sub).toContain('1,200')
  })

  it('入學文件簽署：讀 listMySignRequests().data.pending 的長度，導向 /sign', async () => {
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }, { id: 2 }], signed: [] } })
    const { todos, signDocsCount } = useParentTodos()
    await flush()
    expect(signDocsCount.value).toBe(2)
    const row = todos.value.find((t) => t.key === 'signDocs')!
    expect(row.label).toBe('入學文件簽署')
    expect(row.count).toBe(2)
    expect(row.to).toBe('/sign')
  })

  it('待簽文件：讀 pending_event_acks，導向 /events', async () => {
    setSummary({ pending_event_acks: 3 })
    const { todos } = useParentTodos()
    await flush()
    const row = todos.value.find((t) => t.key === 'eventAcks')!
    expect(row.label).toBe('待簽文件')
    expect(row.count).toBe(3)
    expect(row.to).toBe('/events')
  })

  it('臨時接送：讀 listPickupAuthorizations 的 items 長度，tone=info', async () => {
    listPickupAuthorizations.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const { todos, pickupActiveCount } = useParentTodos()
    await flush()
    expect(pickupActiveCount.value).toBe(1)
    const row = todos.value.find((t) => t.key === 'pickup')!
    expect(row.tone).toBe('info')
    expect(row.to).toBe('/pickup')
  })

  it('未讀公告與請假審核結果為 info tone', async () => {
    setSummary({ unread_announcements: 5, recent_leave_reviews: 1 })
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value.find((t) => t.key === 'announcements')!.tone).toBe('info')
    expect(todos.value.find((t) => t.key === 'leaveReviews')!.tone).toBe('info')
  })
})

describe('useParentTodos 順序與計數', () => {
  it('順序固定為 fees→signDocs→eventAcks→surveys→promotions→pickup→leaveReviews→announcements，逾期不改變位置', async () => {
    setSummary({
      fees: { outstanding_count: 1, outstanding: 100, overdue: 100 },
      pending_event_acks: 1,
      pending_survey_count: 1,
      pending_activity_promotions: 1,
      recent_leave_reviews: 1,
      unread_announcements: 1,
    })
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }], signed: [] } })
    listPickupAuthorizations.mockResolvedValue({ data: { items: [{ id: 1 }] } })
    const { todos } = useParentTodos()
    await flush()
    expect(todos.value.map((t) => t.key)).toEqual([
      'fees', 'signDocs', 'eventAcks', 'surveys',
      'promotions', 'pickup', 'leaveReviews', 'announcements',
    ])
  })

  it('actionCount 只加總 action 與 alert 列，不含 info 列', async () => {
    setSummary({
      fees: { outstanding_count: 2, outstanding: 100, overdue: 0 },
      pending_event_acks: 3,
      unread_announcements: 99,
      recent_leave_reviews: 4,
    })
    const { actionCount } = useParentTodos()
    await flush()
    expect(actionCount.value).toBe(5)
  })
})

describe('useParentTodos 錯誤處理', () => {
  it('入學文件 API 失敗：不產生該列，但其他來源的列照常產生', async () => {
    listMySignRequests.mockRejectedValue(new Error('boom'))
    setSummary({ pending_event_acks: 2 })
    const { todos, signDocsCount } = useParentTodos()
    await flush()
    expect(signDocsCount.value).toBe(0)
    expect(todos.value.find((t) => t.key === 'signDocs')).toBeUndefined()
    expect(todos.value.find((t) => t.key === 'eventAcks')).toBeTruthy()
  })

  it('summary 失敗但入學文件成功：仍產生入學文件列，error 有值', async () => {
    summaryRef.value = null
    summaryError.value = new Error('summary down')
    listMySignRequests.mockResolvedValue({ data: { pending: [{ id: 1 }], signed: [] } })
    const { todos, error } = useParentTodos()
    await flush()
    expect(error.value).toBeTruthy()
    expect(todos.value.find((t) => t.key === 'signDocs')).toBeTruthy()
  })

  it('refresh 會重新呼叫兩支 API 與 summary refresh', async () => {
    const { refresh } = useParentTodos()
    await flush()
    listMySignRequests.mockClear()
    listPickupAuthorizations.mockClear()
    await refresh()
    await flush()
    expect(refreshSummary).toHaveBeenCalled()
    expect(listMySignRequests).toHaveBeenCalled()
    expect(listPickupAuthorizations).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/composables/__tests__/useParentTodos.test.ts`
Expected: FAIL，訊息為 `Failed to resolve import "@/parent/composables/useParentTodos"`

- [ ] **Step 3: 實作 composable**

Create `src/parent/composables/useParentTodos.ts`:

```ts
// src/parent/composables/useParentTodos.ts
/**
 * 家長端「待辦」的唯一真源。
 *
 * 重整前（2026-09-02 之前）同一筆待辦最多在首頁出現三次：頂部 sticky 橫幅、
 * bento 方格、今日動態的「晚一些」桶，三處各自從 summary 讀欄位、各自做
 * null guard 與型別斷言；事務頁與我的頁又各讀一次。這支把八種待辦收斂成
 * 一份固定順序的陣列，首頁 HomeTodoList 與事務頁 AdminListView 共用。
 *
 * 資料來源三支：
 *  1. GET /parent/home/summary（經 useHomeSummary，cache key parent/today/summary）
 *  2. GET /parent/sign-requests/mine（入學文件電子簽，summary 未聚合此欄位）
 *  3. GET /parent/pickup-authorizations?status=active（臨時接送，summary 亦無）
 *
 * 2、3 各自走 useCachedAsync 固定 key，首頁與事務頁同時掛載只會各打一次。
 * key 以 `parent/` 開頭，登出時 invalidateCachedAsync('parent/') 才清得掉。
 */
import { computed, type ComputedRef } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { formatCurrency } from '@/utils/currency'
import { listMySignRequests } from '../api/signDocuments'
import { listPickupAuthorizations } from '../api/pickup'
import { useHomeSummary } from './useHomeSummary'

export const SIGN_DOCS_CACHE_KEY = 'parent/sign-requests/mine'
export const PICKUP_ACTIVE_CACHE_KEY = 'parent/pickup/active'

export type ParentTodoKey =
  | 'fees' | 'signDocs' | 'eventAcks' | 'surveys'
  | 'promotions' | 'pickup' | 'leaveReviews' | 'announcements'

/**
 * tone 語意分三級，色調必須分開，否則「今天有 5 則公告」會被讀成「有事沒處理」：
 *  - alert：逾期款項，唯一該讓家長心跳快一下的情況
 *  - action：需要家長動手或該知道結果
 *  - info：純資訊，不計入標題的「N 件」
 */
export type ParentTodoTone = 'alert' | 'action' | 'info'

export interface ParentTodo {
  key: ParentTodoKey
  label: string
  count: number
  sub?: string
  tone: ParentTodoTone
  icon: string
  to: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function useParentTodos(options: { immediate?: boolean } = {}) {
  const { immediate = true } = options

  const {
    summary,
    error: summaryError,
    pending: summaryPending,
    refresh: refreshSummary,
  } = useHomeSummary({ immediate })

  const {
    data: signDocsData,
    error: signDocsError,
    pending: signDocsPending,
    refresh: refreshSignDocs,
  } = useCachedAsync(
    SIGN_DOCS_CACHE_KEY,
    async () => {
      const res = await listMySignRequests()
      return res.data
    },
    { ttl: 60_000, immediate },
  )

  const {
    data: pickupData,
    error: pickupError,
    pending: pickupPending,
    refresh: refreshPickup,
  } = useCachedAsync(
    PICKUP_ACTIVE_CACHE_KEY,
    async () => {
      const res = await listPickupAuthorizations({ status: 'active' })
      return res.data
    },
    { ttl: 60_000, immediate },
  )

  const signDocsCount = computed<number>(() => {
    const d = signDocsData.value as { pending?: unknown[] } | null
    return Array.isArray(d?.pending) ? d.pending.length : 0
  })

  const pickupActiveCount = computed<number>(() => {
    const d = pickupData.value as { items?: unknown[] } | null
    return Array.isArray(d?.items) ? d.items.length : 0
  })

  const todos = computed<ParentTodo[]>(() => {
    const s = (summary.value ?? {}) as {
      fees?: { outstanding_count?: unknown; outstanding?: unknown; overdue?: unknown }
      pending_event_acks?: unknown
      pending_survey_count?: unknown
      pending_activity_promotions?: unknown
      recent_leave_reviews?: unknown
      unread_announcements?: unknown
    }
    const fees = s.fees ?? {}
    const feesCount = num(fees.outstanding_count)
    const feesOverdue = num(fees.overdue)

    // 順序刻意固定，不做動態排序：家長每天看到的位置穩定，比「最急的浮上來」
    // 更符合 PRODUCT.md 的「安心、可信」調性。逾期以 tone 表達，不改位置。
    const rows: ParentTodo[] = [
      {
        key: 'fees',
        label: '待繳學費',
        count: feesCount,
        sub: feesOverdue > 0 ? `逾期 ${formatCurrency(feesOverdue)}` : `${feesCount} 筆`,
        tone: feesOverdue > 0 ? 'alert' : 'action',
        icon: 'payments',
        to: '/fees',
      },
      {
        key: 'signDocs',
        label: '入學文件簽署',
        count: signDocsCount.value,
        sub: `${signDocsCount.value} 份待簽`,
        tone: 'action',
        icon: 'history_edu',
        to: '/sign',
      },
      {
        key: 'eventAcks',
        label: '待簽文件',
        count: num(s.pending_event_acks),
        sub: `${num(s.pending_event_acks)} 份待簽收`,
        tone: 'action',
        icon: 'mark_email_read',
        to: '/events',
      },
      {
        key: 'surveys',
        label: '活動調查',
        count: num(s.pending_survey_count),
        sub: `${num(s.pending_survey_count)} 份待回覆`,
        tone: 'action',
        icon: 'fact_check',
        to: '/surveys',
      },
      {
        key: 'promotions',
        label: '才藝候補確認',
        count: num(s.pending_activity_promotions),
        sub: `${num(s.pending_activity_promotions)} 筆待確認`,
        tone: 'action',
        icon: 'palette',
        to: '/activity',
      },
      {
        key: 'pickup',
        label: '臨時接送進行中',
        count: pickupActiveCount.value,
        sub: `${pickupActiveCount.value} 筆授權`,
        tone: 'info',
        icon: 'hail',
        to: '/pickup',
      },
      {
        key: 'leaveReviews',
        label: '請假審核結果',
        count: num(s.recent_leave_reviews),
        sub: `${num(s.recent_leave_reviews)} 筆有結果`,
        tone: 'info',
        icon: 'event_busy',
        to: '/leaves',
      },
      {
        key: 'announcements',
        label: '未讀公告',
        count: num(s.unread_announcements),
        sub: `${num(s.unread_announcements)} 則`,
        tone: 'info',
        icon: 'campaign',
        to: '/announcements',
      },
    ]

    return rows.filter((r) => r.count > 0)
  })

  /** 標題「N 件」只算需要家長動作的，避免未讀公告把數字撐大。 */
  const actionCount = computed<number>(() =>
    todos.value
      .filter((t) => t.tone !== 'info')
      .reduce((sum, t) => sum + t.count, 0),
  )

  /**
   * 三個來源都還沒有資料時才算 pending。任一來源已有資料就直接渲染它的列，
   * 部分失敗不清空整份清單（真實失敗被偽裝成「沒有待辦」是家長端反覆出現
   * 過的 defect class）。
   */
  const pending = computed<boolean>(() => {
    const hasAny = !!summary.value || !!signDocsData.value || !!pickupData.value
    if (hasAny) return false
    return !!(summaryPending.value || signDocsPending.value || pickupPending.value)
  })

  const error = computed<unknown>(
    () => summaryError.value || signDocsError.value || pickupError.value || null,
  )

  async function refresh(): Promise<void> {
    await Promise.all([
      refreshSummary(true),
      refreshSignDocs(true),
      refreshPickup(true),
    ])
  }

  return {
    todos,
    actionCount,
    signDocsCount,
    pickupActiveCount,
    pending,
    error,
    refresh,
  } as {
    todos: ComputedRef<ParentTodo[]>
    actionCount: ComputedRef<number>
    signDocsCount: ComputedRef<number>
    pickupActiveCount: ComputedRef<number>
    pending: ComputedRef<boolean>
    error: ComputedRef<unknown>
    refresh: () => Promise<void>
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/parent/composables/__tests__/useParentTodos.test.ts`
Expected: PASS，12 個測試全綠。

若「順序固定」那個測試失敗且訊息顯示 `signDocs` 或 `pickup` 缺席，代表 `flush()` 的 microtask 輪數不夠，把 `flush()` 內的 `await Promise.resolve()` 增加到 5 次再跑。

- [ ] **Step 5: typecheck**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck`
Expected: 無錯誤輸出。

- [ ] **Step 6: Commit**

```bash
git add src/parent/composables/useParentTodos.ts src/parent/composables/__tests__/useParentTodos.test.ts
git commit -- src/parent/composables/useParentTodos.ts src/parent/composables/__tests__/useParentTodos.test.ts
```

Commit message:
```
feat(parent): 新增 useParentTodos 待辦清單唯一真源

聚合 home summary、入學文件簽署、臨時接送三個來源，產生固定順序的
八種待辦列。取代原本首頁橫幅、bento 方格、今日動態三處各自讀取
summary 欄位的重複實作。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 2: `HomeTodoList` 元件

**Files:**
- Create: `src/parent/components/home/HomeTodoList.vue`
- Test: `src/parent/components/home/__tests__/HomeTodoList.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `useParentTodos()`（`todos`、`actionCount`、`pending`、`error`、`refresh`）；既有 `SectionHeader`（props `{ title: string }`，具名 slot `action`）；既有 `M3List`／`M3ListItem`（props `{ headline, supportingText, leadingIcon, clickable }`，emit `click`，具名 slot `trailing`）；既有 `SkeletonBlock`（props `{ variant: 'line'|'card'|'row', count?: number }`）；既有 `MobileErrorRetry`（props `{ error }`，emit `retry`）。
- Produces: 無 props、無 emit 的自足元件 `<HomeTodoList />`，內部自行呼叫 `useParentTodos()`。父層不傳資料。

- [ ] **Step 1: 寫失敗測試**

Create `src/parent/components/home/__tests__/HomeTodoList.test.ts`:

```ts
/**
 * HomeTodoList — 首頁「待辦」區塊。
 *
 * 涵蓋：
 *  - 空清單整區不渲染（首頁不為「沒事」佔位）
 *  - 標題副標只算 action/alert 列
 *  - 每列 aria-label 含名稱與筆數
 *  - 三態：pending 且無資料→骨架；error 且無資料→可重試；部分失敗→仍渲染列
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed } from 'vue'
import type { ParentTodo } from '@/parent/composables/useParentTodos'

const todosRef = ref<ParentTodo[]>([])
const pendingRef = ref(false)
const errorRef = ref<unknown>(null)
const refreshMock = vi.fn()

vi.mock('@/parent/composables/useParentTodos', () => ({
  useParentTodos: () => ({
    todos: computed(() => todosRef.value),
    actionCount: computed(() =>
      todosRef.value.filter((t) => t.tone !== 'info').reduce((s, t) => s + t.count, 0),
    ),
    signDocsCount: computed(() => 0),
    pickupActiveCount: computed(() => 0),
    pending: computed(() => pendingRef.value),
    error: computed(() => errorRef.value),
    refresh: refreshMock,
  }),
}))

import HomeTodoList from '@/parent/components/home/HomeTodoList.vue'

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
}

function makeTodo(over: Partial<ParentTodo> = {}): ParentTodo {
  return {
    key: 'fees',
    label: '待繳學費',
    count: 2,
    sub: '2 筆',
    tone: 'action',
    icon: 'payments',
    to: '/fees',
    ...over,
  }
}

beforeEach(() => {
  todosRef.value = []
  pendingRef.value = false
  errorRef.value = null
  refreshMock.mockClear()
})

describe('HomeTodoList', () => {
  it('沒有待辦時整區不渲染', () => {
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(false)
  })

  it('有待辦時渲染標題「待辦」與每列的名稱與副標', () => {
    todosRef.value = [makeTodo(), makeTodo({ key: 'eventAcks', label: '待簽文件', count: 3, sub: '3 份待簽收', to: '/events' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(true)
    expect(w.text()).toContain('待辦')
    expect(w.text()).toContain('待繳學費')
    expect(w.text()).toContain('待簽文件')
    expect(w.text()).toContain('3 份待簽收')
  })

  it('副標「N 件」只計 action 與 alert 列', () => {
    todosRef.value = [
      makeTodo({ count: 2 }),
      makeTodo({ key: 'announcements', label: '未讀公告', count: 99, tone: 'info', to: '/announcements' }),
    ]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-count"]').text()).toBe('2 件')
  })

  it('每列連到對應路由，aria-label 含名稱與筆數', () => {
    todosRef.value = [makeTodo({ label: '待繳學費', count: 2, to: '/fees' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    const row = w.find('[data-testid="home-todo-row-fees"]')
    expect(row.attributes('href')).toBe('/fees')
    expect(row.attributes('aria-label')).toContain('待繳學費')
    expect(row.attributes('aria-label')).toContain('2')
  })

  it('逾期列帶 alert 樣式類名', () => {
    todosRef.value = [makeTodo({ tone: 'alert', sub: '逾期 $1,200' })]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.find('[data-testid="home-todo-row-fees"]').classes().join(' ')).toContain('alert')
  })

  it('載入中且無資料：顯示骨架、不顯示錯誤態', () => {
    pendingRef.value = true
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.findComponent({ name: 'SkeletonBlock' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
  })

  it('錯誤且無資料：顯示可重試錯誤態，點重試呼叫 refresh', async () => {
    errorRef.value = new Error('boom')
    const w = mount(HomeTodoList, { global: { stubs } })
    const retry = w.findComponent({ name: 'MobileErrorRetry' })
    expect(retry.exists()).toBe(true)
    await retry.vm.$emit('retry')
    expect(refreshMock).toHaveBeenCalled()
  })

  it('部分失敗但已有列：渲染清單而非錯誤態', () => {
    errorRef.value = new Error('sign docs down')
    todosRef.value = [makeTodo()]
    const w = mount(HomeTodoList, { global: { stubs } })
    expect(w.findComponent({ name: 'MobileErrorRetry' }).exists()).toBe(false)
    expect(w.find('[data-testid="home-todo-list"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/components/home/__tests__/HomeTodoList.test.ts`
Expected: FAIL，`Failed to resolve import "@/parent/components/home/HomeTodoList.vue"`

- [ ] **Step 3: 實作元件**

Create `src/parent/components/home/HomeTodoList.vue`:

```vue
<script setup lang="ts">
/**
 * 首頁「待辦」區塊。
 *
 * 取代 2026-09-02 之前的三處重複：頂部兩張 sticky 橫幅（待簽／活動調查）、
 * bento 的四格待辦方格、今日動態「晚一些」桶裡的五種寫死事件。資料一律來自
 * useParentTodos，本元件只負責呈現與三態。
 *
 * 刻意不引入 @/components/common/EmptyState：那支落在 admin-core chunk，
 * 首頁是家長端 entry 首屏，靜態 import 會被 check-entry-chunks gate 擋下。
 * 本區塊在沒有待辦時直接不渲染，本來就不需要空狀態。
 */
import { useParentTodos } from '../../composables/useParentTodos'
import SectionHeader from '../SectionHeader.vue'
import SkeletonBlock from '../SkeletonBlock.vue'
import M3List from '../m3/M3List.vue'
import M3ListItem from '../m3/M3ListItem.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

const { todos, actionCount, pending, error, refresh } = useParentTodos()
</script>

<template>
  <section v-if="pending && todos.length === 0" class="home-todo" data-testid="home-todo-skeleton">
    <SkeletonBlock variant="row" :count="2" />
  </section>

  <section
    v-else-if="error && todos.length === 0"
    class="home-todo"
    data-testid="home-todo-error"
  >
    <MobileErrorRetry :error="error" @retry="refresh" />
  </section>

  <section
    v-else-if="todos.length > 0"
    class="home-todo"
    data-testid="home-todo-list"
  >
    <SectionHeader title="待辦">
      <template #action>
        <span v-if="actionCount > 0" class="home-todo-count" data-testid="home-todo-count">
          {{ actionCount }} 件
        </span>
      </template>
    </SectionHeader>

    <M3List>
      <M3ListItem
        v-for="todo in todos"
        :key="todo.key"
        :headline="todo.label"
        :supporting-text="todo.sub || ''"
        :leading-icon="todo.icon"
      >
        <template #trailing>
          <router-link
            :to="todo.to"
            class="home-todo-row"
            :class="`tone-${todo.tone}`"
            :data-testid="`home-todo-row-${todo.key}`"
            :aria-label="`${todo.label}，${todo.count} 件`"
          >
            <span class="home-todo-badge">{{ todo.count }}</span>
            <span class="material-symbols-rounded home-todo-chevron" aria-hidden="true">chevron_right</span>
          </router-link>
        </template>
      </M3ListItem>
    </M3List>
  </section>
</template>

<style scoped>
.home-todo {
  padding: 0 var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.home-todo-count {
  font-size: var(--text-sm, 13px);
  font-weight: 600;
  color: var(--pt-text-muted, #6b5e54);
}

/* 整列可點：撐滿 M3ListItem 的 trailing 區並延伸出可觸控範圍（≥44px） */
.home-todo-row {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  min-height: 44px;
  padding: 0 var(--space-1, 4px);
  text-decoration: none;
  color: inherit;
}

.home-todo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 11px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  color: var(--pt-on-accent, #fff);
  background: var(--m3-primary, #006d3d);
}
/* 逾期款項：唯一該讓家長心跳快一下的情況（與事務頁 alert 徽章同色） */
.tone-alert .home-todo-badge {
  background: var(--coral-700, #b14545);
}
/* 資訊性（未讀公告、請假結果、進行中授權）：中性藍，避免被讀成待辦 */
.tone-info .home-todo-badge {
  background: var(--sky-700, #2d6f8e);
}

.home-todo-chevron {
  font-size: 20px;
  color: var(--pt-text-muted, #6b5e54);
  font-variation-settings: 'wght' 400;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/parent/components/home/__tests__/HomeTodoList.test.ts`
Expected: PASS，8 個測試全綠。

若「載入中顯示骨架」測試找不到 `SkeletonBlock` 元件，改用 `w.find('[data-testid="home-todo-skeleton"]').exists()` 斷言（元件名在 `<script setup>` 下可能未註冊 name）。同理 `MobileErrorRetry` 改用 `[data-testid="home-todo-error"]`。

- [ ] **Step 5: typecheck 與 lint**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck && npx eslint src/parent/components/home/HomeTodoList.vue src/parent/components/home/__tests__/HomeTodoList.test.ts`
Expected: 兩者皆無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home/HomeTodoList.vue src/parent/components/home/__tests__/HomeTodoList.test.ts
git commit -- src/parent/components/home/HomeTodoList.vue src/parent/components/home/__tests__/HomeTodoList.test.ts
```

Commit message:
```
feat(parent): 新增首頁待辦清單元件 HomeTodoList

以 useParentTodos 為單一來源渲染待辦列，含三態與 a11y 標籤。
沒有待辦時整區不渲染，首頁不為「沒事」佔位。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 3: `HomeBusRow` 元件（娃娃車邏輯搬家）

**Files:**
- Create: `src/parent/components/home/HomeBusRow.vue`
- Test: `src/parent/components/home/__tests__/HomeBusRow.test.ts`
- Reference（讀取來源，本任務不改它）: `src/parent/views/TodayView.vue:133-322`

**Interfaces:**
- Consumes: 既有 API `getBusToday()`、`getRideCancellations()`、`createRideCancellation()`、`revokeRideCancellation()`（`src/parent/api/bus.ts`）；既有 `BusRideCancellationSheet`（props `{ visible, childName, scheduledDirections, activeCancellations, submitting, results }`，emits `submit`／`revoke`／`close`）；既有 `StatTile`（props `{ label, value, sub?, icon?, tone?, to? }`）；`todayTaipeiISO()`（`@/utils/format`）。
- Produces: `<HomeBusRow ref="busRowRef" />`，無 props、無 emit，透過 `defineExpose({ reload })` 對外提供 `reload(): Promise<void>`，供 `TodayView` 的下拉刷新呼叫。

- [ ] **Step 1: 寫失敗測試**

Create `src/parent/components/home/__tests__/HomeBusRow.test.ts`:

```ts
/**
 * HomeBusRow — 首頁娃娃車兩種入口。
 *
 * 本元件是從 TodayView 抽出的純結構搬移，行為必須與搬移前逐一致：
 *  - 追蹤卡只在班次進行中出現，連 /bus
 *  - 「今天不搭」入口吃 ride-cancellations，與 trip 生命週期無關（發車前就要在）
 *  - 站點座標（家庭住址）不得進入畫面
 *  - 送出與撤銷的 re-entrancy guard（雙擊不得覆寫第一發的結果）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const getBusToday = vi.fn()
const getRideCancellations = vi.fn()
const createRideCancellation = vi.fn()
const revokeRideCancellation = vi.fn()

vi.mock('@/parent/api/bus', () => ({
  getBusToday: (...a: unknown[]) => getBusToday(...a),
  getRideCancellations: (...a: unknown[]) => getRideCancellations(...a),
  createRideCancellation: (...a: unknown[]) => createRideCancellation(...a),
  revokeRideCancellation: (...a: unknown[]) => revokeRideCancellation(...a),
}))

import HomeBusRow from '@/parent/components/home/HomeBusRow.vue'

const stubs = {
  'router-link': { props: ['to'], template: '<a :href="to"><slot /></a>' },
  BusRideCancellationSheet: {
    props: ['visible', 'childName', 'scheduledDirections', 'activeCancellations', 'submitting', 'results'],
    template: '<div data-testid="cancel-sheet">{{ childName }}</div>',
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  getBusToday.mockResolvedValue({ data: { trip: null, children: [] } })
  getRideCancellations.mockResolvedValue({ data: { children: [] } })
})

describe('HomeBusRow 娃娃車追蹤卡', () => {
  it('班次進行中且還有站：顯示「還有 N 站」並連到 /bus', async () => {
    getBusToday.mockResolvedValue({
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'pending', stops_ahead: 3 }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('娃娃車')
    expect(w.text()).toContain('還有 3 站')
    expect(w.find('a[href="/bus"]').exists()).toBe(true)
  })

  it('已上車（stop_status 非 pending）：顯示「進行中」', async () => {
    getBusToday.mockResolvedValue({
      data: { trip: { status: 'in_progress' }, children: [{ stop_status: 'boarded', stops_ahead: 0 }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('進行中')
  })

  it('班次未進行中：不渲染追蹤卡', async () => {
    getBusToday.mockResolvedValue({ data: { trip: { status: 'planned' }, children: [] } })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).not.toContain('娃娃車')
  })

  it('站點座標不得出現在畫面', async () => {
    getBusToday.mockResolvedValue({
      data: {
        trip: { status: 'in_progress' },
        children: [{ stop_status: 'pending', stops_ahead: 1, stop_lat: 22.6273, stop_lng: 120.3014 }],
      },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.html()).not.toContain('22.6273')
    expect(w.html()).not.toContain('120.3014')
  })

  it('娃娃車快照失敗不拋例外，元件仍可掛載', async () => {
    getBusToday.mockRejectedValue(new Error('boom'))
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})

describe('HomeBusRow 今天不搭入口', () => {
  it('有排定名單：逐子女一格，點擊開 sheet', async () => {
    getRideCancellations.mockResolvedValue({
      data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    const btn = w.find('[data-testid="bus-ride-cancel-7"]')
    expect(btn.exists()).toBe(true)
    expect(w.text()).toContain('今天不搭')
    await btn.trigger('click')
    expect(w.find('[data-testid="cancel-sheet"]').text()).toContain('小明')
  })

  it('已回報方向會顯示在副標', async () => {
    getRideCancellations.mockResolvedValue({
      data: {
        children: [{
          student_id: 7, student_name: '小明',
          scheduled_directions: ['morning', 'afternoon'],
          cancellations: [{ id: 1, direction: 'morning', revocable: true }],
        }],
      },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    expect(w.text()).toContain('早上接車已回報')
  })

  it('送出後重載名單，且同一 tick 雙擊只送一次', async () => {
    getRideCancellations.mockResolvedValue({
      data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
    })
    createRideCancellation.mockResolvedValue({
      data: { results: [{ direction: 'morning', success: true, message: '已回報' }] },
    })
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    await w.find('[data-testid="bus-ride-cancel-7"]').trigger('click')
    const sheet = w.findComponent({ name: 'BusRideCancellationSheet' })
    sheet.vm.$emit('submit', ['morning'])
    sheet.vm.$emit('submit', ['morning'])
    await flushPromises()
    expect(createRideCancellation).toHaveBeenCalledTimes(1)
  })

  it('名單載入失敗不清空既有資料（sheet 不被抽走）', async () => {
    getRideCancellations
      .mockResolvedValueOnce({
        data: { children: [{ student_id: 7, student_name: '小明', scheduled_directions: ['morning'], cancellations: [] }] },
      })
      .mockRejectedValueOnce(new Error('network'))
    const w = mount(HomeBusRow, { global: { stubs } })
    await flushPromises()
    await w.vm.reload()
    await flushPromises()
    expect(w.find('[data-testid="bus-ride-cancel-7"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/components/home/__tests__/HomeBusRow.test.ts`
Expected: FAIL，`Failed to resolve import "@/parent/components/home/HomeBusRow.vue"`

- [ ] **Step 3: 建立元件（逐字搬移 TodayView 的 bus 邏輯）**

先開啟 `src/parent/views/TodayView.vue`，複製以下區段的**原始碼與註解**到新檔，不要改寫邏輯：

| 來源行號 | 內容 |
|---------|------|
| 133-169 | `busInfo`／`busTileValue`／`busSeq`／`loadBusToday()` |
| 171-212 | `BusDirection`／`BusRideChild`／`DIRECTION_SHORT`／`busRideChildren`／`rideCancelSeq`／`loadRideCancellations()` |
| 214-236 | `cancelSheetStudentId`／`cancelSubmitting`／`cancelResults`／`cancelSheetChild`／`rideCancelSummary()`／`openCancelSheet()`／`closeCancelSheet()` |
| 238-322 | `onRideCancelSubmit()`／`onRideCancelRevoke()` |
| 520-548 | 娃娃車 `StatTile` 與「今天不搭」`button` 的 template |
| 584-595 | `BusRideCancellationSheet` 的 template |
| 666-684 | `.today-bento-action` 與 `.today-bento` 樣式 |

Create `src/parent/components/home/HomeBusRow.vue`:

```vue
<script setup lang="ts">
/**
 * 首頁娃娃車列。2026-09-02 從 TodayView 抽出，行為與抽出前逐一致（純結構搬移）。
 *
 * 兩個入口刻意並存而非合併：
 *  - 追蹤卡（連 /bus）只在班次進行中出現
 *  - 「今天不搭」是回報動作，在發車前就必須在
 */
import { computed, onMounted, ref } from 'vue'
import {
  createRideCancellation,
  getBusToday,
  getRideCancellations,
  revokeRideCancellation,
} from '../../api/bus'
import { todayTaipeiISO } from '@/utils/format'
import BusRideCancellationSheet from '../bus/BusRideCancellationSheet.vue'
import StatTile from '../StatTile.vue'

// ⬇⬇ 以下四段自 TodayView.vue:133-322 逐字搬移，含全部原始註解 ⬇⬇
// （busInfo / busTileValue / busSeq / loadBusToday）
// （BusDirection / BusRideChild / DIRECTION_SHORT / busRideChildren / rideCancelSeq / loadRideCancellations）
// （cancelSheetStudentId / cancelSubmitting / cancelResults / cancelSheetChild
//   / rideCancelSummary / openCancelSheet / closeCancelSheet）
// （onRideCancelSubmit / onRideCancelRevoke）
// ⬆⬆ 搬移區塊結束 ⬆⬆

const hasAnything = computed(() => !!busInfo.value || busRideChildren.value.length > 0)

/** 供 TodayView 下拉刷新呼叫（原本 pullRefresh 直接呼叫兩支 load）。 */
async function reload(): Promise<void> {
  await Promise.all([loadBusToday(), loadRideCancellations()])
}

onMounted(() => {
  loadBusToday()
  loadRideCancellations()
})

defineExpose({ reload })
</script>

<template>
  <div v-if="hasAnything" class="home-bus-row">
    <StatTile
      v-if="busInfo"
      label="娃娃車"
      :value="busTileValue"
      icon="directions_bus"
      tone="sky"
      to="/bus"
    />
    <!--
      「今天不搭」入口：逐子女一格（多寶家庭各自回報）。刻意與上面的娃娃車
      追蹤卡並存而非合併——那格連到 /bus 追蹤頁、只在班次進行中出現，這格是
      回報動作、在發車前就必須在。
    -->
    <button
      v-for="rideChild in busRideChildren"
      :key="`ride-cancel-${rideChild.student_id}`"
      type="button"
      class="home-bus-action"
      :data-testid="`bus-ride-cancel-${rideChild.student_id}`"
      @click="openCancelSheet(rideChild.student_id)"
    >
      <StatTile
        label="今天不搭"
        :value="rideChild.student_name"
        :sub="rideCancelSummary(rideChild)"
        icon="event_busy"
        tone="sky"
      />
    </button>
  </div>

  <BusRideCancellationSheet
    v-if="cancelSheetChild"
    :visible="true"
    :child-name="cancelSheetChild.student_name"
    :scheduled-directions="cancelSheetChild.scheduled_directions"
    :active-cancellations="cancelSheetChild.cancellations"
    :submitting="cancelSubmitting"
    :results="cancelResults"
    @submit="onRideCancelSubmit"
    @revoke="onRideCancelRevoke"
    @close="closeCancelSheet"
  />
</template>

<style scoped>
/* 兩欄格線，與原 .today-bento 相同 */
.home-bus-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
}

/* 可點擊的格：StatTile 無 `to` 時只渲染靜態 div，動作型入口靠這層 button
   承接；重置 UA 樣式讓它與相鄰的 router-link 格視覺一致。 */
.home-bus-action {
  display: block;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
</style>
```

實作時把註解標記的四段用 `TodayView.vue` 的實際程式碼取代，`import` 路徑由 `../api/bus` 改為 `../../api/bus`、`../components/bus/...` 改為 `../bus/...`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/parent/components/home/__tests__/HomeBusRow.test.ts`
Expected: PASS，9 個測試全綠。

- [ ] **Step 5: typecheck 與 lint**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck && npx eslint src/parent/components/home/HomeBusRow.vue`
Expected: 無錯誤。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home/HomeBusRow.vue src/parent/components/home/__tests__/HomeBusRow.test.ts
git commit -- src/parent/components/home/HomeBusRow.vue src/parent/components/home/__tests__/HomeBusRow.test.ts
```

Commit message:
```
feat(parent): 抽出首頁娃娃車列 HomeBusRow

追蹤卡與「今天不搭」入口自 TodayView 逐字搬移，含 seq guard 與
雙擊重入防護；補上原本散在 TodayView 測試裡的行為斷言。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 4: `useTodayTimeline` 瘦身

**Files:**
- Modify: `src/parent/composables/useTodayTimeline.ts:9-14`（桶標籤）、`:34-39`（離園用詞）、`:140-152`（尚未到校占位事件）、`:185-262`（五種 summary 衍生事件）
- Test: `src/parent/composables/__tests__/useTodayTimeline.slim.test.ts`（新建）

**Interfaces:**
- Consumes: 無新依賴。
- Produces: `useTodayTimeline({ summary, todayChildren })` 的簽章不變，回傳的 `buckets` 內容變少。`dismissalLabel()` 對 `completed` 回傳字串由「已接送」改為「已離園」。

- [ ] **Step 1: 寫失敗測試**

Create `src/parent/composables/__tests__/useTodayTimeline.slim.test.ts`:

```ts
/**
 * useTodayTimeline 瘦身（2026-09-02）。
 *
 * 重整前五種 summary 衍生事件（待繳/待簽/才藝候補/未讀公告/請假結果）被
 * 硬編碼塞進 later 桶，讓「今日動態」實際上是第二份待辦清單，且與首頁
 * bento、頂部橫幅三處重複。這些改由 HomeTodoList 承載。
 *
 * 「尚未到校」占位事件同理移除：頂部聯絡簿按鈕的狀態 pill 已經寫著同一句。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useTodayTimeline } from '@/parent/composables/useTodayTimeline'

function collect(summary: Record<string, unknown> | null, children: Record<string, unknown>[]) {
  const { buckets } = useTodayTimeline({
    summary: ref(summary),
    todayChildren: ref(children),
  })
  return buckets.value.flatMap((b: { events: { id: string; primary: string }[] }) => b.events)
}

describe('useTodayTimeline 不再產生待辦事件', () => {
  const fullSummary = {
    fees: { outstanding_count: 2, outstanding: 3600, overdue: 1200 },
    pending_event_acks: 3,
    pending_activity_promotions: 1,
    unread_announcements: 5,
    recent_leave_reviews: 2,
  }

  it('待繳費事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'fees')).toBeUndefined()
  })

  it('待簽閱事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'acks')).toBeUndefined()
  })

  it('才藝候補事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'promotions')).toBeUndefined()
  })

  it('未讀公告事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'announcements')).toBeUndefined()
  })

  it('請假審核結果事件不再出現', () => {
    expect(collect(fullSummary, []).find((e) => e.id === 'leaveReviews')).toBeUndefined()
  })

  it('summary 齊全但沒有孩子事件時，時間軸為空', () => {
    expect(collect(fullSummary, [])).toEqual([])
  })
})

describe('useTodayTimeline 孩子事件保留', () => {
  it('有出席紀錄：照常產生事件並保留後端狀態文字', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', classroom_name: '天堂鳥', attendance: { status: '遲到' } },
    ])
    const att = events.find((e) => e.id === 'att:1')
    expect(att).toBeTruthy()
    expect(att!.primary).toContain('遲到')
  })

  it('請假：照常產生事件', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', leave: { type: '病假' } },
    ])
    expect(events.find((e) => e.id === 'leave:1')).toBeTruthy()
  })

  it('沒有出席也沒有請假：不再產生「尚未到校」占位事件', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', classroom_name: '天堂鳥' },
    ])
    expect(events.find((e) => e.id === 'pending:1')).toBeUndefined()
    expect(events.map((e) => e.primary).join(' ')).not.toContain('尚未到校')
  })

  it('用藥與接送事件照常產生', () => {
    const events = collect(null, [
      {
        student_id: 1, name: '小明',
        medication: { has_order: true, order_count: 2 },
        dismissal: { status: 'completed', completed_at: '2026-09-02T16:10:00' },
      },
    ])
    expect(events.find((e) => e.id === 'med:1')).toBeTruthy()
    expect(events.find((e) => e.id === 'dismissal:1')).toBeTruthy()
  })
})

describe('useTodayTimeline 用詞', () => {
  it('離園完成的接送事件 secondary 為「已離園」，不再是「已接送」', () => {
    const events = collect(null, [
      { student_id: 1, name: '小明', dismissal: { status: 'completed', completed_at: '2026-09-02T16:10:00' } },
    ])
    const d = events.find((e) => e.id === 'dismissal:1') as unknown as { secondary: string }
    expect(d.secondary).toBe('已離園')
  })

  it('later 桶標籤為「傍晚」', () => {
    const { buckets } = useTodayTimeline({
      summary: ref(null),
      todayChildren: ref([
        { student_id: 1, name: '小明', dismissal: { status: 'completed', completed_at: '2026-09-02T19:30:00' } },
      ]),
    })
    const labels = buckets.value.map((b: { label: string }) => b.label)
    expect(labels).toContain('傍晚')
    expect(labels).not.toContain('晚一些')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/composables/__tests__/useTodayTimeline.slim.test.ts`
Expected: FAIL，至少 8 個測試失敗（五種衍生事件仍存在、`pending:1` 仍存在、secondary 為「已接送」、桶標籤為「晚一些」）。

- [ ] **Step 3: 改實作**

在 `src/parent/composables/useTodayTimeline.ts` 做四處修改：

1. 桶標籤（約第 9-14 行）：
```ts
const BUCKET_LABEL = {
  morning: '早上',
  noon: '中午',
  afternoon: '下午',
  later: '傍晚',
}
```

2. 離園用詞（約第 34-39 行）：
```ts
function dismissalLabel(status: string | null | undefined) {
  if (status === 'pending') return '老師處理中'
  if (status === 'acknowledged') return '老師已收到'
  // 2026-09-02：與首頁狀態 pill 統一為「已離園」（原為「已接送」，同一狀態兩種用詞）
  if (status === 'completed') return '已離園'
  return status || '處理中'
}
```

3. 刪除「尚未到校」占位事件（約第 140-152 行）：把
```ts
      } else if (c.leave) {
        ...
      } else {
        out.push({
          id: `pending:${c.student_id}`,
          ...
        })
      }
```
改為（保留 `c.leave` 分支，刪掉最後的 `else` 整段）：
```ts
      } else if (c.leave) {
        out.push({
          id: `leave:${c.student_id}`,
          bucket: 'morning',
          variant: 'past',
          time: null,
          primary: `${c.name} 請假`,
          secondary: c.leave.type,
          tone: 'leave',
          path: '/leaves',
          motif: crown,
        })
      }
      // 2026-09-02：原本這裡有「尚未到校」占位事件。首頁頂部聯絡簿按鈕的
      // 狀態 pill 已經寫著同一句，時間軸再推一列等於同屏重複。
```

4. 刪除五種 summary 衍生事件（約第 185-262 行）：把 `type SummaryShape = {...}` 起、到 `recent_leave_reviews` 那個 `if` 區塊結束為止的整段刪除。刪除後 `const summaryV = summary.value`（events computed 開頭）與 `const sv = summaryV as SummaryShape | null | undefined` 都成為未使用變數，一併刪除。改為一則註解：
```ts
    // 2026-09-02：原本這裡有五種 summary 衍生事件（待繳費／待簽閱／才藝候補／
    // 未讀公告／請假審核結果），全部硬編碼塞進 later 桶——它們沒有時間點，
    // 塞進時間軸讓「今日動態」變成第二份待辦清單，且與首頁 bento、頂部橫幅
    // 三處重複。改由 HomeTodoList（useParentTodos）單一承載。
    // 本 composable 從此只處理「今天真的發生了什麼」。
```
同時把函式簽章裡不再使用的 `summary` 參數保留（呼叫端仍傳入，改動簽章會擴大影響面），並在 `useTodayTimeline` 的 JSDoc 補一行說明 `summary` 目前未被使用但保留於簽章。若 ESLint 因未使用變數報錯，在解構處改為 `summary: _summary` 並加上 `// eslint-disable-next-line @typescript-eslint/no-unused-vars` 與理由註解。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/parent/composables/__tests__/useTodayTimeline.slim.test.ts`
Expected: PASS，12 個測試全綠。

- [ ] **Step 5: 更新三個會受影響的既有測試檔**

Run: `npx vitest run src/parent/composables/__tests__/ tests/unit/parent/composables/`

以下三個檔案必然紅，已預先盤點（全樹 grep 過，不會有第四個）：

**5a. `tests/unit/parent/composables/dismissalTimelineParts.test.ts:37,45`**
測試名「完成：行為與改造前一致（completed_at、已接送、/attendance）」與斷言 `expect(parts.secondary).toBe('已接送')`。改為「已離園」，測試名同步改。

**5b. `tests/unit/parent/composables/useTodayTimeline.test.js:17`**
測試名 `attendance / leave / 尚未到校 → morning bucket`。占位事件已刪，改測試名為 `attendance / leave → morning bucket`，並刪除該案例中對 `pending:*` 事件的斷言。若該案例還斷言事件總數，數字要跟著減。

**5c. `tests/unit/parent/composables/useTodayTimeline.routeParity.test.js`（最需要小心的一支）**
它有一條**防假綠的下限斷言**（約第 59 行）：
```js
// 目前分支數應至少涵蓋 attendance/leave/pending/medication/dismissal 5 種
// 子女事件，加上 6 種 summary 待辦，共 11 個以上。
expect(events.value.length).toBeGreaterThanOrEqual(11)
```
瘦身後 fixture 只會產生 4 個事件（attendance／leave／medication／dismissal，pending 與五種 summary 事件都沒了）。把數字改為 `4`，註解同步改寫為：
```js
// 瘦身後（2026-09-02）只剩 attendance/leave/medication/dismissal 四種子女
// 事件；summary 衍生待辦已移交 HomeTodoList，不再進時間軸。
expect(events.value.length).toBeGreaterThanOrEqual(4)
```
**這個下限的用途是擋 fixture 失效造成的假綠，不是要求事件變多**，所以跟著實際種類調整是正確的，不算弱化斷言。該檔第 36 行 fixture 註解 `// 無 attendance/leave → 尚未到校（pending）` 也改為 `// 無 attendance/leave → 瘦身後不再產生事件`，該筆 fixture 資料保留（用來證明它確實不再產生事件）。

不要為了讓測試過而改回實作。改完重跑上面那條指令確認全綠。

**不要動這兩處**（它們測的是首頁狀態 pill，不是時間軸，pill 保留「尚未到校」）：
`tests/unit/parent/views/TodayView.test.js:196` 與 `:292`。

`tests/unit/parent/components/home-timeline/TodayTimeline.test.js` 用手造 fixture 自己傳 label，不呼叫 composable，**不受本任務影響**，不要改它。

- [ ] **Step 6: Commit**

```bash
git add src/parent/composables/useTodayTimeline.ts \
        src/parent/composables/__tests__/useTodayTimeline.slim.test.ts \
        tests/unit/parent/composables/dismissalTimelineParts.test.ts \
        tests/unit/parent/composables/useTodayTimeline.test.js \
        tests/unit/parent/composables/useTodayTimeline.routeParity.test.js
git commit -F /tmp/ivy-msg.txt -- src/parent/composables/useTodayTimeline.ts \
        src/parent/composables/__tests__/useTodayTimeline.slim.test.ts \
        tests/unit/parent/composables/dismissalTimelineParts.test.ts \
        tests/unit/parent/composables/useTodayTimeline.test.js \
        tests/unit/parent/composables/useTodayTimeline.routeParity.test.js
```

Commit message:
```
refactor(parent): 今日動態只留真實發生的事

刪除五種硬編碼進「晚一些」桶的 summary 衍生待辦事件與「尚未到校」
占位事件；桶標籤改「傍晚」、離園用詞與首頁 pill 統一為「已離園」。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 5: `TodayView` 重排

**Files:**
- Modify: `src/parent/views/TodayView.vue`
- Test（更新既有）: `tests/unit/parent/views/TodayView.test.js`、`src/parent/views/__tests__/TodayView.rideCancellation.test.ts`、`src/parent/views/__tests__/TodayView.busRace.test.ts`、`src/parent/views/__tests__/TodayView.race.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `<HomeTodoList />`（無 props）；Task 3 的 `<HomeBusRow ref="busRow" />`（`defineExpose({ reload })`）。
- Produces: 首頁區塊順序改為「頂部區塊 → 待辦清單 → 娃娃車列 → PushCta → 今日動態 → 多寶列 → 行事曆」。

- [ ] **Step 1: 刪除 script 中已搬走的邏輯**

在 `src/parent/views/TodayView.vue` 刪除：

- import：`PendingSignBanner`、`PendingSurveyBanner`、`StatTile`、`BusRideCancellationSheet`、`listPickupAuthorizations`、`listMySignRequests`、`todayTaipeiISO`、`createRideCancellation`／`getBusToday`／`getRideCancellations`／`revokeRideCancellation`（整個 `../api/bus` import 移除）
- `pendingSignCount`、`pendingSurveyCount`、`pendingSignDocCount`、`loadPendingSignDocCount()`、`feesInfo`
- 第 133-322 行的整段 bus 與 ride-cancellation 邏輯
- `pickupActiveCount`、`loadPickupToday()`

新增 import：
```ts
import HomeTodoList from '../components/home/HomeTodoList.vue'
import HomeBusRow from '../components/home/HomeBusRow.vue'
```

**務必保留**（已 grep 確認這些仍被其他區塊依賴，誤刪會壞掉）：
- `summary` computed（第 57 行）：仍傳給 `useTodayTimeline({ summary, todayChildren })`。Task 4 之後該 composable 內部不再讀它，但簽章保留，傳入仍合法。
- `me`／`children`／`showPushCta`／`selectedChild`／`isUnbound`：頂部區塊與 PushCta 在用。
- `contactBookEntry`／`loadContactBook`／`contactBookSeq` 整套與 `todayVariant`／`contactBookHref`／`contactBookSub`：餵給 `QuickActionsBar`（凍結區塊）。
- `childStatusLabel()`／`childStatusTone()`／`heroStatus`／`selectedTodayChild`／`isOffDay()`：狀態 pill 在用。
- `useTodayStatusCache`／`todayChildren`／`buckets`／`ChildrenStrip`／footer：今日動態與多寶列在用。

已 grep 驗證要刪的那批（`pendingSignCount`／`pendingSurveyCount`／`pendingSignDocCount`／`feesInfo`／`pickupActiveCount`／`busInfo` 等）只出現在自身定義處與即將刪除的橫幅、bento、sheet template 內，沒有其他依賴。

新增 ref 與調整刷新函式：
```ts
const busRow = ref<{ reload: () => Promise<void> } | null>(null)

async function pullRefresh() {
  await Promise.all([
    refreshSummary(true),
    refreshToday(),
    loadContactBook(true),
    busRow.value?.reload() ?? Promise.resolve(),
  ])
}

function refresh() {
  refreshSummary(true)
  refreshToday()
  loadContactBook(true)
  void busRow.value?.reload()
}
```

`onMounted` 改為：
```ts
onMounted(() => {
  refreshToday()
  // useCachedAsync cache-hit 時 children 從一開始就有值，下方 watch（無
  // immediate）不會 fire → 聯絡簿 hero card 永遠不會顯示。mount 時直接
  // ensureSelected + loadContactBook 涵蓋此 case（P1-16）。
  ensureSelected(children.value || [])
  loadContactBook()
})
```

- [ ] **Step 2: 改 template**

刪除：第 458-459 行兩個橫幅、第 512-582 行整個 `.today-bento` 區塊、第 584-595 行 `BusRideCancellationSheet`。

在 `PushCta` 之前插入：
```vue
    <!--
      待辦清單（2026-09-02）：取代原本的兩張 sticky 橫幅與 bento 四格。
      同一筆待辦在首頁只出現一次，資料來源為 useParentTodos。
    -->
    <HomeTodoList />

    <HomeBusRow ref="busRow" />
```

保留 `PushCta` 的既有註解與位置（在待辦之後）。

刪除 style 中的 `.today-bento` 與 `.today-bento-action`（已搬到 `HomeBusRow`）。

- [ ] **Step 3: 跑既有 TodayView 測試，確認紅在預期範圍**

Run: `npx vitest run src/parent/views/__tests__/TodayView.rideCancellation.test.ts src/parent/views/__tests__/TodayView.busRace.test.ts tests/unit/parent/views/TodayView.test.js`
Expected: bento 與娃娃車相關案例大量失敗（元素已移到子元件）。

- [ ] **Step 4: 更新既有測試**

- `TodayView.rideCancellation.test.ts`（27 個案例）與 `TodayView.busRace.test.ts`：這些行為已由 Task 3 的 `HomeBusRow.test.ts` 覆蓋。刪除這兩個檔案，並在 `HomeBusRow.test.ts` 頂部註解補一行：「本檔涵蓋原 TodayView.rideCancellation.test.ts 與 TodayView.busRace.test.ts 的行為斷言（2026-09-02 隨元件抽出搬移）」。
- `tests/unit/parent/views/TodayView.test.js`（該檔既有 helper 是 `mountWith(summary, today)`，定義在約第 103-135 行，**不是** `mountView()`）：
  1. 刪除 `describe('TodayView Bento 儀表板 — StatTile 依 summary 條件渲染')` 與 `describe('TodayView 娃娃車入口卡')` 兩整段。
  2. 改 `mountWith()` 的 `global.stubs`：移除 `StatTile`、`PendingSignBanner`、`PendingSurveyBanner` 三個 stub（元件已不在 TodayView 內），新增 `HomeTodoList: { template: '<div class="home-todo-stub"></div>' }` 與 `HomeBusRow: { template: '<div class="home-bus-stub"></div>' }`。其餘 stub 保留不動。
  3. 在檔案末尾新增一個 describe（第一個參數是 home summary 回應物件、第二個是 today-status 回應物件，形狀比照該檔既有案例）：

```js
describe('TodayView 區塊收斂（2026-09-02）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('不再渲染頂部待簽橫幅與活動調查橫幅', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: { pending_event_acks: 3, pending_survey_count: 2 } },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.pending-sign-stub').exists()).toBe(false)
    expect(w.html()).not.toContain('pending-survey')
  })

  it('不再渲染 bento 方格容器與 StatTile', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: { fees: { outstanding_count: 2, outstanding: 100, overdue: 0 } } },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.today-bento').exists()).toBe(false)
    expect(w.find('.stat-tile-stub').exists()).toBe(false)
  })

  it('渲染待辦清單與娃娃車列兩個子元件', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.home-todo-stub').exists()).toBe(true)
    expect(w.find('.home-bus-stub').exists()).toBe(true)
  })
})
```

若該檔既有案例傳給 `mountWith` 的物件形狀與上面不同（例如 summary 直接放頂層而非包在 `summary` 鍵下），比照檔案內既有案例調整參數，不要改 `mountWith` 的簽章。

- [ ] **Step 4b: 加原始碼層級的退場守衛**

渲染測試只能證明「這次沒渲染」，不能擋住日後有人把元件 import 回來。新建 `src/parent/views/__tests__/TodayView.source.test.ts`：

```ts
/**
 * TodayView 原始碼守衛（2026-09-02）。
 *
 * 兩張 sticky 橫幅與 bento 四格已退場，待辦改由 HomeTodoList 單一承載、
 * 娃娃車改由 HomeBusRow 承載。渲染測試只能證明「這次沒渲染」，擋不住
 * 日後有人把元件 import 回首頁製造第二份待辦清單，故加原始碼層級守衛。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(
  resolve(__dirname, '../TodayView.vue'),
  'utf-8',
)

describe('TodayView 原始碼守衛', () => {
  it('不得 import 已退場的兩張橫幅', () => {
    expect(source).not.toContain('PendingSignBanner')
    expect(source).not.toContain('PendingSurveyBanner')
  })

  it('不得直接使用 StatTile（bento 已退場，娃娃車格在 HomeBusRow 內）', () => {
    expect(source).not.toContain('StatTile')
  })

  it('不得殘留 bento 容器樣式或 class', () => {
    expect(source).not.toContain('today-bento')
  })

  it('必須掛載待辦清單與娃娃車列', () => {
    expect(source).toContain('HomeTodoList')
    expect(source).toContain('HomeBusRow')
  })
})
```

Run: `npx vitest run src/parent/views/__tests__/TodayView.source.test.ts`
Expected: PASS。若 `StatTile` 那條紅，代表 template 或 style 還有殘留，回 Step 2 清乾淨。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/parent/views/__tests__/ tests/unit/parent/views/TodayView.test.js`
Expected: PASS。

- [ ] **Step 6: 確認頂部區塊零 diff**

Run:
```bash
git diff --stat origin/staging -- src/parent/components/home/HomeHeroHeader.vue src/parent/components/home/QuickActionsBar.vue src/parent/utils/quickActionModules.ts src/parent/composables/useQuickActionSlots.ts
```
Expected: 無輸出（零改動）。有輸出即違反 owner 裁定，必須還原。

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/TodayView.vue src/parent/views/__tests__/ tests/unit/parent/views/TodayView.test.js
git rm src/parent/views/__tests__/TodayView.rideCancellation.test.ts src/parent/views/__tests__/TodayView.busRace.test.ts
git commit -- src/parent/views/TodayView.vue src/parent/views/__tests__/ tests/unit/parent/views/TodayView.test.js
```

Commit message:
```
refactor(parent): 首頁改為頂部區塊、待辦清單、今日動態三層

移除兩張 sticky 橫幅與 bento 四格待辦方格，改掛 HomeTodoList；
娃娃車邏輯移交 HomeBusRow。頂部區塊（問候列、常用功能）零改動。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 6: `useHomeSummary` 擴充與 `AdminListView` 改寫

**Files:**
- Modify: `src/parent/composables/useHomeSummary.ts:20-30`（interface）、`:55-70`（badges）、`:77-85`（adminTabBadge）
- Modify: `src/parent/views/AdminListView.vue`
- Test（更新既有）: `src/parent/views/__tests__/AdminListView.badges.test.ts`、`tests/unit/parent/views/AdminListView.test.js`

**Interfaces:**
- Consumes: Task 1 的 `useParentTodos()`（取 `signDocsCount`、`pickupActiveCount`）。
- Produces: `HomeBadges` 新增 `pendingSurveyCount: number`；`adminTabBadge` 加計該欄位。

- [ ] **Step 1: 寫失敗測試**

在 `src/parent/views/__tests__/AdminListView.badges.test.ts` 末尾新增：

```ts
describe('AdminListView 項目收斂（2026-09-02）', () => {
  it('新增「入學文件簽署」與「出席紀錄」兩個入口', () => {
    setSummary()
    const w = mount(AdminListView, { global: { stubs: { 'router-link': true } } })
    expect(w.text()).toContain('入學文件簽署')
    expect(w.text()).toContain('出席紀錄')
  })

  it('「待簽紀錄」改名為「待簽文件」', () => {
    setSummary()
    const w = mount(AdminListView, { global: { stubs: { 'router-link': true } } })
    expect(w.text()).toContain('待簽文件')
    expect(w.text()).not.toContain('待簽紀錄')
  })

  it('預告接送不再有寫死為 0 的徽章欄位', () => {
    setSummary()
    const w = mount(AdminListView, { global: { stubs: { 'router-link': true } } })
    const row = w.findAll('li').find((li) => li.text().includes('預告接送'))!
    expect(row.find('.admin-badge').exists()).toBe(false)
  })

  it('活動調查徽章改讀 badges.pendingSurveyCount', () => {
    setSummary({ pending_survey_count: 4 })
    const w = mount(AdminListView, { global: { stubs: { 'router-link': true } } })
    expect(badgeOf(w, '活動調查')!.text()).toBe('4')
  })
})
```

另建 `src/parent/composables/__tests__/useHomeSummary.badges.test.ts`：

```ts
/**
 * useHomeSummary 徽章加總（2026-09-02）。
 *
 * pending_survey_count 原本沒有併入 HomeBadges，事務頁自己 cast summary 讀，
 * 導致頁面顯示「活動調查 4」但底部 tab 徽章不算它——同一件事兩個數字。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const dataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: dataRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))

import { useHomeSummary } from '@/parent/composables/useHomeSummary'

beforeEach(() => {
  dataRef.value = null
})

describe('useHomeSummary', () => {
  it('badges 帶出 pendingSurveyCount', () => {
    dataRef.value = { summary: { pending_survey_count: 3 } }
    const { badges } = useHomeSummary()
    expect(badges.value.pendingSurveyCount).toBe(3)
  })

  it('adminTabBadge 加計活動調查', () => {
    dataRef.value = {
      summary: {
        fees: { outstanding_count: 1, overdue: 0 },
        pending_event_acks: 1,
        pending_activity_promotions: 1,
        recent_leave_reviews: 1,
        pending_survey_count: 2,
      },
    }
    const { adminTabBadge } = useHomeSummary()
    expect(adminTabBadge.value).toBe(6)
  })

  it('欄位缺漏時 pendingSurveyCount 為 0', () => {
    dataRef.value = { summary: {} }
    const { badges } = useHomeSummary()
    expect(badges.value.pendingSurveyCount).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/composables/__tests__/useHomeSummary.badges.test.ts src/parent/views/__tests__/AdminListView.badges.test.ts`
Expected: FAIL，`pendingSurveyCount` 為 undefined、找不到「入學文件簽署」等。

- [ ] **Step 3: 改 `useHomeSummary`**

interface 補一行：
```ts
  recentLeaveReviews: number
  /** 待回覆的活動調查份數（2026-09-02 併入，原本事務頁自己 cast summary 讀） */
  pendingSurveyCount: number
  /** 今日生效的委託用藥單張數；資訊性，不計入 tab 徽章 */
  activeMedicationOrders: number
```

badges computed 補一行：
```ts
      recentLeaveReviews: num(s.recent_leave_reviews),
      pendingSurveyCount: num(s.pending_survey_count),
      activeMedicationOrders: num(s.active_medication_orders),
```

adminTabBadge 改為：
```ts
  /**
   * 底部「事務」tab 的總數徽章。
   *
   * 只加「需要家長動作或該知道結果」的五項。今日用藥單是資訊性的
   * （家長已經送出、老師照表執行），計進去只會讓紅點天天亮著而失去意義。
   *
   * 刻意不加入首頁待辦清單的另外兩項（入學文件簽署、臨時接送）：那兩支是
   * summary 之外的獨立 API，而 ParentLayout 在登入頁也會掛載，為了徽章
   * 多打兩支請求不划算。因此待辦清單的件數可能比 tab 徽章多，屬已知取捨。
   */
  const adminTabBadge = computed<number>(() => {
    const b = badges.value
    return (
      b.outstandingFees +
      b.pendingEventAcks +
      b.pendingActivityPromotions +
      b.recentLeaveReviews +
      b.pendingSurveyCount
    )
  })
```

- [ ] **Step 4: 改 `AdminListView`**

script 部分：刪除 `pendingSurveyCount` 的自訂 computed、刪除 `pendingPickupCount` 的 `ref` 與 `onMounted` 抓取、刪除 `listPickupAuthorizations` 與 `onMounted`／`ref` import（若不再使用）。新增：

```ts
import { useParentTodos } from '../composables/useParentTodos'

const { signDocsCount, pickupActiveCount } = useParentTodos()
```

`items` computed 改為十項（順序即顯示順序）：

```ts
const items = computed<AdminItem[]>(() => {
  const b = badges.value
  return [
    {
      headline: '請假',
      supportingText: '送出請假申請、查詢假單狀態',
      leadingIcon: 'event_busy',
      path: '/leaves',
      badge: b.recentLeaveReviews,
      badgeTone: 'action',
      badgeLabel: `${b.recentLeaveReviews} 筆假單有審核結果`,
    },
    {
      headline: '繳費',
      supportingText: '查詢應繳/已繳費用',
      leadingIcon: 'payments',
      path: '/fees',
      badge: b.outstandingFees,
      badgeTone: b.overdueFees > 0 ? 'alert' : 'action',
      badgeLabel:
        b.overdueFees > 0
          ? `${b.outstandingFees} 筆待繳，含逾期款項`
          : `${b.outstandingFees} 筆待繳`,
    },
    {
      // 入學文件電子簽署。與下面的「待簽文件」（活動簽閱）是兩個功能，
      // 用全名拉開距離，對齊首頁待辦清單的用詞。
      headline: '入學文件簽署',
      supportingText: '入學相關文件的電子簽署',
      leadingIcon: 'history_edu',
      path: '/sign',
      badge: signDocsCount.value,
      badgeTone: 'action',
      badgeLabel: `${signDocsCount.value} 份待簽`,
    },
    {
      headline: '待簽文件',
      supportingText: '需家長簽收的通知事項',
      leadingIcon: 'mark_email_read',
      path: '/events',
      badge: b.pendingEventAcks,
      badgeTone: 'action',
      badgeLabel: `${b.pendingEventAcks} 份待簽收`,
    },
    {
      headline: '活動調查',
      supportingText: '戶外教學/親子活動參加意願回覆',
      leadingIcon: 'fact_check',
      path: '/surveys',
      badge: b.pendingSurveyCount,
      badgeTone: 'action',
      badgeLabel: `${b.pendingSurveyCount} 份待回覆`,
    },
    {
      headline: '課後才藝',
      supportingText: '才藝課程報名與紀錄',
      leadingIcon: 'palette',
      path: '/activity',
      badge: b.pendingActivityPromotions,
      badgeTone: 'action',
      badgeLabel: `${b.pendingActivityPromotions} 筆候補待確認`,
    },
    {
      headline: '用藥委託',
      supportingText: '新增/查詢委託用藥單',
      leadingIcon: 'medication',
      path: '/medications',
      badge: b.activeMedicationOrders,
      badgeTone: 'info',
      badgeLabel: `今日 ${b.activeMedicationOrders} 張用藥單`,
    },
    {
      // 原本只能從首頁今日動態的出席事件進來，事務目錄裡看不到。
      headline: '出席紀錄',
      supportingText: '查詢到校與離園紀錄',
      leadingIcon: 'fact_check',
      path: '/attendance',
      badge: 0,
      badgeTone: 'info',
      badgeLabel: '',
    },
    {
      // 預告接送與臨時接送是兩個功能：前者=本人預告抵達時間，後者=授權親友代接。
      headline: '預告接送',
      supportingText: '通知園所我多久後抵達',
      leadingIcon: 'directions_walk',
      path: '/pickup-notice',
      badge: 0,
      badgeTone: 'info',
      badgeLabel: '',
    },
    {
      headline: '臨時接送',
      supportingText: '授權親友代為到園接送',
      leadingIcon: 'hail',
      path: '/pickup',
      badge: pickupActiveCount.value,
      badgeTone: 'info',
      badgeLabel: `${pickupActiveCount.value} 筆進行中授權`,
    },
  ]
})
```

「出席紀錄」的 `leadingIcon` 暫用 `fact_check`（與活動調查同 glyph）。若子集內有更貼切且已存在的 glyph（例如 `checklist`），改用之；判斷方式見 Task 9 Step 2 的 glyph 檢查。

- [ ] **Step 4b: 更新第二棵樹的 `tests/unit/parent/views/AdminListView.test.js`**

該檔（87 行）有三處必然紅，已預先盤點：

1. **mock 的 badges 缺新欄位**（約第 13-28 行）：`vi.mock('@/parent/composables/useHomeSummary', ...)` 回傳的 `badges.value` 物件補一行 `pendingSurveyCount: 0,`。
2. **改 pickup 的 mock 來源**：`AdminListView` 不再直接呼叫 `listPickupAuthorizations`，改為透過 `useParentTodos`。把第 30-33 行的 `vi.mock('@/parent/api/pickup', ...)` 換成：
```js
vi.mock('@/parent/composables/useParentTodos', () => ({
  useParentTodos: () => ({
    signDocsCount: { value: 0 },
    pickupActiveCount: { value: 0 },
  }),
}))
```
同時刪除 `beforeEach` 裡對 `mockListPickupAuthorizations` 的兩行操作與該變數宣告。
3. **項目數與路徑陣列**（第 46-49 行的 `渲染 8 個主行政 item`、第 67-76 行的 `8 行政 item 路徑對齊`）：改為 10 項，測試名同步改。新的路徑順序與 §Step 4 的 `items` 陣列一致：

```js
const paths = [
  '/leaves', '/fees', '/sign', '/events', '/surveys',
  '/activity', '/medications', '/attendance', '/pickup-notice', '/pickup',
]
```

第一個案例的文字斷言改為含「入學文件簽署」「待簽文件」「出席紀錄」，並移除「待簽紀錄」那一行（改名了）。`expect(items).toHaveLength(8)` 改為 `10`。第 79-86 行的「預告接送（pnotice01）」describe 不受影響，保留不動。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx vitest run src/parent/composables/__tests__/useHomeSummary.badges.test.ts src/parent/views/__tests__/AdminListView.badges.test.ts src/parent/views/__tests__/AdminListView.threestates.test.ts tests/unit/parent/views/AdminListView.test.js`
Expected: PASS。

關於 `AdminListView.threestates.test.ts`：它 mock 了 `@/composables/useCachedAsync` 本身，所以 `useParentTodos` 內部的三個 `useCachedAsync` 呼叫都會拿到那個 mock、fetcher 根本不會執行。**它很可能完全不用改**（它只驗骨架／錯誤態／清單三種渲染，那些仍由 `useHomeSummary` 驅動）。先跑，真的紅了再看訊息決定，不要預先改它。

- [ ] **Step 6: Commit**

```bash
git add src/parent/composables/useHomeSummary.ts src/parent/composables/__tests__/useHomeSummary.badges.test.ts src/parent/views/AdminListView.vue src/parent/views/__tests__/AdminListView.badges.test.ts tests/unit/parent/views/AdminListView.test.js
git commit -- src/parent/composables/useHomeSummary.ts src/parent/composables/__tests__/useHomeSummary.badges.test.ts src/parent/views/AdminListView.vue src/parent/views/__tests__/AdminListView.badges.test.ts tests/unit/parent/views/AdminListView.test.js
```

Commit message:
```
feat(parent): 事務頁補齊入口並與待辦清單共用來源

新增入學文件簽署與出席紀錄兩項、待簽紀錄改名待簽文件、預告接送
移除寫死為 0 的徽章；活動調查併入 HomeBadges 並計入 tab 徽章。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 7: `MeView` 減法與常見問題入口

**Files:**
- Modify: `src/parent/views/MeView.vue`
- Modify: `src/parent/router.ts:69-74`
- Test（更新既有）: `src/parent/views/__tests__/MeView.test.ts`

**Interfaces:**
- Consumes: 無新依賴。
- Produces: 「我的」頁偏好清單三項改為：通知偏好、個人資料權利、常見問題。

- [ ] **Step 1: 寫失敗測試**

`src/parent/views/__tests__/MeView.test.ts` 既有結構：第 27-29 行有 `vi.mock('@/parent/components/me/FeeSummaryCard.vue', ...)`（mock 一個即將刪除的檔案，Task 8 刪檔後這個 mock 會讓整個測試檔在解析階段就爆），第 54-61 行有 helper `mountMeView()`（已掛好 Pinia 與真實 router，不需要另外 stub `router-link`）。

改法：
1. **刪除**第 27-29 行的 `FeeSummaryCard` mock（連同它的三行）。
2. 在檔案末尾新增：

```ts
describe('MeView 入口收斂（2026-09-02）', () => {
  it('不再顯示費用摘要卡', () => {
    const w = mountMeView()
    expect(w.find('[data-testid="fee-summary-card"]').exists()).toBe(false)
  })

  it('偏好清單不再有「費用查詢」', () => {
    const w = mountMeView()
    expect(w.text()).not.toContain('費用查詢')
  })

  it('偏好清單新增「常見問題」，連到 /assistant', () => {
    const w = mountMeView()
    expect(w.text()).toContain('常見問題')
    expect(w.find('a[href="/assistant"]').exists()).toBe(true)
  })
})
```

註：第一個案例改用 `data-testid` 而非 `findComponent({ name: 'FeeSummaryCard' })`，因為 mock 移除後該元件已不存在，用元件名查詢在 `<script setup>` 下本來就不可靠。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/parent/views/__tests__/MeView.test.ts`
Expected: FAIL，三個新案例都紅。

- [ ] **Step 3: 確認 `help` glyph 是否在子集內**

Run: `grep -rn "\bhelp\b" src/parent --include=*.vue | grep -i "material-symbols\|icon" | head -5`

若家長端已有元件使用 `help` glyph，`PREFS` 的常見問題就用 `help`。若沒有，改用已知存在的 `campaign`（公告用）以外的既有 glyph，最保守的選擇是 `fact_check`。決定後在該行加註解說明為何選這個 glyph。

- [ ] **Step 4: 改 `MeView`**

刪除：
- `import FeeSummaryCard from '../components/me/FeeSummaryCard.vue'`
- `import { getHomeSummary } from '../api/profile'`
- `import { useCachedAsync } from '@/composables/useCachedAsync'`
- 第 43-54 行的 `useCachedAsync` 區塊與 `fees`／`outstanding`／`overdue` 三個 computed
- template 第 96 行的 `<FeeSummaryCard ... />`

`PREFS` 改為：

```ts
const PREFS = [
  { key: 'notifications', label: '通知偏好', icon: 'notifications', path: '/notifications/preferences', hint: '推播 / 公告 / 聯絡簿' },
  // P0c-3 法規/個資權利 (個資法 §3 五權)
  { key: 'privacy_rights', label: '個人資料權利', icon: 'gpp_good', path: '/me/privacy-rights', hint: '同意紀錄 / 申請刪除 / 更正 / 停止處理' },
  // 2026-09-02：/assistant 原本全站沒有任何入口，只能靠外部深連結進入。
  { key: 'assistant', label: '常見問題', icon: 'help', path: '/assistant', hint: '登入、綁定、接送與繳費常見問題' },
]
```

（`icon` 依 Step 3 的結論調整。）

同時在檔案頂部補一則註解：
```ts
/**
 * 2026-09-02：移除 FeeSummaryCard 與「費用查詢」項。費用入口收斂為首頁待辦
 * 清單與事務頁兩處；這裡原本用的 cache key 是 parent/home/summary，與首頁
 * 的 parent/today/summary 不同，等於每次進「我的」都多打一次同一支 API，
 * 一併隨費用卡移除。
 */
```

- [ ] **Step 5: 改 `router.ts`**

```ts
    {
      path: '/assistant',
      name: 'parent-assistant',
      component: () => import('./views/AssistantView.vue'),
      // tab: 'me' — 入口在「我的」偏好清單（2026-09-02 補），底部導覽維持在該分頁
      meta: { title: '常見問題', tab: 'me', showBack: true },
    },
```

- [ ] **Step 6: 跑測試確認通過**

Run: `npx vitest run src/parent/views/__tests__/MeView.test.ts src/parent/__tests__/router.test.ts`
Expected: PASS。若 `router.test.ts` 有斷言 `/assistant` 的 meta 內容，同步更新。

- [ ] **Step 7: Commit**

```bash
git add src/parent/views/MeView.vue src/parent/router.ts src/parent/views/__tests__/MeView.test.ts src/parent/__tests__/router.test.ts
git commit -- src/parent/views/MeView.vue src/parent/router.ts src/parent/views/__tests__/MeView.test.ts src/parent/__tests__/router.test.ts
```

Commit message:
```
feat(parent): 我的頁移除重複費用入口並補常見問題

費用摘要卡與「費用查詢」移除（首頁待辦與事務頁已有入口），順帶消除
一條指向同支 API 的獨立快取；常見問題頁原本全站無入口，補進偏好清單。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 8: 刪除退場元件與兩棵樹測試

**Files:**
- Delete: `src/parent/components/home/PendingSignBanner.vue`
- Delete: `src/parent/components/home/PendingSurveyBanner.vue`
- Delete: `src/parent/components/me/FeeSummaryCard.vue`
- Delete: `src/parent/components/__tests__/PendingSurveyBanner.test.ts`
- Delete: `src/parent/components/me/__tests__/FeeSummaryCard.test.ts`
- Delete: `tests/unit/parent/components/home/PendingSignBanner.test.js`
- Delete: `tests/unit/parent/components/me/FeeSummaryCard.test.js`
- Modify: `src/parent/styles/globals.css:113` 附近（兩個橫幅的琥珀色專用樣式，註解已標明是給 `PendingSignBanner` / `PendingSurveyBanner` 用的）

> 費用卡與待簽橫幅在**兩棵樹都有**測試（`src/parent/**/__tests__/` 與 `tests/unit/parent/`），四個檔案缺一不可刪乾淨。這是家長端反覆出現的 sibling sweep 陷阱。

**Interfaces:**
- Consumes: 無。
- Produces: 無。純刪除。

- [ ] **Step 1: 確認零引用**

Run:
```bash
grep -rn "PendingSignBanner\|PendingSurveyBanner\|FeeSummaryCard" src tests --include=*.vue --include=*.ts --include=*.js
```
Expected: 只剩下三個元件檔本身與三個測試檔。若 `src/parent/styles/globals.css` 出現，記下行號待 Step 3 處理。若還有其他引用，先回頭修那個檔案。

- [ ] **Step 2: 刪除檔案**

```bash
git rm src/parent/components/home/PendingSignBanner.vue \
       src/parent/components/home/PendingSurveyBanner.vue \
       src/parent/components/me/FeeSummaryCard.vue \
       src/parent/components/__tests__/PendingSurveyBanner.test.ts \
       src/parent/components/me/__tests__/FeeSummaryCard.test.ts \
       tests/unit/parent/components/home/PendingSignBanner.test.js \
       tests/unit/parent/components/me/FeeSummaryCard.test.js
```

刪除後再跑一次 Step 1 的 grep，確認只剩 `tests/unit/parent/views/TodayView.test.js` 的 stub（Task 5 已處理）與 `globals.css` 的樣式（下一步處理）。若 `src/parent/views/__tests__/MeView.test.ts` 還出現 `FeeSummaryCard`，代表 Task 7 漏刪那個 `vi.mock`，回頭補。

- [ ] **Step 3: 清理 globals.css**

若 Step 1 找到橫幅專用樣式（class 名如 `.pending-sign-banner`、`.pending-survey-banner`），刪除那些規則區塊。若沒有，跳過此步。

- [ ] **Step 4: 全量家長端測試**

Run: `npx vitest run src/parent tests/unit/parent tests/parent`
Expected: PASS。若有殘留引用造成的 import 錯誤，回頭修。

- [ ] **Step 5: Commit**

```bash
git commit -- src/parent/components src/parent/styles/globals.css tests/unit/parent
```

Commit message:
```
chore(parent): 刪除退場的兩張橫幅與費用摘要卡

PendingSignBanner／PendingSurveyBanner 的內容已併入待辦清單，
FeeSummaryCard 隨我的頁減法退場；兩棵測試樹的對應測試一併移除。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

### Task 9: 全量驗證與 bundle 比對

**Files:**
- 無新增或修改（除非驗證揪出問題）

**Interfaces:**
- Consumes: Task 1-8 的全部產出。
- Produces: 一份可交付的驗證結論。

- [ ] **Step 1: 記錄基準 bundle 大小**

Run:
```bash
git stash list  # 確認沒有殘留 stash
npm run build 2>&1 | tail -30
```
Expected: build 成功，chunk gate 通過。從輸出中找出 `parent` entry 的 gz 大小並記下。

若 gate 失敗且訊息提到 `admin-core`，代表某個新元件靜態 import 了 admin 端元件，回頭檢查 `HomeTodoList.vue` 與 `HomeBusRow.vue` 的 import。

- [ ] **Step 2: 確認 icon glyph 全在子集內**

Run:
```bash
grep -rn "material-symbols-rounded" src/parent/components/home/HomeTodoList.vue src/parent/components/home/HomeBusRow.vue
grep -o "'[a-z_]*'" src/parent/composables/useParentTodos.ts | sort -u
```

把用到的 glyph 名稱與 `src/parent/styles/icons.css` 的子集清單比對（該檔若無明文清單，改以既有元件已使用的 glyph 為準：任何在 `src/parent` 其他檔案已出現過的 glyph 都安全）。發現不在子集內的，換成既有 glyph。

- [ ] **Step 3: 全套測試**

Run: `npx vitest run 2>&1 | tail -30`
Expected: 只有既有紅燈。已知既有紅燈：`POSSearchPanel.pendingNotSelectable`（2026-09-01 已確認在 origin/staging 底座就是紅的）。任何其他紅燈都是本分支造成，必須修。

若不確定某個紅燈是否為既有，開一個 detached worktree 在 `origin/staging` 底座跑同一個檔案比對：
```bash
git worktree add /tmp/ivy-fe-base origin/staging
cd /tmp/ivy-fe-base && ln -s /Users/yilunwu/Desktop/ivy-frontend/node_modules node_modules
npx vitest run <該測試檔>
```
比對完刪除該 worktree。

- [ ] **Step 4: typecheck 與 lint**

Run: `NODE_OPTIONS=--max-old-space-size=4096 npm run typecheck && npm run lint`
Expected: 兩者皆無錯誤。

- [ ] **Step 5: 頂部區塊零 diff 最終核對**

Run:
```bash
git diff --stat origin/staging -- \
  src/parent/components/home/HomeHeroHeader.vue \
  src/parent/components/home/QuickActionsBar.vue \
  src/parent/utils/quickActionModules.ts \
  src/parent/composables/useQuickActionSlots.ts
```
Expected: 無輸出。

- [ ] **Step 6: 確認 components.d.ts 未被 build 汙染**

Run: `git status --porcelain src/components.d.ts`

若有改動，`npm run build` 會重生此檔並可能塞入平行 session 的元件。還原它：
```bash
git checkout -- src/components.d.ts
```
除非新元件本身需要登記（家長端元件為顯式 import，通常不需要）。

- [ ] **Step 7: 產出驗證摘要並 commit（若有修正）**

整理一份摘要，內容包含：
- `parent` entry gz 大小（改動前 237.8 KB，改動後實測值），差值
- 全套測試通過數與既有紅燈清單
- typecheck／lint 結果
- 頂部區塊零 diff 確認

若 Step 1-6 有任何修正，一併 commit：

```bash
git commit -- <修正的檔案>
```

Commit message:
```
fix(parent): 收尾驗證修正

<描述實際修了什麼>

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QsUSjwnrjHLZLNgRXtWfTn
```

---

## 完成後的下一步（不在本計畫範圍）

實作完成不等於交付完成。後續依 `docs/sop/staging-promotion-flow.md`：

1. staging 走查（需 owner 在管理端簽發一組家長裝置登入碼），檢查點見 spec §8。
2. 走查通過後併入 `staging` 並 push（觸發 Railway staging 部署）。
3. 升 prod 需 owner 明確授權，一律跑 `scripts/promote.sh`，不手動 merge。

AI 未獲授權不得自行 push 或部署。
