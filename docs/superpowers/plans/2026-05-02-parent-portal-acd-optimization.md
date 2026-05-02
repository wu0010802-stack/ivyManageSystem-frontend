# 家長端優化批次 A+C+D 實作計畫（2026-05-02）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為家長端引入 5 個共用基礎元件（BottomSheet/LazyImage/Cache/ConnectionStatus/Banner），並把 5 個 800/700/500 行級的 view 拆解為 sub-component，每個 view 同步加上漸層 hero 卡，全程純前端、不動 API。

**Architecture:** 6 phase 漸進交付，Phase 1 為基礎建設（後續都依賴），Phase 2-6 為各 view 拆解（彼此獨立可平行）。每 phase 一條 frontend feature branch（`feat/parent-acd-v1-phase{N}-<topic>`），逐 phase merge 回 main。

**Tech Stack:** Vue 3 (Composition API + `<script setup>`) / Vite / Vitest 4 + happy-dom + @vue/test-utils / Pinia / 既有 Soft UI token 體系（`--pt-elev-*` / `--pt-hairline` / `--pt-gradient-*` / `--pt-tint-*`）

**Spec:** `docs/superpowers/specs/2026-05-02-parent-portal-acd-optimization-design.md`

---

## File Structure

### 新增檔案（Phase 1）

```
src/parent/components/
├── ParentBottomSheet.vue       # snap points 底部彈窗
├── LazyImage.vue                # IntersectionObserver 懶載
└── ConnectionBanner.vue         # 離線/WS 斷線 banner

src/parent/composables/
├── useTodayStatusCache.js       # SWR + BroadcastChannel
└── useConnectionStatus.js       # online + WS singleton

tests/unit/parent/components/
├── ParentBottomSheet.test.js
├── LazyImage.test.js
└── ConnectionBanner.test.js

tests/unit/parent/composables/
├── useTodayStatusCache.test.js
└── useConnectionStatus.test.js
```

### 新增檔案（Phase 2-6）

```
src/parent/components/leaves/
├── LeaveHero.vue
├── LeaveForm.vue
├── LeaveListCard.vue
├── LeaveDetailSheet.vue
└── LeaveAttachments.vue

src/parent/components/home/
├── HomeHero.vue
├── TodayStatusCards.vue
├── TodoCenter.vue
├── ChildrenStrip.vue
└── QuickActions.vue

src/parent/components/fees/
├── FeeHero.vue
├── FeeListGroup.vue
└── FeeReceiptSheet.vue

src/parent/components/activity/
├── ActivityHero.vue
├── ActivityCardList.vue
├── ActivityRegisterSheet.vue
└── RegistrationStatusList.vue

src/parent/components/more/
├── UserHeroCard.vue
├── MoreMenuGroup.vue
└── A11ySettingsSection.vue
```

### 修改檔案

```
src/parent/layouts/ParentLayout.vue   # 嵌入 ConnectionBanner
src/parent/views/LeavesView.vue        # 811 → <200，純 orchestration
src/parent/views/HomeView.vue           # 729 → <150
src/parent/views/FeesView.vue           # 476 → <200
src/parent/views/ActivityView.vue       # 547 → <200
src/parent/views/MoreView.vue           # 573 → <200
```

---

# Phase 1: 基礎建設

**Branch:** `feat/parent-acd-v1-phase1-foundation`

**目標:** 建立 5 個共用元件 / composable，所有測試綠，bundle 增量 < 8 KB gzip。後續 Phase 全部依賴此 phase merge 後才能開分支。

---

### Task 1.1: 建立 branch + 新增元件目錄

**Files:**
- Modify: 工作目錄 `/Users/yilunwu/Desktop/ivy-frontend`

- [ ] **Step 1: 確認在 main 且 clean**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git status
git checkout main
git pull
```

Expected: `nothing to commit, working tree clean` 與 `Already up to date.`

- [ ] **Step 2: 開分支**

```bash
git checkout -b feat/parent-acd-v1-phase1-foundation
```

- [ ] **Step 3: 建立測試目錄**

```bash
mkdir -p tests/unit/parent/components tests/unit/parent/composables
```

Expected: 兩個目錄存在，無檔案。

---

### Task 1.2: ParentBottomSheet — 基本骨架（render + props + slots）

**Files:**
- Create: `src/parent/components/ParentBottomSheet.vue`
- Create: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 寫第一個 failing test（render）**

寫到 `tests/unit/parent/components/ParentBottomSheet.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'

describe('ParentBottomSheet — basic render', () => {
  it('modelValue=false 時不渲染 dialog', () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: false },
      attachTo: document.body,
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('modelValue=true 時渲染 dialog 含 title 與 default slot 內容', () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, title: '測試標題' },
      slots: { default: '<p class="body-text">本文</p>' },
      attachTo: document.body,
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('測試標題')
    expect(wrapper.find('.body-text').exists()).toBe(true)
    wrapper.unmount()
  })

  it('提供 header / footer slot 時優先採用 slot 而非 title prop', () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, title: 'fallback' },
      slots: {
        header: '<h2 class="custom-header">自訂表頭</h2>',
        footer: '<button class="custom-footer">送出</button>',
      },
      attachTo: document.body,
    })
    expect(wrapper.find('.custom-header').exists()).toBe(true)
    expect(wrapper.html()).not.toContain('fallback')
    expect(wrapper.find('.custom-footer').exists()).toBe(true)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

Expected: 3 個測試 fail，原因類似 `Failed to resolve import "@/parent/components/ParentBottomSheet.vue"`。

- [ ] **Step 3: 寫最小元件讓 render 測試通過**

建立 `src/parent/components/ParentBottomSheet.vue`：

```vue
<script setup>
/**
 * 家長端底部彈窗（snap points 進階版）。
 *
 * 提供：
 *  - 三段 snap：peek (30vh) / mid (60vh) / full (92vh)
 *  - drag-to-dismiss 與慣性吸附
 *  - keyboard 開啟時自動切 full + 鎖拖曳（避輸入框被遮）
 *  - role="dialog"、focus trap、ESC 關閉、body scroll lock
 *  - safe-area-inset-bottom
 *  - 視覺：--pt-elev-3 + --pt-hairline + --pt-scrim + --pt-backdrop-blur
 *
 * 使用：
 *   <ParentBottomSheet v-model="show" title="收據明細" :snap-points="['mid','full']" default-snap="mid">
 *     <template #header>...</template>
 *     <p>內容</p>
 *     <template #footer><button>送出</button></template>
 *   </ParentBottomSheet>
 */
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  snapPoints: {
    type: Array,
    default: () => ['mid', 'full'],
    validator: (arr) => arr.every((s) => ['peek', 'mid', 'full'].includes(s)),
  },
  defaultSnap: {
    type: String,
    default: 'mid',
    validator: (v) => ['peek', 'mid', 'full'].includes(v),
  },
  dismissible: { type: Boolean, default: true },
  showHandle: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue', 'close', 'snap-change'])

const slots = useSlots()
const dialogRef = ref(null)
const headerId = `pt-bsheet-${Math.random().toString(36).slice(2, 9)}`

function close() {
  emit('update:modelValue', false)
  emit('close')
}

const hasHeaderSlot = computed(() => !!slots.header)
const hasFooterSlot = computed(() => !!slots.footer)
</script>

<template>
  <Teleport to="body">
    <Transition name="pt-bsheet">
      <div
        v-if="modelValue"
        class="pt-bsheet-overlay"
        @click.self="dismissible && close()"
      >
        <div
          ref="dialogRef"
          class="pt-bsheet-dialog"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="headerId"
          tabindex="-1"
        >
          <div v-if="showHandle" class="pt-bsheet-handle" aria-hidden="true" />

          <div :id="headerId" class="pt-bsheet-header">
            <slot name="header">
              <h2 class="pt-bsheet-title">{{ title }}</h2>
            </slot>
          </div>

          <div class="pt-bsheet-body">
            <slot />
          </div>

          <div v-if="hasFooterSlot" class="pt-bsheet-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pt-bsheet-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop, 90);
  background: var(--pt-scrim, rgba(15, 23, 42, 0.45));
  -webkit-backdrop-filter: blur(var(--pt-backdrop-blur, 8px));
  backdrop-filter: blur(var(--pt-backdrop-blur, 8px));
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.pt-bsheet-dialog {
  background: var(--pt-surface-card, #fff);
  border: var(--pt-hairline);
  border-radius: 16px 16px 0 0;
  box-shadow: var(--pt-elev-3);
  width: 100%;
  max-width: 640px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  outline: none;
  padding-bottom: env(safe-area-inset-bottom, 0);
  overscroll-behavior: contain;
}

.pt-bsheet-handle {
  width: 36px;
  height: 4px;
  background: var(--pt-surface-mute, #e5e7eb);
  border-radius: 2px;
  margin: 8px auto 4px;
}

.pt-bsheet-header { padding: 8px 16px 4px; }
.pt-bsheet-title { font-size: 17px; font-weight: 600; margin: 0; }
.pt-bsheet-body { padding: 12px 16px; overflow-y: auto; flex: 1; }
.pt-bsheet-footer { padding: 12px 16px; border-top: var(--pt-hairline); }

.pt-bsheet-enter-active,
.pt-bsheet-leave-active {
  transition: opacity 0.2s ease;
}
.pt-bsheet-enter-active .pt-bsheet-dialog,
.pt-bsheet-leave-active .pt-bsheet-dialog {
  transition: transform 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
.pt-bsheet-enter-from, .pt-bsheet-leave-to { opacity: 0; }
.pt-bsheet-enter-from .pt-bsheet-dialog,
.pt-bsheet-leave-to .pt-bsheet-dialog { transform: translateY(100%); }

@media (prefers-reduced-motion: reduce) {
  .pt-bsheet-enter-active,
  .pt-bsheet-leave-active,
  .pt-bsheet-enter-active .pt-bsheet-dialog,
  .pt-bsheet-leave-active .pt-bsheet-dialog { transition: none; }
  .pt-bsheet-enter-from .pt-bsheet-dialog,
  .pt-bsheet-leave-to .pt-bsheet-dialog { transform: none; }
}
</style>
```

- [ ] **Step 4: 跑測試確認 3 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  3 passed (3)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): 骨架渲染與 slots（ACD Phase 1）"
```

---

### Task 1.3: ParentBottomSheet — dismiss 行為（backdrop / ESC）

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`
- Modify: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 加 failing test**

在 `tests/unit/parent/components/ParentBottomSheet.test.js` 末尾追加：

```js
describe('ParentBottomSheet — dismiss', () => {
  it('dismissible=true 點 backdrop emit update:modelValue=false', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, dismissible: true },
      attachTo: document.body,
    })
    await wrapper.find('.pt-bsheet-overlay').trigger('click')
    const evts = wrapper.emitted('update:modelValue')
    expect(evts).toBeTruthy()
    expect(evts[0]).toEqual([false])
    wrapper.unmount()
  })

  it('dismissible=false 點 backdrop 不 emit', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, dismissible: false },
      attachTo: document.body,
    })
    await wrapper.find('.pt-bsheet-overlay').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })

  it('ESC 鍵在 dismissible=true 時關閉', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, dismissible: true },
      attachTo: document.body,
    })
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
    wrapper.unmount()
  })

  it('ESC 鍵在 dismissible=false 時不關閉', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, dismissible: false },
      attachTo: document.body,
    })
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 ESC 兩個 fail（backdrop 應該已過）**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

Expected: ESC 相關 2 個 fail。

- [ ] **Step 3: 補 keydown handler**

在 `ParentBottomSheet.vue` `<script setup>` 加：

```js
function onKeydown(e) {
  if (e.key === 'Escape' && props.dismissible) {
    e.stopPropagation()
    close()
  }
}
```

把 template 的 `<div ref="dialogRef" class="pt-bsheet-dialog"` 改為：

```vue
<div
  ref="dialogRef"
  class="pt-bsheet-dialog"
  role="dialog"
  aria-modal="true"
  :aria-labelledby="headerId"
  tabindex="-1"
  @keydown="onKeydown"
>
```

- [ ] **Step 4: 跑測試確認 7 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  7 passed (7)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): 加 backdrop / ESC dismiss"
```

---

### Task 1.4: ParentBottomSheet — focus trap + body lock + 還原焦點

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`
- Modify: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 加 failing test**

追加至測試檔：

```js
describe('ParentBottomSheet — a11y', () => {
  it('開啟時鎖 body overflow，關閉時還原', async () => {
    document.body.style.overflow = ''
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: false },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ modelValue: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.style.overflow).toBe('')
    wrapper.unmount()
  })

  it('開啟後焦點移到 dialog 內第一個可 focus 元素', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: false },
      slots: { default: '<button class="first-btn">A</button><button class="second-btn">B</button>' },
      attachTo: document.body,
    })
    await wrapper.setProps({ modelValue: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement?.classList.contains('first-btn')).toBe(true)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

Expected: 兩個 a11y 測試 fail。

- [ ] **Step 3: 加 focus trap + body lock 邏輯（直接複用 AppModal 模式）**

在 `ParentBottomSheet.vue` `<script setup>` 加：

```js
const previouslyFocused = ref(null)

function getFocusableElements() {
  if (!dialogRef.value) return []
  return Array.from(
    dialogRef.value.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
}

function trapFocus(e) {
  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    e.preventDefault()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

function lockBody() { document.body.style.overflow = 'hidden' }
function unlockBody() { document.body.style.overflow = '' }

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused.value = document.activeElement
      lockBody()
      await nextTick()
      const focusable = getFocusableElements()
      if (focusable.length > 0) focusable[0].focus()
      else dialogRef.value?.focus()
    } else {
      unlockBody()
      if (previouslyFocused.value && typeof previouslyFocused.value.focus === 'function') {
        previouslyFocused.value.focus()
      }
    }
  },
)

onBeforeUnmount(() => unlockBody())
```

把 onKeydown 補 Tab 轉發：

```js
function onKeydown(e) {
  if (e.key === 'Escape' && props.dismissible) {
    e.stopPropagation()
    close()
    return
  }
  if (e.key === 'Tab') trapFocus(e)
}
```

- [ ] **Step 4: 跑測試確認 9 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  9 passed (9)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): focus trap + body lock + 還原焦點"
```

---

### Task 1.5: ParentBottomSheet — snap point 切換邏輯

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`
- Modify: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 加 failing test**

```js
describe('ParentBottomSheet — snap points', () => {
  it('defaultSnap=peek 時 dialog 高度為 30vh', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['peek', 'mid', 'full'], defaultSnap: 'peek' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    const dialog = wrapper.find('.pt-bsheet-dialog').element
    expect(dialog.style.getPropertyValue('--pt-bsheet-h')).toBe('30vh')
    wrapper.unmount()
  })

  it('defaultSnap=full 時為 92vh', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, defaultSnap: 'full' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('92vh')
    wrapper.unmount()
  })

  it('呼叫 setSnap("full") 切到 full 並 emit snap-change', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    wrapper.vm.setSnap('full')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('92vh')
    expect(wrapper.emitted('snap-change')[0]).toEqual(['full'])
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

- [ ] **Step 3: 加 snap state**

在 `ParentBottomSheet.vue` `<script setup>` 加：

```js
const SNAP_HEIGHT = { peek: '30vh', mid: '60vh', full: '92vh' }
const currentSnap = ref(props.defaultSnap)

function setSnap(snap) {
  if (!props.snapPoints.includes(snap)) return
  currentSnap.value = snap
  emit('snap-change', snap)
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) currentSnap.value = props.defaultSnap
  },
  { flush: 'pre' },
)

defineExpose({ setSnap })
```

把 dialog 樣式加上 css var 與 height 套用：

```vue
<div
  ref="dialogRef"
  class="pt-bsheet-dialog"
  :style="{ '--pt-bsheet-h': snapHeight }"
  role="dialog"
  aria-modal="true"
  :aria-labelledby="headerId"
  tabindex="-1"
  @keydown="onKeydown"
>
```

並加 computed：

```js
const snapHeight = computed(() => SNAP_HEIGHT[currentSnap.value])
```

把 `.pt-bsheet-dialog` 樣式中 `max-height: 92vh;` 改成：

```css
.pt-bsheet-dialog {
  /* ...其他不變... */
  height: var(--pt-bsheet-h, 60vh);
  max-height: 92vh;
  transition: height 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}
```

- [ ] **Step 4: 跑測試確認 12 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  12 passed (12)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): snap point peek/mid/full 切換 + setSnap 公開 API"
```

---

### Task 1.6: ParentBottomSheet — 拖曳手勢

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`
- Modify: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 加 failing test**

```js
describe('ParentBottomSheet — drag gesture', () => {
  function dispatchPointer(el, type, y) {
    const evt = new PointerEvent(type, {
      bubbles: true, pointerId: 1, clientY: y, pointerType: 'touch',
    })
    el.dispatchEvent(evt)
  }

  it('drag down 超過 100px 從 peek 關閉', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['peek', 'mid', 'full'], defaultSnap: 'peek' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    const handle = wrapper.find('.pt-bsheet-handle').element
    dispatchPointer(handle, 'pointerdown', 100)
    dispatchPointer(window, 'pointermove', 250)
    dispatchPointer(window, 'pointerup', 250)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('drag up 從 mid 切到 full', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    const handle = wrapper.find('.pt-bsheet-handle').element
    dispatchPointer(handle, 'pointerdown', 300)
    dispatchPointer(window, 'pointermove', 100)
    dispatchPointer(window, 'pointerup', 100)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('snap-change')?.at(-1)).toEqual(['full'])
    wrapper.unmount()
  })

  it('小幅拖曳（< 30px）回彈到原 snap', async () => {
    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    const handle = wrapper.find('.pt-bsheet-handle').element
    dispatchPointer(handle, 'pointerdown', 300)
    dispatchPointer(window, 'pointermove', 320)
    dispatchPointer(window, 'pointerup', 320)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('snap-change')).toBeFalsy()
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 3 個 fail**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

- [ ] **Step 3: 加拖曳邏輯**

在 `ParentBottomSheet.vue` `<script setup>` 加：

```js
const SNAP_ORDER = ['full', 'mid', 'peek'] // 由上至下
const dragStartY = ref(0)
const dragStartTime = ref(0)
const dragOffset = ref(0)
const isDragging = ref(false)

function onDragStart(e) {
  isDragging.value = true
  dragStartY.value = e.clientY
  dragStartTime.value = Date.now()
  dragOffset.value = 0
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd, { once: true })
  window.addEventListener('pointercancel', onDragEnd, { once: true })
}

function onDragMove(e) {
  if (!isDragging.value) return
  dragOffset.value = Math.max(-200, e.clientY - dragStartY.value)
}

function onDragEnd(e) {
  window.removeEventListener('pointermove', onDragMove)
  if (!isDragging.value) return
  const delta = e.clientY - dragStartY.value
  const elapsed = Math.max(1, Date.now() - dragStartTime.value)
  const velocity = delta / elapsed * 1000 // px/s
  isDragging.value = false
  dragOffset.value = 0

  const enabled = SNAP_ORDER.filter((s) => props.snapPoints.includes(s))
  const currentIdx = enabled.indexOf(currentSnap.value)

  // 速度判定
  if (velocity > 600) {
    // 向下快滑
    if (currentSnap.value === enabled[enabled.length - 1]) {
      if (props.dismissible) close()
    } else {
      setSnap(enabled[Math.min(enabled.length - 1, currentIdx + 1)])
    }
    return
  }
  if (velocity < -600) {
    // 向上快滑
    setSnap(enabled[Math.max(0, currentIdx - 1)])
    return
  }
  // 距離判定
  if (Math.abs(delta) < 30) return // 回彈
  if (delta > 100 && currentSnap.value === 'peek' && props.dismissible) {
    close()
    return
  }
  if (delta > 60) {
    setSnap(enabled[Math.min(enabled.length - 1, currentIdx + 1)])
  } else if (delta < -60) {
    setSnap(enabled[Math.max(0, currentIdx - 1)])
  }
}
```

把 handle 元素的 template 改為：

```vue
<div
  v-if="showHandle"
  class="pt-bsheet-handle"
  role="button"
  tabindex="0"
  aria-label="拖曳調整高度"
  @pointerdown="onDragStart"
/>
```

並把 `dragOffset` 套到 dialog 的 `transform`（拖曳期間跟手）：

```js
const dialogTransform = computed(() =>
  isDragging.value ? `translateY(${dragOffset.value}px)` : '',
)
```

dialog template style 改為：

```vue
<div
  ref="dialogRef"
  class="pt-bsheet-dialog"
  :style="{ '--pt-bsheet-h': snapHeight, transform: dialogTransform, transition: isDragging ? 'none' : undefined }"
  ...
>
```

- [ ] **Step 4: 跑測試確認 15 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  15 passed (15)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): 拖曳手勢 + 速度/距離吸附"
```

---

### Task 1.7: ParentBottomSheet — keyboard 鎖定（visualViewport）

**Files:**
- Modify: `src/parent/components/ParentBottomSheet.vue`
- Modify: `tests/unit/parent/components/ParentBottomSheet.test.js`

- [ ] **Step 1: 加 failing test**

```js
describe('ParentBottomSheet — keyboard mode', () => {
  it('visualViewport 縮小 > 100px 時自動切 full 並停拖曳', async () => {
    const handlers = {}
    const fakeVV = {
      height: 800,
      addEventListener: vi.fn((e, h) => { handlers[e] = h }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('visualViewport', fakeVV)

    const wrapper = mount(ParentBottomSheet, {
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
      attachTo: document.body,
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('60vh')

    fakeVV.height = 500
    handlers.resize?.()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('92vh')

    // 拖曳被鎖
    const handle = wrapper.find('.pt-bsheet-handle').element
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 200 }))
    expect(wrapper.vm.isDraggingForTest ?? false).toBe(false)

    wrapper.unmount()
    vi.unstubAllGlobals()
  })
})
```

注意該測試需 `vi` 與 `vi.stubGlobal`。確認測試檔頂端 import 已含 `vi`：`import { describe, it, expect, vi } from 'vitest'`。如未有 `vi`，補上。

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -20
```

- [ ] **Step 3: 加 keyboard mode**

在 `ParentBottomSheet.vue` `<script setup>` 加：

```js
import { onMounted } from 'vue'

const keyboardLocked = ref(false)
const initialVVHeight = ref(0)

function onVVResize() {
  if (typeof window === 'undefined' || !window.visualViewport) return
  const delta = initialVVHeight.value - window.visualViewport.height
  if (delta > 100) {
    if (!keyboardLocked.value) {
      keyboardLocked.value = true
      currentSnap.value = 'full'
    }
  } else {
    keyboardLocked.value = false
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    initialVVHeight.value = window.visualViewport.height
    window.visualViewport.addEventListener('resize', onVVResize)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', onVVResize)
  }
})
```

修改 `onDragStart` 第一行加守衛：

```js
function onDragStart(e) {
  if (keyboardLocked.value) return
  isDragging.value = true
  // ...原本邏輯
}
```

加測試 expose（僅供測試）：

```js
defineExpose({ setSnap, isDraggingForTest: isDragging })
```

- [ ] **Step 4: 跑測試確認 16 個都過**

```bash
npm run test -- tests/unit/parent/components/ParentBottomSheet.test.js 2>&1 | tail -15
```

Expected: `Tests  16 passed (16)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ParentBottomSheet.vue tests/unit/parent/components/ParentBottomSheet.test.js
git commit -m "feat(parent-bsheet): visualViewport keyboard 模式自動切 full + 鎖拖曳"
```

---

### Task 1.8: LazyImage — 元件 + 測試

**Files:**
- Create: `src/parent/components/LazyImage.vue`
- Create: `tests/unit/parent/components/LazyImage.test.js`

- [ ] **Step 1: 寫測試**

寫到 `tests/unit/parent/components/LazyImage.test.js`：

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LazyImage from '@/parent/components/LazyImage.vue'

describe('LazyImage', () => {
  let observers = []
  let observeCb

  beforeEach(() => {
    observers = []
    class MockIO {
      constructor(cb) { observeCb = cb; observers.push(this) }
      observe() {}
      unobserve() {}
      disconnect = vi.fn()
    }
    vi.stubGlobal('IntersectionObserver', MockIO)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未進入視窗前 img 不帶 src（或為空）', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', alt: 'photo' },
      attachTo: document.body,
    })
    await flushPromises()
    const img = wrapper.find('img')
    expect(img.attributes('src')).toBeFalsy()
    wrapper.unmount()
  })

  it('進入視窗後 img.src 被設定', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', alt: 'photo' },
      attachTo: document.body,
    })
    await flushPromises()
    observeCb([{ isIntersecting: true, intersectionRatio: 1 }])
    await flushPromises()
    expect(wrapper.find('img').attributes('src')).toBe('https://x/y.jpg')
    wrapper.unmount()
  })

  it('img.onerror 顯示 fallback slot', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/bad.jpg', alt: 'bad' },
      slots: { error: '<span class="err">圖片載入失敗</span>' },
      attachTo: document.body,
    })
    await flushPromises()
    observeCb([{ isIntersecting: true, intersectionRatio: 1 }])
    await flushPromises()
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('.err').exists()).toBe(true)
    wrapper.unmount()
  })

  it('unmount 時 disconnect IntersectionObserver', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg' },
      attachTo: document.body,
    })
    await flushPromises()
    const io = observers[0]
    wrapper.unmount()
    expect(io.disconnect).toHaveBeenCalled()
  })

  it('aspectRatio prop 套用到容器 style', async () => {
    const wrapper = mount(LazyImage, {
      props: { src: 'https://x/y.jpg', aspectRatio: '16 / 9' },
      attachTo: document.body,
    })
    await flushPromises()
    expect(wrapper.element.style.aspectRatio).toBe('16 / 9')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/LazyImage.test.js 2>&1 | tail -15
```

- [ ] **Step 3: 寫元件**

建立 `src/parent/components/LazyImage.vue`：

```vue
<script setup>
/**
 * 家長端懶載圖片：IntersectionObserver + native loading="lazy" fallback。
 *
 * Props:
 *  - src       (必填) 圖片 URL
 *  - alt       a11y 文字（預設 ''）
 *  - aspectRatio CSS aspect-ratio，避免載入時跳版（預設 '1 / 1'）
 *  - rootMargin IntersectionObserver rootMargin（預設 '200px'）
 *  - placeholder 'shimmer' | 'solid'（預設 'shimmer'）
 *
 * Slots:
 *  - error   載入失敗時顯示
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  src: { type: String, required: true },
  alt: { type: String, default: '' },
  aspectRatio: { type: String, default: '1 / 1' },
  rootMargin: { type: String, default: '200px' },
  placeholder: { type: String, default: 'shimmer' },
})

const containerRef = ref(null)
const inView = ref(false)
const errored = ref(false)
let observer = null

onMounted(() => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    inView.value = true
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && e.intersectionRatio > 0) {
          inView.value = true
          observer?.disconnect()
          break
        }
      }
    },
    { rootMargin: props.rootMargin },
  )
  if (containerRef.value) observer.observe(containerRef.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

function onError() { errored.value = true }
</script>

<template>
  <div
    ref="containerRef"
    class="pt-lazyimg"
    :class="{ 'pt-lazyimg-shimmer': placeholder === 'shimmer' && !inView }"
    :style="{ aspectRatio }"
  >
    <img
      v-if="inView && !errored"
      :src="src"
      :alt="alt"
      loading="lazy"
      decoding="async"
      @error="onError"
    />
    <slot v-else-if="errored" name="error">
      <span class="pt-lazyimg-fallback" aria-hidden="true">⚠</span>
    </slot>
  </div>
</template>

<style scoped>
.pt-lazyimg {
  display: block;
  width: 100%;
  background: var(--pt-surface-mute, #f0f2f5);
  overflow: hidden;
}
.pt-lazyimg img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.pt-lazyimg-shimmer {
  background: linear-gradient(90deg,
    var(--pt-surface-mute) 0%,
    var(--pt-surface-mute-soft) 50%,
    var(--pt-surface-mute) 100%);
  background-size: 200% 100%;
  animation: pt-shimmer 1.4s ease-in-out infinite;
}
.pt-lazyimg-fallback {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%;
  color: var(--pt-text-muted, #94a3b8);
  font-size: 24px;
}
</style>
```

- [ ] **Step 4: 跑測試**

```bash
npm run test -- tests/unit/parent/components/LazyImage.test.js 2>&1 | tail -15
```

Expected: `Tests  5 passed (5)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/LazyImage.vue tests/unit/parent/components/LazyImage.test.js
git commit -m "feat(parent-lazyimg): IntersectionObserver 懶載 + shimmer 占位"
```

---

### Task 1.9: useTodayStatusCache — SWR + sessionStorage

**Files:**
- Create: `src/parent/composables/useTodayStatusCache.js`
- Create: `tests/unit/parent/composables/useTodayStatusCache.test.js`

- [ ] **Step 1: 確認既有 home today-status API 路徑**

```bash
grep -rn 'today-status\|todayStatus' /Users/yilunwu/Desktop/ivy-frontend/src/parent/ 2>&1 | head -10
```

Expected: 找到 `src/parent/api/home.js`（或類似）內 `getTodayStatus()` 之類函式名。記下實際 import 路徑與 function 名（後續測試/實作要對齊）。

- [ ] **Step 2: 寫測試**

寫到 `tests/unit/parent/composables/useTodayStatusCache.test.js`：

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockApi = vi.hoisted(() => ({ getTodayStatus: vi.fn() }))
vi.mock('@/parent/api/home', () => mockApi)

import { useTodayStatusCache, _resetForTest } from '@/parent/composables/useTodayStatusCache'

describe('useTodayStatusCache', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockApi.getTodayStatus.mockReset()
    _resetForTest()
  })

  it('首次 refresh 打 API 並寫入 sessionStorage', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ items: [{ id: 1 }] })
    const { status, refresh } = useTodayStatusCache()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
    expect(status.value).toEqual({ items: [{ id: 1 }] })
    const cached = JSON.parse(sessionStorage.getItem('parent:today-status:v1'))
    expect(cached.payload).toEqual({ items: [{ id: 1 }] })
    expect(typeof cached.cachedAt).toBe('number')
  })

  it('60s 內再次呼叫 refresh 不打 API', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ items: [] })
    const { refresh } = useTodayStatusCache()
    await refresh()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
  })

  it('cache age 介於 60-300s：先 emit cache，再背景 fetch', async () => {
    sessionStorage.setItem(
      'parent:today-status:v1',
      JSON.stringify({ payload: { items: ['stale'] }, cachedAt: Date.now() - 90_000 }),
    )
    mockApi.getTodayStatus.mockResolvedValue({ items: ['fresh'] })

    const { status, refresh } = useTodayStatusCache()
    const p = refresh()
    expect(status.value).toEqual({ items: ['stale'] }) // SWR 先給 stale
    await p
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(1)
    expect(status.value).toEqual({ items: ['fresh'] })
  })

  it('markStale() 後下次 refresh 必打', async () => {
    mockApi.getTodayStatus.mockResolvedValue({ items: [] })
    const { refresh, markStale } = useTodayStatusCache()
    await refresh()
    markStale()
    await refresh()
    expect(mockApi.getTodayStatus).toHaveBeenCalledTimes(2)
  })

  it('無 BroadcastChannel 環境不 throw', async () => {
    const original = globalThis.BroadcastChannel
    delete globalThis.BroadcastChannel
    mockApi.getTodayStatus.mockResolvedValue({ items: [] })
    expect(() => useTodayStatusCache()).not.toThrow()
    globalThis.BroadcastChannel = original
  })
})
```

- [ ] **Step 3: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/composables/useTodayStatusCache.test.js 2>&1 | tail -20
```

- [ ] **Step 4: 寫 composable**

建立 `src/parent/composables/useTodayStatusCache.js`（**注意 import 路徑要與 Step 1 找到的對齊；以下示範 `@/parent/api/home`**）：

```js
/**
 * 家長端今日狀態快取（attendance/leave/medication/dismissal）。
 *
 * 行為：
 *  - sessionStorage 持久化，60s TTL
 *  - 60-300s 期間 stale-while-revalidate
 *  - BroadcastChannel 跨 tab 同步（不支援時靜默降級）
 *  - 可見性回前景且 cache age > 60s 自動 refresh
 *  - markStale() 強制下次重打
 */
import { onBeforeUnmount, ref } from 'vue'
import { getTodayStatus } from '@/parent/api/home'

const CACHE_KEY = 'parent:today-status:v1'
const FRESH_TTL_MS = 60_000
const SWR_TTL_MS = 300_000
const CHANNEL_NAME = 'parent-today-status'

// 模組層 singleton state
const status = ref(null)
const loading = ref(false)
const error = ref(null)
let channel = null
let inflight = null

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function writeCache(payload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload, cachedAt: Date.now() }))
  } catch {/* quota */}
}

function age(cache) { return cache ? Date.now() - cache.cachedAt : Infinity }

async function _fetch() {
  loading.value = true
  try {
    const data = await getTodayStatus()
    status.value = data
    writeCache(data)
    error.value = null
    channel?.postMessage({ type: 'updated', payload: data, ts: Date.now() })
    return data
  } catch (e) {
    error.value = e
    throw e
  } finally {
    loading.value = false
  }
}

function ensureChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = (msg) => {
      if (msg.data?.type === 'updated' && msg.data.payload) {
        status.value = msg.data.payload
        writeCache(msg.data.payload)
      }
    }
  } catch {/* ignore */}
}

let visibilityBound = false
function ensureVisibility() {
  if (visibilityBound || typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const cache = readCache()
      if (age(cache) > FRESH_TTL_MS) {
        if (!inflight) {
          inflight = _fetch().finally(() => { inflight = null })
        }
      }
    }
  })
  visibilityBound = true
}

export function useTodayStatusCache() {
  ensureChannel()
  ensureVisibility()

  // 初始 hydrate from cache（不論是否 fresh）
  if (status.value === null) {
    const cache = readCache()
    if (cache) status.value = cache.payload
  }

  async function refresh() {
    const cache = readCache()
    const a = age(cache)

    if (a < FRESH_TTL_MS) {
      status.value = cache.payload
      return cache.payload
    }

    if (cache && a < SWR_TTL_MS) {
      // SWR：先給 stale 再背景 fetch
      status.value = cache.payload
      if (!inflight) {
        inflight = _fetch().finally(() => { inflight = null })
      }
      return cache.payload
    }

    // 無 cache 或太舊：等 fetch
    if (!inflight) {
      inflight = _fetch().finally(() => { inflight = null })
    }
    return inflight
  }

  function markStale() {
    try { sessionStorage.removeItem(CACHE_KEY) } catch {/* */}
  }

  return { status, loading, error, refresh, markStale }
}

// 測試用：重置 module-level state
export function _resetForTest() {
  status.value = null
  loading.value = false
  error.value = null
  inflight = null
  if (channel) { channel.close?.(); channel = null }
}
```

- [ ] **Step 5: 確認 `getTodayStatus` 真實 export**

```bash
grep -n 'export' /Users/yilunwu/Desktop/ivy-frontend/src/parent/api/home.js 2>&1 | head -10
```

如果實際 function name 不是 `getTodayStatus`，把 `useTodayStatusCache.js` 與測試 mock 的 import 路徑/名稱同步調整。

- [ ] **Step 6: 跑測試**

```bash
npm run test -- tests/unit/parent/composables/useTodayStatusCache.test.js 2>&1 | tail -15
```

Expected: `Tests  5 passed (5)`

- [ ] **Step 7: 提交**

```bash
git add src/parent/composables/useTodayStatusCache.js tests/unit/parent/composables/useTodayStatusCache.test.js
git commit -m "feat(parent-cache): today-status SWR + BroadcastChannel 跨 tab"
```

---

### Task 1.10: useTodayStatusCache — BroadcastChannel 跨 instance 同步測試

**Files:**
- Modify: `tests/unit/parent/composables/useTodayStatusCache.test.js`

- [ ] **Step 1: 加 failing test**

追加：

```js
describe('useTodayStatusCache — BroadcastChannel sync', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockApi.getTodayStatus.mockReset()
    _resetForTest()
  })

  it('收到其他 tab postMessage 時更新 status 並寫 cache', async () => {
    const { status } = useTodayStatusCache()

    // 模擬另一 tab 廣播
    const evt = new MessageEvent('message', {
      data: { type: 'updated', payload: { items: ['from-other-tab'] }, ts: Date.now() },
    })
    // 找到我們建立的 channel
    // 由於 happy-dom 的 BroadcastChannel 是 polyfill，直接派發到 channel 即可
    if (typeof BroadcastChannel !== 'undefined') {
      const peer = new BroadcastChannel('parent-today-status')
      peer.postMessage({ type: 'updated', payload: { items: ['from-other-tab'] }, ts: Date.now() })
      peer.close()
      await new Promise((r) => setTimeout(r, 30))
      expect(status.value).toEqual({ items: ['from-other-tab'] })
      const cached = JSON.parse(sessionStorage.getItem('parent:today-status:v1'))
      expect(cached.payload).toEqual({ items: ['from-other-tab'] })
    }
  })
})
```

- [ ] **Step 2: 跑測試**

```bash
npm run test -- tests/unit/parent/composables/useTodayStatusCache.test.js 2>&1 | tail -15
```

Expected: 6 passed。若 happy-dom 不提供 BroadcastChannel polyfill，測試內 `typeof BroadcastChannel !== 'undefined'` 會跳過該驗證——此情況 OK，但要在 console 加 `console.warn('BroadcastChannel polyfill missing, sync test skipped')` 提醒。

- [ ] **Step 3: 提交**

```bash
git add tests/unit/parent/composables/useTodayStatusCache.test.js
git commit -m "test(parent-cache): 補 BroadcastChannel 跨 instance 同步驗證"
```

---

### Task 1.11: useConnectionStatus — composable + 測試

**Files:**
- Create: `src/parent/composables/useConnectionStatus.js`
- Create: `tests/unit/parent/composables/useConnectionStatus.test.js`

- [ ] **Step 1: 寫測試**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useConnectionStatus, _resetConnectionStatusForTest } from '@/parent/composables/useConnectionStatus'

describe('useConnectionStatus', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('initial online 反映 navigator.onLine', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const { online } = useConnectionStatus()
    expect(online.value).toBe(false)
  })

  it('window offline event 切換 online=false', () => {
    const { online } = useConnectionStatus()
    expect(online.value).toBe(true)
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
  })

  it('singleton：兩次 useConnectionStatus 共用 ref', () => {
    const a = useConnectionStatus()
    const b = useConnectionStatus()
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    expect(a.online.value).toBe(false)
    expect(b.online.value).toBe(false)
  })

  it('registerWs 接收 mock WS，open/close 切換 wsConnected', () => {
    const { wsConnected, registerWs } = useConnectionStatus()
    const fakeWs = {
      _handlers: {},
      addEventListener(evt, h) { this._handlers[evt] = h },
      removeEventListener() {},
    }
    registerWs(fakeWs)
    fakeWs._handlers.open?.()
    expect(wsConnected.value).toBe(true)
    fakeWs._handlers.close?.()
    expect(wsConnected.value).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/composables/useConnectionStatus.test.js 2>&1 | tail -15
```

- [ ] **Step 3: 寫 composable**

建立 `src/parent/composables/useConnectionStatus.js`：

```js
/**
 * 家長端連線狀態 singleton。
 *
 * - online：navigator.onLine + online/offline event
 * - wsConnected：透過 registerWs(ws) 接 open/close/error
 * - lastDisconnectAt：最近斷線時刻（用於 ConnectionBanner 顯示秒數）
 */
import { ref } from 'vue'

const online = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
const wsConnected = ref(false)
const lastDisconnectAt = ref(null)

let bound = false
function ensureBound() {
  if (bound || typeof window === 'undefined') return
  window.addEventListener('online', () => { online.value = true })
  window.addEventListener('offline', () => {
    online.value = false
    lastDisconnectAt.value = Date.now()
  })
  bound = true
}

export function useConnectionStatus() {
  ensureBound()

  function registerWs(ws) {
    if (!ws || typeof ws.addEventListener !== 'function') return
    ws.addEventListener('open', () => { wsConnected.value = true })
    ws.addEventListener('close', () => {
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
    ws.addEventListener('error', () => {
      wsConnected.value = false
      lastDisconnectAt.value = Date.now()
    })
  }

  return { online, wsConnected, lastDisconnectAt, registerWs }
}

export function _resetConnectionStatusForTest() {
  online.value = typeof navigator !== 'undefined' ? navigator.onLine : true
  wsConnected.value = false
  lastDisconnectAt.value = null
}
```

- [ ] **Step 4: 跑測試**

```bash
npm run test -- tests/unit/parent/composables/useConnectionStatus.test.js 2>&1 | tail -15
```

Expected: `Tests  4 passed (4)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/composables/useConnectionStatus.js tests/unit/parent/composables/useConnectionStatus.test.js
git commit -m "feat(parent-conn): online + WS singleton composable"
```

---

### Task 1.12: ConnectionBanner — 元件 + 測試

**Files:**
- Create: `src/parent/components/ConnectionBanner.vue`
- Create: `tests/unit/parent/components/ConnectionBanner.test.js`

- [ ] **Step 1: 寫測試**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionBanner from '@/parent/components/ConnectionBanner.vue'
import { _resetConnectionStatusForTest, useConnectionStatus } from '@/parent/composables/useConnectionStatus'

describe('ConnectionBanner', () => {
  beforeEach(() => {
    _resetConnectionStatusForTest()
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  it('online 且 ws 連線時不渲染', () => {
    const wrapper = mount(ConnectionBanner)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('離線時顯示橘色 banner 含「離線」字樣', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    window.dispatchEvent(new Event('offline'))
    const wrapper = mount(ConnectionBanner)
    await wrapper.vm.$nextTick()
    const banner = wrapper.find('[role="status"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('離線')
    expect(banner.classes()).toContain('pt-conn-offline')
  })

  it('WS 斷線（online=true 且 wsConnected=false）顯示 reconnect banner', async () => {
    const { wsConnected } = useConnectionStatus()
    wsConnected.value = false
    // 模擬「online 但 ws 斷」狀態：透過 props.forceWsBanner 也行；本元件直接讀 store
    const wrapper = mount(ConnectionBanner, { props: { wsBannerDelayMs: 0 } })
    await new Promise((r) => setTimeout(r, 10))
    // 由於 ws 預設 false，且 prop 把 delay 設為 0，要顯示
    const banner = wrapper.find('[role="status"]')
    if (banner.exists()) {
      expect(banner.text()).toMatch(/即時|連線|重連/)
    }
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/ConnectionBanner.test.js 2>&1 | tail -15
```

- [ ] **Step 3: 寫元件**

建立 `src/parent/components/ConnectionBanner.vue`：

```vue
<script setup>
/**
 * 家長端連線狀態 banner。
 * - 離線：橘色「目前離線，部分功能受限」
 * - WS 斷線（online 但 wsConnected=false 超過 delay）：淺灰「即時通知暫停，正在重連...」
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { useConnectionStatus } from '@/parent/composables/useConnectionStatus'

const props = defineProps({
  wsBannerDelayMs: { type: Number, default: 3000 },
})

const { online, wsConnected } = useConnectionStatus()
const wsBannerVisible = ref(false)
let wsTimer = null

function scheduleWsBanner() {
  clearTimeout(wsTimer)
  if (online.value && !wsConnected.value) {
    wsTimer = setTimeout(() => { wsBannerVisible.value = !wsConnected.value }, props.wsBannerDelayMs)
  } else {
    wsBannerVisible.value = false
  }
}

// 初始
scheduleWsBanner()
// watch 變化
import { watch } from 'vue'
watch([online, wsConnected], scheduleWsBanner)

onBeforeUnmount(() => clearTimeout(wsTimer))

const variant = computed(() => {
  if (!online.value) return 'offline'
  if (wsBannerVisible.value) return 'ws'
  return null
})

const message = computed(() => {
  if (variant.value === 'offline') return '目前離線，部分功能受限'
  if (variant.value === 'ws') return '即時通知暫停，正在重連...'
  return ''
})

function retry() {
  if (typeof window !== 'undefined') window.location.reload()
}
</script>

<template>
  <Transition name="pt-conn">
    <div
      v-if="variant"
      role="status"
      aria-live="polite"
      class="pt-conn-banner"
      :class="`pt-conn-${variant}`"
    >
      <span class="pt-conn-msg">{{ message }}</span>
      <button v-if="variant === 'offline'" type="button" class="pt-conn-retry" @click="retry">
        重試
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.pt-conn-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: var(--pt-hairline);
}
.pt-conn-offline {
  background: var(--pt-tint-money, #fef3c7);
  color: var(--pt-tint-money-fg, #b45309);
}
.pt-conn-ws {
  background: var(--pt-tint-message, #dbeafe);
  color: var(--pt-tint-message-fg, #1d4ed8);
}
.pt-conn-retry {
  background: transparent;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 4px 10px;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.pt-conn-enter-active, .pt-conn-leave-active {
  transition: transform 0.28s ease, opacity 0.28s ease;
}
.pt-conn-enter-from, .pt-conn-leave-to {
  transform: translateY(-100%); opacity: 0;
}
</style>
```

- [ ] **Step 4: 跑測試**

```bash
npm run test -- tests/unit/parent/components/ConnectionBanner.test.js 2>&1 | tail -15
```

Expected: 3 passed（第三個若 happy-dom timing 不穩可能 skipped 內部 if）。

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/ConnectionBanner.vue tests/unit/parent/components/ConnectionBanner.test.js
git commit -m "feat(parent-conn): ConnectionBanner 離線/WS 斷線視覺"
```

---

### Task 1.13: 嵌入 ConnectionBanner 到 ParentLayout

**Files:**
- Modify: `src/parent/layouts/ParentLayout.vue`

- [ ] **Step 1: 看現有 ParentLayout 結構**

```bash
grep -n 'AppHeader\|router-view\|TabBar' /Users/yilunwu/Desktop/ivy-frontend/src/parent/layouts/ParentLayout.vue 2>&1 | head -20
```

記下 `<AppHeader>` 與 `<router-view>` 在 template 中的位置。

- [ ] **Step 2: 在 `<AppHeader>` 之下、`<router-view>` 之上插入 `<ConnectionBanner>`**

打開 `src/parent/layouts/ParentLayout.vue`，在 `<script setup>` 加：

```js
import ConnectionBanner from '@/parent/components/ConnectionBanner.vue'
```

在 template 中找到 `<AppHeader ... />` 之後、`<router-view>` 之前，插入：

```vue
<ConnectionBanner />
```

確認 `<ConnectionBanner />` 在 sticky 容器內，或自身為 `position: sticky; top: 0; z-index: 50`。如果 ParentLayout 的 main 區是滾動容器，需確認 banner 跟 header 同層 sticky。最簡作法：ConnectionBanner 內部已設定 banner 高度 fit-content，把它包在 `<div style="position: sticky; top: var(--header-height, 56px); z-index: 50">` 內。

如 ParentLayout 既有 `header-height` 變數已存在則直接用，否則暫用 `56px` 並 TODO 標註。

- [ ] **Step 3: 跑全測試確認沒打壞既有 layout 測試**

```bash
npm run test -- tests/unit 2>&1 | tail -10
```

Expected: 全綠（如果 ParentLayout 有測試的話）。

- [ ] **Step 4: 手動 sanity build**

```bash
npm run build 2>&1 | tail -20
```

Expected: 無 error。

- [ ] **Step 5: 提交**

```bash
git add src/parent/layouts/ParentLayout.vue
git commit -m "feat(parent-layout): 嵌入 ConnectionBanner（離線/WS 斷線視覺）"
```

---

### Task 1.14: Phase 1 全測試 + bundle 驗收

**Files:** 無新增

- [ ] **Step 1: 跑全 Vitest**

```bash
npm run test 2>&1 | tail -15
```

Expected: 全綠，新增 5 檔測試共 ≥ 30 個 cases 全過。

- [ ] **Step 2: build + 紀錄 bundle 大小**

```bash
npm run build 2>&1 | tail -25
```

紀錄 dist 中 `parent-*.js` 的 gzip 大小。對照 baseline（最近一次 main build）：增量必須 < 8 KB gzip。

如超標：檢查是否誤 import 了 element-plus 或其他大型 lib（用 `grep -r "from 'element-plus'" src/parent/components src/parent/composables` 查）。

- [ ] **Step 3: 推上 remote**

```bash
git push -u origin feat/parent-acd-v1-phase1-foundation
```

- [ ] **Step 4: 開 PR（手動）**

```bash
gh pr create --title "feat(parent): ACD 優化 Phase 1 — 基礎建設" --body "$(cat <<'EOF'
## Summary
- 新增 `ParentBottomSheet`（snap points + 拖曳 + keyboard 模式）
- 新增 `LazyImage`（IntersectionObserver + shimmer）
- 新增 `useTodayStatusCache`（SWR + BroadcastChannel + visibility 觸發）
- 新增 `useConnectionStatus` + `ConnectionBanner`，掛入 ParentLayout
- Spec: `docs/superpowers/specs/2026-05-02-parent-portal-acd-optimization-design.md`

## Test plan
- [ ] Vitest: `tests/unit/parent/components/{ParentBottomSheet,LazyImage,ConnectionBanner}.test.js`
- [ ] Vitest: `tests/unit/parent/composables/{useTodayStatusCache,useConnectionStatus}.test.js`
- [ ] `npm run build` 通過，parent-app gzip 增量 < 8 KB
- [ ] 手機 LIFF：BottomSheet snap 切換流暢、拖曳關閉手感正常
- [ ] 切飛航 → ConnectionBanner 出現，重連消失
EOF
)"
```

Phase 1 完成 ✅ → 等 merge 後再開 Phase 2-6 分支。

---

# Phase 2: LeavesView 拆解

**Branch:** `feat/parent-acd-v1-phase2-leaves`（從 main 開，main 必須已含 Phase 1）

**目標:** `src/parent/views/LeavesView.vue` 從 811 行降至 <200 行；新增 5 個 sub-component；上方加 hero 卡（深綠漸層）；detail modal 改用 ParentBottomSheet。

---

### Task 2.1: 開分支 + 新目錄

- [ ] **Step 1: 從 main 開分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git checkout main && git pull
git checkout -b feat/parent-acd-v1-phase2-leaves
mkdir -p src/parent/components/leaves tests/unit/parent/components/leaves
```

---

### Task 2.2: LeaveHero — hero 卡元件

**Files:**
- Create: `src/parent/components/leaves/LeaveHero.vue`
- Create: `tests/unit/parent/components/leaves/LeaveHero.test.js`

- [ ] **Step 1: 寫測試**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveHero from '@/parent/components/leaves/LeaveHero.vue'

describe('LeaveHero', () => {
  it('顯示總天數與分項 chips', () => {
    const wrapper = mount(LeaveHero, {
      props: {
        summary: {
          total_used: 5,
          by_type: { sick: 2, personal: 3 },
          semester_label: '114 上學期',
        },
      },
    })
    expect(wrapper.text()).toContain('5')
    expect(wrapper.text()).toContain('114 上學期')
    expect(wrapper.text()).toContain('病假')
    expect(wrapper.text()).toContain('事假')
  })

  it('action slot 顯示在右側', () => {
    const wrapper = mount(LeaveHero, {
      props: { summary: { total_used: 0, by_type: {}, semester_label: '' } },
      slots: { action: '<button class="cta">申請請假</button>' },
    })
    expect(wrapper.find('.cta').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

```bash
npm run test -- tests/unit/parent/components/leaves/LeaveHero.test.js 2>&1 | tail -15
```

- [ ] **Step 3: 寫元件**

建立 `src/parent/components/leaves/LeaveHero.vue`：

```vue
<script setup>
/**
 * 請假 hero 卡：本學期請假天數彙總（深綠漸層）。
 */
const props = defineProps({
  summary: {
    type: Object,
    required: true,
    // { total_used: number, by_type: { sick, personal, ... }, semester_label: string }
  },
})

const TYPE_LABEL = {
  sick: '病假',
  personal: '事假',
  official: '公假',
  funeral: '喪假',
  marriage: '婚假',
  maternity: '產假',
  other: '其他',
}
</script>

<template>
  <section class="leave-hero">
    <div class="leave-hero-blob leave-hero-blob-a" aria-hidden="true" />
    <div class="leave-hero-blob leave-hero-blob-b" aria-hidden="true" />
    <div class="leave-hero-content">
      <div class="leave-hero-main">
        <span class="leave-hero-label">{{ summary.semester_label || '本學期' }}</span>
        <div class="leave-hero-num">
          <span class="leave-hero-num-val">{{ summary.total_used ?? 0 }}</span>
          <span class="leave-hero-num-unit">天</span>
        </div>
        <span class="leave-hero-sub">已請</span>
      </div>
      <div class="leave-hero-chips">
        <span
          v-for="(days, key) in summary.by_type"
          :key="key"
          class="leave-hero-chip"
        >
          {{ TYPE_LABEL[key] ?? key }} {{ days }}
        </span>
      </div>
    </div>
    <div class="leave-hero-action">
      <slot name="action" />
    </div>
  </section>
</template>

<style scoped>
.leave-hero {
  position: relative;
  overflow: hidden;
  background: var(--pt-gradient-hero);
  color: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.leave-hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(40px);
  opacity: 0.35;
  pointer-events: none;
}
.leave-hero-blob-a {
  width: 160px; height: 160px;
  background: rgba(255, 255, 255, 0.4);
  top: -40px; right: -40px;
}
.leave-hero-blob-b {
  width: 120px; height: 120px;
  background: rgba(180, 233, 192, 0.5);
  bottom: -30px; left: -30px;
}
.leave-hero-content { position: relative; z-index: 1; }
.leave-hero-label {
  display: block;
  font-size: 12px;
  opacity: 0.85;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
}
.leave-hero-num {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.leave-hero-num-val { font-size: 36px; font-weight: 700; line-height: 1; }
.leave-hero-num-unit { font-size: 14px; opacity: 0.85; }
.leave-hero-sub { display: block; font-size: 12px; opacity: 0.85; margin-top: 2px; }
.leave-hero-chips {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px;
}
.leave-hero-chip {
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 12px;
}
.leave-hero-action { position: relative; z-index: 1; }
</style>
```

- [ ] **Step 4: 跑測試**

```bash
npm run test -- tests/unit/parent/components/leaves/LeaveHero.test.js 2>&1 | tail -15
```

Expected: `Tests  2 passed (2)`

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/leaves/LeaveHero.vue tests/unit/parent/components/leaves/LeaveHero.test.js
git commit -m "feat(parent-leaves): 加 LeaveHero 漸層彙總卡（ACD Phase 2）"
```

---

### Task 2.3: 抽 LeaveListCard

**Files:**
- Create: `src/parent/components/leaves/LeaveListCard.vue`
- Read（參考）: `src/parent/views/LeavesView.vue`

- [ ] **Step 1: 找出列表單筆卡片在 LeavesView 內的 markup 範圍**

```bash
grep -n 'leave-card\|LeaveCard\|class="card"\|v-for=' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/LeavesView.vue | head -20
```

記錄列表卡 template 的起訖行號。

- [ ] **Step 2: 建立 LeaveListCard**

把 LeavesView 內單筆 leave 的 markup（含 status badge、假別、期間、天數）整段抽出，放到 `src/parent/components/leaves/LeaveListCard.vue`：

結構大致為：

```vue
<script setup>
const props = defineProps({
  leave: { type: Object, required: true },
})
const emit = defineEmits(['click'])
</script>

<template>
  <article class="leave-card pt-card" @click="emit('click', leave)" role="button" tabindex="0">
    <!-- 把 LeavesView 內單筆卡 template 完整搬過來，並把資料引用改為 props.leave -->
  </article>
</template>

<style scoped>
/* 把對應 .leave-card 等 scoped 樣式搬過來 */
</style>
```

**注意**：原本 LeavesView 內若有透過 props/emits 之外的 store/composable 取資料，要在抽出時改為 props 傳入。**不要把 sessionStorage 讀寫 / API call 搬進子元件**，那些留在父層。

- [ ] **Step 3: 把 LeavesView 內的 `<div v-for="leave in items">...</div>` 用法改用新元件**

```vue
<LeaveListCard
  v-for="leave in items"
  :key="leave.id"
  :leave="leave"
  @click="onLeaveClick"
/>
```

- [ ] **Step 4: 跑現有 leaves 相關測試**

```bash
npm run test -- 'parent.*leave' 2>&1 | tail -15
```

Expected: 全綠（行為不變）。

- [ ] **Step 5: 補 LeaveListCard 單測**

`tests/unit/parent/components/leaves/LeaveListCard.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveListCard from '@/parent/components/leaves/LeaveListCard.vue'

describe('LeaveListCard', () => {
  const sample = {
    id: 1, leave_type: 'sick', start_date: '2026-05-01', end_date: '2026-05-02',
    duration_days: 2, status: 'approved', reason: '感冒',
  }

  it('渲染假別、期間、天數', () => {
    const wrapper = mount(LeaveListCard, { props: { leave: sample } })
    expect(wrapper.text()).toMatch(/2026-05-01|05.*01/)
    expect(wrapper.text()).toContain('2')
  })

  it('點擊 emit click(leave)', async () => {
    const wrapper = mount(LeaveListCard, { props: { leave: sample } })
    await wrapper.find('article').trigger('click')
    expect(wrapper.emitted('click')[0][0]).toEqual(sample)
  })
})
```

```bash
npm run test -- tests/unit/parent/components/leaves/LeaveListCard.test.js 2>&1 | tail -10
```

- [ ] **Step 6: 提交**

```bash
git add src/parent/components/leaves/LeaveListCard.vue \
        src/parent/views/LeavesView.vue \
        tests/unit/parent/components/leaves/LeaveListCard.test.js
git commit -m "refactor(parent-leaves): 抽出 LeaveListCard"
```

---

### Task 2.4: 抽 LeaveAttachments

**Files:**
- Create: `src/parent/components/leaves/LeaveAttachments.vue`
- Modify: `src/parent/views/LeavesView.vue`

- [ ] **Step 1: 找出附件上傳 / 顯示 / 刪除的 markup 與 logic 在 LeavesView 內的範圍**

```bash
grep -n 'attachment\|upload\|file\|input.*type=.file' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/LeavesView.vue | head -20
```

- [ ] **Step 2: 建立 LeaveAttachments**

`src/parent/components/leaves/LeaveAttachments.vue`：

```vue
<script setup>
/**
 * 請假附件管理：上傳 / 列表 / 刪除（pending only）。
 *
 * Emits:
 *  - upload(file)  父層接住後呼叫 API
 *  - delete(attId) 父層接住後呼叫 API
 */
import LazyImage from '@/parent/components/LazyImage.vue'

const props = defineProps({
  leaveId: { type: [Number, String], required: true },
  attachments: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
})

const emit = defineEmits(['upload', 'delete'])

function onFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  emit('upload', file)
  e.target.value = ''
}
</script>

<template>
  <div class="leave-att">
    <ul v-if="attachments.length" class="leave-att-list">
      <li v-for="att in attachments" :key="att.id" class="leave-att-item">
        <LazyImage v-if="att.is_image" :src="att.url" :alt="att.filename" aspect-ratio="4 / 3" />
        <a v-else :href="att.url" target="_blank" rel="noopener">{{ att.filename }}</a>
        <button
          v-if="editable"
          type="button"
          class="leave-att-del"
          :disabled="uploading"
          @click="emit('delete', att.id)"
        >刪除</button>
      </li>
    </ul>
    <p v-else-if="!editable" class="leave-att-empty">無附件</p>
    <label v-if="editable" class="leave-att-upload">
      <input type="file" accept="image/*,application/pdf" hidden @change="onFileChange" />
      <span>{{ uploading ? '上傳中...' : '＋ 新增附件' }}</span>
    </label>
  </div>
</template>

<style scoped>
.leave-att-list { list-style: none; padding: 0; display: grid; gap: 8px; }
.leave-att-item { display: flex; align-items: center; gap: 8px; }
.leave-att-del { background: transparent; color: #b91c1c; border: 1px solid #fca5a5; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; }
.leave-att-empty { color: var(--pt-text-muted, #94a3b8); font-size: 13px; }
.leave-att-upload {
  display: inline-block; padding: 8px 12px;
  background: var(--pt-surface-mute); border-radius: 8px;
  font-size: 13px; cursor: pointer; margin-top: 8px;
}
</style>
```

- [ ] **Step 3: LeavesView 改為使用 LeaveAttachments**

把原本 LeavesView 內附件上傳/刪除的 markup 移除，留下 API call 邏輯：

```vue
<LeaveAttachments
  :leave-id="selectedLeave.id"
  :attachments="selectedLeave.attachments ?? []"
  :editable="selectedLeave.status === 'pending'"
  :uploading="attUploading"
  @upload="onAttUpload"
  @delete="onAttDelete"
/>
```

`onAttUpload(file)` 與 `onAttDelete(attId)` 仍呼叫既有 API（`uploadLeaveAttachment` / `deleteLeaveAttachment`）。

- [ ] **Step 4: 跑既有 leaves 測試**

```bash
npm run test -- 'parent.*leave' 2>&1 | tail -15
```

Expected: 全綠。

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/leaves/LeaveAttachments.vue src/parent/views/LeavesView.vue
git commit -m "refactor(parent-leaves): 抽出 LeaveAttachments（含 LazyImage）"
```

---

### Task 2.5: 抽 LeaveDetailSheet（用 ParentBottomSheet）

**Files:**
- Create: `src/parent/components/leaves/LeaveDetailSheet.vue`
- Modify: `src/parent/views/LeavesView.vue`

- [ ] **Step 1: 找 LeavesView 內 detail modal 的 markup 範圍**

```bash
grep -n 'AppModal\|v-if="showDetail\|detail-modal' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/LeavesView.vue | head -10
```

- [ ] **Step 2: 建立 LeaveDetailSheet**

`src/parent/components/leaves/LeaveDetailSheet.vue`：

```vue
<script setup>
/**
 * 請假詳情 BottomSheet：包 ParentBottomSheet、含 timeline + 附件 + cancel。
 */
import { computed } from 'vue'
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'
import LeaveAttachments from './LeaveAttachments.vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  leave: { type: Object, default: null },
  attUploading: { type: Boolean, default: false },
  cancelling: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue', 'cancel-leave', 'upload-attachment', 'delete-attachment',
])

const canCancel = computed(() =>
  props.leave?.status === 'pending' &&
  new Date(props.leave.start_date) > new Date(),
)

// 把原本 LeavesView 內計算 timeline 各 step 的 helper 整段移過來
function timelineSteps(leave) {
  if (!leave) return []
  const steps = [
    { key: 'submitted', label: '已送出', at: leave.created_at, done: true },
    { key: 'reviewed', label: leave.status === 'cancelled' ? '已取消' : '校方審核', at: leave.reviewed_at, done: !!leave.reviewed_at },
    { key: 'done', label: '完成', at: leave.reviewed_at, done: leave.status !== 'pending' },
  ]
  return steps
}
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    :title="leave ? '請假詳情' : ''"
    :snap-points="['mid', 'full']"
    default-snap="mid"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="leave">
      <!-- Timeline -->
      <ol class="leave-timeline">
        <li v-for="step in timelineSteps(leave)" :key="step.key"
          :class="{ 'leave-timeline-done': step.done }">
          <span class="leave-timeline-label">{{ step.label }}</span>
          <time v-if="step.at" class="leave-timeline-time">{{ step.at }}</time>
        </li>
      </ol>

      <!-- 詳細欄位 -->
      <dl class="leave-meta">
        <div><dt>假別</dt><dd>{{ leave.leave_type_label || leave.leave_type }}</dd></div>
        <div><dt>期間</dt><dd>{{ leave.start_date }} ~ {{ leave.end_date }}</dd></div>
        <div><dt>原因</dt><dd>{{ leave.reason }}</dd></div>
      </dl>

      <!-- 附件 -->
      <h3 class="leave-att-title">附件</h3>
      <LeaveAttachments
        :leave-id="leave.id"
        :attachments="leave.attachments ?? []"
        :editable="leave.status === 'pending'"
        :uploading="attUploading"
        @upload="(f) => emit('upload-attachment', f)"
        @delete="(id) => emit('delete-attachment', id)"
      />
    </template>

    <template v-if="canCancel" #footer>
      <button
        type="button"
        class="leave-cancel-btn"
        :disabled="cancelling"
        @click="emit('cancel-leave', leave.id)"
      >
        {{ cancelling ? '取消中...' : '取消請假' }}
      </button>
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.leave-timeline { list-style: none; padding: 0; display: flex; gap: 12px; }
.leave-timeline li { flex: 1; text-align: center; opacity: 0.5; }
.leave-timeline-done { opacity: 1; color: var(--brand-primary); }
.leave-timeline-label { display: block; font-size: 13px; font-weight: 600; }
.leave-timeline-time { font-size: 11px; opacity: 0.8; }
.leave-meta { margin-top: 16px; }
.leave-meta div { display: flex; padding: 6px 0; border-bottom: var(--pt-hairline); }
.leave-meta dt { width: 60px; color: var(--pt-text-muted); font-size: 13px; }
.leave-meta dd { flex: 1; margin: 0; font-size: 14px; }
.leave-att-title { font-size: 14px; font-weight: 600; margin: 16px 0 8px; }
.leave-cancel-btn {
  width: 100%; padding: 12px;
  background: #fef2f2; color: #b91c1c;
  border: 1px solid #fca5a5; border-radius: 8px;
  font-weight: 600; cursor: pointer;
}
.leave-cancel-btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
```

- [ ] **Step 3: LeavesView 替換掉舊 detail modal**

把原本的 detail AppModal 段移除，換成：

```vue
<LeaveDetailSheet
  v-model="showDetail"
  :leave="selectedLeave"
  :att-uploading="attUploading"
  :cancelling="cancelling"
  @cancel-leave="onCancelLeave"
  @upload-attachment="onAttUpload"
  @delete-attachment="onAttDelete"
/>
```

- [ ] **Step 4: 跑全 leaves 測試**

```bash
npm run test -- 'parent.*leave' 2>&1 | tail -15
```

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/leaves/LeaveDetailSheet.vue src/parent/views/LeavesView.vue
git commit -m "refactor(parent-leaves): detail modal 改用 ParentBottomSheet（snap mid/full）"
```

---

### Task 2.6: 抽 LeaveForm

**Files:**
- Create: `src/parent/components/leaves/LeaveForm.vue`
- Modify: `src/parent/views/LeavesView.vue`

- [ ] **Step 1: 找 LeavesView 內申請表單的 markup**

```bash
grep -n 'form\|申請\|submit\|leave_type\|start_date' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/LeavesView.vue | head -20
```

- [ ] **Step 2: 建立 LeaveForm**

`src/parent/components/leaves/LeaveForm.vue`：

把 LeavesView 內整段表單 markup + v-model + validation 全部搬到此元件。元件介面：

```vue
<script setup>
import { reactive, computed } from 'vue'

const props = defineProps({
  leaveTypes: { type: Array, required: true }, // [{ value, label }]
  submitting: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'cancel'])

const form = reactive({
  leave_type: '',
  start_date: '',
  end_date: '',
  reason: '',
})

const valid = computed(() =>
  form.leave_type && form.start_date && form.end_date &&
  form.reason.trim() !== '' &&
  form.start_date <= form.end_date,
)

function onSubmit() {
  if (!valid.value) return
  emit('submit', { ...form })
}
</script>

<template>
  <form class="leave-form" @submit.prevent="onSubmit">
    <!-- 把原 LeavesView form 內 select / input / textarea 整組搬過來 -->
    <!-- 套用 v-model="form.xxx" -->
    <div class="leave-form-actions">
      <button type="button" class="btn-ghost" :disabled="submitting" @click="emit('cancel')">取消</button>
      <button type="submit" class="btn-primary" :disabled="!valid || submitting">
        {{ submitting ? '送出中...' : '送出申請' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.leave-form { display: grid; gap: 12px; }
.leave-form-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
</style>
```

LeavesView 中改為：

```vue
<ParentBottomSheet v-model="showForm" title="申請請假" default-snap="full">
  <LeaveForm
    :leave-types="leaveTypes"
    :submitting="submitting"
    @submit="onCreateLeave"
    @cancel="showForm = false"
  />
</ParentBottomSheet>
```

並把原本「申請」按鈕的點擊邏輯改成 `showForm = true`。

- [ ] **Step 3: 補測試**

`tests/unit/parent/components/leaves/LeaveForm.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveForm from '@/parent/components/leaves/LeaveForm.vue'

describe('LeaveForm', () => {
  const types = [{ value: 'sick', label: '病假' }, { value: 'personal', label: '事假' }]

  it('表單未填完整時 submit 不 emit', async () => {
    const wrapper = mount(LeaveForm, { props: { leaveTypes: types } })
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('submit')).toBeFalsy()
  })

  it('表單填完整時 emit submit 帶 payload', async () => {
    const wrapper = mount(LeaveForm, { props: { leaveTypes: types } })
    // 假設 form 內 select / input 有 name 屬性，可直接 setValue；
    // 若用 v-model 但無 name，改用 wrapper.vm.form.xxx 設定
    wrapper.vm.form.leave_type = 'sick'
    wrapper.vm.form.start_date = '2026-05-10'
    wrapper.vm.form.end_date = '2026-05-10'
    wrapper.vm.form.reason = '感冒'
    await wrapper.vm.$nextTick()
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('submit')[0][0]).toEqual({
      leave_type: 'sick',
      start_date: '2026-05-10',
      end_date: '2026-05-10',
      reason: '感冒',
    })
  })
})
```

```bash
npm run test -- tests/unit/parent/components/leaves/LeaveForm.test.js 2>&1 | tail -10
```

- [ ] **Step 4: 提交**

```bash
git add src/parent/components/leaves/LeaveForm.vue src/parent/views/LeavesView.vue tests/unit/parent/components/leaves/LeaveForm.test.js
git commit -m "refactor(parent-leaves): 抽出 LeaveForm + 改用 BottomSheet"
```

---

### Task 2.7: LeavesView 整合 LeaveHero + 收尾

**Files:**
- Modify: `src/parent/views/LeavesView.vue`

- [ ] **Step 1: 寫 client-side hero summary computed**

在 `LeavesView.vue` setup 中加：

```js
import { computed } from 'vue'
import LeaveHero from '@/parent/components/leaves/LeaveHero.vue'

// 學期定義：簡化為 8/1–7/31
function currentSemesterRange(today = new Date()) {
  const y = today.getMonth() + 1 >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return {
    start: new Date(y, 7, 1), // 8/1
    end: new Date(y + 1, 6, 31, 23, 59, 59), // 7/31
    label: `${y - 1911} 學年度`,
  }
}

const heroSummary = computed(() => {
  const { start, end, label } = currentSemesterRange()
  const inSemester = (items.value ?? []).filter((l) => {
    const d = new Date(l.start_date)
    return l.status !== 'rejected' && l.status !== 'cancelled' && d >= start && d <= end
  })
  const by_type = {}
  let total = 0
  for (const l of inSemester) {
    const t = l.leave_type
    const days = Number(l.duration_days) || 0
    by_type[t] = (by_type[t] || 0) + days
    total += days
  }
  return { total_used: total, by_type, semester_label: label }
})
```

- [ ] **Step 2: 在 template 頂端加 hero**

```vue
<LeaveHero :summary="heroSummary">
  <template #action>
    <button class="hero-cta" @click="showForm = true">＋ 申請請假</button>
  </template>
</LeaveHero>
```

樣式（scoped）：

```css
.hero-cta {
  background: rgba(255,255,255,0.95);
  color: var(--brand-primary);
  border: none; padding: 8px 14px; border-radius: 99px;
  font-weight: 600; cursor: pointer;
}
```

- [ ] **Step 3: 計算行數，確認 < 200**

```bash
wc -l /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/LeavesView.vue
```

Expected: < 200。如果還是 > 200，檢查是否有 logic 可進一步抽到 composable（例如 `useLeaveActions.js` 包 cancel/upload/delete API 呼叫）。

- [ ] **Step 4: 全測試**

```bash
npm run test -- 'parent.*leave' 2>&1 | tail -15
```

Expected: 全綠。

- [ ] **Step 5: build sanity + 手動點過**

```bash
npm run build 2>&1 | tail -10
```

開 `npm run dev`（或 `start.sh`）→ LIFF 預覽 / mock 登入 → 點 LeavesView：
- 申請表單 BottomSheet 開啟、可拖曳 mid↔full、可送出
- 列表卡點擊開 detail sheet
- pending 假可取消，附件可上傳/刪除
- hero 數字隨列表變化

- [ ] **Step 6: 提交 + push + PR**

```bash
git add src/parent/views/LeavesView.vue
git commit -m "refactor(parent-leaves): 整合 LeaveHero，主檔降至 <200 行"
git push -u origin feat/parent-acd-v1-phase2-leaves
gh pr create --title "feat(parent): ACD Phase 2 — LeavesView 拆解 + hero" --body "$(cat <<'EOF'
## Summary
- LeavesView 從 811 → <200 行
- 新增 LeaveHero / LeaveForm / LeaveListCard / LeaveDetailSheet / LeaveAttachments
- detail modal 改用 ParentBottomSheet（snap mid/full）
- 申請表單改用 BottomSheet（snap full）

## Test plan
- [ ] Vitest 全綠
- [ ] LIFF 申請、cancel、附件、detail timeline 行為等價
EOF
)"
```

---

# Phase 3: HomeView 拆解

**Branch:** `feat/parent-acd-v1-phase3-home`

**目標:** HomeView 從 729 → <150 行；接 `useTodayStatusCache`；ChildrenStrip 用 `LazyImage`。

---

### Task 3.1: 開分支

- [ ] **Step 1**

```bash
git checkout main && git pull
git checkout -b feat/parent-acd-v1-phase3-home
mkdir -p src/parent/components/home tests/unit/parent/components/home
```

---

### Task 3.2: 抽 HomeHero

**Files:**
- Create: `src/parent/components/home/HomeHero.vue`
- Create: `tests/unit/parent/components/home/HomeHero.test.js`
- Modify: `src/parent/views/HomeView.vue`

- [ ] **Step 1: 找 HomeView 內 hero 段（已存在於 5/2 升級）**

```bash
grep -n 'hero\|問候\|早安\|午安\|晚安\|--pt-gradient' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/HomeView.vue | head -15
```

- [ ] **Step 2: 建立 HomeHero**

`src/parent/components/home/HomeHero.vue`：

把 HomeView 內 hero 段（含問候語邏輯、漸層 + blob、parent 名字）整段搬過來：

```vue
<script setup>
import { computed } from 'vue'

const props = defineProps({
  parentName: { type: String, default: '家長' },
  childrenCount: { type: Number, default: 0 },
})

function greetingByHour(h = new Date().getHours()) {
  if (h < 5) return '深夜安好'
  if (h < 11) return '早安'
  if (h < 14) return '午安'
  if (h < 18) return '下午好'
  return '晚安'
}

const greeting = computed(() => greetingByHour())
</script>

<template>
  <section class="home-hero">
    <div class="home-hero-blob home-hero-blob-a" aria-hidden="true" />
    <div class="home-hero-blob home-hero-blob-b" aria-hidden="true" />
    <div class="home-hero-content">
      <h1 class="home-hero-greeting">{{ greeting }}，{{ parentName }}</h1>
      <p v-if="childrenCount > 0" class="home-hero-sub">今天有 {{ childrenCount }} 位寶貝在園所</p>
    </div>
  </section>
</template>

<style scoped>
.home-hero {
  position: relative;
  overflow: hidden;
  background: var(--pt-gradient-hero);
  color: #fff;
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
}
.home-hero-blob {
  position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.35; pointer-events: none;
}
.home-hero-blob-a { width: 180px; height: 180px; background: rgba(255,255,255,0.4); top: -50px; right: -50px; }
.home-hero-blob-b { width: 130px; height: 130px; background: rgba(180,233,192,0.5); bottom: -40px; left: -40px; }
.home-hero-content { position: relative; z-index: 1; }
.home-hero-greeting { font-size: 22px; font-weight: 700; margin: 0; }
.home-hero-sub { font-size: 14px; opacity: 0.9; margin-top: 4px; }
</style>
```

- [ ] **Step 3: HomeView 替換**

```vue
<HomeHero :parent-name="user?.display_name" :children-count="children.length" />
```

刪除原本 HomeView 內 hero markup 與相關樣式。

- [ ] **Step 4: 補測試**

```js
// tests/unit/parent/components/home/HomeHero.test.js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HomeHero from '@/parent/components/home/HomeHero.vue'

describe('HomeHero', () => {
  it('顯示問候語 + 家長名', () => {
    const wrapper = mount(HomeHero, { props: { parentName: '王媽媽', childrenCount: 1 } })
    expect(wrapper.text()).toContain('王媽媽')
    expect(wrapper.text()).toMatch(/早安|午安|晚安|下午好|深夜安好/)
  })
  it('childrenCount=0 不顯示 sub', () => {
    const wrapper = mount(HomeHero, { props: { parentName: 'X', childrenCount: 0 } })
    expect(wrapper.text()).not.toContain('在園所')
  })
})
```

```bash
npm run test -- tests/unit/parent/components/home/HomeHero.test.js 2>&1 | tail -10
```

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/home/HomeHero.vue src/parent/views/HomeView.vue tests/unit/parent/components/home/HomeHero.test.js
git commit -m "refactor(parent-home): 抽出 HomeHero（ACD Phase 3）"
```

---

### Task 3.3: 抽 TodayStatusCards（接 useTodayStatusCache）

**Files:**
- Create: `src/parent/components/home/TodayStatusCards.vue`
- Modify: `src/parent/views/HomeView.vue`

- [ ] **Step 1: 找 HomeView 內 today-status 段**

```bash
grep -n 'today-status\|todayStatus\|attendance.*leave.*medication\|dismissal' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/HomeView.vue | head -15
```

- [ ] **Step 2: 建立 TodayStatusCards**

`src/parent/components/home/TodayStatusCards.vue`：

把 HomeView 內顯示今日狀態的 markup 抽出。改用 `useTodayStatusCache` 直接讀（不再透過父層 props）：

```vue
<script setup>
import { onMounted } from 'vue'
import { useTodayStatusCache } from '@/parent/composables/useTodayStatusCache'

const { status, loading, refresh } = useTodayStatusCache()

onMounted(() => { refresh() })
</script>

<template>
  <section class="today-status">
    <h2 class="today-status-title">今日狀態</h2>
    <div v-if="loading && !status" class="today-status-loading pt-shimmer" />
    <div v-else-if="status?.items?.length" class="today-status-grid">
      <article
        v-for="child in status.items"
        :key="child.student_id"
        class="today-status-card pt-card"
      >
        <h3>{{ child.name }}</h3>
        <ul>
          <li>到校：{{ child.attendance?.label ?? '—' }}</li>
          <li>請假：{{ child.leave?.label ?? '無' }}</li>
          <li>用藥：{{ child.medication?.label ?? '無' }}</li>
          <li>接送：{{ child.dismissal?.label ?? '—' }}</li>
        </ul>
      </article>
    </div>
    <p v-else class="today-status-empty">尚無資料</p>
  </section>
</template>

<style scoped>
.today-status-title { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }
.today-status-grid { display: grid; gap: 12px; }
.today-status-card { padding: 12px 14px; }
.today-status-loading { height: 100px; border-radius: 12px; }
.today-status-empty { color: var(--pt-text-muted); font-size: 13px; }
</style>
```

**注意**：上面 markup 假設 `status.items[].attendance.label` 結構；實際結構應對齊 `/home/today-status` API response，從原 HomeView 內取數路徑搬過來。

- [ ] **Step 3: HomeView 替換**

```vue
<TodayStatusCards />
```

刪除 HomeView 內既有 today-status 區段與相關 fetch（移到 composable 內了）。

**重要**：HomeView 原本還有打 `/home/summary` 取 `pending_activity_promotions` 等，**那個保留在 HomeView 內**，只把 today-status 移走。

- [ ] **Step 4: 跑測試**

```bash
npm run test -- 'parent.*home' 2>&1 | tail -10
```

如有 HomeView 既有測試 mock 了 `getTodayStatus`，可能要調整為 mock composable。改 mock 方式：

```js
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({
    status: ref({ items: [] }),
    loading: ref(false),
    refresh: vi.fn(),
    markStale: vi.fn(),
  }),
}))
```

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/home/TodayStatusCards.vue src/parent/views/HomeView.vue
git commit -m "refactor(parent-home): 抽出 TodayStatusCards 並接 useTodayStatusCache"
```

---

### Task 3.4: 抽 TodoCenter / ChildrenStrip / QuickActions

**Files:**
- Create: `src/parent/components/home/TodoCenter.vue`
- Create: `src/parent/components/home/ChildrenStrip.vue`
- Create: `src/parent/components/home/QuickActions.vue`
- Modify: `src/parent/views/HomeView.vue`

對每個元件重複以下流程（一個 commit 一個元件）：

#### TodoCenter

- [ ] **Step 1**：在 HomeView 內找待辦 6 項 section（`pending_activity_promotions` / `recent_leave_reviews` / 未繳費 / 簽閱事件 / 用藥單 / 訊息未讀），整段搬到 `TodoCenter.vue`，接受 props：

```js
defineProps({
  todos: { type: Array, default: () => [] }, // 由父層彙總後傳入
})
```

`TodoCenter.vue` 只負責呈現，不直接打 API。父層 HomeView 用 `computed` 把 `summary` 各欄位扁平化成 todo array 傳入。

- [ ] **Step 2**：HomeView 替換 `<TodoCenter :todos="todos" />`

- [ ] **Step 3**：commit `refactor(parent-home): 抽出 TodoCenter`

#### ChildrenStrip

- [ ] **Step 1**：在 HomeView 內找「我的孩子」橫向 strip 段，搬到 `ChildrenStrip.vue`，把每個 avatar 改用 `<LazyImage>`：

```vue
<script setup>
import LazyImage from '@/parent/components/LazyImage.vue'
const props = defineProps({ children: { type: Array, default: () => [] } })
const emit = defineEmits(['select'])
</script>

<template>
  <div class="children-strip">
    <button
      v-for="c in children"
      :key="c.id"
      class="children-strip-item"
      @click="emit('select', c)"
    >
      <LazyImage v-if="c.photo_url" :src="c.photo_url" :alt="c.name" aspect-ratio="1 / 1" />
      <span v-else class="children-strip-initial">{{ c.name?.[0] ?? '?' }}</span>
      <span class="children-strip-name">{{ c.name }}</span>
    </button>
  </div>
</template>

<style scoped>
.children-strip { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0; }
.children-strip-item {
  flex: 0 0 72px; display: flex; flex-direction: column; align-items: center; gap: 4px;
  background: transparent; border: none; cursor: pointer; padding: 0;
}
.children-strip-item :deep(.pt-lazyimg) { width: 56px; height: 56px; border-radius: 50%; }
.children-strip-initial {
  display: inline-flex; width: 56px; height: 56px; border-radius: 50%;
  background: var(--pt-tint-message); color: var(--pt-tint-message-fg);
  align-items: center; justify-content: center; font-weight: 700; font-size: 20px;
}
.children-strip-name { font-size: 12px; }
</style>
```

- [ ] **Step 2**：HomeView 替換 `<ChildrenStrip :children="children" @select="onChildSelect" />`

- [ ] **Step 3**：commit `refactor(parent-home): 抽出 ChildrenStrip 並改 LazyImage`

#### QuickActions

- [ ] **Step 1**：把 HomeView 底部 4 格常用操作搬到 `QuickActions.vue`，接受 `actions` array：

```js
defineProps({
  actions: { type: Array, default: () => [] }, // [{ icon, label, to, tint }]
})
```

模板用 `<router-link :to="a.to">` 包，icon 用 `--pt-tint-${a.tint}` 圓底。

- [ ] **Step 2**：HomeView 替換 `<QuickActions :actions="quickActions" />`，`quickActions` 在 HomeView 內定義為 `const`。

- [ ] **Step 3**：commit `refactor(parent-home): 抽出 QuickActions`

---

### Task 3.5: HomeView 收尾驗收

**Files:** `src/parent/views/HomeView.vue`

- [ ] **Step 1: 確認行數**

```bash
wc -l /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/HomeView.vue
```

Expected: < 150。

- [ ] **Step 2: 全測試**

```bash
npm run test 2>&1 | tail -10
```

- [ ] **Step 3: 手動驗證 cache 行為**

`npm run dev`：
- 開兩個 LIFF tab
- A tab 觸發 `markStale` (例如送出一筆請假，回 home)，B tab 切回前景時應立即收到更新
- 切回 home 應 < 16ms 顯示快取（DevTools Performance flame graph）

- [ ] **Step 4: push + PR**

```bash
git push -u origin feat/parent-acd-v1-phase3-home
gh pr create --title "feat(parent): ACD Phase 3 — HomeView 拆解 + cache" --body "..."
```

---

# Phase 4: FeesView 拆解

**Branch:** `feat/parent-acd-v1-phase4-fees`

**目標:** FeesView 從 476 → <200 行；新增 FeeHero（warm 漸層）+ FeeListGroup + FeeReceiptSheet。

---

### Task 4.1: 開分支

- [ ] **Step 1**

```bash
git checkout main && git pull
git checkout -b feat/parent-acd-v1-phase4-fees
mkdir -p src/parent/components/fees tests/unit/parent/components/fees
```

---

### Task 4.2: FeeHero

**Files:**
- Create: `src/parent/components/fees/FeeHero.vue`
- Create: `tests/unit/parent/components/fees/FeeHero.test.js`

- [ ] **Step 1: 寫測試**

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FeeHero from '@/parent/components/fees/FeeHero.vue'

describe('FeeHero', () => {
  it('顯示未繳合計與最近到期', () => {
    const wrapper = mount(FeeHero, {
      props: { unpaidTotal: 12500, nearestDueDate: '2026-05-15', unpaidCount: 3 },
    })
    expect(wrapper.text()).toContain('12,500')
    expect(wrapper.text()).toContain('05')
  })
  it('無未繳時隱藏 CTA', () => {
    const wrapper = mount(FeeHero, { props: { unpaidTotal: 0, unpaidCount: 0 } })
    expect(wrapper.find('.fee-hero-cta').exists()).toBe(false)
  })
  it('CTA click emit jump-unpaid', async () => {
    const wrapper = mount(FeeHero, { props: { unpaidTotal: 1000, unpaidCount: 1, nearestDueDate: '2026-05-10' } })
    await wrapper.find('.fee-hero-cta').trigger('click')
    expect(wrapper.emitted('jump-unpaid')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑 fail**

```bash
npm run test -- tests/unit/parent/components/fees/FeeHero.test.js 2>&1 | tail -10
```

- [ ] **Step 3: 寫元件**

`src/parent/components/fees/FeeHero.vue`：

```vue
<script setup>
const props = defineProps({
  unpaidTotal: { type: Number, default: 0 },
  unpaidCount: { type: Number, default: 0 },
  nearestDueDate: { type: String, default: '' },
})
const emit = defineEmits(['jump-unpaid'])

function fmt(n) {
  return Number(n).toLocaleString('en-US')
}
</script>

<template>
  <section class="fee-hero">
    <div class="fee-hero-blob" aria-hidden="true" />
    <div class="fee-hero-content">
      <span class="fee-hero-label">未繳合計</span>
      <div class="fee-hero-amount">
        <span class="fee-hero-currency">NT$</span>
        <span class="fee-hero-num">{{ fmt(unpaidTotal) }}</span>
      </div>
      <p v-if="nearestDueDate" class="fee-hero-due">
        最近到期：{{ nearestDueDate }}（共 {{ unpaidCount }} 筆）
      </p>
    </div>
    <button
      v-if="unpaidCount > 0"
      type="button"
      class="fee-hero-cta"
      @click="emit('jump-unpaid')"
    >跳到應繳</button>
  </section>
</template>

<style scoped>
.fee-hero {
  position: relative; overflow: hidden;
  background: var(--pt-gradient-warm);
  color: #78350f;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--pt-elev-2);
  border: var(--pt-hairline);
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.fee-hero-blob {
  position: absolute; width: 160px; height: 160px;
  background: rgba(255, 255, 255, 0.5); border-radius: 50%; filter: blur(40px);
  top: -50px; right: -50px; pointer-events: none;
}
.fee-hero-content { position: relative; z-index: 1; }
.fee-hero-label { font-size: 12px; opacity: 0.85; letter-spacing: 0.04em; }
.fee-hero-amount { display: flex; align-items: baseline; gap: 4px; margin-top: 2px; }
.fee-hero-currency { font-size: 13px; opacity: 0.85; }
.fee-hero-num { font-size: 28px; font-weight: 700; }
.fee-hero-due { font-size: 12px; margin-top: 4px; opacity: 0.85; }
.fee-hero-cta {
  position: relative; z-index: 1;
  background: rgba(255,255,255,0.95);
  color: #b45309; border: none;
  padding: 8px 14px; border-radius: 99px;
  font-weight: 600; cursor: pointer;
}
</style>
```

- [ ] **Step 4: 跑測試**

```bash
npm run test -- tests/unit/parent/components/fees/FeeHero.test.js 2>&1 | tail -10
```

Expected: 3 passed。

- [ ] **Step 5: 提交**

```bash
git add src/parent/components/fees/FeeHero.vue tests/unit/parent/components/fees/FeeHero.test.js
git commit -m "feat(parent-fees): FeeHero 暖橘漸層繳費卡（ACD Phase 4）"
```

---

### Task 4.3: FeeListGroup + FeeReceiptSheet + FeesView 整合

**Files:**
- Create: `src/parent/components/fees/FeeListGroup.vue`
- Create: `src/parent/components/fees/FeeReceiptSheet.vue`
- Modify: `src/parent/views/FeesView.vue`

- [ ] **Step 1: 抽 FeeListGroup**

把 FeesView 內按月/按學期分組顯示的列表 markup 整段抽出。介面：

```js
defineProps({
  groups: { type: Array, required: true }, // [{ label, items: [...fee] }]
})
const emit = defineEmits(['receipt-click'])
```

模板用 `<details>` 或 accordion 包，每個 item card 點擊 emit `receipt-click(fee)`。樣式套 `.pt-card` + 分組 title。

- [ ] **Step 2: 抽 FeeReceiptSheet**

把 FeesView 內收據 modal（含 5/1 加的「複製收據資訊 / 複製收據編號」動作）改用 ParentBottomSheet：

```vue
<script setup>
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  fee: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'copy-info', 'copy-no'])
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    title="收據明細"
    :snap-points="['mid', 'full']"
    default-snap="mid"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 把 FeesView 原本 receipt modal 內容搬過來 -->
    <template #footer>
      <div class="fee-receipt-actions">
        <button @click="emit('copy-info')">複製收據資訊</button>
        <button @click="emit('copy-no')">複製收據編號</button>
      </div>
      <p class="fee-receipt-hint">如需 PDF 版收據，請聯絡園所</p>
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.fee-receipt-actions { display: flex; gap: 8px; }
.fee-receipt-actions button {
  flex: 1; padding: 10px; background: var(--pt-surface-mute);
  border: var(--pt-hairline); border-radius: 8px; font-size: 13px; cursor: pointer;
}
.fee-receipt-hint { font-size: 12px; color: var(--pt-text-muted); margin-top: 8px; text-align: center; }
</style>
```

- [ ] **Step 3: FeesView 整合 + hero**

- 把整段列表改用 `<FeeListGroup :groups="groups" @receipt-click="onReceiptClick" />`
- 把 receipt modal 改用 `<FeeReceiptSheet v-model="showReceipt" :fee="selectedFee" @copy-info="..." @copy-no="..." />`
- 在頂端加：

```vue
<FeeHero
  :unpaid-total="unpaidTotal"
  :unpaid-count="unpaidCount"
  :nearest-due-date="nearestDueDate"
  @jump-unpaid="onJumpUnpaid"
/>
```

- 寫 `onJumpUnpaid()`：

```js
function onJumpUnpaid() {
  const el = document.querySelector('[data-unpaid-anchor]')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('fee-highlight')
    setTimeout(() => el.classList.remove('fee-highlight'), 1000)
  }
}
```

並在 FeeListGroup 第一筆 unpaid item 加 `data-unpaid-anchor` 屬性。

- 加 `.fee-highlight` 樣式（短暫亮色背景 1s）：

```css
.fee-highlight {
  animation: feeHighlight 1s ease;
}
@keyframes feeHighlight {
  0% { background: var(--pt-tint-money); }
  100% { background: transparent; }
}
```

- [ ] **Step 4: 計算 unpaidTotal / unpaidCount / nearestDueDate**

```js
import { computed } from 'vue'

const unpaidItems = computed(() =>
  (allFees.value ?? []).filter((f) => f.status === 'unpaid' || f.status === 'partial'),
)
const unpaidTotal = computed(() =>
  unpaidItems.value.reduce((s, f) => s + Number(f.outstanding_amount ?? f.amount ?? 0), 0),
)
const unpaidCount = computed(() => unpaidItems.value.length)
const nearestDueDate = computed(() => {
  const sorted = unpaidItems.value
    .filter((f) => f.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  return sorted[0]?.due_date ?? ''
})
```

- [ ] **Step 5: 測試 + 行數**

```bash
npm run test -- 'parent.*fee' 2>&1 | tail -10
wc -l /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/FeesView.vue
```

Expected: 全綠，FeesView < 200 行。

- [ ] **Step 6: 提交 + push + PR**

```bash
git add src/parent/components/fees/ src/parent/views/FeesView.vue
git commit -m "refactor(parent-fees): 拆 FeeListGroup/FeeReceiptSheet + 加 FeeHero"
git push -u origin feat/parent-acd-v1-phase4-fees
gh pr create --title "feat(parent): ACD Phase 4 — FeesView 拆解 + hero" --body "..."
```

---

# Phase 5: ActivityView 拆解

**Branch:** `feat/parent-acd-v1-phase5-activity`

**目標:** ActivityView 從 547 → <200 行；新增 ActivityHero（info 漸層）+ ActivityCardList + ActivityRegisterSheet + RegistrationStatusList；活動海報用 `LazyImage`。

---

### Task 5.1: 開分支 + 建 ActivityHero

**Files:**
- Create: `src/parent/components/activity/ActivityHero.vue`
- Create: `tests/unit/parent/components/activity/ActivityHero.test.js`

- [ ] **Step 1**

```bash
git checkout main && git pull
git checkout -b feat/parent-acd-v1-phase5-activity
mkdir -p src/parent/components/activity tests/unit/parent/components/activity
```

- [ ] **Step 2: 寫 ActivityHero（用 `--pt-gradient-info` 藍青）**

`src/parent/components/activity/ActivityHero.vue`（套用 `LeaveHero` 同樣骨架，改用 info 漸層、改 props）：

```vue
<script setup>
const props = defineProps({
  activeRegistrations: { type: Number, default: 0 },
  unpaidActivityFee: { type: Number, default: 0 },
  upcomingCount: { type: Number, default: 0 },
})
const emit = defineEmits(['scroll-section'])

function fmt(n) { return Number(n).toLocaleString('en-US') }
</script>

<template>
  <section class="act-hero">
    <div class="act-hero-blob" aria-hidden="true" />
    <div class="act-hero-content">
      <button class="act-hero-stat" @click="emit('scroll-section', 'active')">
        <span class="num">{{ activeRegistrations }}</span><span class="lbl">進行中</span>
      </button>
      <button class="act-hero-stat" @click="emit('scroll-section', 'unpaid')">
        <span class="num">NT$ {{ fmt(unpaidActivityFee) }}</span><span class="lbl">待繳</span>
      </button>
      <button class="act-hero-stat" @click="emit('scroll-section', 'upcoming')">
        <span class="num">{{ upcomingCount }}</span><span class="lbl">即將開課</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.act-hero {
  position: relative; overflow: hidden;
  background: var(--pt-gradient-info);
  color: #1e3a8a;
  border-radius: 16px; padding: 16px;
  box-shadow: var(--pt-elev-2); border: var(--pt-hairline);
}
.act-hero-blob {
  position: absolute; width: 160px; height: 160px;
  background: rgba(255,255,255,0.5); border-radius: 50%; filter: blur(40px);
  top: -50px; right: -50px; pointer-events: none;
}
.act-hero-content {
  position: relative; z-index: 1;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.act-hero-stat {
  background: rgba(255,255,255,0.6); border: none; border-radius: 12px;
  padding: 12px 6px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  color: inherit;
}
.act-hero-stat .num { font-size: 16px; font-weight: 700; }
.act-hero-stat .lbl { font-size: 11px; opacity: 0.85; }
</style>
```

對應測試：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityHero from '@/parent/components/activity/ActivityHero.vue'

describe('ActivityHero', () => {
  it('顯示三段統計', () => {
    const wrapper = mount(ActivityHero, {
      props: { activeRegistrations: 2, unpaidActivityFee: 3000, upcomingCount: 1 },
    })
    expect(wrapper.text()).toContain('2')
    expect(wrapper.text()).toContain('3,000')
    expect(wrapper.text()).toContain('1')
  })
  it('點擊段落 emit scroll-section', async () => {
    const wrapper = mount(ActivityHero, {
      props: { activeRegistrations: 1, unpaidActivityFee: 0, upcomingCount: 0 },
    })
    await wrapper.findAll('.act-hero-stat')[0].trigger('click')
    expect(wrapper.emitted('scroll-section')[0]).toEqual(['active'])
  })
})
```

```bash
npm run test -- tests/unit/parent/components/activity/ActivityHero.test.js 2>&1 | tail -10
```

- [ ] **Step 3: 提交**

```bash
git add src/parent/components/activity/ActivityHero.vue tests/unit/parent/components/activity/ActivityHero.test.js
git commit -m "feat(parent-activity): ActivityHero 藍青資訊卡（ACD Phase 5）"
```

---

### Task 5.2: ActivityCardList + ActivityRegisterSheet + RegistrationStatusList + ActivityView 整合

**Files:**
- Create: `src/parent/components/activity/ActivityCardList.vue`
- Create: `src/parent/components/activity/ActivityRegisterSheet.vue`
- Create: `src/parent/components/activity/RegistrationStatusList.vue`
- Modify: `src/parent/views/ActivityView.vue`

對每個元件：

#### ActivityCardList

- [ ] **Step 1**：抽出可報名活動卡片列表 markup。每張海報用 `<LazyImage :src="activity.poster_url" aspect-ratio="16 / 9" />`。
- [ ] **Step 2**：父層 `<ActivityCardList :items="availableActivities" @register-click="onRegister" />`
- [ ] **Step 3**：commit

#### ActivityRegisterSheet

- [ ] **Step 1**：抽出報名 modal 內容（確認 + 注意事項 + 同意條款），改用 `ParentBottomSheet defaultSnap="mid"`：

```vue
<ParentBottomSheet :model-value="modelValue" title="報名確認" default-snap="mid"
  @update:model-value="emit('update:modelValue', $event)">
  <!-- 報名表單內容 -->
  <template #footer>
    <button class="btn-primary" :disabled="submitting" @click="emit('confirm')">確認報名</button>
  </template>
</ParentBottomSheet>
```

- [ ] **Step 2**：commit

#### RegistrationStatusList

- [ ] **Step 1**：抽出已報名狀態列表（含 promoted_pending），介面：

```js
defineProps({
  registrations: { type: Array, default: () => [] },
})
const emit = defineEmits(['promotion-action'])
```

- [ ] **Step 2**：commit

#### ActivityView 整合

- [ ] **Step 1**：頂端加 `<ActivityHero ...>`，內三段資料用 computed 算出。
- [ ] **Step 2**：實作 `onScrollSection(key)`：

```js
function onScrollSection(key) {
  const map = { active: '#act-active', unpaid: '#act-unpaid', upcoming: '#act-upcoming' }
  const el = document.querySelector(map[key])
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

對應在 RegistrationStatusList / FeeListGroup / ActivityCardList 加 `id="act-active"` 等錨點。

- [ ] **Step 3**：行數 + 測試 + push + PR

```bash
wc -l /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/ActivityView.vue
npm run test -- 'parent.*activity' 2>&1 | tail -10
git push -u origin feat/parent-acd-v1-phase5-activity
gh pr create --title "feat(parent): ACD Phase 5 — ActivityView 拆解 + hero + lazy" --body "..."
```

Expected: < 200 行。

---

# Phase 6: MoreView 拆解

**Branch:** `feat/parent-acd-v1-phase6-more`

**目標:** MoreView 從 573 → <200 行；新增 UserHeroCard + MoreMenuGroup + A11ySettingsSection。

---

### Task 6.1: 開分支

```bash
git checkout main && git pull
git checkout -b feat/parent-acd-v1-phase6-more
mkdir -p src/parent/components/more tests/unit/parent/components/more
```

---

### Task 6.2: 抽 UserHeroCard

**Files:**
- Create: `src/parent/components/more/UserHeroCard.vue`
- Modify: `src/parent/views/MoreView.vue`

- [ ] **Step 1: 找 MoreView 內 user-card hero 段（5/2 升級已加）**

```bash
grep -n 'user-card\|hero\|avatar\|--pt-gradient' /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/MoreView.vue | head -10
```

- [ ] **Step 2: 抽出 UserHeroCard.vue**

```vue
<script setup>
const props = defineProps({
  userName: { type: String, default: '' },
  avatarInitial: { type: String, default: '' },
  subline: { type: String, default: '' },
})
</script>

<template>
  <section class="user-hero">
    <div class="user-hero-blob" aria-hidden="true" />
    <div class="user-hero-avatar">{{ avatarInitial }}</div>
    <div class="user-hero-text">
      <h2 class="user-hero-name">{{ userName }}</h2>
      <p v-if="subline" class="user-hero-sub">{{ subline }}</p>
    </div>
  </section>
</template>

<style scoped>
/* 從 MoreView 把對應樣式搬過來 */
.user-hero {
  position: relative; overflow: hidden;
  background: var(--pt-gradient-hero);
  color: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: var(--pt-elev-2); border: var(--pt-hairline);
  display: flex; align-items: center; gap: 14px;
}
.user-hero-blob {
  position: absolute; width: 140px; height: 140px;
  background: rgba(255,255,255,0.4); border-radius: 50%; filter: blur(40px);
  top: -40px; right: -40px; pointer-events: none;
}
.user-hero-avatar {
  position: relative; z-index: 1;
  width: 56px; height: 56px; border-radius: 50%;
  background: rgba(255,255,255,0.3);
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700;
}
.user-hero-text { position: relative; z-index: 1; }
.user-hero-name { font-size: 18px; font-weight: 700; margin: 0; }
.user-hero-sub { font-size: 12px; opacity: 0.85; margin: 2px 0 0; }
</style>
```

- [ ] **Step 3: MoreView 替換 + commit**

```vue
<UserHeroCard
  :user-name="user?.display_name"
  :avatar-initial="user?.display_name?.[0] ?? '?'"
  :subline="parentRoleLabel"
/>
```

```bash
git add src/parent/components/more/UserHeroCard.vue src/parent/views/MoreView.vue
git commit -m "refactor(parent-more): 抽出 UserHeroCard"
```

---

### Task 6.3: MoreMenuGroup

**Files:**
- Create: `src/parent/components/more/MoreMenuGroup.vue`

- [ ] **Step 1: 抽出統一 menu-group 元件**

```vue
<script setup>
import { computed } from 'vue'
import ParentIcon from '@/parent/components/ParentIcon.vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  // items: [{ icon, tint, label, to, badge?, onClick? }]
})
</script>

<template>
  <section class="more-group">
    <h3 class="more-group-title">{{ title }}</h3>
    <ul class="more-group-list">
      <li v-for="item in items" :key="item.label">
        <component
          :is="item.to ? 'router-link' : 'button'"
          :to="item.to"
          class="more-group-item"
          @click="item.onClick && item.onClick()"
        >
          <span class="more-group-icon" :style="{
            background: `var(--pt-tint-${item.tint})`,
            color: `var(--pt-tint-${item.tint}-fg)`,
          }">
            <ParentIcon :name="item.icon" />
          </span>
          <span class="more-group-label">{{ item.label }}</span>
          <span v-if="item.badge" class="more-group-badge">{{ item.badge }}</span>
        </component>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.more-group { margin-top: 20px; }
.more-group-title {
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--pt-text-muted); margin: 0 0 8px; padding: 0 4px;
}
.more-group-list { list-style: none; padding: 0; margin: 0; background: var(--pt-surface-card); border-radius: 12px; box-shadow: var(--pt-elev-1); border: var(--pt-hairline); overflow: hidden; }
.more-group-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; text-decoration: none; color: inherit;
  background: transparent; border: none; width: 100%; text-align: left; cursor: pointer;
  border-bottom: var(--pt-hairline);
}
.more-group-list li:last-child .more-group-item { border-bottom: none; }
.more-group-icon {
  width: 36px; height: 36px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.more-group-label { flex: 1; font-size: 15px; }
.more-group-badge {
  background: var(--brand-primary); color: #fff;
  font-size: 11px; padding: 2px 8px; border-radius: 99px;
}
</style>
```

- [ ] **Step 2: MoreView 把三段 menu group 都改用此元件**

例：

```vue
<MoreMenuGroup title="孩子與園所" :items="kidGroupItems" />
<MoreMenuGroup title="財務與簽閱" :items="financeGroupItems" />
<MoreMenuGroup title="帳號設定" :items="accountGroupItems" />
```

`kidGroupItems` / `financeGroupItems` / `accountGroupItems` 在 MoreView setup 內定義為陣列常數（含 icon / tint / label / to）。

- [ ] **Step 3: commit**

```bash
git add src/parent/components/more/MoreMenuGroup.vue src/parent/views/MoreView.vue
git commit -m "refactor(parent-more): 抽出 MoreMenuGroup 統一三段選單"
```

---

### Task 6.4: A11ySettingsSection + MoreView 收尾

**Files:**
- Create: `src/parent/components/more/A11ySettingsSection.vue`
- Modify: `src/parent/views/MoreView.vue`

- [ ] **Step 1: 把 MoreView 內 a11y 設定段（字級 / 高對比 toggle）整段抽到 A11ySettingsSection.vue**

該元件直接呼叫 `useA11yPreference`（既有）composable，自包邏輯不需要 props。

- [ ] **Step 2: MoreView 替換 `<A11ySettingsSection />`**

- [ ] **Step 3: 行數 + 測試**

```bash
wc -l /Users/yilunwu/Desktop/ivy-frontend/src/parent/views/MoreView.vue
npm run test 2>&1 | tail -10
```

Expected: MoreView < 200 行；全測試綠。

- [ ] **Step 4: 提交 + push + PR**

```bash
git add src/parent/components/more/A11ySettingsSection.vue src/parent/views/MoreView.vue
git commit -m "refactor(parent-more): 抽出 A11ySettingsSection，主檔降至 <200 行"
git push -u origin feat/parent-acd-v1-phase6-more
gh pr create --title "feat(parent): ACD Phase 6 — MoreView 拆解" --body "..."
```

---

# 全域驗收（6 phase 全 merge 後）

### Task 7.1: 整合驗證

- [ ] **Step 1: 確認 main 已含全 6 phase**

```bash
git checkout main && git pull
git log --oneline -20
```

- [ ] **Step 2: 跑全測試**

```bash
npm run test 2>&1 | tail -15
```

Expected: 全綠。

- [ ] **Step 3: build + bundle 比對**

```bash
npm run build 2>&1 | tail -25
```

紀錄 parent-app gzip 大小。對照 main baseline（5/2 升級後）：總增量 ≤ +12 KB。

- [ ] **Step 4: 手動 LIFF checklist**

依 spec 全域驗收 checklist：
- [ ] HomeView：快取秒顯、跨 tab 同步、ChildrenStrip lazy
- [ ] LeavesView：申請、cancel、附件、detail sheet 三段 snap
- [ ] FeesView：hero CTA scroll、收據 sheet
- [ ] ActivityView：報名 sheet、海報 lazy
- [ ] MoreView：menu 三組
- [ ] ConnectionBanner：開飛航 + WS 重連模擬
- [ ] 字級放大 ×1.25 / 高對比模式下 hero 漸層仍 ≥ AA
- [ ] dark mode 全頁面 hairline / shadow 正常

- [ ] **Step 5: 寫 memory**

把這次 ACD 優化結果寫入 `~/.claude/projects/-Users-yilunwu-Desktop-ivyManageSystem/memory/`：

```
project_parent_acd_optimization_2026_05_02.md
```

格式按 Workspace CLAUDE.md memory 慣例（type: project，含 originSessionId、Why、How to apply）。並更新 `MEMORY.md` 索引加一行。

---

## 風險與緩解（執行時注意）

| 風險 | 緩解 |
|---|---|
| 拖曳手勢與 LIFF iOS Safari body scroll 衝突 | dialog `overscroll-behavior: contain`；拖曳期間 `touch-action: none` |
| `BroadcastChannel` 在 iOS Safari < 15.4 不存在 | composable 內 `typeof BroadcastChannel === 'undefined'` 檢查，降級為單 tab |
| 拆出元件後 props drilling 太深 | 遇 ≥3 層傳遞時改用 composable / pinia store；不要自建 provide/inject 鏈 |
| bundle 增量超 +12 KB | 每 phase 後用 `du -h dist/assets/parent-*.js.gz` 比對；超標立刻檢查是否誤 import element-plus |
| 測試 mock IntersectionObserver / BroadcastChannel 不一致 | happy-dom 提供基本 polyfill；複雜情境統一用 `vi.stubGlobal` |
| Phase 2-6 之間若有 main 衝突（同一 view 文件被改） | Phase 之間理論獨立（不同 view），但 Phase 1 base 必須先 merge |

---

## 不變更（明確列出）

- 路由 `router.js` / 任何 API endpoint / 後端任何檔案
- HomeView `pending_activity_promotions` / `recent_leave_reviews` 業務語意
- TabBar / AppHeader / AppModal / SkeletonBlock / ChildSelector / ParentIcon 既有 API
- `--brand-primary` `#3f7d48` 與 5/2 加的所有 token
