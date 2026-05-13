# 家長端 Material 3 重寫 P1：核心元件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補齊家長端 Material 3 核心元件庫：`M3Button` / `M3Card` / `M3IconButton` / `M3List` + `M3ListItem` / `M3Chip` / `M3Divider`，每個元件搭一份 Vitest 測試，全部從 barrel `src/parent/components/m3/index.js` export。P1 結束後 P2 可直接組裝導航元件。

**Architecture:** P1 是 **additive**。所有新元件放在 `src/parent/components/m3/`，依賴 P0 已建立的 token（`--m3-primary`、`--m3-on-primary`、`--m3-surface-container-*`、`--m3-state-hover/-focus/-pressed`、type scale class、elev-1~5、easing/duration）。元件 API 走 Vue 3 `<script setup>` 慣例：必要參數用 props，內容用 default slot，按下事件正常 emit `click`。State layer 用 `::before` overlay 配合 transparent alpha 變數（依 M3 spec 8%/12%/12%）。

**Tech Stack:** Vue 3 `<script setup>` + Vitest + @vue/test-utils。CSS scoped，無 SCSS / preprocessor。Material Symbols icon 經由 P0 的 `M3Icon`。

**Spec reference:** `docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md` §4 與 §10 對應表。

**Branch:** 沿用 P0 的 worktree `/Users/yilunwu/Desktop/ivy-frontend-m3-p0`，但建議切新分支 `feat/parent-m3-phase-1-frontend` 從 `feat/parent-m3-phase-0-frontend` head 為 base（這樣 P0 沒 merge 進 main 也可以開工，且 P1 PR 可 stack 在 P0 PR 之上）。

---

## File Structure

```
src/parent/components/m3/
├── M3Icon.vue              (P0 已建)
├── M3Button.vue            (P1 Task 1)
├── M3Card.vue              (P1 Task 2)
├── M3IconButton.vue        (P1 Task 3)
├── M3List.vue              (P1 Task 4，主容器)
├── M3ListItem.vue          (P1 Task 4，子項)
├── M3Chip.vue              (P1 Task 5)
├── M3Divider.vue           (P1 Task 6)
├── index.js                (P0 已建，P1 Task 7 補 export)
└── __tests__/
    ├── M3Icon.spec.js      (P0 已建)
    ├── M3Button.spec.js    (P1 Task 1)
    ├── M3Card.spec.js      (P1 Task 2)
    ├── M3IconButton.spec.js(P1 Task 3)
    ├── M3List.spec.js      (P1 Task 4)
    ├── M3Chip.spec.js      (P1 Task 5)
    └── M3Divider.spec.js   (P1 Task 6)
```

---

### Task 0: P1 branch setup

**Files:**
- 純 git 操作

- [ ] **Step 1: 從 P0 head 切 P1 分支**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
git status   # 確認 clean
git log -1 --format="%h %s"   # 確認 HEAD = f4f6742c App.vue
git checkout -b feat/parent-m3-phase-1-frontend
```

Expected: 切換成功，HEAD 不變。

---

### Task 1: M3Button

**Files:**
- Create: `src/parent/components/m3/M3Button.vue`
- Create: `src/parent/components/m3/__tests__/M3Button.spec.js`

API 規格：
- props: `variant` (string: 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated', default 'filled')
- props: `disabled` (boolean, default false)
- props: `type` (string, default 'button') — HTML button type
- slots: default = label content；`icon` = leading icon
- emits: 自動透傳 `click`（用 `@click` on root button，不寫 emit declare）

視覺：
- 高度 40px（含上下 padding 共 40px）
- 圓角 fully rounded（border-radius: 9999px）
- Padding: 24px horizontal（無 icon）/ 16px left + 24px right（有 leading icon 時，icon 與 label 間 8px）
- Label: `m3-label-large` (14px / 500 / spacing 0.1)
- State layer (::before overlay): hover 8%、focus 12%、pressed 12%

variant 樣式：
- `filled`: bg `--m3-primary`、color `--m3-on-primary`、shadow none
- `tonal`: bg `--m3-secondary-container`、color `--m3-on-secondary-container`、shadow none
- `outlined`: bg transparent、color `--m3-primary`、1px solid `--m3-outline`
- `text`: bg transparent、color `--m3-primary`、no border、padding 12px horizontal（M3 spec）
- `elevated`: bg `--m3-surface-container-low`、color `--m3-primary`、shadow `--m3-elev-1`

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Button.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Button from '../M3Button.vue'

describe('M3Button', () => {
  it('render default slot 為 label', () => {
    const w = mount(M3Button, { slots: { default: '送出' } })
    expect(w.text()).toContain('送出')
  })

  it('預設 variant = filled', () => {
    const w = mount(M3Button, { slots: { default: 'OK' } })
    expect(w.classes()).toContain('m3-button')
    expect(w.classes()).toContain('m3-button-filled')
  })

  it.each(['filled', 'tonal', 'outlined', 'text', 'elevated'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Button, { props: { variant }, slots: { default: 'x' } })
      expect(w.classes()).toContain(`m3-button-${variant}`)
    },
  )

  it('disabled prop 套用 disabled 屬性 + class', () => {
    const w = mount(M3Button, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('預設 type = "button"（避免在 form 內誤觸發 submit）', () => {
    const w = mount(M3Button, { slots: { default: 'x' } })
    expect(w.attributes('type')).toBe('button')
  })

  it('type prop 可覆寫', () => {
    const w = mount(M3Button, {
      props: { type: 'submit' },
      slots: { default: 'x' },
    })
    expect(w.attributes('type')).toBe('submit')
  })

  it('icon slot 渲染在 label 前面', () => {
    const w = mount(M3Button, {
      slots: { default: 'Label', icon: '<span class="ico">★</span>' },
    })
    const icon = w.find('.ico')
    expect(icon.exists()).toBe(true)
    expect(w.find('.m3-button-icon').exists()).toBe(true)
    // class 套用驗證：含 leading icon 時容器加標記 class
    expect(w.classes()).toContain('has-leading-icon')
  })

  it('click 事件被觸發', async () => {
    const w = mount(M3Button, { slots: { default: 'x' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3Button, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend-m3-p0
npm run test -- M3Button 2>&1 | tail -15
```

Expected: FAIL with `Cannot find module '../M3Button.vue'` or similar.

- [ ] **Step 3: 實作 M3Button.vue**

寫入 `src/parent/components/m3/M3Button.vue`：

```vue
<script setup>
import { computed, useSlots } from 'vue'

/**
 * Material 3 Button.
 *
 * Variants（5）:
 *   - filled    (預設) primary bg + on-primary text；最強行動
 *   - tonal     secondary-container bg；中等強度（最常用）
 *   - outlined  border + transparent bg；中性
 *   - text      無 bg / border；連結式行動
 *   - elevated  surface-container-low + elev-1；少用，搭配深色卡
 *
 * Slots:
 *   - default   label 文字
 *   - icon      leading icon（會在 label 前面渲染）
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.1
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'filled',
    validator: (v) => ['filled', 'tonal', 'outlined', 'text', 'elevated'].includes(v),
  },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: 'button' },
})

const slots = useSlots()
const hasLeadingIcon = computed(() => !!slots.icon)

const classes = computed(() => ({
  'm3-button': true,
  [`m3-button-${props.variant}`]: true,
  'has-leading-icon': hasLeadingIcon.value,
  'is-disabled': props.disabled,
}))
</script>

<template>
  <button
    :class="classes"
    :type="type"
    :disabled="disabled"
  >
    <span v-if="hasLeadingIcon" class="m3-button-icon">
      <slot name="icon" />
    </span>
    <span class="m3-button-label m3-label-large">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.m3-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 40px;
  padding: 0 24px;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
  /* state layer overlay */
}
.m3-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-button:hover:not(.is-disabled)::before { opacity: var(--m3-state-hover, 0.08); }
.m3-button:focus-visible:not(.is-disabled)::before { opacity: var(--m3-state-focus, 0.12); }
.m3-button:active:not(.is-disabled)::before { opacity: var(--m3-state-pressed, 0.12); }
.m3-button.has-leading-icon { padding-left: 16px; }
.m3-button-icon { display: inline-flex; align-items: center; flex-shrink: 0; }
.m3-button-label { white-space: nowrap; }

/* variants */
.m3-button-filled {
  background: var(--m3-primary, #006d3d);
  color: var(--m3-on-primary, #ffffff);
}
.m3-button-tonal {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-button-outlined {
  background: transparent;
  color: var(--m3-primary, #006d3d);
  border: 1px solid var(--m3-outline, #727970);
}
.m3-button-text {
  background: transparent;
  color: var(--m3-primary, #006d3d);
  padding: 0 12px;
}
.m3-button-text.has-leading-icon { padding-left: 12px; }
.m3-button-elevated {
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-primary, #006d3d);
  box-shadow: var(--m3-elev-1, 0 1px 2px rgba(0, 0, 0, 0.3));
}

.m3-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-button.is-disabled::before { opacity: 0; }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3Button 2>&1 | tail -15
```

Expected: 12+ tests passed（9 個 `it` + 5 個 `it.each` 跑出 5 條子測試 = 13 條）。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3Button.vue \
       src/parent/components/m3/__tests__/M3Button.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Button 元件 + Vitest

5 variants (filled/tonal/outlined/text/elevated) + state layer overlay +
leading icon slot + disabled state。13 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: M3Card

**Files:**
- Create: `src/parent/components/m3/M3Card.vue`
- Create: `src/parent/components/m3/__tests__/M3Card.spec.js`

API：
- props: `variant` (string: 'elevated' | 'filled' | 'outlined', default 'elevated')
- props: `clickable` (boolean, default false) — true 時加 state layer + pointer cursor，emit click
- props: `padding` (string, default '16px') — 內距，可傳 CSS shorthand
- slots: default

樣式：
- `elevated`: bg `--m3-surface-container-low`、shadow `--m3-elev-1`
- `filled`: bg `--m3-surface-container-highest`、no shadow
- `outlined`: bg `--m3-surface`、1px solid `--m3-outline-variant`、no shadow
- 圓角 12px

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Card.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Card from '../M3Card.vue'

describe('M3Card', () => {
  it('render default slot', () => {
    const w = mount(M3Card, { slots: { default: '<p>內文</p>' } })
    expect(w.text()).toContain('內文')
  })

  it('預設 variant = elevated', () => {
    const w = mount(M3Card)
    expect(w.classes()).toContain('m3-card')
    expect(w.classes()).toContain('m3-card-elevated')
  })

  it.each(['elevated', 'filled', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Card, { props: { variant } })
      expect(w.classes()).toContain(`m3-card-${variant}`)
    },
  )

  it('預設不是 clickable（無 role）', () => {
    const w = mount(M3Card)
    expect(w.attributes('role')).toBeUndefined()
    expect(w.attributes('tabindex')).toBeUndefined()
    expect(w.classes()).not.toContain('is-clickable')
  })

  it('clickable=true 加 role=button + tabindex=0 + 觸發 click', async () => {
    const w = mount(M3Card, { props: { clickable: true } })
    expect(w.attributes('role')).toBe('button')
    expect(w.attributes('tabindex')).toBe('0')
    expect(w.classes()).toContain('is-clickable')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('padding prop 套到 style', () => {
    const w = mount(M3Card, { props: { padding: '24px' } })
    const style = w.attributes('style') || ''
    expect(style).toContain('padding: 24px')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3Card 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: 實作 M3Card.vue**

寫入 `src/parent/components/m3/M3Card.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * Material 3 Card.
 *
 * Variants:
 *   - elevated (預設) surface-container-low + elev-1
 *   - filled   surface-container-highest + no shadow
 *   - outlined surface + 1px outline-variant + no shadow
 *
 * clickable prop:
 *   - true: 加 role=button + tabindex=0 + state layer + cursor:pointer + emit click
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.2
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'elevated',
    validator: (v) => ['elevated', 'filled', 'outlined'].includes(v),
  },
  clickable: { type: Boolean, default: false },
  padding: { type: String, default: '16px' },
})

const classes = computed(() => ({
  'm3-card': true,
  [`m3-card-${props.variant}`]: true,
  'is-clickable': props.clickable,
}))

const style = computed(() => ({ padding: props.padding }))

const rootAttrs = computed(() =>
  props.clickable
    ? { role: 'button', tabindex: '0' }
    : {},
)
</script>

<template>
  <div :class="classes" :style="style" v-bind="rootAttrs">
    <slot />
  </div>
</template>

<style scoped>
.m3-card {
  position: relative;
  border-radius: 12px;
  color: var(--m3-on-surface, #181d18);
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    box-shadow var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-card-elevated {
  background: var(--m3-surface-container-low, #f1f5ee);
  box-shadow: var(--m3-elev-1, 0 1px 2px rgba(0, 0, 0, 0.3));
}
.m3-card-filled {
  background: var(--m3-surface-container-highest, #e0e4dc);
}
.m3-card-outlined {
  background: var(--m3-surface, #f7fbf3);
  border: 1px solid var(--m3-outline-variant, #c2c9be);
}

.m3-card.is-clickable {
  cursor: pointer;
}
.m3-card.is-clickable::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--m3-on-surface, currentColor);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-card.is-clickable:hover::before  { opacity: var(--m3-state-hover, 0.08); }
.m3-card.is-clickable:focus-visible::before { opacity: var(--m3-state-focus, 0.12); }
.m3-card.is-clickable:active::before { opacity: var(--m3-state-pressed, 0.12); }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3Card 2>&1 | tail -15
```

Expected: 9+ tests passed（6 個 it + 3 個 it.each 子測試）。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3Card.vue \
       src/parent/components/m3/__tests__/M3Card.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Card 元件 + Vitest

3 variants (elevated/filled/outlined) + clickable mode +
padding prop。9+ tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: M3IconButton

**Files:**
- Create: `src/parent/components/m3/M3IconButton.vue`
- Create: `src/parent/components/m3/__tests__/M3IconButton.spec.js`

API：
- props: `variant` (string: 'standard' | 'filled' | 'filled-tonal' | 'outlined', default 'standard')
- props: `icon` (string, required) — Material Symbols ligature name
- props: `iconSize` (number, default 24)
- props: `iconFilled` (boolean, default false) — 傳給 M3Icon
- props: `disabled` (boolean, default false)
- attrs: `aria-label` (必須由父層傳入；icon-only button accessibility 要求)

樣式：
- 40×40px
- 圓角 fully rounded
- state layer
- variants:
  - `standard`: transparent bg, color on-surface-variant
  - `filled`: bg primary, color on-primary
  - `filled-tonal`: bg secondary-container, color on-secondary-container
  - `outlined`: 1px outline, bg transparent, color on-surface-variant

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3IconButton.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3IconButton from '../M3IconButton.vue'

describe('M3IconButton', () => {
  it('render icon name', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'close' },
      attrs: { 'aria-label': '關閉' },
    })
    expect(w.text()).toBe('close')
    expect(w.attributes('aria-label')).toBe('關閉')
  })

  it('預設 variant = standard', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'menu' },
      attrs: { 'aria-label': '選單' },
    })
    expect(w.classes()).toContain('m3-icon-button')
    expect(w.classes()).toContain('m3-icon-button-standard')
  })

  it.each(['standard', 'filled', 'filled-tonal', 'outlined'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3IconButton, {
        props: { icon: 'star', variant },
        attrs: { 'aria-label': 'x' },
      })
      expect(w.classes()).toContain(`m3-icon-button-${variant}`)
    },
  )

  it('disabled 套用 attribute + class', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    expect(w.attributes('disabled')).toBeDefined()
    expect(w.classes()).toContain('is-disabled')
  })

  it('iconFilled prop 透傳 M3Icon', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'favorite', iconFilled: true },
      attrs: { 'aria-label': '收藏' },
    })
    const inner = w.find('.material-symbols-rounded')
    const style = inner.attributes('style') || ''
    expect(style).toContain('"FILL" 1')
  })

  it('iconSize prop 透傳 M3Icon', () => {
    const w = mount(M3IconButton, {
      props: { icon: 'menu', iconSize: 28 },
      attrs: { 'aria-label': '選單' },
    })
    const inner = w.find('.material-symbols-rounded')
    const style = inner.attributes('style') || ''
    expect(style).toContain('font-size: 28px')
  })

  it('click 事件', async () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star' },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3IconButton, {
      props: { icon: 'star', disabled: true },
      attrs: { 'aria-label': 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3IconButton 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: 實作 M3IconButton.vue**

寫入 `src/parent/components/m3/M3IconButton.vue`：

```vue
<script setup>
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Icon Button.
 *
 * Variants:
 *   - standard     (預設) transparent bg, on-surface-variant color
 *   - filled       primary bg, on-primary color
 *   - filled-tonal secondary-container bg
 *   - outlined     1px outline border, transparent bg
 *
 * 必填 aria-label（icon-only 按鈕 accessibility 要求）；父層必須傳入。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.3
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'standard',
    validator: (v) => ['standard', 'filled', 'filled-tonal', 'outlined'].includes(v),
  },
  icon: { type: String, required: true },
  iconSize: { type: Number, default: 24 },
  iconFilled: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const classes = computed(() => ({
  'm3-icon-button': true,
  [`m3-icon-button-${props.variant}`]: true,
  'is-disabled': props.disabled,
}))
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
  >
    <M3Icon
      :name="icon"
      :size="iconSize"
      :filled="iconFilled"
      aria-hidden="true"
    />
  </button>
</template>

<style scoped>
.m3-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 9999px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-icon-button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-icon-button:hover:not(.is-disabled)::before { opacity: var(--m3-state-hover, 0.08); }
.m3-icon-button:focus-visible:not(.is-disabled)::before { opacity: var(--m3-state-focus, 0.12); }
.m3-icon-button:active:not(.is-disabled)::before { opacity: var(--m3-state-pressed, 0.12); }

/* variants */
.m3-icon-button-standard {
  color: var(--m3-on-surface-variant, #424941);
}
.m3-icon-button-filled {
  background: var(--m3-primary, #006d3d);
  color: var(--m3-on-primary, #ffffff);
}
.m3-icon-button-filled-tonal {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
}
.m3-icon-button-outlined {
  border: 1px solid var(--m3-outline, #727970);
  color: var(--m3-on-surface-variant, #424941);
}

.m3-icon-button.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-icon-button.is-disabled::before { opacity: 0; }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3IconButton 2>&1 | tail -15
```

Expected: 11+ tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3IconButton.vue \
       src/parent/components/m3/__tests__/M3IconButton.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3IconButton 元件 + Vitest

4 variants (standard/filled/filled-tonal/outlined) +
icon/iconSize/iconFilled props 透傳 M3Icon + state layer。
11+ tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: M3List + M3ListItem

**Files:**
- Create: `src/parent/components/m3/M3List.vue`
- Create: `src/parent/components/m3/M3ListItem.vue`
- Create: `src/parent/components/m3/__tests__/M3List.spec.js`

M3List 是 wrapper（純結構）；M3ListItem 是行內容。

M3List API：
- slots: default = list items
- 無 props（就是個 `<ul>`，role=list）

M3ListItem API：
- props: `headline` (string, required) — 主文字
- props: `supportingText` (string) — 副文字（two-line）
- props: `overline` (string) — 上方小標（three-line variant）
- props: `leadingIcon` (string) — Material Symbols name，左側 icon
- props: `trailingIcon` (string) — 右側 icon
- props: `clickable` (boolean, default false) — 加 state layer + role=button + emit click
- props: `disabled` (boolean, default false)
- slots: 
  - `leading` = 自訂 leading 內容（avatar / image / checkbox 等），會覆蓋 leadingIcon
  - `trailing` = 自訂 trailing 內容（switch / text 等），會覆蓋 trailingIcon

高度推導：
- one-line: 56px（只有 headline）
- two-line: 72px（headline + supportingText 或 headline + overline）
- three-line: 88px（overline + headline + supportingText）

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3List.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3List from '../M3List.vue'
import M3ListItem from '../M3ListItem.vue'

describe('M3List', () => {
  it('render ul role=list 容器', () => {
    const w = mount(M3List, { slots: { default: '<li>x</li>' } })
    expect(w.element.tagName).toBe('UL')
    expect(w.classes()).toContain('m3-list')
    expect(w.attributes('role')).toBe('list')
  })
})

describe('M3ListItem', () => {
  it('headline 必填，render headline', () => {
    const w = mount(M3ListItem, { props: { headline: '今日活動' } })
    expect(w.text()).toContain('今日活動')
    expect(w.find('.m3-list-item-headline').exists()).toBe(true)
  })

  it('supportingText 渲染兩行版（套 two-line class）', () => {
    const w = mount(M3ListItem, {
      props: { headline: '訊息', supportingText: '14:00 美術教室' },
    })
    expect(w.classes()).toContain('m3-list-item-two-line')
    expect(w.find('.m3-list-item-supporting').text()).toBe('14:00 美術教室')
  })

  it('overline + headline 三行版（套 three-line）', () => {
    const w = mount(M3ListItem, {
      props: { headline: '主標題', overline: '類別', supportingText: '副文' },
    })
    expect(w.classes()).toContain('m3-list-item-three-line')
    expect(w.find('.m3-list-item-overline').text()).toBe('類別')
  })

  it('預設一行版（只有 headline）', () => {
    const w = mount(M3ListItem, { props: { headline: '單行' } })
    expect(w.classes()).toContain('m3-list-item-one-line')
  })

  it('leadingIcon 渲染 Material Symbol', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', leadingIcon: 'home' },
    })
    const leading = w.find('.m3-list-item-leading')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('home')
  })

  it('leading slot 覆蓋 leadingIcon', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', leadingIcon: 'home' },
      slots: { leading: '<span class="custom">★</span>' },
    })
    expect(w.find('.custom').exists()).toBe(true)
    expect(w.find('.material-symbols-rounded').exists()).toBe(false)
  })

  it('trailingIcon 渲染', () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', trailingIcon: 'chevron_right' },
    })
    const trailing = w.find('.m3-list-item-trailing')
    expect(trailing.exists()).toBe(true)
    expect(trailing.text()).toBe('chevron_right')
  })

  it('clickable=true 加 button role + emit click', async () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', clickable: true },
    })
    expect(w.attributes('role')).toBe('button')
    expect(w.attributes('tabindex')).toBe('0')
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 click 不觸發', async () => {
    const w = mount(M3ListItem, {
      props: { headline: 'x', clickable: true, disabled: true },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3List 2>&1 | tail -15
```

Expected: FAIL with module not found.

- [ ] **Step 3: 實作 M3List.vue**

寫入 `src/parent/components/m3/M3List.vue`：

```vue
<script setup>
/**
 * Material 3 List wrapper.
 *
 * 純結構 wrapper；行內容由 M3ListItem 提供。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.4
 */
</script>

<template>
  <ul class="m3-list" role="list">
    <slot />
  </ul>
</template>

<style scoped>
.m3-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--m3-surface, #f7fbf3);
}
</style>
```

- [ ] **Step 4: 實作 M3ListItem.vue**

寫入 `src/parent/components/m3/M3ListItem.vue`：

```vue
<script setup>
import { computed, useSlots } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 List Item.
 *
 * 自動依 props 推導高度（one-line 56 / two-line 72 / three-line 88）：
 *   - 只有 headline → one-line
 *   - headline + supporting OR headline + overline → two-line
 *   - overline + headline + supporting → three-line
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.4
 */
const props = defineProps({
  headline: { type: String, required: true },
  supportingText: { type: String, default: '' },
  overline: { type: String, default: '' },
  leadingIcon: { type: String, default: '' },
  trailingIcon: { type: String, default: '' },
  clickable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const slots = useSlots()
const hasLeading = computed(() => !!slots.leading || !!props.leadingIcon)
const hasTrailing = computed(() => !!slots.trailing || !!props.trailingIcon)

const lineCount = computed(() => {
  if (props.overline && props.supportingText) return 'three-line'
  if (props.supportingText || props.overline) return 'two-line'
  return 'one-line'
})

const classes = computed(() => ({
  'm3-list-item': true,
  [`m3-list-item-${lineCount.value}`]: true,
  'is-clickable': props.clickable,
  'is-disabled': props.disabled,
}))

const rootAttrs = computed(() =>
  props.clickable && !props.disabled
    ? { role: 'button', tabindex: '0' }
    : props.clickable
      ? { role: 'button', tabindex: '-1', 'aria-disabled': 'true' }
      : {},
)
</script>

<template>
  <li :class="classes" v-bind="rootAttrs">
    <span v-if="hasLeading" class="m3-list-item-leading">
      <slot name="leading">
        <M3Icon v-if="leadingIcon" :name="leadingIcon" aria-hidden="true" />
      </slot>
    </span>

    <span class="m3-list-item-content">
      <span v-if="overline" class="m3-list-item-overline m3-label-small">{{ overline }}</span>
      <span class="m3-list-item-headline m3-body-large">{{ headline }}</span>
      <span v-if="supportingText" class="m3-list-item-supporting m3-body-medium">{{ supportingText }}</span>
    </span>

    <span v-if="hasTrailing" class="m3-list-item-trailing">
      <slot name="trailing">
        <M3Icon v-if="trailingIcon" :name="trailingIcon" aria-hidden="true" />
      </slot>
    </span>
  </li>
</template>

<style scoped>
.m3-list-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  color: var(--m3-on-surface, #181d18);
  background: transparent;
  outline: none;
}
.m3-list-item-one-line   { min-height: 56px; }
.m3-list-item-two-line   { min-height: 72px; }
.m3-list-item-three-line { min-height: 88px; }

.m3-list-item-leading,
.m3-list-item-trailing {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--m3-on-surface-variant, #424941);
}

.m3-list-item-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.m3-list-item-headline {
  color: var(--m3-on-surface, #181d18);
}
.m3-list-item-supporting,
.m3-list-item-overline {
  color: var(--m3-on-surface-variant, #424941);
}

.m3-list-item.is-clickable {
  cursor: pointer;
  transition: background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-list-item.is-clickable::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--m3-on-surface, currentColor);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-list-item.is-clickable:hover::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-list-item.is-clickable:focus-visible::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-list-item.is-clickable:active::before       { opacity: var(--m3-state-pressed, 0.12); }

.m3-list-item.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-list-item.is-disabled::before { opacity: 0; }
</style>
```

- [ ] **Step 5: 跑測試確認 PASS**

```bash
npm run test -- M3List 2>&1 | tail -20
```

Expected: 10+ tests passed。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/m3/M3List.vue \
       src/parent/components/m3/M3ListItem.vue \
       src/parent/components/m3/__tests__/M3List.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3List + M3ListItem 元件 + Vitest

M3List = ul role=list wrapper。
M3ListItem = headline + 可選 supporting/overline/leading/trailing；
自動推導 one-line/two-line/three-line 高度。10+ tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: M3Chip

**Files:**
- Create: `src/parent/components/m3/M3Chip.vue`
- Create: `src/parent/components/m3/__tests__/M3Chip.spec.js`

API：
- props: `variant` (string: 'assist' | 'filter' | 'input' | 'suggestion', default 'assist')
- props: `selected` (boolean, default false) — filter chip 才用
- props: `icon` (string) — leading icon
- props: `removable` (boolean, default false) — input chip 才用，右側加 close icon
- props: `disabled` (boolean, default false)
- slots: default = label
- emits: `click`、`remove`（按 close icon 時）

樣式：
- 高 32px、圓角 8px
- Padding 8px 12px（with leading icon）/ 8px 16px（無 icon）
- 文字 label-large

variant 樣式（簡化）：
- `assist`: bg surface-container-low, color on-surface, 1px outline
- `filter`: bg surface-container-low；selected = secondary-container bg + check icon
- `input`: bg surface-container-low, removable = 右側 close
- `suggestion`: bg surface-container-low

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Chip.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Chip from '../M3Chip.vue'

describe('M3Chip', () => {
  it('render default slot 為 label', () => {
    const w = mount(M3Chip, { slots: { default: '標籤' } })
    expect(w.text()).toContain('標籤')
  })

  it('預設 variant = assist', () => {
    const w = mount(M3Chip, { slots: { default: 'x' } })
    expect(w.classes()).toContain('m3-chip')
    expect(w.classes()).toContain('m3-chip-assist')
  })

  it.each(['assist', 'filter', 'input', 'suggestion'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3Chip, { props: { variant }, slots: { default: 'x' } })
      expect(w.classes()).toContain(`m3-chip-${variant}`)
    },
  )

  it('icon prop 渲染 leading Material Symbol', () => {
    const w = mount(M3Chip, {
      props: { icon: 'event' },
      slots: { default: 'x' },
    })
    const leading = w.find('.m3-chip-leading')
    expect(leading.exists()).toBe(true)
    expect(leading.text()).toBe('event')
  })

  it('filter variant + selected 顯示 check icon', () => {
    const w = mount(M3Chip, {
      props: { variant: 'filter', selected: true },
      slots: { default: 'x' },
    })
    expect(w.classes()).toContain('is-selected')
    expect(w.find('.m3-chip-leading').text()).toBe('check')
  })

  it('removable input chip 顯示 close icon + 觸發 remove', async () => {
    const w = mount(M3Chip, {
      props: { variant: 'input', removable: true },
      slots: { default: 'x' },
    })
    const close = w.find('.m3-chip-remove')
    expect(close.exists()).toBe(true)
    await close.trigger('click')
    expect(w.emitted('remove')).toHaveLength(1)
  })

  it('chip click 事件', async () => {
    const w = mount(M3Chip, { slots: { default: 'x' } })
    await w.trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })

  it('disabled 時 chip click 不觸發', async () => {
    const w = mount(M3Chip, {
      props: { disabled: true },
      slots: { default: 'x' },
    })
    await w.trigger('click')
    expect(w.emitted('click') ?? []).toHaveLength(0)
  })

  it('removable + disabled 時 remove 也不觸發', async () => {
    const w = mount(M3Chip, {
      props: { variant: 'input', removable: true, disabled: true },
      slots: { default: 'x' },
    })
    await w.find('.m3-chip-remove').trigger('click')
    expect(w.emitted('remove') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3Chip 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: 實作 M3Chip.vue**

寫入 `src/parent/components/m3/M3Chip.vue`：

```vue
<script setup>
import { computed } from 'vue'
import M3Icon from './M3Icon.vue'

/**
 * Material 3 Chip.
 *
 * Variants:
 *   - assist     (預設) 動作提示 chip
 *   - filter     可切換選中態（用 selected prop）
 *   - input      輸入 token，可 removable（用 removable prop）
 *   - suggestion AI 建議 chip
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4.5
 */
const props = defineProps({
  variant: {
    type: String,
    default: 'assist',
    validator: (v) => ['assist', 'filter', 'input', 'suggestion'].includes(v),
  },
  selected: { type: Boolean, default: false },
  icon: { type: String, default: '' },
  removable: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['click', 'remove'])

const showLeadingCheck = computed(
  () => props.variant === 'filter' && props.selected,
)
const leadingIconName = computed(() =>
  showLeadingCheck.value ? 'check' : props.icon,
)
const hasLeading = computed(() => !!leadingIconName.value)

const classes = computed(() => ({
  'm3-chip': true,
  [`m3-chip-${props.variant}`]: true,
  'is-selected': props.selected,
  'is-disabled': props.disabled,
}))

function onClick(e) {
  if (props.disabled) return
  emit('click', e)
}
function onRemove(e) {
  e.stopPropagation()
  if (props.disabled) return
  emit('remove', e)
}
</script>

<template>
  <button
    :class="classes"
    type="button"
    :disabled="disabled"
    @click="onClick"
  >
    <M3Icon
      v-if="hasLeading"
      class="m3-chip-leading"
      :name="leadingIconName"
      :size="18"
      aria-hidden="true"
    />
    <span class="m3-chip-label m3-label-large">
      <slot />
    </span>
    <span
      v-if="removable"
      class="m3-chip-remove"
      role="button"
      :aria-label="'移除'"
      tabindex="0"
      @click="onRemove"
      @keydown.enter.prevent="onRemove"
    >
      <M3Icon name="close" :size="18" aria-hidden="true" />
    </span>
  </button>
</template>

<style scoped>
.m3-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--m3-outline, #727970);
  border-radius: 8px;
  background: var(--m3-surface-container-low, #f1f5ee);
  color: var(--m3-on-surface, #181d18);
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
  cursor: pointer;
  transition:
    background-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease),
    border-color var(--m3-dur-short-3, 150ms) var(--m3-easing-standard, ease);
}
.m3-chip::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--m3-dur-short-2, 100ms) var(--m3-easing-standard, ease);
}
.m3-chip:hover:not(.is-disabled)::before        { opacity: var(--m3-state-hover, 0.08); }
.m3-chip:focus-visible:not(.is-disabled)::before{ opacity: var(--m3-state-focus, 0.12); }
.m3-chip:active:not(.is-disabled)::before       { opacity: var(--m3-state-pressed, 0.12); }

.m3-chip.is-selected {
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
  border-color: transparent;
}

.m3-chip-leading { color: inherit; }
.m3-chip-label { white-space: nowrap; }
.m3-chip-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: inherit;
  border-radius: 50%;
}
.m3-chip-remove:hover {
  background: rgba(0, 0, 0, 0.08);
}

.m3-chip.is-disabled {
  cursor: not-allowed;
  opacity: 0.38;
}
.m3-chip.is-disabled::before { opacity: 0; }

/* Padding 調整：有 leading icon 時 left padding 縮小 */
.m3-chip:has(.m3-chip-leading) { padding-left: 8px; }
.m3-chip:has(.m3-chip-remove)  { padding-right: 8px; }
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3Chip 2>&1 | tail -20
```

Expected: 13+ tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3Chip.vue \
       src/parent/components/m3/__tests__/M3Chip.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Chip 元件 + Vitest

4 variants (assist/filter/input/suggestion) + leading icon +
filter selected check + input removable close + state layer。
13+ tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: M3Divider

**Files:**
- Create: `src/parent/components/m3/M3Divider.vue`
- Create: `src/parent/components/m3/__tests__/M3Divider.spec.js`

API：
- props: `inset` (boolean, default false) — 縮排版（左 16px 留白）
- props: `vertical` (boolean, default false) — 垂直版（在 row 內當分隔）

樣式：
- 1px 高度 outline-variant 線
- 全寬（預設）/ inset 16px / vertical 寬 1px

- [ ] **Step 1: 寫失敗測試**

寫入 `src/parent/components/m3/__tests__/M3Divider.spec.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import M3Divider from '../M3Divider.vue'

describe('M3Divider', () => {
  it('預設 render hr role=separator', () => {
    const w = mount(M3Divider)
    expect(w.element.tagName).toBe('HR')
    expect(w.attributes('role')).toBe('separator')
    expect(w.classes()).toContain('m3-divider')
  })

  it('inset prop 套 inset class', () => {
    const w = mount(M3Divider, { props: { inset: true } })
    expect(w.classes()).toContain('is-inset')
  })

  it('vertical prop 套 vertical class + aria-orientation', () => {
    const w = mount(M3Divider, { props: { vertical: true } })
    expect(w.classes()).toContain('is-vertical')
    expect(w.attributes('aria-orientation')).toBe('vertical')
  })
})
```

- [ ] **Step 2: 跑測試確認 FAIL**

```bash
npm run test -- M3Divider 2>&1 | tail -15
```

- [ ] **Step 3: 實作 M3Divider.vue**

寫入 `src/parent/components/m3/M3Divider.vue`：

```vue
<script setup>
import { computed } from 'vue'

/**
 * Material 3 Divider.
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §4 (M3 spec divider)
 */
const props = defineProps({
  inset: { type: Boolean, default: false },
  vertical: { type: Boolean, default: false },
})

const classes = computed(() => ({
  'm3-divider': true,
  'is-inset': props.inset,
  'is-vertical': props.vertical,
}))

const ariaOrientation = computed(() =>
  props.vertical ? 'vertical' : undefined,
)
</script>

<template>
  <hr :class="classes" role="separator" :aria-orientation="ariaOrientation" />
</template>

<style scoped>
.m3-divider {
  border: none;
  margin: 0;
  background: var(--m3-outline-variant, #c2c9be);
  height: 1px;
  width: 100%;
}
.m3-divider.is-inset {
  margin-left: 16px;
  width: calc(100% - 16px);
}
.m3-divider.is-vertical {
  width: 1px;
  height: auto;
  align-self: stretch;
}
</style>
```

- [ ] **Step 4: 跑測試確認 PASS**

```bash
npm run test -- M3Divider 2>&1 | tail -15
```

Expected: 3 tests passed。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/M3Divider.vue \
       src/parent/components/m3/__tests__/M3Divider.spec.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 新增 M3Divider 元件 + Vitest

inset / vertical 兩個 props，預設水平全寬。3 tests 全綠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 補齊 barrel exports + 全套驗證

**Files:**
- Modify: `src/parent/components/m3/index.js`

- [ ] **Step 1: 改 index.js 補 export**

用 Edit tool 把 `src/parent/components/m3/index.js` 內容：

```js
/**
 * Material 3 元件 barrel export.
 *
 * 使用：
 *   import { M3Icon } from '@/parent/components/m3'
 *
 * P0 只有 M3Icon；P1 起逐步補上 M3Button / M3Card / ...
 */
export { default as M3Icon } from './M3Icon.vue'
```

整檔替換為：

```js
/**
 * Material 3 元件 barrel export.
 *
 * 使用：
 *   import { M3Button, M3Card, M3Icon, M3IconButton, M3List, M3ListItem, M3Chip, M3Divider }
 *     from '@/parent/components/m3'
 *
 * 階段：
 *   - P0: M3Icon
 *   - P1: M3Button, M3Card, M3IconButton, M3List, M3ListItem, M3Chip, M3Divider
 *   - P2: M3TopAppBar, M3NavigationBar, M3FAB（導航）
 *   - P3: M3Dialog, M3BottomSheet, M3Snackbar, M3TextField, ...（互動）
 */
export { default as M3Icon } from './M3Icon.vue'
export { default as M3Button } from './M3Button.vue'
export { default as M3Card } from './M3Card.vue'
export { default as M3IconButton } from './M3IconButton.vue'
export { default as M3List } from './M3List.vue'
export { default as M3ListItem } from './M3ListItem.vue'
export { default as M3Chip } from './M3Chip.vue'
export { default as M3Divider } from './M3Divider.vue'
```

- [ ] **Step 2: 跑全套 m3 測試**

```bash
npm run test -- src/parent/components/m3 2>&1 | tail -20
```

Expected: 全部測試通過。預計 5 + 13 + 9 + 11 + 10 + 13 + 3 = 64 個測試左右（依 `it.each` 展開不同會有差異）。

- [ ] **Step 3: 跑 parent 全套測試確認零 regression**

```bash
npm run test -- src/parent 2>&1 | tail -10
```

Expected: parent app 既有測試零 regression（pre-existing 失敗如 `TodoCenter*`、`HomeHero` 不變，新元件測試全綠）。

- [ ] **Step 4: 確認 barrel 可正常 import**

```bash
node -e "import('./src/parent/components/m3/index.js').then(m => console.log(Object.keys(m).sort())).catch(e => { console.error('FAIL', e.message); process.exit(1); })"
```

備註：Vue SFC 無法直接由 node 解析，所以此檢查可能失敗，這是 expected。改驗證 vitest 能正確 import：

```bash
npm run test -- M3Button M3Card M3IconButton M3List M3Chip M3Divider M3Icon 2>&1 | tail -10
```

Expected: 全部測試 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/components/m3/index.js
git commit -m "$(cat <<'EOF'
feat(parent-m3): 補齊 P1 核心元件 barrel exports

M3Button / M3Card / M3IconButton / M3List / M3ListItem / M3Chip / M3Divider
全部從 @/parent/components/m3 export。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 後備檢查表

實作者在 PR merge 前需逐項打勾：

- [ ] 7 個新元件檔（M3Button / M3Card / M3IconButton / M3List / M3ListItem / M3Chip / M3Divider）全部存在
- [ ] 對應 6 個 spec 檔（M3List + M3ListItem 共用一個 spec 檔）全部存在
- [ ] index.js 已 export 全部 7 個元件
- [ ] 每個元件都有 state layer overlay（`::before` 含 hover/focus/pressed alpha）— `M3Divider` 例外（無互動）
- [ ] 每個元件都用 `--m3-*` token，無寫死 hex 色（只有 fallback hex 在 `var(... , fallback)` 內）
- [ ] 每個元件 disabled 時不觸發 click（測試覆蓋）
- [ ] M3Chip filter selected 顯示 check icon（測試覆蓋）
- [ ] M3ListItem 自動推導 one-line / two-line / three-line 高度
- [ ] 既有 parent app 測試零 regression
- [ ] No remaining `TODO` / `TBD` / `placeholder` 字串在新增檔案內

---

## P1 完成後

- 進 **P2 plan**（導航元件：M3TopAppBar / M3NavigationBar / M3FAB；會動到 `ParentLayout.vue` 全 app 共用 layout）。
- P2 是首個會改既有 view 視覺的 phase，風險上升至 MID（spec §5）。
- P2 plan 由 implementer 重新調用 `superpowers:writing-plans` skill 寫，spec §5 為依據。
