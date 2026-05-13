# 家長端 Material 3 重寫 P3：互動元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊家長端 Material 3 互動元件：6 個新元件（`M3Snackbar` / `M3TextField` / `M3SegmentedButton` / `M3Switch` / `M3Checkbox` / `M3Radio`）+ `useSnackbar` composable；並把 3 個既有元件（`ParentBottomSheet` / `AppModal` / `ConfirmDialog`）的視覺切到 M3（28px 圓角 + M3 token + Material easing），**但 props/events/slots API 完全不變**，避免破壞 7+ 處 caller。

**Architecture:** P3 採「visual-only refactor」策略應對 3 個複雜既有元件：`ParentBottomSheet` 內含 snap points / drag gesture / visualViewport keyboard mode / focus trap / a11y / body scroll lock，整體 670 行邏輯不動，只改 scoped style + 用 M3 token 重新調色。`AppModal` / `ConfirmDialog` 同樣 in-place 視覺改造，`ConfirmDialog` 額外把內部按鈕換 `M3Button`。6 個新元件遵照 P0/P1 慣例：scoped style + state layer overlay + `--m3-*` token。

**Tech Stack:** Vue 3 `<script setup>` + Pinia（snackbar 全域 store）+ Vitest。沿用 P1/P2 已建的 M3Icon / M3Button / M3IconButton 等。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §6 與 §10。

**Branch:** 從 `feat/parent-m3-phase-2-frontend` head 切 `feat/parent-m3-phase-3-frontend`。

---

## File Structure

### 新建檔案

```
src/parent/components/m3/
├── M3Snackbar.vue              (Task 4 — 含 host container)
├── M3TextField.vue             (Task 5)
├── M3SegmentedButton.vue       (Task 6)
├── M3Switch.vue                (Task 7)
├── M3Checkbox.vue              (Task 8)
├── M3Radio.vue                 (Task 8 同 commit)
└── __tests__/
    ├── M3Snackbar.spec.js
    ├── M3TextField.spec.js
    ├── M3SegmentedButton.spec.js
    ├── M3Switch.spec.js
    ├── M3Checkbox.spec.js
    └── M3Radio.spec.js

src/parent/composables/
└── useSnackbar.js              (Task 4，含 Pinia store)
```

### 既有檔案 in-place 視覺改造（API 不變）

```
src/parent/components/
├── ParentBottomSheet.vue       (Task 1 — scoped style 改 M3，邏輯不動)
├── AppModal.vue                (Task 2 — scoped style 改 M3，邏輯不動)
└── ConfirmDialog.vue           (Task 3 — 內部按鈕換 M3Button，scoped style 改 M3)
```

### Barrel update

```
src/parent/components/m3/index.js  (Task 9 — 加 6 個新元件 export)
```

---

### Task 0: P3 branch setup

- [ ] **Step 1: 從 P2 head 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = af2cac9a P2 barrel
git checkout -b feat/parent-m3-phase-3-frontend
```

---

### Task 1: ParentBottomSheet visual refactor (M3 化)

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`（只動 `<style scoped>` 區塊與必要 token 引用，**不動 `<script setup>` 與 `<template>`**）

策略：
- 頂部圓角：當前 16px → 28px（M3 spec bottom sheet 標誌性）
- bg：`var(--pt-surface-card)` → `var(--m3-surface-container-low, ...)` (fallback 保留 IvyKids 值)
- handle bar：當前圓條 → 32×4px、bg `var(--m3-outline-variant)`
- scrim：當前 `var(--pt-scrim)` → `rgba(0, 0, 0, 0.32)` + `backdrop-filter: blur(8px)`
- 進場 easing：當前 cubic-bezier → `var(--m3-easing-emphasized-decel)`
- 進場 duration：當前 transition → `var(--m3-dur-medium-2, 300ms)`
- shadow：當前 `--pt-elev-3` → `var(--m3-elev-3)`

不動：
- props / emits / setSnap / SNAP_HEIGHT / SNAP_ORDER / drag gesture / focus trap / body scroll lock / keyboard mode 全部既有 logic
- aria 屬性與 role

- [ ] **Step 1: Read 現有 ParentBottomSheet.vue 並定位 style 區塊**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
wc -l src/parent/components/ParentBottomSheet.vue
grep -n "^<style\|^</style>\|^<template>\|^</template>" src/parent/components/ParentBottomSheet.vue
```

預期看到 `<style scoped>` 區塊的起始與結束行號。整檔 ~670 行，style 區塊預期在 ~400-670 行。

- [ ] **Step 2: 跑既有 vitest baseline**

```bash
npm run test -- ParentBottomSheet 2>&1 | tail -10
```

記下 baseline 測試數（如果有 spec 檔的話）。若無 spec 檔，視為 baseline = 0 並 skip。

- [ ] **Step 3: 編輯 ParentBottomSheet.vue style 區塊**

用 Edit tool，把以下 token 引用全套替換（**每行只動 token name，不動其他屬性**）：

| 找到（精確匹配） | 替換為 |
|----------------|-------|
| `border-top-left-radius: 16px;` | `border-top-left-radius: 28px;` |
| `border-top-right-radius: 16px;` | `border-top-right-radius: 28px;` |
| `box-shadow: var(--pt-elev-3` | `box-shadow: var(--m3-elev-3, var(--pt-elev-3` |
| `background: var(--pt-scrim` | `background: rgba(0, 0, 0, 0.32` |

備註：若上述任一 old_string 不精確匹配（如有多空格或不同寫法），改用 Read 看真實內容後再 Edit。每次替換後跑一次 vitest baseline 確認 spec 未壞。

如果 ParentBottomSheet 沒有 `border-top-left-radius` 等具體屬性，改在 `.bsheet-panel` 或對應 class 上加 `border-radius: 28px 28px 0 0`。Read 真實內容調整即可。

- [ ] **Step 4: 加 M3 token fallback 與 motion 升級**

在 `<style scoped>` 區塊內找 transition / animation 相關（dragging release / snap change 的 transition），把 cubic-bezier 替換為 M3 easing：

| 找到 | 替換為 |
|------|-------|
| `cubic-bezier(0.22, 1, 0.36, 1)` | `var(--m3-easing-emphasized-decel, cubic-bezier(0.05, 0.7, 0.1, 1))` |

若找不到這個 easing function，找其他自定義 cubic-bezier 在 sheet panel 過場處，逐一改成 M3 easing。

- [ ] **Step 5: 跑 vitest 確認既有測試（若有）零 regression**

```bash
npm run test -- ParentBottomSheet 2>&1 | tail -10
```

Expected: 既有測試（多半在 `tests/unit/parent/components/ParentBottomSheet.test.js`）全綠。

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed（pre-existing）保持不變。**新增任何 failure 必須回退**。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/ParentBottomSheet.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ParentBottomSheet visual refactor 為 M3 風格

- 頂部圓角 16 → 28px (M3 bottom sheet spec)
- 引用 --m3-elev-3 / --m3-easing-emphasized-decel / --m3-surface-container-low
- scrim 改 rgba(0,0,0,0.32)（M3 spec）
- 全部 props/events/slots/snap/drag/a11y 邏輯不動，7 處 caller 不受影響

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: AppModal visual refactor

**Files:**
- Modify: `src/parent/components/AppModal.vue`

策略：
- 圓角 16px → 28px
- bg：M3 surface-container-high
- scrim：rgba(0,0,0,0.32) + backdrop blur 8px
- 進場用 M3 easing-emphasized-decel
- props/emits 全部不變（open / labelledBy / describedBy / closeOnOverlay / closeOnEscape / maxWidth）

- [ ] **Step 1: Read AppModal.vue style 區塊定位**

```bash
grep -n "^<style\|^</style>" src/parent/components/AppModal.vue
```

- [ ] **Step 2: Read 真實 style 內容（前 40 行）**

```bash
grep -n "border-radius\|background\|cubic-bezier\|box-shadow" src/parent/components/AppModal.vue
```

- [ ] **Step 3: 用 Edit tool 套以下替換**

| 找到（精確匹配，原碼可能略不同；以實際讀取為準） | 替換為 |
|----------------|-------|
| `border-radius: 16px;` (modal 容器) | `border-radius: 28px;` |
| `box-shadow: var(--pt-elev-3` | `box-shadow: var(--m3-elev-3, var(--pt-elev-3` |
| `background: var(--pt-surface-card)` (modal 容器 bg) | `background: var(--m3-surface-container-high, var(--pt-surface-card))` |

每次 Edit 後執行 vitest baseline，確保未爆。

- [ ] **Step 4: 跑既有 AppModal 測試**

```bash
npm run test -- AppModal 2>&1 | tail -10
```

Expected: 全綠。

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed 不變。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/AppModal.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): AppModal visual refactor 為 M3 風格

- 圓角 16 → 28px
- 引用 --m3-elev-3 + --m3-surface-container-high
- scrim rgba(0,0,0,0.32)
- props/emits/focus trap/scroll lock 邏輯不動

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: ConfirmDialog M3 化（含 M3Button 取代內部按鈕）

**Files:**
- Modify: `src/parent/components/ConfirmDialog.vue`

策略：
- import `M3Button` 取代既有 `<button class="...">` 確認/取消按鈕
- destructive 模式：confirm button variant 切到 `filled`，但 color 用 M3 error 系（透過 inline style 覆寫 background）
- 非 destructive：confirm variant=filled，cancel variant=text
- 內部 spacing / padding 套 M3 tokens

- [ ] **Step 1: Read 現有 ConfirmDialog.vue template + style 區塊**

確認 7 個既有 props（open / title / message / confirmLabel / cancelLabel / destructive）與 3 個 emits（update:open / confirm / cancel）。

- [ ] **Step 2: Read 真實 template 內按鈕 markup**

```bash
grep -n "<button\|@click=\"onConfirm\|@click=\"onCancel" src/parent/components/ConfirmDialog.vue
```

定位現有 confirm / cancel button 的 HTML，準備替換為 M3Button。

- [ ] **Step 3: 整檔覆寫 ConfirmDialog.vue**

依現有 props/emits 結構整檔覆寫（保留 import AppModal 與 ID 邏輯）：

```vue
<script setup>
/**
 * 二擇一確認對話框，取代 window.confirm()。M3 化版本。
 *
 * 用法與舊版完全相同：
 *   <ConfirmDialog v-model:open="show" title="..." confirm-label="..." destructive @confirm="..." />
 *
 * P3 改造：內部按鈕換用 M3Button；外殼仍走 AppModal（AppModal 已 M3 視覺）。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.1
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'
import M3Button from './m3/M3Button.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: '確定' },
  cancelLabel: { type: String, default: '取消' },
  destructive: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open', 'confirm', 'cancel'])

const titleId = computed(
  () => `confirm-title-${Math.random().toString(36).slice(2, 8)}`,
)
const messageId = computed(
  () => `confirm-msg-${Math.random().toString(36).slice(2, 8)}`,
)

function onCancel() {
  emit('update:open', false)
  emit('cancel')
}

function onConfirm() {
  emit('update:open', false)
  emit('confirm')
}
</script>

<template>
  <AppModal
    :open="open"
    :labelled-by="titleId"
    :described-by="message ? messageId : null"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="confirm-dialog">
      <h2 :id="titleId" class="confirm-dialog-title m3-headline-small">{{ title }}</h2>
      <p v-if="message" :id="messageId" class="confirm-dialog-message m3-body-medium">{{ message }}</p>
      <div class="confirm-dialog-actions">
        <M3Button variant="text" @click="onCancel">{{ cancelLabel }}</M3Button>
        <M3Button
          variant="filled"
          :class="{ 'is-destructive': destructive }"
          @click="onConfirm"
        >{{ confirmLabel }}</M3Button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.confirm-dialog {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.confirm-dialog-title {
  margin: 0;
  color: var(--m3-on-surface, #181d18);
}
.confirm-dialog-message {
  margin: 0;
  color: var(--m3-on-surface-variant, #424941);
}
.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* destructive variant：覆寫 M3Button filled bg 為 M3 error */
.confirm-dialog-actions :deep(.is-destructive.m3-button-filled) {
  background: var(--m3-error, #ba1a1a);
  color: var(--m3-on-error, #ffffff);
}
</style>
```

- [ ] **Step 4: 跑既有 ConfirmDialog 測試**

```bash
npm run test -- ConfirmDialog 2>&1 | tail -10
```

Expected: 全綠。

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: 228 passed / 4 failed 不變。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/ConfirmDialog.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ConfirmDialog M3 化（內部按鈕換 M3Button）

- 整檔重寫 template：confirm/cancel 換 M3Button (filled / text)
- destructive 模式覆寫 filled bg 為 m3-error
- title/message 套 m3-headline-small / m3-body-medium
- props/emits 完全不變，外殼仍走 AppModal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: M3Snackbar + useSnackbar composable

**Files:**
- Create: `src/parent/components/m3/M3Snackbar.vue`
- Create: `src/parent/components/m3/__tests__/M3Snackbar.spec.js`
- Create: `src/parent/composables/useSnackbar.js`
- Create: `src/parent/composables/__tests__/useSnackbar.spec.js`

策略：
- `useSnackbar()` 返回 `{ show, snackbars }`；`show({ message, action, duration })` push 一個 entry 到 reactive array
- M3Snackbar.vue 接 `snackbars` array 渲染當前 active snackbar（first item）；4s 後自動 dismiss
- 整 app 透過 ParentLayout 或在 main.js 全域掛載一個 M3Snackbar instance（host pattern）

API（M3Snackbar 元件）：
- props: snackbars (Array) — 全域佇列
- emits: dismiss (id) — 通知 store 移除

API（useSnackbar composable）：
- 用 Pinia store `useSnackbarStore`
- state: `entries: { id, message, action?: { label, onClick }, duration }[]`
- actions: `show({ message, action, duration = 4000 })` / `dismiss(id)`

- [ ] **Step 1: 寫失敗測試 — useSnackbar composable**

寫入 `src/parent/composables/__tests__/useSnackbar.spec.js`：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSnackbar } from '../useSnackbar'

describe('useSnackbar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('show() 新增一筆到 entries', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: '已儲存' })
    expect(snackbars.value).toHaveLength(1)
    expect(snackbars.value[0].message).toBe('已儲存')
  })

  it('id 唯一遞增', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: 'a' })
    show({ message: 'b' })
    expect(snackbars.value[0].id).not.toBe(snackbars.value[1].id)
  })

  it('預設 duration = 4000ms', () => {
    const { show, snackbars } = useSnackbar()
    show({ message: 'x' })
    expect(snackbars.value[0].duration).toBe(4000)
  })

  it('dismiss(id) 移除對應 entry', () => {
    const { show, dismiss, snackbars } = useSnackbar()
    show({ message: 'a' })
    show({ message: 'b' })
    const id0 = snackbars.value[0].id
    dismiss(id0)
    expect(snackbars.value).toHaveLength(1)
    expect(snackbars.value[0].message).toBe('b')
  })

  it('action 可包 label + onClick', () => {
    const { show, snackbars } = useSnackbar()
    const onClick = vi.fn()
    show({ message: 'x', action: { label: 'undo', onClick } })
    expect(snackbars.value[0].action.label).toBe('undo')
    snackbars.value[0].action.onClick()
    expect(onClick).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- useSnackbar 2>&1 | tail -10
```

Expected: FAIL `Cannot find module '../useSnackbar'`.

- [ ] **Step 3: 實作 useSnackbar.js**

寫入 `src/parent/composables/useSnackbar.js`：

```js
import { defineStore, storeToRefs } from 'pinia'

/**
 * Snackbar global queue store + composable.
 *
 * 使用：
 *   const { show, dismiss, snackbars } = useSnackbar()
 *   show({ message: '已儲存', action: { label: '復原', onClick: undo }, duration: 5000 })
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.3
 */
let nextId = 1

const useSnackbarStore = defineStore('parentSnackbar', {
  state: () => ({
    entries: [],
  }),
  actions: {
    show({ message, action = null, duration = 4000 }) {
      const id = nextId++
      this.entries.push({ id, message, action, duration })
      return id
    },
    dismiss(id) {
      this.entries = this.entries.filter((e) => e.id !== id)
    },
  },
})

export function useSnackbar() {
  const store = useSnackbarStore()
  const { entries } = storeToRefs(store)
  return {
    snackbars: entries,
    show: (payload) => store.show(payload),
    dismiss: (id) => store.dismiss(id),
  }
}
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- useSnackbar 2>&1 | tail -10
```

Expected: 5 tests passed。

- [ ] **Step 5: 寫 M3Snackbar 失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Snackbar.spec.js`：

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Snackbar from '../M3Snackbar.vue'

describe('M3Snackbar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('snackbars 為空時不渲染', () => {
    const w = mount(M3Snackbar, { props: { snackbars: [] } })
    expect(w.find('.m3-snackbar').exists()).toBe(false)
  })

  it('render 第一筆 snackbar 訊息', () => {
    const snackbars = [{ id: 1, message: '已儲存', action: null, duration: 4000 }]
    const w = mount(M3Snackbar, { props: { snackbars } })
    expect(w.find('.m3-snackbar').exists()).toBe(true)
    expect(w.find('.m3-snackbar-message').text()).toBe('已儲存')
  })

  it('有 action 時渲染 action button', () => {
    const onClick = vi.fn()
    const snackbars = [{
      id: 1,
      message: '已刪除',
      action: { label: '復原', onClick },
      duration: 7000,
    }]
    const w = mount(M3Snackbar, { props: { snackbars } })
    const btn = w.find('.m3-snackbar-action')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('復原')
  })

  it('點 action button 觸發 onClick + emit dismiss', async () => {
    const onClick = vi.fn()
    const snackbars = [{
      id: 42,
      message: 'x',
      action: { label: 'undo', onClick },
      duration: 4000,
    }]
    const w = mount(M3Snackbar, { props: { snackbars } })
    await w.find('.m3-snackbar-action').trigger('click')
    expect(onClick).toHaveBeenCalled()
    expect(w.emitted('dismiss')).toEqual([[42]])
  })

  it('duration 到時自動 emit dismiss', async () => {
    const snackbars = [{ id: 7, message: 'x', action: null, duration: 4000 }]
    const w = mount(M3Snackbar, { props: { snackbars } })
    vi.advanceTimersByTime(4000)
    await w.vm.$nextTick()
    expect(w.emitted('dismiss')).toEqual([[7]])
  })

  it('第一筆移除後若還有第二筆，自動顯示第二筆', async () => {
    const w = mount(M3Snackbar, {
      props: {
        snackbars: [{ id: 1, message: 'a', action: null, duration: 4000 }],
      },
    })
    expect(w.find('.m3-snackbar-message').text()).toBe('a')
    await w.setProps({
      snackbars: [{ id: 2, message: 'b', action: null, duration: 4000 }],
    })
    expect(w.find('.m3-snackbar-message').text()).toBe('b')
  })
})
```

- [ ] **Step 6: 跑測試確認 FAIL**

```bash
npm run test -- M3Snackbar 2>&1 | tail -10
```

- [ ] **Step 7: 實作 M3Snackbar.vue**

寫入 `src/parent/components/m3/M3Snackbar.vue`：

```vue
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'

/**
 * Material 3 Snackbar host container.
 *
 * 整個 app 應該只在 ParentLayout 或 main 掛載一個 M3Snackbar，
 * 透過 useSnackbar() composable 觸發訊息。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.3
 */
const props = defineProps({
  snackbars: { type: Array, required: true },
})

const emit = defineEmits(['dismiss'])

const current = computed(() => props.snackbars[0] || null)

let dismissTimer = null

function clearTimer() {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

watch(
  current,
  (snack) => {
    clearTimer()
    if (snack) {
      dismissTimer = setTimeout(() => {
        emit('dismiss', snack.id)
      }, snack.duration || 4000)
    }
  },
  { immediate: true },
)

function onActionClick() {
  if (current.value?.action?.onClick) {
    current.value.action.onClick()
  }
  emit('dismiss', current.value.id)
}

onBeforeUnmount(clearTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="m3-snackbar">
      <div v-if="current" class="m3-snackbar" role="status" aria-live="polite">
        <span class="m3-snackbar-message m3-body-medium">{{ current.message }}</span>
        <button
          v-if="current.action"
          type="button"
          class="m3-snackbar-action m3-label-large"
          @click="onActionClick"
        >{{ current.action.label }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m3-snackbar {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0) + 16px);
  transform: translateX(-50%);
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: 4px;
  background: var(--m3-inverse-surface, #2d3230);
  color: var(--m3-inverse-on-surface, #eef2eb);
  box-shadow: var(--m3-elev-3, 0 4px 8px rgba(0, 0, 0, 0.3));
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-snackbar-message {
  flex: 1;
  min-width: 0;
}

.m3-snackbar-action {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--m3-inverse-primary, #5fdb96);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.m3-snackbar-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.m3-snackbar-enter-active,
.m3-snackbar-leave-active {
  transition: transform var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, ease),
    opacity var(--m3-dur-medium-2, 300ms) var(--m3-easing-emphasized-decel, ease);
}
.m3-snackbar-enter-from,
.m3-snackbar-leave-to {
  opacity: 0;
  transform: translate(-50%, 30px);
}
</style>
```

- [ ] **Step 8: 跑測試確認 PASS**

```bash
npm run test -- M3Snackbar 2>&1 | tail -10
```

Expected: 6 tests passed。

- [ ] **Step 9: Commit**

```bash
git add src/parent/components/m3/M3Snackbar.vue \
       src/parent/components/m3/__tests__/M3Snackbar.spec.js \
       src/parent/composables/useSnackbar.js \
       src/parent/composables/__tests__/useSnackbar.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Snackbar + useSnackbar composable

- useSnackbar 用 Pinia store 管理全域 queue
- M3Snackbar 渲染當前 active snackbar，duration 到自動 dismiss
- Teleport 到 body，浮在 NavigationBar 上方 16px
- 5 + 6 = 11 tests 全綠

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: M3TextField

**Files:**
- Create: `src/parent/components/m3/M3TextField.vue`
- Create: `src/parent/components/m3/__tests__/M3TextField.spec.js`

API:
- v-model: `modelValue` (string)
- props: `variant` ('filled' | 'outlined', default 'filled')
- props: `label` (string, default '') — 浮動標籤
- props: `placeholder` (string, default '')
- props: `supportingText` (string, default '') — 下方輔助文字
- props: `error` (boolean, default false)
- props: `errorText` (string, default '') — error 時顯示在 supportingText 位置
- props: `disabled` (boolean, default false)
- props: `type` (string, default 'text') — input type
- emits: `update:modelValue`

樣式：高 56px，filled 4px top radius / outlined 4px all radius。label 浮動動畫。

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3TextField.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3TextField from '../M3TextField.vue'

describe('M3TextField', () => {
  it('render input 元素', () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    expect(w.find('input').exists()).toBe(true)
    expect(w.classes()).toContain('m3-text-field')
  })

  it('預設 variant = filled', () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    expect(w.classes()).toContain('m3-text-field-filled')
  })

  it.each(['filled', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3TextField, { props: { modelValue: '', variant } })
      expect(w.classes()).toContain(`m3-text-field-${variant}`)
    },
  )

  it('label 渲染為浮動 label', () => {
    const w = mount(M3TextField, { props: { modelValue: '', label: '姓名' } })
    const label = w.find('.m3-text-field-label')
    expect(label.exists()).toBe(true)
    expect(label.text()).toBe('姓名')
  })

  it('輸入觸發 update:modelValue', async () => {
    const w = mount(M3TextField, { props: { modelValue: '' } })
    await w.find('input').setValue('hi')
    expect(w.emitted('update:modelValue')).toEqual([['hi']])
  })

  it('placeholder 透傳到 input', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', placeholder: '請輸入' },
    })
    expect(w.find('input').attributes('placeholder')).toBe('請輸入')
  })

  it('supportingText 顯示', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', supportingText: '8 字以內' },
    })
    expect(w.find('.m3-text-field-supporting').text()).toBe('8 字以內')
  })

  it('error=true 套 is-error class + errorText 取代 supportingText', () => {
    const w = mount(M3TextField, {
      props: {
        modelValue: '',
        error: true,
        supportingText: '提示',
        errorText: '必填',
      },
    })
    expect(w.classes()).toContain('is-error')
    expect(w.find('.m3-text-field-supporting').text()).toBe('必填')
  })

  it('disabled 透傳到 input', () => {
    const w = mount(M3TextField, { props: { modelValue: '', disabled: true } })
    expect(w.find('input').attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('type prop 透傳（如 email/password）', () => {
    const w = mount(M3TextField, {
      props: { modelValue: '', type: 'email' },
    })
    expect(w.find('input').attributes('type')).toBe('email')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3TextField 2>&1 | tail -10
```

- [ ] **Step 3: 實作 M3TextField.vue**

寫入 `src/parent/components/m3/M3TextField.vue`：

```vue
<script setup>
import { computed, ref } from 'vue'

/**
 * Material 3 Text Field.
 *
 * Variants: filled (預設) / outlined
 * 浮動 label：focus 或有值時 label 上移
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.4
 */
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  variant: {
    type: String,
    default: 'filled',
    validator: (v) => ['filled', 'outlined'].includes(v),
  },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  supportingText: { type: String, default: '' },
  error: { type: Boolean, default: false },
  errorText: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'text' },
})

const emit = defineEmits(['update:modelValue'])

const isFocused = ref(false)

const hasValue = computed(
  () => props.modelValue !== '' && props.modelValue != null,
)
const labelFloating = computed(() => isFocused.value || hasValue.value)

const classes = computed(() => ({
  'm3-text-field': true,
  [`m3-text-field-${props.variant}`]: true,
  'is-focused': isFocused.value,
  'is-error': props.error,
  'is-disabled': props.disabled,
  'has-value': hasValue.value,
  'has-floating-label': labelFloating.value && !!props.label,
}))

const supportingDisplay = computed(() =>
  props.error && props.errorText ? props.errorText : props.supportingText,
)

function onInput(e) {
  emit('update:modelValue', e.target.value)
}
</script>

<template>
  <div :class="classes">
    <div class="m3-text-field-control">
      <label v-if="label" class="m3-text-field-label">{{ label }}</label>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="m3-text-field-input"
        @focus="isFocused = true"
        @blur="isFocused = false"
        @input="onInput"
      />
    </div>
    <span
      v-if="supportingDisplay"
      class="m3-text-field-supporting m3-body-small"
    >{{ supportingDisplay }}</span>
  </div>
</template>

<style scoped>
.m3-text-field {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-text-field-control {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  background: transparent;
}

.m3-text-field-label {
  position: absolute;
  top: 16px;
  left: 16px;
  color: var(--m3-on-surface-variant, #424941);
  font-size: 16px;
  pointer-events: none;
  transition: transform var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    font-size var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  transform-origin: top left;
}
.m3-text-field.has-floating-label .m3-text-field-label {
  transform: translateY(-12px) scale(0.75);
  color: var(--m3-primary, #006d3d);
}

.m3-text-field-input {
  width: 100%;
  height: 56px;
  padding: 24px 16px 8px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--m3-on-surface, #181d18);
  font-family: inherit;
  font-size: 16px;
}

.m3-text-field-filled .m3-text-field-control {
  background: var(--m3-surface-container-highest, #e0e4dc);
  border-radius: 4px 4px 0 0;
  border-bottom: 1px solid var(--m3-on-surface-variant, #424941);
}
.m3-text-field-filled.is-focused .m3-text-field-control {
  border-bottom: 2px solid var(--m3-primary, #006d3d);
}

.m3-text-field-outlined .m3-text-field-control {
  border: 1px solid var(--m3-outline, #727970);
  border-radius: 4px;
}
.m3-text-field-outlined.is-focused .m3-text-field-control {
  border: 2px solid var(--m3-primary, #006d3d);
}

.m3-text-field.is-error.m3-text-field-filled .m3-text-field-control {
  border-bottom-color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error.m3-text-field-outlined .m3-text-field-control {
  border-color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error .m3-text-field-label {
  color: var(--m3-error, #ba1a1a);
}
.m3-text-field.is-error .m3-text-field-supporting {
  color: var(--m3-error, #ba1a1a);
}

.m3-text-field-supporting {
  padding: 0 16px;
  color: var(--m3-on-surface-variant, #424941);
}

.m3-text-field.is-disabled {
  opacity: 0.38;
  pointer-events: none;
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3TextField 2>&1 | tail -10
```

Expected: 11+ tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3TextField.vue \
       src/parent/components/m3/__tests__/M3TextField.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3TextField 元件 + Vitest

filled / outlined 2 variants + floating label + supportingText/errorText +
v-model + disabled。11+ tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: M3SegmentedButton

**Files:**
- Create: `src/parent/components/m3/M3SegmentedButton.vue`
- Create: `src/parent/components/m3/__tests__/M3SegmentedButton.spec.js`

API:
- v-model: `modelValue` (string | string[]) — single 模式為 string，multi 模式為 array
- props: `items` (Array, required) — `[{ value, label, icon?: string }, ...]`，2-5 個 segment
- props: `multiple` (boolean, default false)
- emits: `update:modelValue`

樣式：水平 button group，圓角 9999px（pill），中間 segment 方形。selected segment 用 secondary-container bg。

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3SegmentedButton.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3SegmentedButton from '../M3SegmentedButton.vue'

const ITEMS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '週' },
  { value: 'month', label: '月' },
]

describe('M3SegmentedButton', () => {
  it('render N 個 segment', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    expect(w.findAll('.m3-segment')).toHaveLength(3)
  })

  it('selected segment 套 is-selected class', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'week' },
    })
    const segs = w.findAll('.m3-segment')
    expect(segs[0].classes()).not.toContain('is-selected')
    expect(segs[1].classes()).toContain('is-selected')
  })

  it('點 segment (single) 觸發 update:modelValue', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    await w.findAll('.m3-segment')[2].trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['month']])
  })

  it('multiple=true 時 modelValue 應為 array', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: ['day'], multiple: true },
    })
    await w.findAll('.m3-segment')[1].trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toEqual(['day', 'week'])
  })

  it('multiple 模式再次點已選 segment 則移除', async () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: ['day', 'week'], multiple: true },
    })
    await w.findAll('.m3-segment')[0].trigger('click')
    const emitted = w.emitted('update:modelValue')
    expect(emitted[0][0]).toEqual(['week'])
  })

  it('label 渲染', () => {
    const w = mount(M3SegmentedButton, {
      props: { items: ITEMS, modelValue: 'day' },
    })
    expect(w.findAll('.m3-segment')[0].text()).toContain('日')
  })

  it('icon prop 渲染 leading icon', () => {
    const items = [{ value: 'a', label: 'A', icon: 'star' }]
    const w = mount(M3SegmentedButton, {
      props: { items, modelValue: 'a' },
    })
    expect(w.find('.material-symbols-rounded').exists()).toBe(true)
    expect(w.find('.material-symbols-rounded').text()).toBe('star')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3SegmentedButton 2>&1 | tail -10
```

- [ ] **Step 3: 實作 M3SegmentedButton.vue**

寫入 `src/parent/components/m3/M3SegmentedButton.vue`：

```vue
<script setup>
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Segmented Button.
 *
 * Single / multiple selection 兩種模式。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.5
 */
const props = defineProps({
  modelValue: {
    type: [String, Array],
    default: '',
  },
  items: {
    type: Array,
    required: true,
    validator: (arr) =>
      Array.isArray(arr) && arr.every((it) => 'value' in it && 'label' in it),
  },
  multiple: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

function isSelected(value) {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.includes(value)
  }
  return props.modelValue === value
}

function onSegmentClick(value) {
  if (props.multiple) {
    const cur = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const idx = cur.indexOf(value)
    if (idx >= 0) cur.splice(idx, 1)
    else cur.push(value)
    emit('update:modelValue', cur)
  } else {
    emit('update:modelValue', value)
  }
}
</script>

<template>
  <div class="m3-segmented-button" role="group">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="m3-segment"
      :class="{ 'is-selected': isSelected(item.value) }"
      :aria-pressed="isSelected(item.value)"
      @click="onSegmentClick(item.value)"
    >
      <M3Icon
        v-if="isSelected(item.value)"
        name="check"
        :size="18"
        aria-hidden="true"
      />
      <M3Icon
        v-else-if="item.icon"
        :name="item.icon"
        :size="18"
        aria-hidden="true"
      />
      <span class="m3-segment-label m3-label-large">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.m3-segmented-button {
  display: inline-flex;
  height: 40px;
  border: 1px solid var(--m3-outline, #727970);
  border-radius: 9999px;
  overflow: hidden;
  background: var(--m3-surface, #f7fbf3);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-segment {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  height: 100%;
  border: none;
  border-left: 1px solid var(--m3-outline, #727970);
  background: transparent;
  color: var(--m3-on-surface, #181d18);
  cursor: pointer;
  white-space: nowrap;
}
.m3-segment:first-child {
  border-left: none;
}

.m3-segment.is-selected {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}

.m3-segment::before {
  content: '';
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-segment:hover::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-segment:focus-visible::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-segment:active::before       { opacity: var(--m3-state-pressed, 0.12); }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3SegmentedButton 2>&1 | tail -10
```

Expected: 7 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3SegmentedButton.vue \
       src/parent/components/m3/__tests__/M3SegmentedButton.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3SegmentedButton 元件 + Vitest

single/multiple 模式 + check icon (selected) + leading icon (unselected) +
state layer。7 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: M3Switch

**Files:**
- Create: `src/parent/components/m3/M3Switch.vue`
- Create: `src/parent/components/m3/__tests__/M3Switch.spec.js`

API:
- v-model: `modelValue` (boolean)
- props: `disabled` (boolean, default false)
- attrs: `aria-label` 父層自填
- emits: `update:modelValue`

樣式：52×32 track，handle thumb 24×24（off）/ 24×24（on，位移）。M3 spec 標誌性。

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Switch.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Switch from '../M3Switch.vue'

describe('M3Switch', () => {
  it('render checkbox role=switch', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': '通知' },
    })
    expect(w.attributes('role')).toBe('switch')
    expect(w.classes()).toContain('m3-switch')
  })

  it('預設 unchecked', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).not.toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('modelValue=true → checked', () => {
    const w = mount(M3Switch, {
      props: { modelValue: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('點擊切換', async () => {
    const w = mount(M3Switch, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[true]])
  })

  it('disabled 不觸發 update', async () => {
    const w = mount(M3Switch, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })

  it('disabled 套 is-disabled class', () => {
    const w = mount(M3Switch, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-disabled')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3Switch 2>&1 | tail -10
```

- [ ] **Step 3: 實作 M3Switch.vue**

寫入 `src/parent/components/m3/M3Switch.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * Material 3 Switch.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const classes = computed(() => ({
  'm3-switch': true,
  'is-checked': props.modelValue,
  'is-disabled': props.disabled,
}))

function onClick() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="m3-switch-track">
      <span class="m3-switch-thumb" />
    </span>
  </button>
</template>

<style scoped>
.m3-switch {
  position: relative;
  display: inline-block;
  width: 52px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}

.m3-switch-track {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--m3-surface-container-highest, #e0e4dc);
  border: 2px solid var(--m3-outline, #727970);
  transition: background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}

.m3-switch-thumb {
  position: absolute;
  top: 50%;
  left: 6px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--m3-outline, #727970);
  transform: translateY(-50%);
  transition: transform var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    width var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    height var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease),
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}

.m3-switch.is-checked .m3-switch-track {
  background: var(--m3-primary, #006d3d);
  border-color: var(--m3-primary, #006d3d);
}
.m3-switch.is-checked .m3-switch-thumb {
  background: var(--m3-on-primary, #ffffff);
  width: 24px;
  height: 24px;
  left: auto;
  right: 2px;
  transform: translateY(-50%);
}

.m3-switch.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3Switch 2>&1 | tail -10
```

Expected: 6 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3Switch.vue \
       src/parent/components/m3/__tests__/M3Switch.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Switch 元件 + Vitest

M3 標誌性 track + thumb 切換動畫；role=switch + aria-checked。
6 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: M3Checkbox + M3Radio (同 commit)

**Files:**
- Create: `src/parent/components/m3/M3Checkbox.vue`
- Create: `src/parent/components/m3/M3Radio.vue`
- Create: `src/parent/components/m3/__tests__/M3Checkbox.spec.js`
- Create: `src/parent/components/m3/__tests__/M3Radio.spec.js`

M3Checkbox API：
- v-model: modelValue (boolean)
- props: indeterminate (boolean, default false)
- props: disabled (boolean, default false)
- attrs: aria-label / aria-labelledby

M3Radio API：
- v-model: modelValue (any) — 對外控制
- props: value (any, required) — 此 radio 的值
- props: name (string, default '') — radio group 名（HTML 慣例）
- props: disabled (boolean, default false)
- attrs: aria-label / aria-labelledby

樣式 18×18 box（checkbox 圓角 2px / radio 圓形）。

- [ ] **Step 1: 寫 Checkbox 失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Checkbox.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Checkbox from '../M3Checkbox.vue'

describe('M3Checkbox', () => {
  it('預設 unchecked', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('m3-checkbox')
    expect(w.classes()).not.toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('modelValue=true → checked', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-checked')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('indeterminate 套 class + aria-checked=mixed', () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false, indeterminate: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('is-indeterminate')
    expect(w.attributes('aria-checked')).toBe('mixed')
  })

  it('點擊切換 modelValue', async () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([[true]])
  })

  it('disabled 不觸發', async () => {
    const w = mount(M3Checkbox, {
      props: { modelValue: false, disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 寫 Radio 失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Radio.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Radio from '../M3Radio.vue'

describe('M3Radio', () => {
  it('value 等於 modelValue 時為 selected', () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'a' },
      attrs: { 'aria-label': 'A' },
    })
    expect(w.classes()).toContain('m3-radio')
    expect(w.classes()).toContain('is-selected')
    expect(w.attributes('aria-checked')).toBe('true')
  })

  it('value 不等於 modelValue 時為 unselected', () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b' },
      attrs: { 'aria-label': 'B' },
    })
    expect(w.classes()).not.toContain('is-selected')
    expect(w.attributes('aria-checked')).toBe('false')
  })

  it('點擊觸發 update:modelValue 為 value', async () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b' },
      attrs: { 'aria-label': 'B' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['b']])
  })

  it('disabled 不觸發', async () => {
    const w = mount(M3Radio, {
      props: { modelValue: 'a', value: 'b', disabled: true },
      attrs: { 'aria-label': 'B' },
    })
    await w.trigger('click')
    expect(w.emitted('update:modelValue') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 3: 跑測試確認 FAIL**

```bash
npm run test -- M3Checkbox M3Radio 2>&1 | tail -15
```

- [ ] **Step 4: 實作 M3Checkbox.vue**

寫入 `src/parent/components/m3/M3Checkbox.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * Material 3 Checkbox.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  indeterminate: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const ariaChecked = computed(() => {
  if (props.indeterminate) return 'mixed'
  return props.modelValue ? 'true' : 'false'
})

const classes = computed(() => ({
  'm3-checkbox': true,
  'is-checked': props.modelValue,
  'is-indeterminate': props.indeterminate,
  'is-disabled': props.disabled,
}))

function onClick() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="checkbox"
    :aria-checked="ariaChecked"
    :disabled="disabled"
    @click="onClick"
  >
    <span class="m3-checkbox-box">
      <span v-if="indeterminate" class="m3-checkbox-indeterminate" />
      <span v-else-if="modelValue" class="m3-checkbox-check">✓</span>
    </span>
  </button>
</template>

<style scoped>
.m3-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.m3-checkbox-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 2px solid var(--m3-on-surface-variant, #424941);
  border-radius: 2px;
  background: transparent;
  transition: background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  color: var(--m3-on-primary, #ffffff);
  font-size: 14px;
  line-height: 1;
}
.m3-checkbox.is-checked .m3-checkbox-box,
.m3-checkbox.is-indeterminate .m3-checkbox-box {
  background: var(--m3-primary, #006d3d);
  border-color: var(--m3-primary, #006d3d);
}
.m3-checkbox-indeterminate {
  display: block;
  width: 10px;
  height: 2px;
  background: var(--m3-on-primary, #ffffff);
}
.m3-checkbox.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 5: 實作 M3Radio.vue**

寫入 `src/parent/components/m3/M3Radio.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * Material 3 Radio Button.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.6
 */
const props = defineProps({
  modelValue: { default: null },
  value: { required: true },
  name: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const isSelected = computed(() => props.modelValue === props.value)

const classes = computed(() => ({
  'm3-radio': true,
  'is-selected': isSelected.value,
  'is-disabled': props.disabled,
}))

function onClick() {
  if (props.disabled) return
  if (!isSelected.value) {
    emit('update:modelValue', props.value)
  }
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    role="radio"
    :aria-checked="isSelected ? 'true' : 'false'"
    :disabled="disabled"
    :name="name || undefined"
    @click="onClick"
  >
    <span class="m3-radio-outer">
      <span v-if="isSelected" class="m3-radio-inner" />
    </span>
  </button>
</template>

<style scoped>
.m3-radio {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
}
.m3-radio-outer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--m3-on-surface-variant, #424941);
  border-radius: 50%;
  background: transparent;
  transition: border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-radio.is-selected .m3-radio-outer {
  border-color: var(--m3-primary, #006d3d);
}
.m3-radio-inner {
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--m3-primary, #006d3d);
}
.m3-radio.is-disabled {
  opacity: 0.38;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 6: 跑測試確認 PASS**

```bash
npm run test -- M3Checkbox M3Radio 2>&1 | tail -15
```

Expected: 5 + 4 = 9 tests passed。

- [ ] **Step 7: Commit**

```bash
git add src/parent/components/m3/M3Checkbox.vue \
       src/parent/components/m3/M3Radio.vue \
       src/parent/components/m3/__tests__/M3Checkbox.spec.js \
       src/parent/components/m3/__tests__/M3Radio.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Checkbox + M3Radio 元件 + Vitest

M3Checkbox 支援 indeterminate；M3Radio 用 modelValue + value 配對。
role=checkbox/radio + aria-checked 完整支援。9 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: barrel exports + 全套驗證

**Files:**
- Modify: `src/parent/components/m3/index.js`

- [ ] **Step 1: 加 P3 元件 export**

用 Edit tool，把：

```js
export { default as M3FAB } from './M3FAB.vue'
```

替換為：

```js
export { default as M3FAB } from './M3FAB.vue'
export { default as M3Snackbar } from './M3Snackbar.vue'
export { default as M3TextField } from './M3TextField.vue'
export { default as M3SegmentedButton } from './M3SegmentedButton.vue'
export { default as M3Switch } from './M3Switch.vue'
export { default as M3Checkbox } from './M3Checkbox.vue'
export { default as M3Radio } from './M3Radio.vue'
```

- [ ] **Step 2: 確認 grep 數**

```bash
grep -c "^export { default as" src/parent/components/m3/index.js
```

Expected: 17（P0 1 + P1 7 + P2 3 + P3 6）。

- [ ] **Step 3: 跑全套 m3 測試**

```bash
npm run test -- src/parent/components/m3 2>&1 | tail -15
```

Expected: 全部 m3 元件測試通過。預計 96 (P0-P2) + 11 + 11 + 7 + 6 + 9 = 140 個測試左右。

- [ ] **Step 4: 跑全套 parent 確認零新增 regression**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -10
```

Expected: 228 passed / 4 failed (pre-existing) 不變。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/index.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 補齊 P3 互動元件 barrel exports

M3Snackbar / M3TextField / M3SegmentedButton / M3Switch / M3Checkbox / M3Radio
全部從 @/parent/components/m3 export。
共 17 個 M3 元件 export（P0 1 + P1 7 + P2 3 + P3 6）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 後備檢查表

- [ ] 6 個新元件（Snackbar/TextField/SegmentedButton/Switch/Checkbox/Radio）+ 6 個 spec 檔全部存在
- [ ] useSnackbar composable + spec 檔存在
- [ ] ParentBottomSheet / AppModal / ConfirmDialog visual refactor 完成，**props/events/slots API 完全不變**
- [ ] ConfirmDialog 內部按鈕已換 M3Button（destructive 模式有 m3-error 覆寫）
- [ ] 既有 ParentBottomSheet test、AppModal test、ConfirmDialog test 全綠（無 API breaking）
- [ ] index.js 已 export 17 個元件
- [ ] M3 元件測試 ~140 全綠
- [ ] Parent app 既有測試零新增 regression（pre-existing 4 個失敗不變）
- [ ] No remaining TODO / TBD 字串

---

## P3 完成後

- 進 **P4 plan**（27 view 改寫，分 4 sub-PR：首頁群 / 訊息家校群 / 子女檔案群 / 申請我的群）。
- P4 是 HIGH 風險 phase；多人多週工時；建議切分多個 PR。
- P4 plan 由 implementer 重新調用 writing-plans skill 寫，spec §7 為依據。
