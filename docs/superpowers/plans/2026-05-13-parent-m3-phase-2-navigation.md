# 家長端 Material 3 重寫 P2：導航元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Material 3 導航元件取代家長端共用 layout 中的 header 與 tab bar：新增 `M3TopAppBar`（替換 `AppHeader.vue`）、`M3NavigationBar`（替換 `ParentLayout.vue` 內 `.tab-bar`）、`M3FAB`（預留 P4 使用）；P2 結束時整 app 的頂部與底部視覺已切到 Material 3。

**Architecture:** P2 是首個改 view 視覺的 phase（spec MID 風險）。新元件放 `src/parent/components/m3/`；`ParentLayout.vue` 改為使用 M3 元件。保留全部既有 API：`route.meta.title / showBack / hideTabBar / tab`、badge 邏輯（公告 + 訊息未讀數）、scroll-to-top tap 行為。`AppHeader.vue` 不刪（避免動到 `MessageThreadView` 既有註解 + 保留 reference），改在 P5 統一清。M3FAB 元件先建好但 P2 不在任何 view 使用（P4 才上場）。

**Tech Stack:** Vue 3 `<script setup>` + Vue Router 4 + Vitest + @vue/test-utils。沿用 P1 已建的 M3Icon / M3Card etc。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §5 與 §10。

**Branch:** 從 `feat/parent-m3-phase-1-frontend` head 切 `feat/parent-m3-phase-2-frontend`。

---

## File Structure

```
src/parent/components/m3/
├── M3TopAppBar.vue         (Task 1)
├── M3NavigationBar.vue     (Task 2)
├── M3FAB.vue               (Task 3)
└── __tests__/
    ├── M3TopAppBar.spec.js
    ├── M3NavigationBar.spec.js
    └── M3FAB.spec.js

src/parent/layouts/
└── ParentLayout.vue        (Task 4 — 修改：用新元件，但保留 unread badge 邏輯)

src/parent/components/m3/index.js  (Task 5 — 加 export)
```

**不動的檔案**：
- `src/parent/components/AppHeader.vue`（保留 deprecated，P5 才刪）
- `src/parent/components/ParentIcon.vue`（同上）
- `src/parent/router.js`（route.meta 不動）

---

### Task 0: 切 P2 分支

- [ ] **Step 1: 從 P1 head 切分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"  # HEAD = 7d9ed134 P1 barrel
git checkout -b feat/parent-m3-phase-2-frontend
```

---

### Task 1: M3TopAppBar

**Files:**
- Create: `src/parent/components/m3/M3TopAppBar.vue`
- Create: `src/parent/components/m3/__tests__/M3TopAppBar.spec.js`

API：
- props: `variant` ('center-aligned' | 'small' | 'large', default 'small')
  - center-aligned: 64px 高，title 置中（首頁用）
  - small: 64px 高，title 左對齊 + leading 圖示（detail page 用）
  - large: 152px 展開高度（暫時不做 scroll-collapse；P5 才補）
- props: `title` (string, default '') — 標題
- props: `showBack` (boolean, default false) — 顯示左側返回鍵
- props: `onBack` (function, default null) — 自訂返回行為
- slots: `actions` = 右側 trailing 區域（M3IconButton 等）
- slots: `leading` = 自訂左側內容（覆蓋預設 back 按鈕）

樣式：
- 高 64px (small/center-aligned)、152px (large)
- bg `--m3-surface`，scroll 後上方 elev-2（暫時靜態，不做 scroll detect — P5 補）
- Title: title-large class (22px / 400)
- safe-area-inset-top padding

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3TopAppBar.spec.js`：

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import M3TopAppBar from '../M3TopAppBar.vue'

describe('M3TopAppBar', () => {
  it('render title', () => {
    const w = mount(M3TopAppBar, { props: { title: '訊息' } })
    expect(w.text()).toContain('訊息')
    expect(w.find('.m3-top-app-bar-title').exists()).toBe(true)
  })

  it('預設 variant = small', () => {
    const w = mount(M3TopAppBar, { props: { title: 'x' } })
    expect(w.classes()).toContain('m3-top-app-bar')
    expect(w.classes()).toContain('m3-top-app-bar-small')
  })

  it.each(['center-aligned', 'small', 'large'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3TopAppBar, { props: { title: 'x', variant } })
      expect(w.classes()).toContain(`m3-top-app-bar-${variant}`)
    },
  )

  it('預設不顯示 back 按鈕', () => {
    const w = mount(M3TopAppBar, { props: { title: 'x' } })
    expect(w.find('.m3-top-app-bar-back').exists()).toBe(false)
  })

  it('showBack=true 顯示 back 按鈕並可點擊觸發 onBack', async () => {
    const onBack = vi.fn()
    const w = mount(M3TopAppBar, {
      props: { title: 'x', showBack: true, onBack },
    })
    const back = w.find('.m3-top-app-bar-back')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('actions slot 渲染在右側', () => {
    const w = mount(M3TopAppBar, {
      props: { title: 'x' },
      slots: { actions: '<button class="custom-action">A</button>' },
    })
    expect(w.find('.custom-action').exists()).toBe(true)
    expect(w.find('.m3-top-app-bar-actions').exists()).toBe(true)
  })

  it('leading slot 覆蓋預設 back 按鈕', () => {
    const w = mount(M3TopAppBar, {
      props: { title: 'x', showBack: true },
      slots: { leading: '<span class="custom-leading">★</span>' },
    })
    expect(w.find('.custom-leading').exists()).toBe(true)
    expect(w.find('.m3-top-app-bar-back').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3TopAppBar 2>&1 | tail -15
```

Expected: FAIL `Cannot find module '../M3TopAppBar.vue'`。

- [ ] **Step 3: 實作 M3TopAppBar.vue**

寫入 `src/parent/components/m3/M3TopAppBar.vue`：

```vue
<script setup>
import { computed, useSlots } from 'vue'
import M3IconButton from './M3IconButton.vue'

/**
 * Material 3 Top App Bar.
 *
 * Variants:
 *   - center-aligned 首頁，title 置中（64px）
 *   - small (預設)   detail page，title 左對齊（64px）
 *   - large          特殊頁，152px 展開（scroll collapse 留待 P5）
 *
 * Slots:
 *   - leading 自訂左側內容（覆蓋預設 back 按鈕）
 *   - actions 右側 trailing 區域，預期放 M3IconButton
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.2
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'small',
    validator: (v) => ['center-aligned', 'small', 'large'].includes(v),
  },
  title: { type: String, default: '' },
  showBack: { type: Boolean, default: false },
  onBack: { type: Function, default: null },
})

const slots = useSlots()
const hasLeadingSlot = computed(() => !!slots.leading)

const classes = computed(() => ({
  'm3-top-app-bar': true,
  [`m3-top-app-bar-${props.variant}`]: true,
}))

function onBackClick() {
  if (props.onBack) props.onBack()
}
</script>

<template>
  <header :class="classes" role="banner">
    <div class="m3-top-app-bar-leading">
      <slot name="leading">
        <M3IconButton
          v-if="showBack"
          class="m3-top-app-bar-back"
          icon="arrow_back"
          aria-label="返回上一頁"
          @click="onBackClick"
        />
      </slot>
    </div>

    <h1 class="m3-top-app-bar-title m3-title-large">{{ title }}</h1>

    <div class="m3-top-app-bar-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.m3-top-app-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 10);
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  padding: 0 4px;
  padding-top: env(safe-area-inset-top, 0);
  background: var(--m3-surface, #f7fbf3);
  color: var(--m3-on-surface, #181d18);
}

.m3-top-app-bar-small,
.m3-top-app-bar-center-aligned {
  min-height: 64px;
}
.m3-top-app-bar-large {
  min-height: 152px;
  grid-template-rows: 64px auto;
  grid-template-areas:
    "leading title actions"
    "title-expanded title-expanded title-expanded";
}

.m3-top-app-bar-leading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  grid-area: leading;
}
.m3-top-app-bar-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  grid-area: actions;
  padding-right: 4px;
}

.m3-top-app-bar-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  grid-area: title;
}
.m3-top-app-bar-small .m3-top-app-bar-title { text-align: left; }
.m3-top-app-bar-center-aligned .m3-top-app-bar-title { text-align: center; }
.m3-top-app-bar-large .m3-top-app-bar-title {
  grid-area: title-expanded;
  padding: 0 16px 16px;
  font-size: 28px;
  line-height: 36px;
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3TopAppBar 2>&1 | tail -15
```

Expected: 9 tests passed（7 it + 3 it.each - 1 重複的 small 預設 = 9）。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3TopAppBar.vue src/parent/components/m3/__tests__/M3TopAppBar.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3TopAppBar 元件 + Vitest

3 variants (center-aligned/small/large) + showBack + onBack +
leading/actions slots。9 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: M3NavigationBar

**Files:**
- Create: `src/parent/components/m3/M3NavigationBar.vue`
- Create: `src/parent/components/m3/__tests__/M3NavigationBar.spec.js`

API：
- props: `items` (Array, required) — 每項 `{ key, label, icon, path, badge?: number, activeIcon?: string }`
- props: `currentKey` (string, required) — 當前 active tab 的 key
- emits: `select` (key, item) — 點 tab 時觸發
- slots: 無（純資料驅動）

視覺：
- 80px 高（含 safe-area-inset-bottom）
- 4 個 tab 平均分佈
- Active tab: icon 上方有 32×32 active indicator pill (`--m3-secondary-container` bg)
- Active icon 用 filled 變體（M3Icon filled=true）；inactive 用 outline (filled=false)
- Label: `m3-label-medium` (12px / 500)
- Badge: 右上角浮 chip，未讀數 > 99 顯示 "99+"

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3NavigationBar.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3NavigationBar from '../M3NavigationBar.vue'

const ITEMS = [
  { key: 'home', label: '首頁', icon: 'home', path: '/home' },
  { key: 'messages', label: '訊息', icon: 'chat', path: '/messages', badge: 3 },
  { key: 'family', label: '家校', icon: 'school', path: '/family' },
  { key: 'me', label: '我的', icon: 'person', path: '/me' },
]

describe('M3NavigationBar', () => {
  it('render nav role=navigation', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    expect(w.element.tagName).toBe('NAV')
    expect(w.attributes('role')).toBe('navigation')
    expect(w.classes()).toContain('m3-navigation-bar')
  })

  it('每個 item 對應一個 tab', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    expect(w.findAll('.m3-nav-tab')).toHaveLength(4)
  })

  it('current tab 套 is-active class', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'messages' },
    })
    const tabs = w.findAll('.m3-nav-tab')
    expect(tabs[0].classes()).not.toContain('is-active')
    expect(tabs[1].classes()).toContain('is-active')
  })

  it('active tab 的 icon 為 filled 變體', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const homeTab = w.findAll('.m3-nav-tab')[0]
    const style = homeTab.find('.material-symbols-rounded').attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })

  it('inactive tab 的 icon 為 outline 變體', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    const style = messagesTab.find('.material-symbols-rounded').attributes('style') || ''
    expect(style).toContain('"FILL" 0')
  })

  it('label 套 m3-label-medium', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const labels = w.findAll('.m3-nav-tab-label')
    expect(labels[0].classes()).toContain('m3-label-medium')
    expect(labels[0].text()).toBe('首頁')
  })

  it('badge > 0 顯示 chip + 數字', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    expect(messagesTab.find('.m3-nav-tab-badge').exists()).toBe(true)
    expect(messagesTab.find('.m3-nav-tab-badge').text()).toBe('3')
  })

  it('badge > 99 顯示 99+', () => {
    const items = [...ITEMS]
    items[1] = { ...items[1], badge: 120 }
    const w = mount(M3NavigationBar, {
      props: { items, currentKey: 'home' },
    })
    const messagesTab = w.findAll('.m3-nav-tab')[1]
    expect(messagesTab.find('.m3-nav-tab-badge').text()).toBe('99+')
  })

  it('badge 為 0 或 undefined 不顯示', () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    const homeTab = w.findAll('.m3-nav-tab')[0]
    expect(homeTab.find('.m3-nav-tab-badge').exists()).toBe(false)
  })

  it('點 tab 觸發 select 事件帶 key + item', async () => {
    const w = mount(M3NavigationBar, {
      props: { items: ITEMS, currentKey: 'home' },
    })
    await w.findAll('.m3-nav-tab')[2].trigger('click')
    const emitted = w.emitted('select')
    expect(emitted).toHaveLength(1)
    expect(emitted[0][0]).toBe('family')
    expect(emitted[0][1]).toMatchObject({ key: 'family', label: '家校' })
  })

  it('activeIcon 覆寫 active 狀態的 icon name', () => {
    const items = [
      { key: 'a', label: 'A', icon: 'home', activeIcon: 'cottage', path: '/a' },
      { key: 'b', label: 'B', icon: 'chat', path: '/b' },
    ]
    const w = mount(M3NavigationBar, { props: { items, currentKey: 'a' } })
    const activeTab = w.findAll('.m3-nav-tab')[0]
    expect(activeTab.find('.material-symbols-rounded').text()).toBe('cottage')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3NavigationBar 2>&1 | tail -15
```

- [ ] **Step 3: 實作 M3NavigationBar.vue**

寫入 `src/parent/components/m3/M3NavigationBar.vue`：

```vue
<script setup>
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Navigation Bar.
 *
 * 4-tab 底部導航（家長端固定 4 tab，不支援動態 1-3 tab）。
 *
 * Active tab 用 active indicator pill（M3 spec: 32×32 secondary-container bg），
 * icon 切 filled 變體。Inactive 用 outline。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.1
 */
const props = defineProps({
  items: {
    type: Array,
    required: true,
    validator: (arr) =>
      Array.isArray(arr) &&
      arr.every((it) => typeof it.key === 'string' && typeof it.icon === 'string'),
  },
  currentKey: { type: String, required: true },
})

const emit = defineEmits(['select'])

function badgeLabel(badge) {
  if (!badge || badge < 1) return null
  return badge > 99 ? '99+' : String(badge)
}

function iconName(item, isActive) {
  if (isActive && item.activeIcon) return item.activeIcon
  return item.icon
}

function onTabClick(item) {
  emit('select', item.key, item)
}
</script>

<template>
  <nav class="m3-navigation-bar" role="navigation" aria-label="主要功能">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="m3-nav-tab"
      :class="{ 'is-active': item.key === currentKey }"
      :aria-current="item.key === currentKey ? 'page' : null"
      :aria-label="item.label"
      @click="onTabClick(item)"
    >
      <span class="m3-nav-tab-icon-wrap">
        <span class="m3-nav-tab-indicator" aria-hidden="true" />
        <M3Icon
          class="m3-nav-tab-icon"
          :name="iconName(item, item.key === currentKey)"
          :filled="item.key === currentKey"
          :size="24"
          aria-hidden="true"
        />
        <span
          v-if="badgeLabel(item.badge)"
          class="m3-nav-tab-badge"
          :aria-label="`未讀 ${badgeLabel(item.badge)} 則`"
        >{{ badgeLabel(item.badge) }}</span>
      </span>
      <span class="m3-nav-tab-label m3-label-medium">{{ item.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.m3-navigation-bar {
  display: flex;
  width: 100%;
  height: 80px;
  padding-bottom: env(safe-area-inset-bottom, 0);
  background: var(--m3-surface-container, #ebefe8);
  color: var(--m3-on-surface-variant, #424941);
}

.m3-nav-tab {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 100%;
  padding: 12px 0 16px;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.m3-nav-tab-icon-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 32px;
}
.m3-nav-tab-indicator {
  position: absolute;
  inset: 0;
  border-radius: 9999px;
  background: var(--m3-secondary-container, #d3e8d3);
  opacity: 0;
  transition: opacity var(--m3-dur-short-3, 150ms) var(--m3-easing-emphasized-decel, ease);
}
.m3-nav-tab.is-active .m3-nav-tab-indicator { opacity: 1; }

.m3-nav-tab-icon {
  position: relative;
  z-index: 1;
}
.m3-nav-tab.is-active .m3-nav-tab-icon {
  color: var(--m3-on-secondary-container, #0e1f12);
}

.m3-nav-tab-badge {
  position: absolute;
  top: -2px;
  right: 6px;
  z-index: 2;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 9999px;
  background: var(--m3-error, #ba1a1a);
  color: var(--m3-on-error, #ffffff);
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.m3-nav-tab-label {
  color: var(--m3-on-surface-variant, #424941);
}
.m3-nav-tab.is-active .m3-nav-tab-label {
  color: var(--m3-on-surface, #181d18);
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3NavigationBar 2>&1 | tail -15
```

Expected: 11 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3NavigationBar.vue src/parent/components/m3/__tests__/M3NavigationBar.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3NavigationBar 元件 + Vitest

4-tab 底部導航 + active indicator pill + badge (>99 → '99+') +
filled/outline icon 切換 + select 事件。11 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: M3FAB

**Files:**
- Create: `src/parent/components/m3/M3FAB.vue`
- Create: `src/parent/components/m3/__tests__/M3FAB.spec.js`

API：
- props: `icon` (string, required) — Material Symbols ligature
- props: `variant` ('primary' | 'secondary' | 'tertiary' | 'surface', default 'primary')
- props: `size` ('small' | 'regular' | 'large', default 'regular') — 40 / 56 / 96
- props: `extended` (boolean, default false) — 有 label 的延伸 FAB
- props: `label` (string, default '') — extended FAB 的文字（extended=true 必填）
- props: `disabled` (boolean, default false)
- attrs: `aria-label` 必填（icon-only FAB 必須）

樣式：
- regular 56×56、small 40×40、large 96×96
- extended 56 高，寬自適應，padding 16px / 20px
- 圓角 16px (regular)、12px (small)、28px (large)、16px (extended)
- bg primary / secondary / tertiary / surface-container-low
- elev-3 (預設)，hover elev-4

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3FAB.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3FAB from '../M3FAB.vue'

describe('M3FAB', () => {
  it('render icon', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': '新增' },
    })
    expect(w.text()).toContain('add')
    expect(w.classes()).toContain('m3-fab')
  })

  it('預設 variant=primary, size=regular', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).toContain('m3-fab-primary')
    expect(w.classes()).toContain('m3-fab-regular')
  })

  it.each(['primary', 'secondary', 'tertiary', 'surface'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3FAB, {
        props: { icon: 'add', variant },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-fab-${variant}`)
    },
  )

  it.each(['small', 'regular', 'large'])(
    'size=%s 套對應 class',
    (size) => {
      const w = mount(M3FAB, {
        props: { icon: 'add', size },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-fab-${size}`)
    },
  )

  it('extended=true 顯示 label', () => {
    const w = mount(M3FAB, {
      props: { icon: 'edit', extended: true, label: '寫訊息' },
    })
    expect(w.classes()).toContain('is-extended')
    expect(w.find('.m3-fab-label').text()).toBe('寫訊息')
  })

  it('extended=false 不顯示 label', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', label: 'x' },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.classes()).not.toContain('is-extended')
    expect(w.find('.m3-fab-label').exists()).toBe(false)
  })

  it('disabled 套用 attribute + class', () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('click 事件', async () => {
    const w = mount(M3FAB, {
      props: { icon: 'add' },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3FAB, {
      props: { icon: 'add', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3FAB 2>&1 | tail -15
```

- [ ] **Step 3: 實作 M3FAB.vue**

寫入 `src/parent/components/m3/M3FAB.vue`：

```vue
<script setup>
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Floating Action Button.
 *
 * Variants (color):
 *   - primary (預設) / secondary / tertiary / surface
 *
 * Sizes:
 *   - small   40x40   12px radius
 *   - regular 56x56   16px radius (預設)
 *   - large   96x96   28px radius
 *
 * Extended:
 *   - extended=true 時為延伸 FAB（含 label），高 56，寬自適應
 *
 * 必填 aria-label（icon-only FAB accessibility 要求）；
 * extended=true 時 label 同時擔任 accessible name，aria-label 仍建議傳。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §5.3
 */
const props = defineProps({
  icon: { type: String, required: true },
  variant: {
    type: String,
    default: 'primary',
    validator: (v) => ['primary', 'secondary', 'tertiary', 'surface'].includes(v),
  },
  size: {
    type: String,
    default: 'regular',
    validator: (v) => ['small', 'regular', 'large'].includes(v),
  },
  extended: { type: Boolean, default: false },
  label: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})

const classes = computed(() => ({
  'm3-fab': true,
  [`m3-fab-${props.variant}`]: true,
  [`m3-fab-${props.size}`]: true,
  'is-extended': props.extended,
  'is-disabled': props.disabled,
}))

const iconSize = computed(() => {
  if (props.size === 'small') return 20
  if (props.size === 'large') return 36
  return 24
})

const emit = defineEmits(['click'])

function onClick(e) {
  if (props.disabled) return
  emit('click', e)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
    @click="onClick"
  >
    <M3Icon :name="icon" :size="iconSize" aria-hidden="true" />
    <span v-if="extended && label" class="m3-fab-label m3-label-large">{{ label }}</span>
  </button>
</template>

<style scoped>
.m3-fab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border: none;
  cursor: pointer;
  box-shadow: var(--m3-elev-3, 0 4px 8px rgba(0, 0, 0, 0.2));
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}
.m3-fab::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-fab:hover:not(.is-disabled) {
  box-shadow: var(--m3-elev-4, 0 6px 10px rgba(0, 0, 0, 0.2));
}
.m3-fab:hover:not(.is-disabled)::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-fab:focus-visible:not(.is-disabled)::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-fab:active:not(.is-disabled)::before       { opacity: var(--m3-state-pressed, 0.12); }

/* sizes */
.m3-fab-small  { width: 40px; height: 40px; border-radius: 12px; }
.m3-fab-regular{ width: 56px; height: 56px; border-radius: 16px; }
.m3-fab-large  { width: 96px; height: 96px; border-radius: 28px; }
.m3-fab.is-extended {
  width: auto;
  height: 56px;
  padding: 0 16px 0 20px;
  border-radius: 16px;
}

/* variants */
.m3-fab-primary {
  background: var(--m3-primary-container, #98f7be);
  color: var(--m3-on-primary-container, #002111);
}
.m3-fab-secondary {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-fab-tertiary {
  background: var(--m3-tertiary-container, #beeaf8);
  color: var(--m3-on-tertiary-container, #001f27);
}
.m3-fab-surface {
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-primary, #006d3d);
}

.m3-fab-label {
  white-space: nowrap;
}

.m3-fab.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
  box-shadow: none;
}
.m3-fab.is-disabled::before { opacity: 0; }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3FAB 2>&1 | tail -15
```

Expected: 14 tests passed (9 it + 4 + 3 it.each = 16 - 2 overlap = ~14)。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3FAB.vue src/parent/components/m3/__tests__/M3FAB.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3FAB 元件 + Vitest

4 variants (primary/secondary/tertiary/surface) +
3 sizes (small/regular/large) + extended (label) + state layer。
14+ tests 全綠。P2 內不使用，P4 view 需要時上場。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ParentLayout 切換到 M3 導航

**Files:**
- Modify: `src/parent/layouts/ParentLayout.vue`

當前 ParentLayout 用 `AppHeader` + 自寫 `.tab-bar`。改成 `M3TopAppBar` + `M3NavigationBar`，badge unread 邏輯保留。`AppHeader.vue` 不刪。

- [ ] **Step 1: Read 完整 ParentLayout.vue 以理解結構**

```bash
cat src/parent/layouts/ParentLayout.vue | head -130
```

確認以下三個區塊存在：
1. `<script setup>` 內 `unread / unreadMessages / refreshUnread()` 邏輯（API import + onMounted + watch）
2. `<template>` 內 `<AppHeader>` 與 `<nav class="tab-bar">`
3. `<style scoped>` 內 tab-bar 樣式

- [ ] **Step 2: 整檔重寫 ParentLayout.vue**

用 Write tool（整檔覆寫），寫入：

```vue
<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParentAuthStore } from '../stores/parentAuth'
import { getUnreadCount } from '../api/announcements'
import { getMessageUnreadCount } from '../api/messages'
import M3TopAppBar from '../components/m3/M3TopAppBar.vue'
import M3NavigationBar from '../components/m3/M3NavigationBar.vue'
import ConnectionBanner from '../components/ConnectionBanner.vue'

const route = useRoute()
const router = useRouter()
const authStore = useParentAuthStore()

const isPublic = computed(() => route.meta?.public === true)
const hideTabBar = computed(() => route.meta?.hideTabBar === true)
const currentTab = computed(() => route.meta?.tab || '')

/**
 * 點再次點 active tab → scroll-to-top。
 * 條件嚴格：必須「目前路徑等於 tab.path」才觸發；若使用者在深層頁
 * （/messages/123，meta.tab 仍為 'messages'）點 messages tab，仍應
 * 走 router 正常導回 /messages（不阻止預設行為）。
 */
function onTabSelect(key, item) {
  if (route.path === item.path) {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    return
  }
  router.push(item.path)
}

const unread = ref(0)
const unreadMessages = ref(0)

const TABS = computed(() => [
  {
    key: 'home',
    label: '首頁',
    icon: 'home',
    activeIcon: 'home',
    path: '/home',
  },
  {
    key: 'messages',
    label: '訊息',
    icon: 'chat_bubble',
    activeIcon: 'chat_bubble',
    path: '/messages',
    badge: unreadMessages.value,
  },
  {
    key: 'family',
    label: '家校',
    icon: 'school',
    activeIcon: 'school',
    path: '/family',
    badge: unread.value,
  },
  {
    key: 'me',
    label: '我的',
    icon: 'person',
    activeIcon: 'person',
    path: '/me',
  },
])

async function refreshUnread() {
  if (!authStore.isAuthed()) return
  try {
    const [{ data: a }, { data: m }] = await Promise.all([
      getUnreadCount(),
      getMessageUnreadCount(),
    ])
    unread.value = a?.unread_count || 0
    unreadMessages.value = m?.unread_count || 0
  } catch {
    /* ignore */
  }
}

onMounted(refreshUnread)
watch(() => route.fullPath, refreshUnread)

const headerTitle = computed(() => route.meta?.title || '常春藤家長')
const headerShowBack = computed(() => route.meta?.showBack === true)

function onBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.replace('/home')
  }
}
</script>

<template>
  <div class="parent-layout">
    <M3TopAppBar
      v-if="!isPublic"
      :title="headerTitle"
      :show-back="headerShowBack"
      :on-back="onBack"
      variant="small"
    />

    <div v-if="!isPublic" class="parent-conn-slot">
      <ConnectionBanner />
    </div>

    <main
      class="parent-main"
      :class="{ 'is-public': isPublic, 'with-tabbar': !hideTabBar && !isPublic }"
    >
      <slot />
    </main>

    <M3NavigationBar
      v-if="!hideTabBar && !isPublic"
      class="parent-navbar"
      :items="TABS"
      :current-key="currentTab"
      @select="onTabSelect"
    />
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  width: 100%;
  max-width: var(--pt-app-max-width, 560px);
  margin: 0 auto;
  position: relative;
}

.parent-conn-slot {
  /* ConnectionBanner 由元件自身控制顯示，這裡只給定位 slot */
  position: sticky;
  top: 64px;
  z-index: 9;
}

.parent-main {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.parent-main.is-public {
  /* 公開頁（login / bind）撐滿，不留 header/nav 空間 */
}
.parent-main.with-tabbar {
  padding-bottom: 80px; /* M3NavigationBar 高度 */
}

.parent-navbar {
  position: sticky;
  bottom: 0;
  z-index: var(--z-sticky, 10);
}
</style>
```

- [ ] **Step 3: 確認 Vitest 仍綠**

```bash
npm run test -- src/parent/components/m3 tests/unit/parent 2>&1 | tail -10
```

Expected: m3 元件測試全綠（無 layout 元件單獨測試），parent app 既有測試零新增 regression（保留 pre-existing 4 failures）。

- [ ] **Step 4: 確認 dev server 啟動正常**

```bash
(npm run dev 2>&1 &); DEV_PID=$!; sleep 6; kill $DEV_PID 2>/dev/null; wait 2>/dev/null
```

Expected: 看到 `VITE vN.N.N ready` 字樣，無語法錯誤。

- [ ] **Step 5: Commit**

```bash
git add src/parent/layouts/ParentLayout.vue
git commit -m "$(cat <<'EOF'
feat(parent-m3): ParentLayout 切換到 M3TopAppBar + M3NavigationBar

- AppHeader → M3TopAppBar（保留 title/showBack/onBack API，讀 route.meta）
- 自寫 .tab-bar → M3NavigationBar（保留 4-tab + announcements/messages badge）
- 既有 unread 邏輯不變（refreshUnread + onMounted + watch route）
- AppHeader.vue 保留 deprecated，P5 才刪

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: barrel exports 補齊

**Files:**
- Modify: `src/parent/components/m3/index.js`

- [ ] **Step 1: 加 P2 元件 export**

用 Edit tool，把：

```js
export { default as M3Chip } from './M3Chip.vue'
export { default as M3Divider } from './M3Divider.vue'
```

替換為：

```js
export { default as M3Chip } from './M3Chip.vue'
export { default as M3Divider } from './M3Divider.vue'
export { default as M3TopAppBar } from './M3TopAppBar.vue'
export { default as M3NavigationBar } from './M3NavigationBar.vue'
export { default as M3FAB } from './M3FAB.vue'
```

- [ ] **Step 2: 確認 grep 數**

```bash
grep -c "^export { default as" src/parent/components/m3/index.js
```

Expected: 11（P0 1 + P1 7 + P2 3）。

- [ ] **Step 3: 跑全套 m3 測試**

```bash
npm run test -- src/parent/components/m3 2>&1 | tail -15
```

Expected: 全部 m3 元件測試通過。預計 62 (P0+P1) + 9 + 11 + 14 = 96 個測試左右。

- [ ] **Step 4: 跑 parent 全套確認零新增 regression**

```bash
npm run test -- "tests/unit/parent" 2>&1 | tail -8
```

Expected: pre-existing 4 個失敗不變（HomeHero / TodoCenter / TodoCenterPhase3 / SalaryView 之一可能 admin 不在 parent path）；無新增 failure。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/index.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 補齊 P2 導航元件 barrel exports

M3TopAppBar / M3NavigationBar / M3FAB
全部從 @/parent/components/m3 export。
共 11 個 M3 元件 export。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 後備檢查表

實作者在 PR merge 前需逐項打勾：

- [ ] 3 個新元件（M3TopAppBar / M3NavigationBar / M3FAB）+ 對應 3 個 spec 檔全部存在
- [ ] ParentLayout.vue 已用新元件，但保留全部既有 API（route.meta.title / showBack / hideTabBar / tab、unread badge 邏輯、scroll-to-top tap 行為）
- [ ] AppHeader.vue 沒被刪（P5 才刪）
- [ ] router.js 沒動
- [ ] M3FAB 元件已建好但無任何 view 使用（P2 暫不上場）
- [ ] index.js 已 export 11 個元件
- [ ] State layer overlay 在 M3FAB 內仍生效（不同於底部 nav 用 active indicator）
- [ ] Dev server 啟動無錯
- [ ] M3 元件 96+ tests passed
- [ ] Parent app 既有測試零新增 regression（pre-existing 4 個失敗不變）
- [ ] No remaining TODO / TBD 字串

---

## P2 完成後

- 進 **P3 plan**（互動元件：M3Dialog / M3BottomSheet / M3Snackbar / M3TextField / M3SegmentedButton / M3Switch / M3Checkbox / M3Radio）。
- P3 涉及 refactor `ParentBottomSheet.vue`（被 7 處使用），風險 MID。
- P3 plan 由 implementer 重新調用 writing-plans skill 寫，spec §6 為依據。
