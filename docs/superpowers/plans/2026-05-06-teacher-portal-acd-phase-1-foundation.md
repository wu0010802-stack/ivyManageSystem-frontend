# 教師端 Portal 大 polish — Phase 1 實作計畫（基建 + 導航重組）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為教師端引入 4 個共用元件（TeacherBottomSheet / LazyImage / StatCard / OfflineQueueBadge）與 2 個 composable / store（useAsyncState / usePortalCache），並完成導航資訊架構重組（底部 tab 第 5 項從漢堡換成「我的」、側邊欄班級教務分為「教學 / 管理」二級）。

**Architecture:** 純前端，不動任何 API。Phase 1 是後續 Phase 2-7 的依賴：所有大 view 拆解都會用到這批基建。每個元件 / composable 帶 vitest，導航重組附 Playwright mobile golden path。

**Tech Stack:** Vue 3 (Composition API + `<script setup>`) / Vite / Vitest + happy-dom + @vue/test-utils / Pinia 2 / Element Plus / 既有 Soft UI token 體系（`--pt-elev-*` / `--pt-hairline` / `--pt-tint-*`）。

**Spec:** `docs/superpowers/specs/2026-05-06-teacher-portal-acd-optimization-design.md`

**Branch:** `feat/teacher-acd-v1-1-foundation`（單一 branch，純前端，無後端 PR）

---

## File Structure

### 新增檔案

```
src/components/common/
└── LazyImage.vue                       # 從 src/parent/components/LazyImage.vue 搬移

src/components/portal/
├── TeacherBottomSheet.vue              # 從 ParentBottomSheet 複製、重 token
├── StatCard.vue                        # 通用統計卡
└── OfflineQueueBadge.vue               # 離線佇列徽章（為 Phase 6 服務）

src/composables/
└── useAsyncState.js                    # 統一 loading / error / data 狀態

src/stores/
└── portalCache.js                      # Pinia store：portal 共用 cache

tests/unit/components/common/
└── LazyImage.test.js                   # 搬移時跟著移檔

tests/unit/components/portal/
├── TeacherBottomSheet.test.js
├── StatCard.test.js
└── OfflineQueueBadge.test.js

tests/unit/composables/
└── useAsyncState.test.js

tests/unit/stores/
└── portalCache.test.js

tests/e2e/portal/
└── navigation-revamp.spec.js           # Playwright mobile viewport
```

### 修改檔案

```
src/parent/components/LazyImage.vue     # 刪除（搬移後）
src/parent/views/<all-using-LazyImage>  # 更新 import path（grep 找）
tests/unit/parent/components/LazyImage.test.js  # 刪除（搬移後）
src/layouts/PortalLayout.vue            # 底部 tab 重排 + 側邊欄分組
src/router/index.js                     # /portal redirect 從 attendance 改為 home
```

---

## Phase 1: 基建 + 導航重組

**目標:** 11 個 task 全綠，bundle 增量 < 6 KB gzip（複用既有 Soft UI token、複製 ParentBottomSheet 主要邏輯不增 npm 依賴）。Phase 2-7 全部依賴此 phase merge 到 main 後才能開分支。

---

### Task 1.1: 確認狀態 + 開分支 + 建立目錄

**Files:**
- Modify: 工作目錄 `/Users/yilunwu/Desktop/ivy-frontend`

- [ ] **Step 1: 確認在 main 且 clean**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git status
```

Expected: `nothing to commit, working tree clean`。若有未 commit 變更，先處理（stash 或 commit 到當前分支），再切到 main。

- [ ] **Step 2: 切 main + pull**

```bash
git checkout main
git pull origin main
```

Expected: `Already up to date.` 或 fast-forward 訊息。

- [ ] **Step 3: 開 phase 1 branch**

```bash
git checkout -b feat/teacher-acd-v1-1-foundation
```

- [ ] **Step 4: 建立新目錄**

```bash
mkdir -p src/components/common src/components/portal
mkdir -p tests/unit/components/common tests/unit/components/portal
mkdir -p tests/unit/composables tests/unit/stores
mkdir -p tests/e2e/portal
```

Expected: 7 個目錄存在。`src/composables/` 與 `src/stores/` 已存在（既有），不會錯。

- [ ] **Step 5: 確認 spec 在 working tree**

```bash
ls docs/superpowers/specs/2026-05-06-teacher-portal-acd-optimization-design.md
```

Expected: 檔案存在。若不在則先 `cp` 進來（spec 採 D3 策略，原本留在 fix/bug-sweep-v1 分支的 working tree）。

---

### Task 1.2: useAsyncState composable + 測試（TDD）

**Files:**
- Create: `src/composables/useAsyncState.js`
- Create: `tests/unit/composables/useAsyncState.test.js`

統一非同步狀態：`{ data, loading, error, execute, refresh }`，含 ElMessage error toast 與「shadow execution」（同 ref 不重複觸發 spinner，只更新資料）。

- [ ] **Step 1: 寫 test 骨架（先 fail）**

寫 `tests/unit/composables/useAsyncState.test.js`：

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useAsyncState } from '@/composables/useAsyncState'

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
}))

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initial state has data=null, loading=false, error=null', () => {
    const { data, loading, error } = useAsyncState(() => Promise.resolve('x'))
    expect(data.value).toBe(null)
    expect(loading.value).toBe(false)
    expect(error.value).toBe(null)
  })

  it('execute sets loading then data on success', async () => {
    const fetcher = vi.fn().mockResolvedValue({ id: 1 })
    const { data, loading, execute } = useAsyncState(fetcher)
    const p = execute()
    expect(loading.value).toBe(true)
    await p
    expect(loading.value).toBe(false)
    expect(data.value).toEqual({ id: 1 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('execute captures error and shows ElMessage by default', async () => {
    const { ElMessage } = await import('element-plus')
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'))
    const { error, loading, execute } = useAsyncState(fetcher)
    await execute()
    expect(loading.value).toBe(false)
    expect(error.value).toBeInstanceOf(Error)
    expect(error.value.message).toBe('boom')
    expect(ElMessage.error).toHaveBeenCalledWith('boom')
  })

  it('toast=false suppresses ElMessage', async () => {
    const { ElMessage } = await import('element-plus')
    const fetcher = vi.fn().mockRejectedValue(new Error('silent'))
    const { execute } = useAsyncState(fetcher, { toast: false })
    await execute()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('refresh shadow=true keeps loading false but updates data', async () => {
    let counter = 0
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(++counter))
    const { data, loading, execute, refresh } = useAsyncState(fetcher)
    await execute()
    expect(data.value).toBe(1)
    const p = refresh({ shadow: true })
    expect(loading.value).toBe(false)
    await p
    expect(data.value).toBe(2)
  })

  it('immediate=true triggers execute on creation', async () => {
    const fetcher = vi.fn().mockResolvedValue('init')
    const { data } = useAsyncState(fetcher, { immediate: true })
    await nextTick()
    await nextTick()
    expect(data.value).toBe('init')
  })

  it('initialData sets data before first fetch', () => {
    const { data } = useAsyncState(() => Promise.resolve('y'), { initialData: 'init-value' })
    expect(data.value).toBe('init-value')
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/composables/useAsyncState.test.js
```

Expected: FAIL，錯誤類似 `Cannot find module '@/composables/useAsyncState'`。

- [ ] **Step 3: 實作 composable**

寫 `src/composables/useAsyncState.js`：

```javascript
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * 統一非同步狀態管理。
 *
 * @param {() => Promise<any>} fetcher 任何回傳 promise 的函式
 * @param {Object} [opts]
 * @param {boolean} [opts.immediate=false] 創建時立即 execute
 * @param {boolean} [opts.toast=true]      失敗時顯示 ElMessage.error
 * @param {any}     [opts.initialData=null] 初始 data 值
 * @returns {{ data, loading, error, execute, refresh }}
 */
export function useAsyncState(fetcher, opts = {}) {
  const { immediate = false, toast = true, initialData = null } = opts

  const data = ref(initialData)
  const loading = ref(false)
  const error = ref(null)

  const execute = async (...args) => {
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(...args)
      data.value = result
      return result
    } catch (e) {
      error.value = e
      if (toast) {
        const msg = e?.response?.data?.detail || e?.message || '操作失敗'
        ElMessage.error(typeof msg === 'string' ? msg : '操作失敗')
      }
      return undefined
    } finally {
      loading.value = false
    }
  }

  // shadow=true：背景重抓不顯示 loading，避免 spinner 閃爍
  const refresh = async ({ shadow = false, ...rest } = {}) => {
    if (shadow) {
      try {
        const result = await fetcher(rest)
        data.value = result
        return result
      } catch (e) {
        error.value = e
        if (toast) {
          const msg = e?.response?.data?.detail || e?.message || '操作失敗'
          ElMessage.error(typeof msg === 'string' ? msg : '操作失敗')
        }
        return undefined
      }
    }
    return execute(rest)
  }

  if (immediate) {
    execute()
  }

  return { data, loading, error, execute, refresh }
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm run test -- tests/unit/composables/useAsyncState.test.js
```

Expected: 7 tests pass。

- [ ] **Step 5: Commit**

```bash
git add src/composables/useAsyncState.js tests/unit/composables/useAsyncState.test.js
git commit -m "feat(common): 新增 useAsyncState composable

統一 portal/admin 兩端非同步狀態管理：
- 提供 data/loading/error/execute/refresh
- 預設失敗自動 ElMessage.error，可關
- 支援 shadow refresh（背景更新不閃 spinner）
- 支援 immediate / initialData

Phase 1 基建之一，後續所有 view 拆解會套用。"
```

---

### Task 1.3: usePortalCache Pinia store + 測試

**Files:**
- Create: `src/stores/portalCache.js`
- Create: `tests/unit/stores/portalCache.test.js`

集中 portal 用本地 cache（攻略 view 內各自的 sheetCache / sessionDetail 散落）。支援 TTL、invalidate、namespace 隔離。

- [ ] **Step 1: 寫 test**

寫 `tests/unit/stores/portalCache.test.js`：

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePortalCache } from '@/stores/portalCache'

describe('usePortalCache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-06T10:00:00Z'))
  })

  it('get returns undefined for missing key', () => {
    const cache = usePortalCache()
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('set + get within TTL returns value', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', { hello: 'world' })
    expect(cache.get('attendance', 'k1')).toEqual({ hello: 'world' })
  })

  it('TTL expired returns undefined', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', { v: 1 }, { ttlMs: 1000 })
    vi.advanceTimersByTime(1500)
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('invalidate(namespace, key) removes specific key', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 1)
    cache.set('attendance', 'k2', 2)
    cache.invalidate('attendance', 'k1')
    expect(cache.get('attendance', 'k1')).toBeUndefined()
    expect(cache.get('attendance', 'k2')).toBe(2)
  })

  it('invalidate(namespace) clears entire namespace', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 1)
    cache.set('schedule', 'k2', 2)
    cache.invalidate('attendance')
    expect(cache.get('attendance', 'k1')).toBeUndefined()
    expect(cache.get('schedule', 'k2')).toBe(2)
  })

  it('clear removes everything', () => {
    const cache = usePortalCache()
    cache.set('a', '1', 'x')
    cache.set('b', '2', 'y')
    cache.clear()
    expect(cache.get('a', '1')).toBeUndefined()
    expect(cache.get('b', '2')).toBeUndefined()
  })

  it('default TTL is 5 minutes', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 'v')
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(cache.get('attendance', 'k1')).toBe('v')
    vi.advanceTimersByTime(2 * 60 * 1000) // total 6min
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('has() reflects existence + TTL', () => {
    const cache = usePortalCache()
    expect(cache.has('attendance', 'k1')).toBe(false)
    cache.set('attendance', 'k1', 1, { ttlMs: 500 })
    expect(cache.has('attendance', 'k1')).toBe(true)
    vi.advanceTimersByTime(600)
    expect(cache.has('attendance', 'k1')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/stores/portalCache.test.js
```

Expected: FAIL，找不到 module。

- [ ] **Step 3: 實作 store**

寫 `src/stores/portalCache.js`：

```javascript
import { defineStore } from 'pinia'

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 分鐘

/**
 * Portal 共用本地 cache。
 *
 * 取代各 view 內散落的 sheetCache / sessionDetail / scheduleMonthCache 等本地 Map，
 * 並提供 TTL、namespace、invalidate API。
 *
 * 使用：
 *   const cache = usePortalCache()
 *   cache.set('attendance', '2026-05', sheetData)
 *   const cached = cache.get('attendance', '2026-05')
 *   cache.invalidate('attendance')  // 整個 namespace
 *   cache.invalidate('attendance', '2026-05')  // 單筆
 */
export const usePortalCache = defineStore('portalCache', {
  state: () => ({
    // entries: Map<namespace, Map<key, { value, expiresAt }>>
    entries: new Map(),
  }),
  actions: {
    _ns(namespace) {
      let ns = this.entries.get(namespace)
      if (!ns) {
        ns = new Map()
        this.entries.set(namespace, ns)
      }
      return ns
    },
    set(namespace, key, value, { ttlMs = DEFAULT_TTL_MS } = {}) {
      const ns = this._ns(namespace)
      ns.set(String(key), { value, expiresAt: Date.now() + ttlMs })
    },
    get(namespace, key) {
      const ns = this.entries.get(namespace)
      if (!ns) return undefined
      const entry = ns.get(String(key))
      if (!entry) return undefined
      if (entry.expiresAt < Date.now()) {
        ns.delete(String(key))
        return undefined
      }
      return entry.value
    },
    has(namespace, key) {
      return this.get(namespace, key) !== undefined
    },
    invalidate(namespace, key = undefined) {
      if (key === undefined) {
        this.entries.delete(namespace)
        return
      }
      const ns = this.entries.get(namespace)
      if (ns) ns.delete(String(key))
    },
    clear() {
      this.entries.clear()
    },
  },
})
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm run test -- tests/unit/stores/portalCache.test.js
```

Expected: 8 tests pass。

- [ ] **Step 5: Commit**

```bash
git add src/stores/portalCache.js tests/unit/stores/portalCache.test.js
git commit -m "feat(portal): 新增 usePortalCache Pinia store

集中 portal 各 view 內散落的本地 cache：
- TTL（預設 5 分鐘）+ namespace 隔離
- 提供 invalidate(ns) / invalidate(ns, key) / clear
- 後續 Phase 4 attendance 月份切換 cache 直接取用

Phase 1 基建之一。"
```

---

### Task 1.4: 搬移 LazyImage 至 src/components/common/

**Files:**
- Create: `src/components/common/LazyImage.vue`（從家長端搬）
- Create: `tests/unit/components/common/LazyImage.test.js`（從家長端搬）
- Delete: `src/parent/components/LazyImage.vue`
- Delete: `tests/unit/parent/components/LazyImage.test.js`
- Modify: 所有 import 過 `@/parent/components/LazyImage.vue` 的檔案

LazyImage 是純展示元件、無 parent-specific 邏輯，移到 common 讓 parent / portal 共用。

- [ ] **Step 1: 找出所有 LazyImage import 點**

```bash
grep -rn "parent/components/LazyImage" src/ tests/
```

Expected: 列出所有引用點（家長端 view 與測試檔）。記錄這些路徑。

- [ ] **Step 2: 移動原始檔**

```bash
git mv src/parent/components/LazyImage.vue src/components/common/LazyImage.vue
git mv tests/unit/parent/components/LazyImage.test.js tests/unit/components/common/LazyImage.test.js
```

Expected: `git status` 顯示兩個 renamed 條目。

- [ ] **Step 3: 更新測試檔的 import 路徑**

開 `tests/unit/components/common/LazyImage.test.js`，把：

```javascript
import LazyImage from '@/parent/components/LazyImage.vue'
```

改成：

```javascript
import LazyImage from '@/components/common/LazyImage.vue'
```

- [ ] **Step 4: 更新所有家長端 view / 元件的 import**

對 Step 1 列出的每個檔案，把 `'@/parent/components/LazyImage.vue'` 全部 replace 成 `'@/components/common/LazyImage.vue'`：

```bash
grep -rl "parent/components/LazyImage" src/ \
  | xargs sed -i.bak 's|@/parent/components/LazyImage|@/components/common/LazyImage|g'
find src/ -name "*.bak" -delete
```

Expected: 所有檔案更新；`grep -rn "parent/components/LazyImage" src/` 應回空。

- [ ] **Step 5: 跑 LazyImage 測試確認過**

```bash
npm run test -- tests/unit/components/common/LazyImage.test.js
```

Expected: 既有所有 test pass。

- [ ] **Step 6: 跑全 vitest 確認沒打壞家長端**

```bash
npm run test
```

Expected: 全綠（特別是家長端的 home/leaves/activity 等使用 LazyImage 的測試）。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(common): 將 LazyImage 從 parent 搬至 common

LazyImage 是純元件、無 parent-specific 邏輯。為 Phase 3 ContactBook
照片 lazy load 與後續 portal 各 view 共用，搬到 src/components/common/。

更新家長端所有 import 路徑 + 測試檔；行為不變。"
```

---

### Task 1.5: TeacherBottomSheet — 從 ParentBottomSheet 派生

**Files:**
- Create: `src/components/portal/TeacherBottomSheet.vue`
- Create: `tests/unit/components/portal/TeacherBottomSheet.test.js`

ParentBottomSheet 的 snap points / 手勢 / focus trap / keyboard 處理已驗證過，直接複製 + 重 token 為 portal 主色（深藍 #1e293b 系，對齊 PortalLayout sidebar 主色）。

- [ ] **Step 1: 複製 ParentBottomSheet 為 TeacherBottomSheet**

```bash
cp src/parent/components/ParentBottomSheet.vue src/components/portal/TeacherBottomSheet.vue
```

- [ ] **Step 2: 開檔修改 component name 與註解**

開 `src/components/portal/TeacherBottomSheet.vue`，把檔頭註解的「家長端底部彈窗」改為「教師端底部彈窗」，其餘函式邏輯保留。

如有 `defineOptions({ name: 'ParentBottomSheet' })`（檢查是否存在），改為 `'TeacherBottomSheet'`。若無 defineOptions，跳過。

- [ ] **Step 3: 重 token（CSS 區塊）**

在 `<style scoped>` 區塊內，把對應家長端綠色品牌的 token 改為教師端深藍系。具體規則：

| 家長端原值 | 教師端改成 |
|---|---|
| `var(--pt-tint-primary)`（綠系） | 保留（仍走 portal 內注入的 `--pt-tint-primary` 色，不另指定，讓父層 token 控制） |
| 任何 hard-coded `#10b981` / `#22c55e` 綠 | `#1e293b` slate-800（PortalLayout sidebar 同色） |
| handle 顏色（drag bar） | `var(--pt-text-muted)` |

實際操作：開檔 grep `#10b981|#22c55e|#16a34a` 與 `bg-green|bg-emerald`，沒命中就跳過此 step。教師端 PortalLayout 已經注入自己的 `--pt-tint-*` 系列，TeacherBottomSheet 用 token 即可繼承。

- [ ] **Step 4: 複製測試檔並改 import**

```bash
cp tests/unit/parent/components/ParentBottomSheet.test.js \
   tests/unit/components/portal/TeacherBottomSheet.test.js
```

開 `tests/unit/components/portal/TeacherBottomSheet.test.js`：
- 把 `import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'` 改為 `import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'`
- 全檔 replace：`ParentBottomSheet` → `TeacherBottomSheet`（含 describe / mount call / variable name）

- [ ] **Step 5: 跑測試確認通過**

```bash
npm run test -- tests/unit/components/portal/TeacherBottomSheet.test.js
```

Expected: 既有所有 test pass（複製 ParentBottomSheet 完整測試套）。若 fail，回頭檢查 import 是否漏改、style 修改是否破壞 selector。

- [ ] **Step 6: Commit**

```bash
git add src/components/portal/TeacherBottomSheet.vue tests/unit/components/portal/TeacherBottomSheet.test.js
git commit -m "feat(portal): 新增 TeacherBottomSheet 元件

從 ParentBottomSheet 派生，保留 snap points / 手勢 / focus trap /
keyboard 處理；style 重綁 portal 深藍系 token。
為 Phase 5 Schedule mobile dialog 改造服務。

Phase 1 基建之一。"
```

---

### Task 1.6: StatCard — 通用統計卡 + 測試

**Files:**
- Create: `src/components/portal/StatCard.vue`
- Create: `tests/unit/components/portal/StatCard.test.js`

5 個 view 都重複實作的「統計卡」（label / value / trend / icon）抽出，後續 Home dashboard 與 Attendance 統計區會大量使用。

- [ ] **Step 1: 寫 test**

寫 `tests/unit/components/portal/StatCard.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatCard from '@/components/portal/StatCard.vue'

describe('StatCard', () => {
  it('renders label and value', () => {
    const w = mount(StatCard, { props: { label: '總出勤', value: 18 } })
    expect(w.text()).toContain('總出勤')
    expect(w.text()).toContain('18')
  })

  it('renders unit suffix when provided', () => {
    const w = mount(StatCard, { props: { label: '時數', value: 8.5, unit: 'h' } })
    expect(w.text()).toContain('8.5')
    expect(w.text()).toContain('h')
  })

  it('applies tone class', () => {
    const w = mount(StatCard, { props: { label: 'X', value: 1, tone: 'warning' } })
    expect(w.classes()).toContain('stat-card--warning')
  })

  it('default tone is neutral', () => {
    const w = mount(StatCard, { props: { label: 'X', value: 1 } })
    expect(w.classes()).toContain('stat-card--neutral')
  })

  it('renders trend up/down with delta', () => {
    const w = mount(StatCard, {
      props: { label: 'X', value: 5, trend: 'up', delta: '+2' },
    })
    expect(w.find('[data-test="stat-trend"]').exists()).toBe(true)
    expect(w.text()).toContain('+2')
  })

  it('emits click when interactive prop true', async () => {
    const w = mount(StatCard, {
      props: { label: 'X', value: 1, interactive: true },
    })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('does not emit click by default', async () => {
    const w = mount(StatCard, { props: { label: 'X', value: 1 } })
    await w.trigger('click')
    expect(w.emitted('click')).toBeFalsy()
  })

  it('renders default icon slot', () => {
    const w = mount(StatCard, {
      props: { label: 'X', value: 1 },
      slots: { icon: '<span class="ic">📅</span>' },
    })
    expect(w.find('.ic').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/components/portal/StatCard.test.js
```

Expected: FAIL，找不到 module。

- [ ] **Step 3: 實作元件**

寫 `src/components/portal/StatCard.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * 教師端通用統計卡。
 *
 * 用於 Home dashboard、Attendance 月度統計、ContactBook 進度卡等。
 *
 * Props:
 *  - label: 卡片標籤（top）
 *  - value: 主數值（center, 大字）
 *  - unit: 數值單位（e.g. 'h', '%'）
 *  - tone: 視覺色調（neutral/primary/success/warning/danger）
 *  - trend: 'up' | 'down' | null
 *  - delta: 趨勢數字字串（e.g. '+2', '-3'）
 *  - interactive: true 時顯示 hover 狀態並可點擊
 *
 * Slots:
 *  - icon: 左上角 icon
 *  - footer: 底部補充行
 */
const props = defineProps({
  label: { type: String, required: true },
  value: { type: [Number, String], required: true },
  unit: { type: String, default: '' },
  tone: {
    type: String,
    default: 'neutral',
    validator: (v) => ['neutral', 'primary', 'success', 'warning', 'danger'].includes(v),
  },
  trend: { type: String, default: null, validator: (v) => v === null || ['up', 'down'].includes(v) },
  delta: { type: String, default: '' },
  interactive: { type: Boolean, default: false },
})

defineEmits(['click'])

const cardClass = computed(() => [
  'stat-card',
  `stat-card--${props.tone}`,
  { 'stat-card--interactive': props.interactive },
])
</script>

<template>
  <div :class="cardClass" @click="interactive && $emit('click')">
    <div class="stat-card__head">
      <slot name="icon" />
      <span class="stat-card__label">{{ label }}</span>
    </div>
    <div class="stat-card__value">
      <span class="stat-card__num">{{ value }}</span>
      <span v-if="unit" class="stat-card__unit">{{ unit }}</span>
    </div>
    <div
      v-if="trend"
      class="stat-card__trend"
      :class="`stat-card__trend--${trend}`"
      data-test="stat-trend"
    >
      <span class="stat-card__arrow">{{ trend === 'up' ? '▲' : '▼' }}</span>
      <span>{{ delta }}</span>
    </div>
    <div v-if="$slots.footer" class="stat-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.stat-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  transition: box-shadow var(--transition-base), transform var(--transition-base);
}

.stat-card--interactive {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.stat-card--interactive:hover {
  box-shadow: var(--pt-elev-2);
  transform: translateY(-1px);
}

.stat-card__head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}

.stat-card__label {
  font-weight: 500;
}

.stat-card__value {
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
}

.stat-card__num {
  font-size: 28px;
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.1;
}

.stat-card__unit {
  font-size: var(--text-base);
  color: var(--pt-text-muted);
}

.stat-card__trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-sm);
  font-weight: 500;
}

.stat-card__trend--up {
  color: #16a34a;
}

.stat-card__trend--down {
  color: #dc2626;
}

.stat-card__footer {
  font-size: var(--text-xs);
  color: var(--pt-text-faint);
  border-top: var(--pt-hairline);
  padding-top: var(--space-2);
}

/* Tone tints */
.stat-card--primary {
  border-color: rgba(79, 70, 229, 0.2);
}

.stat-card--success {
  border-color: rgba(34, 197, 94, 0.2);
}

.stat-card--warning {
  border-color: rgba(234, 179, 8, 0.25);
}

.stat-card--danger {
  border-color: rgba(220, 38, 38, 0.25);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm run test -- tests/unit/components/portal/StatCard.test.js
```

Expected: 8 tests pass。

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/StatCard.vue tests/unit/components/portal/StatCard.test.js
git commit -m "feat(portal): 新增 StatCard 通用統計卡

抽出 5 個 view 重複實作的統計卡樣式：
- 5 種 tone（neutral/primary/success/warning/danger）
- 支援 trend up/down + delta
- interactive 模式可點擊（emit click）
- icon / footer slots

Phase 1 基建之一，Home dashboard / Attendance 統計區直接套用。"
```

---

### Task 1.7: OfflineQueueBadge — 離線佇列徽章 + 測試

**Files:**
- Create: `src/components/portal/OfflineQueueBadge.vue`
- Create: `tests/unit/components/portal/OfflineQueueBadge.test.js`

顯示「N 筆待同步」徽章，為 Phase 6 學生點名離線佇列服務。本 phase 提供元件骨架，實際 wired 到 useOfflineQueue 留 Phase 6。

- [ ] **Step 1: 寫 test**

寫 `tests/unit/components/portal/OfflineQueueBadge.test.js`：

```javascript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OfflineQueueBadge from '@/components/portal/OfflineQueueBadge.vue'

describe('OfflineQueueBadge', () => {
  it('renders nothing when count is 0', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 0 } })
    expect(w.find('[data-test="badge-root"]').exists()).toBe(false)
  })

  it('renders count when > 0', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 3 } })
    expect(w.find('[data-test="badge-root"]').exists()).toBe(true)
    expect(w.text()).toContain('3')
    expect(w.text()).toContain('待同步')
  })

  it('shows clock icon when status=pending', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 2, status: 'pending' } })
    expect(w.find('[data-test="badge-root"]').classes()).toContain('badge--pending')
  })

  it('shows warning color when status=failed', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 1, status: 'failed' } })
    expect(w.find('[data-test="badge-root"]').classes()).toContain('badge--failed')
  })

  it('emits click when clicked', async () => {
    const w = mount(OfflineQueueBadge, { props: { count: 2 } })
    await w.find('[data-test="badge-root"]').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('caps display at 99+', () => {
    const w = mount(OfflineQueueBadge, { props: { count: 150 } })
    expect(w.text()).toContain('99+')
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/components/portal/OfflineQueueBadge.test.js
```

Expected: FAIL（module not found）。

- [ ] **Step 3: 實作元件**

寫 `src/components/portal/OfflineQueueBadge.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * 離線佇列徽章 — 顯示「N 筆待同步」狀態。
 *
 * 狀態：
 *  - pending: 待同步（橘）
 *  - failed: 同步失敗（紅）
 *
 * Phase 6 會由 useOfflineQueue 注入 count + status。
 */
const props = defineProps({
  count: { type: Number, required: true },
  status: {
    type: String,
    default: 'pending',
    validator: (v) => ['pending', 'failed'].includes(v),
  },
})

defineEmits(['click'])

const display = computed(() => (props.count > 99 ? '99+' : String(props.count)))
const visible = computed(() => props.count > 0)
</script>

<template>
  <button
    v-if="visible"
    type="button"
    :class="['badge', `badge--${status}`]"
    data-test="badge-root"
    @click="$emit('click')"
  >
    <span class="badge__icon" aria-hidden="true">
      {{ status === 'failed' ? '⚠' : '⏳' }}
    </span>
    <span class="badge__text">{{ display }} 筆待同步</span>
  </button>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #fff7ed;
  color: #c2410c;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-base);
  -webkit-tap-highlight-color: transparent;
}

.badge:hover {
  background: #ffedd5;
}

.badge--failed {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}

.badge--failed:hover {
  background: #fee2e2;
}

.badge__icon {
  font-size: 12px;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npm run test -- tests/unit/components/portal/OfflineQueueBadge.test.js
```

Expected: 6 tests pass。

- [ ] **Step 5: Commit**

```bash
git add src/components/portal/OfflineQueueBadge.vue tests/unit/components/portal/OfflineQueueBadge.test.js
git commit -m "feat(portal): 新增 OfflineQueueBadge 元件

顯示「N 筆待同步」狀態徽章，支援 pending / failed 兩種視覺。
為 Phase 6 學生點名離線佇列 UI 服務。

Phase 1 基建之一。"
```

---

### Task 1.8: PortalLayout 底部 tab 重排

**Files:**
- Modify: `src/layouts/PortalLayout.vue`

把第 5 個「更多」漢堡換成「我的」（直接跳 `/portal/profile`），並把第 1 個從「出勤」改為「工作台」（首頁）。漢堡選單仍保留在頂部 right-end 作為次要入口（已存在的 `toggleSidebar`）。

- [ ] **Step 1: 找出 PortalLayout.vue 的 bottom-nav 區塊**

bottom-nav 在 `src/layouts/PortalLayout.vue` 第 472-503 行（template 內 `<div v-if="isMobile" class="bottom-nav">` 區塊）。

- [ ] **Step 2: 替換 bottom-nav template**

把目前 5 個 bottom-tab 的順序與內容改成下表：

| # | 路由 | 圖示 | 標籤 | badge |
|---|---|---|---|---|
| 1 | `/portal/home` | `HomeFilled` | 工作台 | `totalHubBadge`（已 computed） |
| 2 | `/portal/attendance` | `Calendar` | 出勤 | — |
| 3 | `/portal/schedule` | `Clock` | 排班 | `swapPendingCount` |
| 4 | `/portal/students` | `User` | 學生 | — |
| 5 | `/portal/profile` | `UserFilled` | 我的 | — |

把整個 bottom-nav `<div>` 區塊替換為：

```vue
      <!-- Bottom Navigation (mobile only) -->
      <div v-if="isMobile" class="bottom-nav">
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/home') || route.path.startsWith('/portal/class-hub') }" @click="router.push('/portal/home')">
          <div class="tab-icon-wrapper">
            <el-icon><HomeFilled /></el-icon>
            <el-badge v-if="totalHubBadge > 0" :value="totalHubBadge" :max="99" class="tab-badge" />
          </div>
          <span>工作台</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/attendance') }" @click="router.push('/portal/attendance')">
          <el-icon><Calendar /></el-icon>
          <span>出勤</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/schedule') }" @click="router.push('/portal/schedule')">
          <div class="tab-icon-wrapper">
            <el-icon><Clock /></el-icon>
            <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="tab-badge" />
          </div>
          <span>排班</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/students') || route.path.startsWith('/portal/student') }" @click="router.push('/portal/students')">
          <el-icon><User /></el-icon>
          <span>學生</span>
        </div>
        <div class="bottom-tab" :class="{ active: route.path.startsWith('/portal/profile') }" @click="router.push('/portal/profile')">
          <el-icon><UserFilled /></el-icon>
          <span>我的</span>
        </div>
      </div>
```

註：原來的「請假」與「薪資」tab 移除，使用者改從側邊欄 / dashboard 進入。

- [ ] **Step 3: 確認 import**

打開 `src/layouts/PortalLayout.vue` `<script setup>`，確認從 `@element-plus/icons-vue` import 的 icons 包含：`HomeFilled`、`Calendar`、`Clock`、`User`、`UserFilled`、`Document`、`Watch`、`Edit`、`Warning`、`Timer`、`Bell`、`School`、`DataAnalysis`、`Van`、`Brush`、`Money`、`Menu`、`ArrowDown`。

如缺，從現有 import 補齊：

```javascript
import {
  HomeFilled, Calendar, Clock, User, UserFilled, Document,
  Watch, Edit, Warning, Timer, Bell, School, DataAnalysis,
  Van, Brush, Money, Menu, ArrowDown,
} from '@element-plus/icons-vue'
```

實際上既有檔很可能是 auto-register。先 grep 確認：

```bash
grep -n "from '@element-plus/icons-vue'" src/layouts/PortalLayout.vue
```

若無 import 行，表示用 vite plugin 自動註冊，不需手動加。

- [ ] **Step 4: 跑前端 dev server 手動測試**

```bash
npm run dev
```

開瀏覽器 Chrome DevTools → Toggle device toolbar → 選 iPhone 12 Pro，登入教師帳號（dev 環境用 admin 帳號可走 portal）。

驗證：
- 底部 5 個 tab 順序：工作台 / 出勤 / 排班 / 學生 / 我的
- 點工作台 → 跳 `/portal/home`（會看到 `PortalHomeView` 既有空殼，正常）
- 點我的 → 跳 `/portal/profile`
- 漢堡（頂部右上）仍可開側邊欄

`Ctrl+C` 停 dev server。

- [ ] **Step 5: Commit**

```bash
git add src/layouts/PortalLayout.vue
git commit -m "refactor(portal): 底部 tab 重排為「工作台/出勤/排班/學生/我的」

把第 5 個漢堡 tab 換為「我的（個人選單）」，避免雙層導航；
新增第 1 個「工作台」tab 對應 Phase 2 將新建的 dashboard。
頂部漢堡入口保留作為側邊欄次要入口。

教師端 Phase 1 第二步驟。"
```

---

### Task 1.9: PortalLayout 側邊欄分組（教學 / 管理）

**Files:**
- Modify: `src/layouts/PortalLayout.vue`

側邊欄按下列六群分組：

- **我的**：今日工作台、我的出勤、我的排班、薪資查詢、個人資料、修改密碼
- **假勤申請**：請假申請、加班申請、補打卡申請、異常確認
- **班級教學**：班級學生、學生點名、課堂觀察、學期評量、聯絡簿
- **班級管理**：事件紀錄、接送通知、用藥執行
- **才藝**：才藝報名查詢、才藝點名
- **其他**：公告通知、學校行事曆

- [ ] **Step 1: 確認 router 內各路由 path 名稱（避免 hardcode 錯）**

```bash
grep -n "name: 'portal-" src/router/index.js | head -40
```

Expected: 列出所有 portal-* 路由名。對照表：

| 路由 path | 顯示名 |
|---|---|
| `/portal/home` | 今日工作台（新建，Phase 2） |
| `/portal/class-hub` | 班級工作台（既有） |
| `/portal/attendance` | 我的出勤 |
| `/portal/schedule` | 我的排班 |
| `/portal/leave` | 請假申請 |
| `/portal/overtime` | 加班申請 |
| `/portal/punch-correction` | 補打卡申請 |
| `/portal/anomalies` | 異常確認 |
| `/portal/students` | 班級學生 |
| `/portal/student-attendance` | 學生點名（路由存在則用，否則跳過） |
| `/portal/observations` | 課堂觀察 |
| `/portal/assessments` | 學期評量 |
| `/portal/contact-book` 或 `/portal/class-hub?panel=contact` | 聯絡簿 |
| `/portal/incidents` | 事件紀錄 |
| `/portal/dismissal-calls` | 接送通知 |
| `/portal/medications` | 用藥執行 |
| `/portal/activity` | 才藝管理 |
| `/portal/announcements` | 公告通知 |
| `/portal/calendar` | 學校行事曆 |
| `/portal/profile` | 個人資料 |
| `/portal/salary` | 薪資查詢 |

若某路由不存在（如 `student-attendance` 可能在 Phase 6 才加），先用 `class-hub?panel=...` 替代或暫時不放入 menu。

- [ ] **Step 2: 替換側邊欄 el-menu template**

開 `src/layouts/PortalLayout.vue`，把第 293-404 行 `<el-menu>` 整段替換為下列內容：

```vue
      <el-menu
        :default-active="activeIndex"
        :router="true"
        class="portal-menu"
        unique-opened
        text-color="#94a3b8"
        active-text-color="#ffffff"
        background-color="#1e293b"
        @select="closeSidebar"
      >
        <!-- ============ 我的 ============ -->
        <el-sub-menu index="group-mine">
          <template #title>
            <el-icon><UserFilled /></el-icon>
            <span>我的</span>
          </template>
          <el-menu-item index="/portal/home">
            <el-icon><HomeFilled /></el-icon>
            <span>今日工作台</span>
            <el-badge v-if="totalHubBadge > 0" :value="totalHubBadge" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/attendance">
            <el-icon><Calendar /></el-icon>
            <span>我的出勤</span>
          </el-menu-item>
          <el-menu-item index="/portal/schedule">
            <el-icon><Timer /></el-icon>
            <span>我的排班</span>
            <el-badge v-if="swapPendingCount > 0" :value="swapPendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/salary">
            <el-icon><Money /></el-icon>
            <span>薪資查詢</span>
          </el-menu-item>
          <el-menu-item index="/portal/profile">
            <el-icon><User /></el-icon>
            <span>個人資料</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 假勤申請 ============ -->
        <el-sub-menu index="group-leave">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>假勤申請</span>
          </template>
          <el-menu-item index="/portal/leave">
            <span>請假申請</span>
            <el-badge v-if="substitutePendingCount > 0" :value="substitutePendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/overtime">
            <span>加班申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/punch-correction">
            <span>補打卡申請</span>
          </el-menu-item>
          <el-menu-item index="/portal/anomalies">
            <span>異常確認</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 班級 — 教學 ============ -->
        <el-sub-menu index="group-class-teach">
          <template #title>
            <el-icon><School /></el-icon>
            <span>班級 — 教學</span>
          </template>
          <el-menu-item index="/portal/students">
            <span>班級學生</span>
          </el-menu-item>
          <el-menu-item index="/portal/class-hub">
            <span>今日班級工作台</span>
          </el-menu-item>
          <el-menu-item index="/portal/observations">
            <span>課堂觀察</span>
          </el-menu-item>
          <el-menu-item index="/portal/assessments">
            <span>學期評量</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 班級 — 管理 ============ -->
        <el-sub-menu index="group-class-admin">
          <template #title>
            <el-icon><Warning /></el-icon>
            <span>班級 — 管理</span>
          </template>
          <el-menu-item index="/portal/incidents">
            <span>事件紀錄</span>
          </el-menu-item>
          <el-menu-item index="/portal/dismissal-calls">
            <span>接送通知</span>
            <el-badge v-if="dismissalPendingCount > 0" :value="dismissalPendingCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/medications">
            <span>用藥執行</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 才藝 ============ -->
        <el-sub-menu index="group-activity">
          <template #title>
            <el-icon><Brush /></el-icon>
            <span>才藝</span>
          </template>
          <el-menu-item index="/portal/activity">
            <span>才藝管理</span>
          </el-menu-item>
        </el-sub-menu>

        <!-- ============ 其他 ============ -->
        <el-menu-item index="/portal/announcements">
          <el-icon><Bell /></el-icon>
          <span>公告通知</span>
          <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="announcement-badge" />
        </el-menu-item>
        <el-menu-item index="/portal/calendar">
          <el-icon><Calendar /></el-icon>
          <span>學校行事曆</span>
        </el-menu-item>
      </el-menu>
```

- [ ] **Step 3: dev 手動驗證分組**

```bash
npm run dev
```

桌面瀏覽（不開 mobile mode），登入教師帳號，逐一展開 6 個 sub-menu，確認：
- 每個 menu item 點擊都可正確跳目標路由（不報 404 / 不錯路徑）
- badge（公告未讀 / 接送待處理 / 換班待回覆）顯示位置正確
- `unique-opened` 行為：開一個 sub-menu 會收起其他

若有路由不存在報錯（如 `/portal/observations`），先確認 `router/index.js` 確實有對應 route（既有應該都有；若沒有則拿掉該 menu item，等對應 phase 補回來）。

`Ctrl+C` 停 dev。

- [ ] **Step 4: Commit**

```bash
git add src/layouts/PortalLayout.vue
git commit -m "refactor(portal): 側邊欄重新分組為六群

- 我的：工作台 / 出勤 / 排班 / 薪資 / 個人
- 假勤申請：請假 / 加班 / 補打卡 / 異常
- 班級 — 教學：學生 / 班級工作台 / 觀察 / 評量
- 班級 — 管理：事件 / 接送 / 用藥
- 才藝：才藝管理
- 其他：公告 / 行事曆

把舊的「班級教務」7 子項拆為教學 vs 管理，降低認知負擔。
教師端 Phase 1 第三步驟。"
```

---

### Task 1.10: router redirect + 一次性導航更新提示

**Files:**
- Modify: `src/router/index.js`
- Modify: `src/layouts/PortalLayout.vue`（加一次性提示邏輯）

`/portal` 預設 redirect 從 `/portal/attendance` 改為 `/portal/home`。第一次進新版用 `localStorage` 旗標彈一次「導航更新」提示。

- [ ] **Step 1: 修改 router redirect**

開 `src/router/index.js`，找到 `/portal` 的 redirect。原本：

```javascript
{
    path: '/portal',
    component: () => import('../layouts/PortalLayout.vue'),
    meta: { portal: true, requiresAuth: true },
    children: [
        {
            path: '',
            redirect: '/portal/home',  // 注意原本可能是 attendance
        },
        ...
```

確認 `redirect` 為 `/portal/home`。如不是，改之。

從 grep 得知 router 第二段是 `redirect: '/portal/home'`，可能已 redirect 到 home（既有 PortalHomeView 是空殼）。若已是，Skip Step 1，無需修改。

```bash
grep -n "redirect.*'/portal" src/router/index.js | head
```

確認第一個 `redirect: '/portal/home'` 存在。

- [ ] **Step 2: 在 PortalLayout `onMounted` 加一次性導航更新提示**

開 `src/layouts/PortalLayout.vue`，在 `onMounted` 既有區塊內（約第 164 行附近）追加：

```javascript
onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
  window.addEventListener('portal-substitute-count-changed', onSubstituteChanged)
  document.addEventListener('visibilitychange', onVisibilityChange)
  fetchEmployees()
  refreshPortalCounts({ force: true })

  // 導航更新一次性提示（v=1: 2026-05 教師端 ACD 改造）
  const PORTAL_LAYOUT_VERSION = '1'
  const stored = localStorage.getItem('portal_layout_v')
  if (stored !== PORTAL_LAYOUT_VERSION) {
    setTimeout(() => {
      ElMessageBox({
        title: '導航更新',
        message: '教師端介面已更新：\n\n' +
          '• 底部 tab 第 5 個從「更多」改為「我的」（個人選單）\n' +
          '• 側邊欄「班級教務」拆為「班級 — 教學」與「班級 — 管理」\n' +
          '• 新增「今日工作台」為預設首頁\n\n' +
          '原本的選單仍可由側邊欄找到。',
        type: 'info',
        confirmButtonText: '我知道了',
        showCancelButton: false,
      }).catch(() => {}).finally(() => {
        localStorage.setItem('portal_layout_v', PORTAL_LAYOUT_VERSION)
      })
    }, 500)
  }
})
```

確認 `ElMessageBox` 已在 import：第 5 行 `import { ElMessage, ElMessageBox } from 'element-plus'` 已有，無需補。

- [ ] **Step 3: 確認 PortalHomeView 空殼可正常 render**

開 `src/views/portal/PortalHomeView.vue`，確認檔案存在且 mount 不報錯。本 phase 不重打 dashboard，只是讓 redirect 不會 404。

如有需要，加最小 placeholder：

```vue
<script setup>
// Phase 1：保留檔，Phase 2 重打為 dashboard
</script>

<template>
  <div class="portal-home-placeholder">
    <h2>今日工作台（建設中）</h2>
    <p>Phase 2 將提供完整 dashboard</p>
  </div>
</template>

<style scoped>
.portal-home-placeholder {
  padding: var(--space-6);
  color: var(--pt-text-muted);
  text-align: center;
}
</style>
```

如既有 PortalHomeView 已有內容、能正常 mount，Skip 此 step（不要覆蓋）。先 `cat` 看：

```bash
wc -l src/views/portal/PortalHomeView.vue
```

若 < 30 行（幾乎空檔）才覆蓋；若 > 30 行有實際內容則保留。

- [ ] **Step 4: dev 手動驗證一次性提示**

```bash
npm run dev
```

清掉 localStorage：開 DevTools → Application → Local Storage → 刪除 `portal_layout_v`。重整頁面 → 應彈出「導航更新」提示。按「我知道了」。再重整 → 不再彈。

`Ctrl+C` 停 dev。

- [ ] **Step 5: Commit**

```bash
git add src/router/index.js src/layouts/PortalLayout.vue src/views/portal/PortalHomeView.vue
git commit -m "feat(portal): 導航更新一次性提示 + /portal redirect 確認

- /portal 預設 redirect 確認為 /portal/home
- 用 localStorage.portal_layout_v 控制首次彈導航更新說明
- PortalHomeView 保留為 placeholder（Phase 2 重打）

教師端 Phase 1 第四步驟。"
```

---

### Task 1.11: Phase 1 全測試 + bundle 驗收 + Playwright mobile

**Files:**
- Create: `tests/e2e/portal/navigation-revamp.spec.js`

跑全 vitest、bundle size 驗證、Playwright mobile golden path。

- [ ] **Step 1: 跑完整 vitest**

```bash
npm run test
```

Expected: 所有測試綠（含既有家長端 + 新加 portal 共用元件）。

若家長端有測試 fail，最大可能是 LazyImage import path 漏改。回頭跑：

```bash
grep -rn "@/parent/components/LazyImage" src/ tests/
```

應為空。若有殘留，補改後重跑 vitest。

- [ ] **Step 2: 跑完整 build 確認沒語法問題**

```bash
npm run build
```

Expected: build success；觀察輸出的 chunk size 行。

- [ ] **Step 3: 比對 portal chunk gzip 增量**

紀錄 dist 目錄結構：

```bash
ls -lah dist/assets/ | grep -i portal | head
```

或更直接：

```bash
du -sh dist/assets/*portal*
```

對照 main 分支的 portal bundle gzip size（從 git log 找 commit history 或實際比較）：

```bash
# 切到 main 跑一次 build
git stash
git checkout main
npm run build
du -sh dist/assets/*portal* > /tmp/portal-baseline.txt
git checkout feat/teacher-acd-v1-1-foundation
git stash pop
npm run build
du -sh dist/assets/*portal* > /tmp/portal-after.txt
diff /tmp/portal-baseline.txt /tmp/portal-after.txt
```

Expected: portal chunk gzip 增加 < 6 KB。若超出，回頭檢查 TeacherBottomSheet 是否複製了不必要的 import / StatCard CSS 是否過重。

- [ ] **Step 4: 寫 Playwright mobile golden path**

寫 `tests/e2e/portal/navigation-revamp.spec.js`（如專案無 Playwright，跳過此 step，記錄為「需後補」）：

```bash
ls playwright.config.* 2>/dev/null
```

若有 playwright config，繼續；若無，Step 4 跳過寫入 Phase 1 驗收事項：「需在後續 phase 補 Playwright 環境」。

```javascript
import { test, expect, devices } from '@playwright/test'

test.use({ ...devices['iPhone 13'] })

test.describe('portal 導航重組', () => {
  test('進 /portal 自動導向 /portal/home，底部 5 tab 順序正確', async ({ page }) => {
    // 假設 dev 環境 admin/admin123 登入流程
    await page.goto('http://localhost:5173/portal/login')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("登入")')

    // 進 /portal 預設導 /portal/home
    await page.waitForURL(/\/portal\/home/, { timeout: 10000 })

    // 底部 5 tab 標籤
    const tabLabels = await page.locator('.bottom-tab span').allTextContents()
    expect(tabLabels).toEqual(['工作台', '出勤', '排班', '學生', '我的'])

    // 點「我的」跳 profile
    await page.click('.bottom-tab:has-text("我的")')
    await expect(page).toHaveURL(/\/portal\/profile/)
  })

  test('一次性導航更新提示首次顯示，第二次不顯示', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('http://localhost:5173/portal/login')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[type="password"]', 'admin123')
    await page.click('button:has-text("登入")')

    // 第一次彈 ElMessageBox
    await expect(page.locator('.el-message-box').filter({ hasText: '導航更新' }))
      .toBeVisible({ timeout: 5000 })
    await page.click('.el-message-box button:has-text("我知道了")')

    // reload 後不再彈
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.el-message-box').filter({ hasText: '導航更新' }))
      .toHaveCount(0)
  })
})
```

註：實際登入 selector 可能跟 dev 環境不同，根據 `LoginView.vue` 的實際 input name / button text 調整。

- [ ] **Step 5: 跑 Playwright（若環境支援）**

需先啟動 dev server（背景）+ 後端：

```bash
cd /Users/yilunwu/Desktop/ivyManageSystem
./start.sh
```

另一個 terminal：

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
npx playwright test tests/e2e/portal/navigation-revamp.spec.js --project=mobile
```

Expected: 2 tests pass。若無 mobile project 設定，改 `npx playwright test tests/e2e/portal/navigation-revamp.spec.js`。

如環境問題或登入流程不一致，記錄為 manual verification done（dev mode 手動驗）並讓 PR review 補。

- [ ] **Step 6: 補 Phase 1 commit + push**

```bash
git add tests/e2e/portal/navigation-revamp.spec.js
git commit -m "test(portal): Phase 1 Playwright mobile 導航 golden path"
git push -u origin feat/teacher-acd-v1-1-foundation
```

Expected: branch push 成功，準備發 PR。

- [ ] **Step 7: 開 PR（gh CLI）**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
gh pr create --title "feat(portal): Phase 1 — 基建 + 導航重組" --body "$(cat <<'EOF'
## Summary

教師端 Portal 大 polish 第 1 phase：

- 4 個共用元件：TeacherBottomSheet / LazyImage（移至 common）/ StatCard / OfflineQueueBadge
- 2 個 composable / store：useAsyncState / usePortalCache
- 底部 tab 重排：工作台 / 出勤 / 排班 / 學生 / 我的（取代漢堡）
- 側邊欄分為 6 群（教學 / 管理拆開）
- 一次性導航更新提示

依據 spec：\`docs/superpowers/specs/2026-05-06-teacher-portal-acd-optimization-design.md\`

## Test plan
- [x] 全 vitest 綠
- [x] portal bundle gzip 增量 < 6 KB
- [ ] Playwright mobile golden path（兩條，需 reviewer 在本機跑一次）
- [ ] dev 環境手動驗證 6 個側邊欄群組所有路由可達
- [ ] 桌面與 mobile 兩個 viewport 各跑一次
EOF
)"
```

Expected: PR URL 印出。

---

## Phase 1 完成檢核

- [ ] 4 個元件 + 2 個 composable / store 全部建立並有測試
- [ ] LazyImage 從 parent 搬到 common，家長端 import 全更新
- [ ] PortalLayout 底部 tab 5 項符合表格
- [ ] PortalLayout 側邊欄 6 群分組正確
- [ ] `/portal` 預設 redirect 至 `/portal/home`
- [ ] 一次性導航提示 localStorage 機制運作
- [ ] vitest 全綠
- [ ] portal bundle gzip 增量 < 6 KB
- [ ] PR 已開、reviewer 已 ping

---

## 後續 Phase 2-8 預告

Phase 1 merge 後，依序開：

- **Phase 2**：Home dashboard 新建（前端 + 後端 home N+1）— 跨前後端，雙 PR
- **Phase 3**：ContactBook 拆解（前端 + 後端 contact_book N+1）— 跨前後端，雙 PR
- **Phase 4**：Attendance 拆解（純前端）
- **Phase 5**：Schedule 拆解（純前端）
- **Phase 6**：StudentAttendance 拆解（純前端）
- **Phase 7**：Activity 拆解（純前端）
- **Phase 8**：後端 polish 收尾（純後端）

每 phase 開工前 invoke `superpowers:writing-plans` 產出該 phase 的詳細 task plan，因為前期 phase 的 API 可能在實作中微調。
