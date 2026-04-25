# 載入圖示邏輯優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正路由載入瞬閃與 keyed store 全域 loading 互蓋，建立 `useAsyncState` / `<LoadingPanel>` 共用基建與 axios 同 key 去重。

**Architecture:** 三層修補 —（1）修既有 `useRouteLoading` 與 `_createKeyedFetchStore`；（2）新增 `useAsyncState` composable 與 `<LoadingPanel>` 元件；（3）API 層包裝 `api.request` 對 mutating 請求做同 key 去重。不強制遷移 132 處 `v-loading`，僅遷移 2 個代表頁面做為示範。

**Tech Stack:** Vue 3（Composition API + Options API 混用）、Pinia、Vue Router 4、Element Plus、axios、vitest + happy-dom + @vue/test-utils。

**Spec 參照：** `docs/superpowers/specs/2026-04-24-loading-icon-optimization-design.md`

**檔案結構（本 plan 會碰到的檔案）：**

新增：
- `src/composables/useAsyncState.js`
- `src/components/common/LoadingPanel.vue`
- `src/utils/apiDedupe.js`（封裝 dedupe 邏輯，讓 `src/api/index.js` 單純）
- `tests/unit/composables/useAsyncState.test.js`
- `tests/unit/components/LoadingPanel.test.js`
- `tests/unit/api/dedupe.test.js`
- `tests/unit/stores/keyedFetchStore.test.js`

修改：
- `src/composables/useRouteLoading.js` - 加 `MIN_SHOW_MS` 最短顯示時間
- `src/stores/_createKeyedFetchStore.js` - 加 `loadingKeys` Set + `isLoading(key)`
- `src/api/index.js` - 套用 `apiDedupe` 包裝
- `tests/unit/composables/useRouteLoading.test.js` - 新增 min-show 測試
- `src/views/LeaveView.vue` - 示範遷移至 `<LoadingPanel>`
- `src/views/OvertimeView.vue` - 示範遷移至 `<LoadingPanel>`

**測試慣例（照既有專案）：**
- 測試檔路徑：`tests/unit/<domain>/<name>.test.js`（不用 `__tests__` 子目錄、不用 `.spec.js`）
- 測試環境：`happy-dom`
- 全域：`vitest` globals 已開啟（可直接用 `describe/it/expect/vi`）
- `tests/setup.js` 已 mock `localStorage`

---

## Task 1: useRouteLoading 加最短顯示時間

修掉路由 overlay 瞬閃：顯示後至少 400ms 才能關。

**Files:**
- Modify: `src/composables/useRouteLoading.js`
- Test: `tests/unit/composables/useRouteLoading.test.js`（既存，新增 2 個 it 區塊）

---

- [ ] **Step 1: 新增失敗測試 — overlay 顯示後至少停留 MIN_SHOW_MS**

在 `tests/unit/composables/useRouteLoading.test.js` 的 `describe` 區塊末尾（最後一個 `it` 之後、`describe` 結束 `})` 之前）插入：

```javascript
  it('overlay 顯示後若 finish 太快，延遲關閉直到最短顯示時間', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示後才 100ms 就 finish
    vi.advanceTimersByTime(100)
    finishRouteLoading()
    // 不應立刻關（總共才顯示 100ms，要滿 400ms）
    expect(routeLoading.value).toBe(true)

    // 再過 300ms，總顯示 400ms，應該關了
    vi.advanceTimersByTime(300)
    expect(routeLoading.value).toBe(false)
  })

  it('overlay 顯示超過最短時間後 finish，立刻關閉', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示超過 400ms
    vi.advanceTimersByTime(500)
    finishRouteLoading()

    expect(routeLoading.value).toBe(false)
  })

  it('resetRouteLoading 立刻關閉，不受最短顯示時間限制', () => {
    const { routeLoading } = useRouteLoading()

    startRouteLoading()
    vi.advanceTimersByTime(120)
    expect(routeLoading.value).toBe(true)

    // 顯示才 50ms 就 reset（例如登出）
    vi.advanceTimersByTime(50)
    resetRouteLoading()

    expect(routeLoading.value).toBe(false)
  })
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/composables/useRouteLoading.test.js`

Expected：3 個新測試 FAIL（`overlay 顯示後若 finish 太快...` 會失敗，因為現在的 `finishRouteLoading` 立刻關）。前 3 個原測試應 PASS。

- [ ] **Step 3: 實作最短顯示時間**

完整取代 `src/composables/useRouteLoading.js` 的內容為：

```javascript
import { ref } from 'vue'

const routeLoading = ref(false)
const LOADING_DELAY_MS = 120
const MIN_SHOW_MS = 400

let pendingNavigations = 0
let loadingTimer = null
let shownAt = 0
let closeTimer = null

function clearLoadingTimer() {
  if (!loadingTimer) return
  window.clearTimeout(loadingTimer)
  loadingTimer = null
}

function clearCloseTimer() {
  if (!closeTimer) return
  window.clearTimeout(closeTimer)
  closeTimer = null
}

export function startRouteLoading() {
  pendingNavigations += 1

  if (routeLoading.value || loadingTimer) return

  clearCloseTimer()
  loadingTimer = window.setTimeout(() => {
    loadingTimer = null
    if (pendingNavigations > 0) {
      routeLoading.value = true
      shownAt = Date.now()
    }
  }, LOADING_DELAY_MS)
}

export function finishRouteLoading() {
  pendingNavigations = Math.max(0, pendingNavigations - 1)

  if (pendingNavigations > 0) return

  // overlay 還沒顯示（仍在 debounce 中）→ 取消 delay timer，直接結束
  if (!routeLoading.value) {
    clearLoadingTimer()
    return
  }

  // overlay 已顯示 → 檢查是否達最短顯示時間
  const elapsed = Date.now() - shownAt
  if (elapsed >= MIN_SHOW_MS) {
    routeLoading.value = false
    return
  }

  // 未達最短顯示時間 → 延遲關閉
  clearCloseTimer()
  closeTimer = window.setTimeout(() => {
    closeTimer = null
    if (pendingNavigations === 0) {
      routeLoading.value = false
    }
  }, MIN_SHOW_MS - elapsed)
}

export function resetRouteLoading() {
  pendingNavigations = 0
  clearLoadingTimer()
  clearCloseTimer()
  routeLoading.value = false
  shownAt = 0
}

export function useRouteLoading() {
  return {
    routeLoading,
  }
}
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/composables/useRouteLoading.test.js`

Expected：全部 6 個測試 PASS（原 3 + 新 3）。

- [ ] **Step 5: 跑全量測試確保無回歸**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`

Expected：全綠。若有其他測試 fail，優先檢查是不是有 test 直接斷言 `useRouteLoading` 內部狀態。

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/composables/useRouteLoading.js tests/unit/composables/useRouteLoading.test.js
git commit -m "$(cat <<'EOF'
chore(loading): useRouteLoading 加最短顯示時間避免瞬閃

overlay 顯示後至少停留 400ms，防止 API 快速 resolve 導致閃一下就消失。
resetRouteLoading（登出）不受限制，仍立即關閉。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: _createKeyedFetchStore 支援 isLoading(key)

修掉多 key 併發時全域 `loading` 互蓋的問題。

**Files:**
- Modify: `src/stores/_createKeyedFetchStore.js`
- Test: `tests/unit/stores/keyedFetchStore.test.js`（新）

---

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/stores/keyedFetchStore.test.js`：

```javascript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { createKeyedFetchStore } from '@/stores/_createKeyedFetchStore'

describe('createKeyedFetchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('isLoading(key) 可區分不同 key 的載入狀態', async () => {
    let resolveA, resolveB
    const apiFn = vi.fn((params) => {
      if (params.id === 'A') return new Promise((r) => { resolveA = r })
      if (params.id === 'B') return new Promise((r) => { resolveB = r })
    })
    const useStore = createKeyedFetchStore('test-keyed', apiFn)
    const store = useStore()

    const pA = store.fetchByKey({ id: 'A' })
    const pB = store.fetchByKey({ id: 'B' })

    expect(store.isLoading({ id: 'A' })).toBe(true)
    expect(store.isLoading({ id: 'B' })).toBe(true)

    // A 先 resolve
    resolveA({ data: [] })
    await pA
    expect(store.isLoading({ id: 'A' })).toBe(false)
    expect(store.isLoading({ id: 'B' })).toBe(true)  // B 還沒好

    resolveB({ data: [] })
    await pB
    expect(store.isLoading({ id: 'B' })).toBe(false)
  })

  it('store.loading 在任一 key 載入中時為 true，全部完成才為 false', async () => {
    let resolveA, resolveB
    const apiFn = vi.fn((params) => {
      if (params.id === 'A') return new Promise((r) => { resolveA = r })
      if (params.id === 'B') return new Promise((r) => { resolveB = r })
    })
    const useStore = createKeyedFetchStore('test-keyed-any', apiFn)
    const store = useStore()

    const pA = store.fetchByKey({ id: 'A' })
    const pB = store.fetchByKey({ id: 'B' })

    expect(store.loading).toBe(true)

    resolveA({ data: [] })
    await pA
    expect(store.loading).toBe(true)  // B 還在

    resolveB({ data: [] })
    await pB
    expect(store.loading).toBe(false)
  })

  it('失敗 path 也會從 loadingKeys 移除', async () => {
    const apiFn = vi.fn(() => Promise.reject(new Error('boom')))
    const useStore = createKeyedFetchStore('test-keyed-err', apiFn)
    const store = useStore()

    await expect(store.fetchByKey({ id: 'X' })).rejects.toThrow('boom')
    expect(store.isLoading({ id: 'X' })).toBe(false)
    expect(store.loading).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/stores/keyedFetchStore.test.js`

Expected：`isLoading is not a function` 或類似錯誤，所有新測試 FAIL。

- [ ] **Step 3: 修改 _createKeyedFetchStore.js**

打開 `src/stores/_createKeyedFetchStore.js`，做下列替換（不改動未提及的部分）。

**1. state() 中加 `loadingKeys: new Set()`，並把原本的 `loading: false` 移除**：

原：
```javascript
    state: () => ({
      entries: new Map(),
      loading: false,
      error: null,
    }),
```

改為：
```javascript
    state: () => ({
      entries: new Map(),
      loadingKeys: new Set(),
      error: null,
    }),
```

**2. getters 新增 `loading`**：

原：
```javascript
    getters: {
      allItems(state) {
```

改為：
```javascript
    getters: {
      loading(state) {
        return state.loadingKeys.size > 0
      },
      allItems(state) {
```

**3. actions 新增 `isLoading(params)`**，放在 `getEntry` 之後、`items` 之前：

原：
```javascript
      getEntry(params) {
        return this.entries.get(this._keyOf(params)) || null
      },

      items(params) {
```

改為：
```javascript
      getEntry(params) {
        return this.entries.get(this._keyOf(params)) || null
      },

      isLoading(params) {
        return this.loadingKeys.has(this._keyOf(params))
      },

      items(params) {
```

**4. 修改 `fetchByKey`，用 `loadingKeys.add/delete` 取代 `this.loading = true/false`**：

原（`fetchByKey` 內）：
```javascript
        const entry = existing || { data: [], meta: {}, fetchedAt: 0, pending: null }
        this.loading = true
        this.error = null

        entry.pending = apiFn(params)
          .then((res) => {
            const { items, meta } = extract(res)
            entry.data = items || []
            entry.meta = meta || {}
            entry.fetchedAt = Date.now()
            this.entries.set(key, entry)
            return { items: entry.data, meta: entry.meta }
          })
          .catch((err) => {
            this.error = err?.response?.data?.detail || errorMsg
            throw err
          })
          .finally(() => {
            entry.pending = null
            this.loading = false
          })
```

改為：
```javascript
        const entry = existing || { data: [], meta: {}, fetchedAt: 0, pending: null }
        this.loadingKeys.add(key)
        this.error = null

        entry.pending = apiFn(params)
          .then((res) => {
            const { items, meta } = extract(res)
            entry.data = items || []
            entry.meta = meta || {}
            entry.fetchedAt = Date.now()
            this.entries.set(key, entry)
            return { items: entry.data, meta: entry.meta }
          })
          .catch((err) => {
            this.error = err?.response?.data?.detail || errorMsg
            throw err
          })
          .finally(() => {
            entry.pending = null
            this.loadingKeys.delete(key)
          })
```

- [ ] **Step 4: 跑新測試確認 PASS**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/stores/keyedFetchStore.test.js`

Expected：3 個測試全 PASS。

- [ ] **Step 5: 跑全量測試確保無回歸**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`

Expected：全綠。若有測試依賴 `state.loading` 為 writable，會 fail（但目前專案中 `state.loading` 只在 keyed store 內部寫入，外部只讀，不會出事）。

- [ ] **Step 6: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/stores/_createKeyedFetchStore.js tests/unit/stores/keyedFetchStore.test.js
git commit -m "$(cat <<'EOF'
fix(store): keyed fetch store 支援 isLoading(key) 精準查詢

原本 state.loading 全域單一 boolean，多 key 併發會互相覆蓋。
改以 loadingKeys Set 追蹤，新增 isLoading(key) 方法；
store.loading 改為 getter，任一 key 載入中即 true，保持向後相容。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 新增 useAsyncState composable

統一 composable 載入命名與生命週期（pending / error / data / execute / reset）。

**Files:**
- Create: `src/composables/useAsyncState.js`
- Test: `tests/unit/composables/useAsyncState.test.js`（新）

---

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/composables/useAsyncState.test.js`：

```javascript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAsyncState } from '@/composables/useAsyncState'

describe('useAsyncState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('immediate: true 建立時自動 execute', async () => {
    const fetcher = vi.fn(() => Promise.resolve('hello'))
    const { data, pending } = useAsyncState(fetcher, { immediate: true, minShowMs: 0 })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(pending.value).toBe(true)

    await vi.runAllTimersAsync()
    expect(data.value).toBe('hello')
    expect(pending.value).toBe(false)
  })

  it('minShowMs 保證 pending 最短顯示時間', async () => {
    const fetcher = vi.fn(() => Promise.resolve('quick'))
    const { pending, execute } = useAsyncState(fetcher, { minShowMs: 300 })

    const p = execute()
    expect(pending.value).toBe(true)

    // fetcher 立刻 resolve，但 minShowMs 未到
    await vi.advanceTimersByTimeAsync(100)
    expect(pending.value).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    await p
    expect(pending.value).toBe(false)
  })

  it('dedupe: true 時併發 execute 只發一次 API', async () => {
    const fetcher = vi.fn(() => new Promise((r) => setTimeout(() => r('ok'), 50)))
    const { execute } = useAsyncState(fetcher, { dedupe: true, minShowMs: 0 })

    const p1 = execute()
    const p2 = execute()
    expect(fetcher).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60)
    await Promise.all([p1, p2])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('錯誤寫入 error ref，不向外拋出', async () => {
    const fetcher = vi.fn(() => Promise.reject(new Error('boom')))
    const { error, data, pending, execute } = useAsyncState(fetcher, { minShowMs: 0 })

    await execute()
    expect(error.value).toBeInstanceOf(Error)
    expect(error.value.message).toBe('boom')
    expect(data.value).toBe(null)
    expect(pending.value).toBe(false)
  })

  it('reset 清空 data/error/pending', async () => {
    const fetcher = vi.fn(() => Promise.resolve('x'))
    const { data, error, pending, execute, reset } = useAsyncState(fetcher, { minShowMs: 0 })

    await execute()
    expect(data.value).toBe('x')

    reset()
    expect(data.value).toBe(null)
    expect(error.value).toBe(null)
    expect(pending.value).toBe(false)
  })

  it('reset 會 abort 尚未完成的請求', async () => {
    let receivedSignal
    const fetcher = vi.fn((signal) => {
      receivedSignal = signal
      return new Promise(() => {})  // 永不 resolve
    })
    const { reset, execute } = useAsyncState(fetcher, { minShowMs: 0 })

    execute()
    expect(receivedSignal.aborted).toBe(false)
    reset()
    expect(receivedSignal.aborted).toBe(true)
  })

  it('initialData 設定 data 初始值', () => {
    const fetcher = vi.fn()
    const { data } = useAsyncState(fetcher, { initialData: [] })
    expect(data.value).toEqual([])
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/composables/useAsyncState.test.js`

Expected：`Cannot find module '@/composables/useAsyncState'`。

- [ ] **Step 3: 實作 useAsyncState**

建立 `src/composables/useAsyncState.js`：

```javascript
import { ref, shallowRef } from 'vue'

/**
 * 統一的非同步資料載入 composable。
 *
 * @param {(signal: AbortSignal) => Promise<any>} fetcher
 * @param {Object} [options]
 * @param {boolean} [options.immediate=false]  建立時立即 execute
 * @param {number}  [options.minShowMs=300]    pending 保證最短顯示時間
 * @param {boolean} [options.dedupe=true]      併發 execute 是否共用 inflight Promise
 * @param {any}     [options.initialData=null] data 初始值
 */
export function useAsyncState(fetcher, options = {}) {
  const {
    immediate = false,
    minShowMs = 300,
    dedupe = true,
    initialData = null,
  } = options

  const data = shallowRef(initialData)
  const error = ref(null)
  const pending = ref(false)

  let inflight = null
  let currentController = null

  function reset() {
    data.value = initialData
    error.value = null
    pending.value = false
    if (currentController) {
      currentController.abort()
      currentController = null
    }
    inflight = null
  }

  function execute() {
    if (dedupe && inflight) return inflight

    pending.value = true
    error.value = null

    const controller = new AbortController()
    currentController = controller
    const startedAt = Date.now()

    const p = Promise.resolve()
      .then(() => fetcher(controller.signal))
      .then((result) => {
        if (controller.signal.aborted) return data.value
        data.value = result
        return result
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        error.value = err
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt
        const remaining = Math.max(0, minShowMs - elapsed)
        if (remaining > 0) {
          return new Promise((r) => setTimeout(r, remaining)).then(() => {
            if (!controller.signal.aborted) pending.value = false
            if (inflight === p) inflight = null
          })
        }
        if (!controller.signal.aborted) pending.value = false
        if (inflight === p) inflight = null
      })

    inflight = p
    return p
  }

  if (immediate) execute()

  return { data, error, pending, execute, reset }
}
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/composables/useAsyncState.test.js`

Expected：7 個測試全 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/composables/useAsyncState.js tests/unit/composables/useAsyncState.test.js
git commit -m "$(cat <<'EOF'
feat(loading): 新增 useAsyncState composable 統一非同步狀態

提供 data/pending/error/execute/reset 統一介面，內建：
- minShowMs 最短顯示時間（避免瞬閃）
- dedupe 併發去重
- AbortController 支援，reset 可取消進行中請求

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 新增 `<LoadingPanel>` 元件

共用元件，封裝「loading / empty / content」三態與 skeleton/spinner 切換。

**Files:**
- Create: `src/components/common/LoadingPanel.vue`
- Test: `tests/unit/components/LoadingPanel.test.js`（新）

---

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/components/LoadingPanel.test.js`：

```javascript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LoadingPanel from '@/components/common/LoadingPanel.vue'

describe('LoadingPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loading=false 且 empty=false 時顯示預設 slot', () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: false, empty: false },
      slots: { default: '<div class="content">data</div>' },
    })
    expect(wrapper.find('.content').exists()).toBe(true)
  })

  it('empty=true 時顯示 empty slot', () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: false, empty: true },
      slots: {
        default: '<div class="content">data</div>',
        empty: '<div class="empty-msg">no data</div>',
      },
    })
    expect(wrapper.find('.content').exists()).toBe(false)
    expect(wrapper.find('.empty-msg').exists()).toBe(true)
  })

  it('loading=true 超過 delay 後顯示 spinner', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, delay: 100, minShowMs: 0 },
      slots: { default: '<div class="content">data</div>' },
    })
    // delay 未到，不顯示 spinner，也不顯示 content
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(false)

    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)
  })

  it('variant=skeleton 時顯示 skeleton slot', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, variant: 'skeleton', delay: 0, minShowMs: 0 },
      slots: {
        default: '<div class="content">x</div>',
        skeleton: '<div class="skel">bones</div>',
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('.skel').exists()).toBe(true)
    expect(wrapper.find('.content').exists()).toBe(false)
  })

  it('loading 轉 false 若未達 minShowMs 會延遲才切換', async () => {
    const wrapper = mount(LoadingPanel, {
      props: { loading: true, delay: 0, minShowMs: 300 },
      slots: { default: '<div class="content">data</div>' },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)

    await wrapper.setProps({ loading: false })
    // 100ms 後還不能關
    await vi.advanceTimersByTimeAsync(100)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.find('.loading-panel-spinner').exists()).toBe(false)
    expect(wrapper.find('.content').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/components/LoadingPanel.test.js`

Expected：`Cannot find module '@/components/common/LoadingPanel.vue'`。

- [ ] **Step 3: 實作 LoadingPanel.vue**

建立 `src/components/common/LoadingPanel.vue`：

```vue
<template>
  <div class="loading-panel">
    <template v-if="displayLoading">
      <slot v-if="variant === 'skeleton'" name="skeleton">
        <div class="loading-panel-spinner" role="status" aria-live="polite">
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
        </div>
      </slot>
      <slot v-else name="spinner">
        <div class="loading-panel-spinner" role="status" aria-live="polite">
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
          <span class="loading-panel-dot" />
        </div>
      </slot>
    </template>
    <template v-else-if="empty">
      <slot name="empty" />
    </template>
    <template v-else>
      <slot />
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  empty: { type: Boolean, default: false },
  variant: {
    type: String,
    default: 'spinner',
    validator: (v) => v === 'spinner' || v === 'skeleton',
  },
  delay: { type: Number, default: 120 },
  minShowMs: { type: Number, default: 300 },
})

const displayLoading = ref(false)
let showTimer = null
let hideTimer = null
let shownAt = 0

function clearShowTimer() {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

watch(
  () => props.loading,
  (loading) => {
    if (loading) {
      clearHideTimer()
      if (displayLoading.value || showTimer) return
      const doShow = () => {
        showTimer = null
        displayLoading.value = true
        shownAt = Date.now()
      }
      if (props.delay <= 0) doShow()
      else showTimer = setTimeout(doShow, props.delay)
    } else {
      clearShowTimer()
      if (!displayLoading.value) return
      const elapsed = Date.now() - shownAt
      const remaining = Math.max(0, props.minShowMs - elapsed)
      if (remaining <= 0) {
        displayLoading.value = false
      } else {
        hideTimer = setTimeout(() => {
          hideTimer = null
          displayLoading.value = false
        }, remaining)
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  clearShowTimer()
  clearHideTimer()
})
</script>

<style scoped>
.loading-panel {
  position: relative;
  min-height: 120px;
}
.loading-panel-spinner {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}
.loading-panel-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f4b43f;
  animation: loading-panel-bounce 1s infinite ease-in-out both;
}
.loading-panel-dot:nth-child(1) { animation-delay: -0.3s; }
.loading-panel-dot:nth-child(2) { animation-delay: -0.15s; }
@keyframes loading-panel-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/components/LoadingPanel.test.js`

Expected：5 個測試全 PASS。若 `variant=skeleton` 測試 fail，檢查 slot fallback 是否正確。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/common/LoadingPanel.vue tests/unit/components/LoadingPanel.test.js
git commit -m "$(cat <<'EOF'
feat(loading): 新增 LoadingPanel 共用元件（loading / empty / content 三態）

封裝 delay 與 minShowMs 邏輯，支援 spinner / skeleton 兩種 variant。
預設 variant=spinner（動作用），skeleton 給列表頁。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Axios 同 key 去重

對 `POST/PUT/PATCH/DELETE` 做同 method+url+body 去重，防止按鈕連點送出多筆。

**Files:**
- Create: `src/utils/apiDedupe.js`
- Modify: `src/api/index.js`
- Test: `tests/unit/api/dedupe.test.js`（新）

---

- [ ] **Step 1: 寫失敗測試**

建立 `tests/unit/api/dedupe.test.js`：

```javascript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { applyDedupe } from '@/utils/apiDedupe'

function makeInstance() {
  const instance = axios.create()
  // 用 adapter mock，每次呼叫增加 counter，並延遲 resolve
  instance._calls = 0
  instance.defaults.adapter = (config) => {
    instance._calls += 1
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          data: { ok: true, callIndex: instance._calls },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        })
      }, 20)
    })
  }
  applyDedupe(instance)
  return instance
}

describe('apiDedupe', () => {
  it('相同 method+url+body 的 POST 併發只打一次 adapter', async () => {
    const api = makeInstance()
    const [r1, r2] = await Promise.all([
      api.post('/foo', { x: 1 }),
      api.post('/foo', { x: 1 }),
    ])
    expect(api._calls).toBe(1)
    expect(r1.data.callIndex).toBe(1)
    expect(r2.data.callIndex).toBe(1)
  })

  it('body 不同的併發 POST 不去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { x: 1 }),
      api.post('/foo', { x: 2 }),
    ])
    expect(api._calls).toBe(2)
  })

  it('GET 不去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.get('/foo', { params: { x: 1 } }),
      api.get('/foo', { params: { x: 1 } }),
    ])
    expect(api._calls).toBe(2)
  })

  it('meta.allowConcurrent 繞過去重', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { x: 1 }, { meta: { allowConcurrent: true } }),
      api.post('/foo', { x: 1 }, { meta: { allowConcurrent: true } }),
    ])
    expect(api._calls).toBe(2)
  })

  it('第一次完成後，第二次相同請求會重新發出', async () => {
    const api = makeInstance()
    await api.post('/foo', { x: 1 })
    await api.post('/foo', { x: 1 })
    expect(api._calls).toBe(2)
  })

  it('object key 順序不影響 dedupe', async () => {
    const api = makeInstance()
    await Promise.all([
      api.post('/foo', { a: 1, b: 2 }),
      api.post('/foo', { b: 2, a: 1 }),
    ])
    expect(api._calls).toBe(1)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/api/dedupe.test.js`

Expected：`Cannot find module '@/utils/apiDedupe'`。

- [ ] **Step 3: 實作 apiDedupe**

建立 `src/utils/apiDedupe.js`：

```javascript
function stableStringify(obj) {
  if (obj === null || obj === undefined) return ''
  if (typeof obj !== 'object') return String(obj)
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']'
  }
  const keys = Object.keys(obj).sort()
  return '{' + keys
    .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
    .join(',') + '}'
}

function shouldDedupe(config) {
  if (config?.meta?.allowConcurrent) return false
  const m = (config?.method || 'get').toLowerCase()
  return m === 'post' || m === 'put' || m === 'patch' || m === 'delete'
}

function buildKey(config) {
  const method = (config.method || 'get').toUpperCase()
  const url = config.url || ''
  const body = config.data == null ? '' : stableStringify(config.data)
  return `${method} ${url} ${body}`
}

/**
 * 在 axios instance 上套用「同 key mutating 請求去重」。
 * 包裝 instance.request，不動其他 interceptor 設定。
 */
export function applyDedupe(instance) {
  const inflight = new Map()
  const originalRequest = instance.request.bind(instance)

  instance.request = function (configOrUrl, maybeConfig) {
    // axios.request 支援兩種呼叫形式，先正規化
    const config =
      typeof configOrUrl === 'string'
        ? { ...(maybeConfig || {}), url: configOrUrl }
        : configOrUrl

    if (!shouldDedupe(config)) return originalRequest(config)

    const key = buildKey(config)
    const existing = inflight.get(key)
    if (existing) return existing

    const p = originalRequest(config).finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, p)
    return p
  }

  return instance
}

export { stableStringify }
```

- [ ] **Step 4: 跑測試確認 PASS**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run tests/unit/api/dedupe.test.js`

Expected：6 個測試全 PASS。

- [ ] **Step 5: 套用到 api instance**

修改 `src/api/index.js`，在 `const api = axios.create(...)` 之後、`api.interceptors.response.use(...)` 之前加入 dedupe。

原（`src/api/index.js` 頂部）：
```javascript
import axios from 'axios'
import { setUserInfo, clearAuth } from '@/utils/auth'
import { classifyError } from '@/utils/errorHandler'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 10000,
    withCredentials: true, // 自動攜帶 httpOnly Cookie
    headers: {
        'Content-Type': 'application/json'
    }
})

// 不再需要 request interceptor 注入 Authorization header
```

改為：
```javascript
import axios from 'axios'
import { setUserInfo, clearAuth } from '@/utils/auth'
import { classifyError } from '@/utils/errorHandler'
import { applyDedupe } from '@/utils/apiDedupe'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
    timeout: 10000,
    withCredentials: true, // 自動攜帶 httpOnly Cookie
    headers: {
        'Content-Type': 'application/json'
    }
})

// 對 mutating 請求做同 key 去重，防止按鈕連點送出多筆
applyDedupe(api)

// 不再需要 request interceptor 注入 Authorization header
```

- [ ] **Step 6: 跑全量測試確保無回歸**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`

Expected：全綠。特別注意：若任何現有測試 mock `api.post` 且預期多次呼叫，可能會因為去重改為一次。目前 grep 無此類斷言，但若出現需加 `meta: { allowConcurrent: true }` 讓測試呼叫繞過。

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/utils/apiDedupe.js src/api/index.js tests/unit/api/dedupe.test.js
git commit -m "$(cat <<'EOF'
feat(api): axios 對 mutating 請求做同 key 去重

method+url+stableStringify(body) 作為 key，併發相同請求共用同一 Promise。
僅對 POST/PUT/PATCH/DELETE 生效，GET 不影響。
特殊情境可透過 config.meta.allowConcurrent=true 繞過。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 示範遷移 — LeaveView + OvertimeView

只遷移 2 個已使用 `TableSkeleton` 的頁面，做為 `<LoadingPanel>` 的參考實作。其他 8 頁由後續 PR 處理（非本 plan 範圍）。

**Files:**
- Modify: `src/views/LeaveView.vue`
- Modify: `src/views/OvertimeView.vue`

---

- [ ] **Step 1: 先看兩個檔案現況**

Run:
```
Read src/views/LeaveView.vue 367 20
Read src/views/OvertimeView.vue 334 20
```

確認當前 template 結構（應該是類似 `<TableSkeleton v-if="loading && !records.length" /> <el-table v-else v-loading="loading" :data="records" />` 的模式）。

- [ ] **Step 2: 遷移 LeaveView.vue**

定位到 `<TableSkeleton ... />` 與其後的 `<el-table ...>` 段落。將兩者包進 `<LoadingPanel>`：

替換模式：
```vue
<!-- Before -->
<TableSkeleton v-if="loading && !records.length" :rows="5" />
<el-table v-else v-loading="loading" :data="records" ...>
  ...
</el-table>

<!-- After -->
<LoadingPanel :loading="loading" :empty="!loading && !records.length" variant="skeleton">
  <template #skeleton><TableSkeleton :rows="5" /></template>
  <template #empty><el-empty description="尚無請假紀錄" /></template>
  <el-table :data="records" ...>
    ...
  </el-table>
</LoadingPanel>
```

同時在 `<script setup>` 頂部加 import：
```javascript
import LoadingPanel from '@/components/common/LoadingPanel.vue'
```

（若檔案用 Options API，import 寫在 `import` 區並在 `components: { LoadingPanel }` 註冊。）

- [ ] **Step 3: 手動驗證 LeaveView**

Run（另開 terminal）:
```
cd ~/Desktop/ivyManageSystem && ./start.sh
```

瀏覽器開 `http://localhost:5173`，登入後點請假頁：
- 首次載入：應看到 skeleton（不是瞬閃的 spinner）
- 無資料情境：改日期範圍到無資料月份，應看到 `el-empty`
- 重新整理：skeleton → 資料，沒有閃爍

若驗證通過進下一步；有問題回到 Step 2 調整。

- [ ] **Step 4: 遷移 OvertimeView.vue**

同 Step 2 模式，替換 `<TableSkeleton>` + `<el-table>` 成 `<LoadingPanel>` 包裝。空狀態文字改為「尚無加班紀錄」。

- [ ] **Step 5: 手動驗證 OvertimeView**

同 Step 3 流程，對加班頁做一次。

- [ ] **Step 6: 跑全量測試確保無回歸**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`

Expected：全綠。

- [ ] **Step 7: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/LeaveView.vue src/views/OvertimeView.vue
git commit -m "$(cat <<'EOF'
refactor(views): LeaveView + OvertimeView 遷移至 LoadingPanel

以 TableSkeleton + 空狀態 + content 三態取代 v-loading 閃爍。
做為 <LoadingPanel> 共用元件的參考實作，其他頁面由後續 PR 處理。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 收尾

- [ ] **全量測試**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`

Expected：全綠。

- [ ] **git log 確認 commit 數量**

Run: `cd ~/Desktop/ivy-frontend && git log --oneline | head -10`

Expected：6 筆新 commit（Task 1–6 各一筆），訊息分別為 `chore(loading)` / `fix(store)` / `feat(loading)` x2 / `feat(api)` / `refactor(views)`。

---

## Self-Review 結論

1. **Spec 覆蓋**：spec §3.1–§3.5 → Task 1–5，spec §4 遷移清單 → Task 6 挑 2 頁示範（其餘 8 頁不在本 plan，等後續自然迭代）。§6 測試策略每個 Task 內皆有對應測試。§8 風險每 Task commit 獨立可 revert，達成。
2. **Placeholder scan**：無 TBD/TODO，所有步驟含具體程式碼與指令。
3. **Type consistency**：`useAsyncState` 回傳 `{ data, error, pending, execute, reset }` 一致；`<LoadingPanel>` props `loading/empty/variant/delay/minShowMs` 一致；`applyDedupe(instance)` 簽名前後統一。
4. **未覆蓋但刻意排除**：全 10 頁遷移（spec §4 明言不強制）、視覺 token 系統、NProgress、樂觀 UI（皆 spec §7 YAGNI）。
