# 家長端多寶家庭子女選擇器統一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 多寶家庭在家長端「永遠看得到正在看誰、跨 PWA session 記住選擇、單一切換管道」。

**Architecture:** `useChildSelection` 持久化升 localStorage（v2 key）；新增 `<ChildContextHeader>` 共用元件（單孩純顯示 / 多寶 tap 開 BottomSheet）；TodayView 的 `ChildrenStrip` 從 navigation cards 改成 selector cards（profile 入口降為卡片右上 IconButton）；7 子 view（Contact / Attendance / Leaves / Fees / Medication / Activity / Family）以 `<ChildContextHeader variant="page" />` 取代 `<ChildSelector />` chip。

**Tech Stack:** Vue 3 SFC `<script setup lang="ts">` / Pinia / vue-router 4 / Vitest + @vue/test-utils。前端 only，0 後端 / 0 router / 0 store 結構改動。

**Spec reference**：`docs/superpowers/specs/2026-05-22-parent-child-selector-unification-design.md`

---

## File Structure

**Modify**：
- `src/parent/composables/useChildSelection.ts` — sessionStorage → localStorage、key v1 → v2、API surface 不動
- `src/parent/components/home/ChildrenStrip.vue` — props 加 `selectedId`、emits 加 `select`、active 視覺、右上 secondary IconButton
- `src/parent/views/TodayView.vue` — hero 接 ChildContextHeader、`hero.kind === 'multi'` 收斂、ChildrenStrip 接線
- `src/parent/views/ContactBookView.vue` — 換元件
- `src/parent/views/AttendanceView.vue` — 換元件
- `src/parent/views/LeavesView.vue` — 換元件
- `src/parent/views/FeesView.vue` — 換元件
- `src/parent/views/MedicationListView.vue` — 換元件
- `src/parent/views/ActivityView.vue` — 換元件（保留 `v-if="tab === 'my'"` 條件）
- `src/parent/views/FamilyView.vue` — 換元件
- `tests/unit/parent/composables/useChildSelection.test.js` — localStorage assertions、key v2
- `tests/unit/parent/components/home/ChildrenStrip.test.js` — selector mode 行為
- `tests/unit/parent/views/TodayView.test.js` — hero multi 文案 + ChildrenStrip stub 加 selectedId emit
- `tests/unit/parent/views/ContactBookView.test.js` — `ChildSelector` stub → `ChildContextHeader` stub
- `tests/unit/parent/views/ContactBookView.routerNav.spec.js` — 同上

**Create**：
- `src/parent/components/ChildContextHeader.vue`
- `tests/unit/parent/components/ChildContextHeader.test.js`

**保留不動**：
- `src/parent/components/ChildSelector.vue`（0 引用後續 sprint 再刪）
- `src/parent/stores/children.ts`
- 路由（不引入 deep link）

---

## Task 0: Worktree 與 branch 建立

**Files:** N/A（terminal commands）

- [ ] **Step 1: 確認 ivy-frontend 在 main 且乾淨於 spec 已落地**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && git log --oneline -1 && git status --short docs/superpowers/specs/`
Expected: 看到最新 commit `docs(parent): 家長端多寶家庭子女選擇器統一 design spec`，spec dir 無 untracked。

- [ ] **Step 2: 建 worktree + branch**

Run:
```bash
cd /Users/yilunwu/Desktop/ivy-frontend && \
  git worktree add .claude/worktrees/parent-child-selector-2026-05-22-frontend \
  -b feat/parent-child-selector-2026-05-22-frontend
```
Expected：`Preparing worktree (new branch ...)` + `HEAD is now at ...`。

- [ ] **Step 3: 切到 worktree 並驗 git 環境**

Run:
```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-child-selector-2026-05-22-frontend && \
  git branch --show-current && git status --short
```
Expected：branch = `feat/parent-child-selector-2026-05-22-frontend`，working tree clean。

- [ ] **Step 4: 安裝依賴（worktree 第一次需獨立 install）**

Run（如果 node_modules 已是 symlink 可跳過；標準做法 install 一次）：
```bash
cd /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/parent-child-selector-2026-05-22-frontend && \
  npm ci
```
Expected：依賴安裝完成，無 EUSAGE 錯誤（若有 EUSAGE 確認 npm 是 10.9.8 不是 11）。

> 後續所有 Task 的相對路徑皆以此 worktree 為 cwd。

---

## Task 1: `useChildSelection` 升級至 localStorage

**Files:**
- Modify: `src/parent/composables/useChildSelection.ts`
- Modify: `tests/unit/parent/composables/useChildSelection.test.js`

- [ ] **Step 1: 改寫測試（先 fail）**

完整覆寫 `tests/unit/parent/composables/useChildSelection.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useChildSelection } from '@/parent/composables/useChildSelection'

// useChildSelection 內部是 module-level singleton ref。
// 每個 test 用 setSelected(null) 重置；不要 vi.resetModules，因為 localStorage 已被寫進去。
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  const { setSelected } = useChildSelection()
  setSelected(null)
})

describe('useChildSelection', () => {
  it('setSelected 將 id 寫入 selectedId 並同步 localStorage（key v2）', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    expect(selectedId.value).toBe(42)
    await nextTick()
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe('42')
  })

  it('setSelected(null) 清空 selectedId 與 localStorage', async () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected(42)
    await nextTick()
    setSelected(null)
    await nextTick()
    expect(selectedId.value).toBe(null)
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe(null)
  })

  it('v1 sessionStorage 殘留不影響 v2 行為', async () => {
    sessionStorage.setItem('parent_selected_student_id_v1', '999')
    const { selectedId, setSelected } = useChildSelection()
    setSelected(5)
    await nextTick()
    expect(selectedId.value).toBe(5)
    expect(localStorage.getItem('parent_selected_student_id_v2')).toBe('5')
  })

  it('ensureSelected：空 children → null', () => {
    const { ensureSelected, selectedId } = useChildSelection()
    const result = ensureSelected([])
    expect(result).toBe(null)
    expect(selectedId.value).toBe(null)
  })

  it('ensureSelected：未選過 → 預設選第一個', () => {
    const { ensureSelected, selectedId } = useChildSelection()
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(1)
    expect(selectedId.value).toBe(1)
  })

  it('ensureSelected：已選過且 id 在 children 中 → 保留', () => {
    const { ensureSelected, setSelected, selectedId } = useChildSelection()
    setSelected(2)
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(2)
    expect(selectedId.value).toBe(2)
  })

  it('ensureSelected：已選的 id 不在 children → 切到第一個', () => {
    const { ensureSelected, setSelected, selectedId } = useChildSelection()
    setSelected(999)
    const result = ensureSelected([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    expect(result).toBe(1)
    expect(selectedId.value).toBe(1)
  })

  it('selectedChild：回傳對應 children 的物件', () => {
    const { setSelected, selectedChild } = useChildSelection()
    const children = ref([
      { student_id: 1, name: 'A' },
      { student_id: 2, name: 'B' },
    ])
    setSelected(2)
    const c = selectedChild(children)
    expect(c.value).toEqual({ student_id: 2, name: 'B' })
  })

  it('selectedChild：找不到 → null', () => {
    const { setSelected, selectedChild } = useChildSelection()
    const children = ref([{ student_id: 1, name: 'A' }])
    setSelected(99)
    const c = selectedChild(children)
    expect(c.value).toBe(null)
  })

  it('selectedChild：children 為 null 時也回 null（不炸）', () => {
    const { selectedChild } = useChildSelection()
    const children = ref(null)
    const c = selectedChild(children)
    expect(c.value).toBe(null)
  })

  it('setSelected 字串 id 會被轉成 Number', () => {
    const { selectedId, setSelected } = useChildSelection()
    setSelected('7')
    expect(selectedId.value).toBe(7)
  })

  it('localStorage 拋例外時不 crash（private mode fallback）', async () => {
    const origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => { throw new Error('quota') }
    const { selectedId, setSelected } = useChildSelection()
    try {
      setSelected(11)
      await nextTick()
      expect(selectedId.value).toBe(11)
    } finally {
      Storage.prototype.setItem = origSetItem
    }
  })
})
```

- [ ] **Step 2: 跑測試確認 fail（key 仍是 v1 / 仍是 sessionStorage）**

Run: `npx vitest run tests/unit/parent/composables/useChildSelection.test.js`
Expected: FAIL — `parent_selected_student_id_v2` localStorage 為 null（因為原 code 寫的是 sessionStorage v1）。

- [ ] **Step 3: 改 composable**

完整覆寫 `src/parent/composables/useChildSelection.ts`：

```ts
/**
 * 多寶家庭子女選擇 composable
 *
 * localStorage 持久化（v2 key），跨 PWA session 保留上次選擇。
 * caller 自行取 children list 並餵給 setOptions() / ensureSelected()。
 */

import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'parent_selected_student_id_v2'

function loadStored(): number | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

function saveStored(id: number | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, String(id))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* private mode 等 throw 時忽略 */
  }
}

const selectedId = ref<number | null>(loadStored())

watch(selectedId, (v) => saveStored(v))

export function useChildSelection() {
  const setSelected = (id: number | null | undefined): void => {
    selectedId.value = id ? Number(id) : null
  }

  const ensureSelected = (children: { student_id: number }[]): number | null => {
    if (!children || children.length === 0) {
      selectedId.value = null
      return null
    }
    const ids = children.map((c) => c.student_id)
    if (selectedId.value && ids.includes(selectedId.value)) {
      return selectedId.value
    }
    selectedId.value = ids[0]
    return ids[0]
  }

  const selectedChild = (children: { value?: { student_id: number }[] | null }) =>
    computed(() => children.value?.find((c) => c.student_id === selectedId.value) || null)

  return {
    selectedId,
    setSelected,
    ensureSelected,
    selectedChild,
  }
}
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `npx vitest run tests/unit/parent/composables/useChildSelection.test.js`
Expected: PASS — 全 12 個 case 綠。

- [ ] **Step 5: 確認 typecheck 不破**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tail -20`
Expected: 無新增 error（既有未動者忽略）。

- [ ] **Step 6: Commit**

```bash
git add src/parent/composables/useChildSelection.ts \
        tests/unit/parent/composables/useChildSelection.test.js
git commit -m "feat(parent): useChildSelection 升級至 localStorage 跨 session 持久化

key 從 parent_selected_student_id_v1 (sessionStorage) → v2 (localStorage)。
API surface 不動 (selectedId/setSelected/ensureSelected/selectedChild)。
加 private mode try/catch fallback。v1 sessionStorage 殘留與 v2 互不影響。"
```

---

## Task 2: 新增 `<ChildContextHeader>` 元件 + 測試

**Files:**
- Create: `src/parent/components/ChildContextHeader.vue`
- Create: `tests/unit/parent/components/ChildContextHeader.test.js`

- [ ] **Step 1: 寫 ChildContextHeader 測試（先 fail，因元件還沒建）**

新建 `tests/unit/parent/components/ChildContextHeader.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ChildContextHeader from '@/parent/components/ChildContextHeader.vue'
import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'

function seedChildren(items) {
  const store = useChildrenStore()
  store.items = items
  store.loaded = true
}

const stubs = {
  ParentBottomSheet: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" class="bsheet-stub"><slot /></div>',
  },
  ParentIcon: true,
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  const { setSelected } = useChildSelection()
  setSelected(null)
})

describe('ChildContextHeader', () => {
  it('children 為空：完全不渲染（避免空欄佔位）', () => {
    seedChildren([])
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.find('.child-context-header').exists()).toBe(false)
  })

  it('單孩家庭：渲染為 div 不可 tap，顯示姓名 + 班級', () => {
    seedChildren([{ student_id: 1, name: '小明', classroom_name: '星辰班' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.text()).toContain('小明')
    expect(wrapper.text()).toContain('星辰班')
    expect(wrapper.find('button.child-context-header').exists()).toBe(false)
    expect(wrapper.find('div.child-context-header').exists()).toBe(true)
  })

  it('多寶家庭：渲染為 button[aria-haspopup="dialog"]', () => {
    seedChildren([
      { student_id: 1, name: '小明', classroom_name: '星辰班' },
      { student_id: 2, name: '小華', classroom_name: '晨曦班' },
    ])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    const btn = wrapper.find('button.child-context-header')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('aria-haspopup')).toBe('dialog')
    expect(btn.attributes('aria-label')).toBe('切換孩子')
  })

  it('多寶 tap → BottomSheet 開啟，列出所有孩子並標記當前選擇', async () => {
    seedChildren([
      { student_id: 1, name: '小明', classroom_name: '星辰班' },
      { student_id: 2, name: '小華', classroom_name: '晨曦班' },
    ])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    await wrapper.find('button.child-context-header').trigger('click')
    expect(wrapper.find('.bsheet-stub').exists()).toBe(true)
    const items = wrapper.findAll('.bsheet-stub [data-child-option]')
    expect(items.length).toBe(2)
    expect(items[0].attributes('data-active')).toBe('true')
    expect(items[1].attributes('data-active')).toBe('false')
  })

  it('多寶選 BottomSheet item → selectedId 更新 + sheet 關閉', async () => {
    seedChildren([
      { student_id: 1, name: '小明' },
      { student_id: 2, name: '小華' },
    ])
    const { selectedId, setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    await wrapper.find('button.child-context-header').trigger('click')
    await wrapper.findAll('.bsheet-stub [data-child-option]')[1].trigger('click')
    await flushPromises()
    expect(selectedId.value).toBe(2)
    expect(wrapper.find('.bsheet-stub').exists()).toBe(false)
  })

  it('variant="hero"：套 hero 樣式（class 含 child-context-header--hero）', () => {
    seedChildren([{ student_id: 1, name: '小明' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, {
      props: { variant: 'hero' },
      global: { stubs },
    })
    expect(wrapper.find('.child-context-header--hero').exists()).toBe(true)
  })

  it('variant 預設為 page', () => {
    seedChildren([{ student_id: 1, name: '小明' }])
    const { setSelected } = useChildSelection()
    setSelected(1)
    const wrapper = mount(ChildContextHeader, { global: { stubs } })
    expect(wrapper.find('.child-context-header--page').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認 fail（元件不存在）**

Run: `npx vitest run tests/unit/parent/components/ChildContextHeader.test.js`
Expected: FAIL — `Cannot find module '@/parent/components/ChildContextHeader.vue'`。

- [ ] **Step 3: 建立 ChildContextHeader.vue**

新建 `src/parent/components/ChildContextHeader.vue`：

```vue
<script setup lang="ts">
/**
 * 家長端「正在看誰」一致性 header。
 *
 * 單孩家庭：純顯示，不可 tap。
 * 多寶家庭：tap 開 BottomSheet 切換孩子。
 *
 * state 全部從 useChildSelection + useChildrenStore 自取，
 * 不從 props 傳 child id，確保 7 view 一致性。
 */
import { computed, ref } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import ParentBottomSheet from './ParentBottomSheet.vue'

interface Child {
  student_id: number
  name?: string
  classroom_name?: string
}

withDefaults(defineProps<{
  variant?: 'page' | 'hero'
}>(), {
  variant: 'page',
})

const childrenStore = useChildrenStore()
const { selectedId, setSelected } = useChildSelection()

const items = computed<Child[]>(() => (childrenStore.items as Child[]) || [])
const isMulti = computed(() => items.value.length > 1)
const current = computed<Child | null>(() =>
  items.value.find((c) => c.student_id === selectedId.value) || items.value[0] || null,
)

const initial = computed(() => String(current.value?.name || '孩').slice(0, 1))
const sheetOpen = ref(false)

function pick(id: number) {
  setSelected(id)
  sheetOpen.value = false
}
</script>

<template>
  <button
    v-if="isMulti && current"
    type="button"
    class="child-context-header"
    :class="`child-context-header--${variant}`"
    aria-haspopup="dialog"
    aria-label="切換孩子"
    @click="sheetOpen = true"
  >
    <span class="cch-avatar">{{ initial }}</span>
    <span class="cch-copy">
      <span class="cch-name">{{ current.name }}</span>
      <span v-if="current.classroom_name" class="cch-sub">{{ current.classroom_name }}</span>
    </span>
    <span class="cch-chevron material-symbols-rounded" aria-hidden="true">expand_more</span>
  </button>

  <div
    v-else-if="!isMulti && current"
    class="child-context-header"
    :class="`child-context-header--${variant}`"
  >
    <span class="cch-avatar">{{ initial }}</span>
    <span class="cch-copy">
      <span class="cch-name">{{ current.name }}</span>
      <span v-if="current.classroom_name" class="cch-sub">{{ current.classroom_name }}</span>
    </span>
  </div>

  <ParentBottomSheet
    v-model="sheetOpen"
    title="切換孩子"
    :snap-points="['mid']"
    default-snap="mid"
  >
    <ul class="cch-list" role="listbox" aria-label="孩子清單">
      <li
        v-for="c in items"
        :key="c.student_id"
        :data-child-option="c.student_id"
        :data-active="c.student_id === selectedId ? 'true' : 'false'"
        role="option"
        :aria-selected="c.student_id === selectedId"
        tabindex="0"
        class="cch-item"
        :class="{ 'cch-item--active': c.student_id === selectedId }"
        @click="pick(c.student_id)"
        @keydown.enter="pick(c.student_id)"
        @keydown.space.prevent="pick(c.student_id)"
      >
        <span class="cch-item-avatar">{{ String(c.name || '孩').slice(0, 1) }}</span>
        <span class="cch-item-copy">
          <span class="cch-item-name">{{ c.name }}</span>
          <span v-if="c.classroom_name" class="cch-item-sub">{{ c.classroom_name }}</span>
        </span>
        <span
          v-if="c.student_id === selectedId"
          class="cch-item-check material-symbols-rounded"
          aria-hidden="true"
        >check</span>
      </li>
    </ul>
  </ParentBottomSheet>
</template>

<style scoped>
.child-context-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  cursor: default;
}
button.child-context-header { cursor: pointer; }
button.child-context-header:active { background: var(--pt-surface-mute-soft); }

.cch-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)));
  color: var(--brand-primary);
  font-weight: 900;
  flex-shrink: 0;
}
.child-context-header--page .cch-avatar {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  font-size: 18px;
}
.child-context-header--hero .cch-avatar {
  width: 62px;
  height: 62px;
  border-radius: 20px;
  font-size: 22px;
}

.cch-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}
.cch-name {
  font-weight: 700;
  color: var(--pt-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.child-context-header--page .cch-name {
  font-size: var(--text-lg, 16px);
}
.child-context-header--hero .cch-name {
  font-size: 24px;
  letter-spacing: -0.01em;
}
.cch-sub {
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  margin-top: 2px;
}

.cch-chevron {
  font-size: 22px;
  color: var(--pt-text-soft);
  flex-shrink: 0;
}

/* BottomSheet 內清單 */
.cch-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cch-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  min-height: var(--touch-target-min, 44px);
}
.cch-item:hover { background: var(--pt-surface-mute-soft); }
.cch-item--active { background: var(--brand-primary-soft); }
.cch-item:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}
.cch-item-avatar {
  width: 40px;
  height: 40px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--pt-surface-mute);
  color: var(--brand-primary);
  font-weight: 800;
  flex-shrink: 0;
}
.cch-item--active .cch-item-avatar {
  background: var(--m3-secondary-container, var(--pt-tint-brand));
}
.cch-item-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.cch-item-name { font-weight: 700; color: var(--pt-text-strong); }
.cch-item-sub { font-size: 12px; color: var(--pt-text-muted); }
.cch-item-check {
  color: var(--brand-primary);
  font-size: 22px;
}
</style>
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `npx vitest run tests/unit/parent/components/ChildContextHeader.test.js`
Expected: PASS — 全 7 個 case 綠。

- [ ] **Step 5: typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tail -20`
Expected: 無新增 error。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/ChildContextHeader.vue \
        tests/unit/parent/components/ChildContextHeader.test.js
git commit -m "feat(parent): 新增 <ChildContextHeader> page+hero 雙 variant

state 全自取 useChildSelection + useChildrenStore，不從 props 傳 child id
保 7 view 跨頁一致性。單孩家庭 div 不可 tap；多寶 button[aria-haspopup=dialog]
tap → ParentBottomSheet 列清單切換。a11y role=option/aria-selected/focus-visible 完備。"
```

---

## Task 3: `ChildrenStrip` 改為 selector mode

**Files:**
- Modify: `src/parent/components/home/ChildrenStrip.vue`
- Modify: `tests/unit/parent/components/home/ChildrenStrip.test.js`

- [ ] **Step 1: 改寫測試（先 fail）**

完整覆寫 `tests/unit/parent/components/home/ChildrenStrip.test.js`：

```js
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChildrenStrip from '@/parent/components/home/ChildrenStrip.vue'

const stubs = { ParentIcon: true, CrownIcon: true }

describe('ChildrenStrip', () => {
  it('children 為空時顯示提示文', () => {
    const wrapper = mount(ChildrenStrip, { props: { children: [] }, global: { stubs } })
    expect(wrapper.text()).toContain('尚未綁定任何學生')
    expect(wrapper.text()).toContain('我的孩子')
  })

  it('渲染 child name + classroom + 各種 tag', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [
          {
            student_id: 1,
            guardian_id: 11,
            name: '王小明',
            classroom_name: '小班A',
            guardian_relation: '父親',
            is_primary: true,
            can_pickup: true,
            lifecycle_status: 'enrolled',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('小班A')
    expect(wrapper.text()).toContain('父親')
    expect(wrapper.text()).toContain('主要聯絡人')
    expect(wrapper.text()).toContain('可接送')
    expect(wrapper.text()).toContain('在學')
  })

  it('classroom_name 為空時顯示「未分班」', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('未分班')
  })

  it('lifecycle_status withdrawn → 已退學', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'withdrawn' }],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('已退學')
  })

  it('點卡片本體 emit select(student_id)，不再 navigate', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 7, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('.child-card').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0]).toEqual([7])
    expect(wrapper.emitted('navigate')).toBeFalsy()
  })

  it('點右上 IconButton emit navigate(/children/:id)', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 7, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('[data-action="open-profile"]').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/children/7'])
    expect(wrapper.emitted('select')).toBeFalsy()
  })

  it('selectedId 對應的卡片加上 active class', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        selectedId: 2,
        children: [
          { student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'enrolled' },
          { student_id: 2, guardian_id: 12, name: 'B', lifecycle_status: 'enrolled' },
        ],
      },
      global: { stubs },
    })
    const cards = wrapper.findAll('.child-card')
    expect(cards[0].classes()).not.toContain('child-card--active')
    expect(cards[1].classes()).toContain('child-card--active')
  })

  it('IconButton click 不冒泡為 card click（避免 select 也被觸發）', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 9, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('[data-action="open-profile"]').trigger('click')
    expect(wrapper.emitted('select')).toBeFalsy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/children/9'])
  })
})
```

- [ ] **Step 2: 跑測試確認 fail**

Run: `npx vitest run tests/unit/parent/components/home/ChildrenStrip.test.js`
Expected: FAIL — `select` event 未發出 / `data-action="open-profile"` 找不到 / `child-card--active` class 不存在。

- [ ] **Step 3: 改 ChildrenStrip.vue**

完整覆寫 `src/parent/components/home/ChildrenStrip.vue`：

```vue
<script setup lang="ts">
/**
 * 家長首頁「我的孩子」selector cards。
 *
 * 點卡片本體 = 切換 selected child（emit select）。
 * 點右上 IconButton = 進 child profile（emit navigate）。
 */
import ParentIcon from '../ParentIcon.vue'
import CrownIcon from '@/components/brand/CrownIcon.vue'

interface Child {
  guardian_id: number
  student_id: number
  name?: string
  classroom_name?: string
  guardian_relation?: string
  is_primary?: boolean
  can_pickup?: boolean
  lifecycle_status?: string
  birthday?: string
}

withDefaults(defineProps<{
  children?: Child[]
  selectedId?: number | null
}>(), {
  children: () => [],
  selectedId: null,
})

const emit = defineEmits<{
  'select': [studentId: number]
  'navigate': [path: string]
}>()

const LIFECYCLE_LABELS: Record<string, string> = {
  active: '在學',
  enrolled: '在學',
  on_leave: '休學中',
  withdrawn: '已退學',
  transferred: '已轉出',
  graduated: '已畢業',
  prospect: '招生中',
}

function lifecycleLabel(s: string | undefined): string {
  return (s ? LIFECYCLE_LABELS[s] : null) || s || ''
}

function isBirthdayToday(child: Child): boolean {
  if (!child.birthday) return false
  const parts = String(child.birthday).split('-')
  if (parts.length < 3) return false
  const [, m, day] = parts.map(Number)
  const d = new Date()
  return d.getMonth() + 1 === m && d.getDate() === day
}

function openProfile(e: Event, c: Child) {
  e.stopPropagation()
  emit('navigate', `/children/${c.student_id}`)
}
</script>

<template>
  <section class="children-section">
    <div class="pt-section-head">
      <h3 class="pt-section-title">我的孩子</h3>
      <span v-if="children.length" class="section-count">{{ children.length }} 位</span>
    </div>
    <div v-if="children.length === 0" class="empty">
      尚未綁定任何學生，請聯絡園所協助。
    </div>
    <div v-else class="children-track" aria-label="孩子清單">
      <button
        v-for="c in children"
        :key="c.guardian_id"
        type="button"
        class="child-card press-scale"
        :class="{ 'child-card--active': selectedId === c.student_id }"
        :aria-pressed="selectedId === c.student_id"
        @click="emit('select', c.student_id)"
      >
        <span class="child-avatar-wrap">
          <CrownIcon
            v-if="isBirthdayToday(c)"
            :size="18"
            decorative
            class="child-crown"
          />
          <span class="child-avatar">{{ String(c.name || '孩').slice(0, 1) }}</span>
        </span>
        <span class="child-copy">
          <span class="child-row">
            <span class="child-name">{{ c.name }}</span>
            <button
              type="button"
              class="child-profile-icon"
              data-action="open-profile"
              aria-label="查看孩子資料"
              @click="(e) => openProfile(e, c)"
            >
              <ParentIcon name="user" size="sm" />
            </button>
          </span>
          <span class="child-classroom">{{ c.classroom_name || '未分班' }}</span>
          <span class="child-meta">
            <span v-if="c.guardian_relation">{{ c.guardian_relation }}</span>
            <span v-if="c.is_primary" class="tag primary">主要聯絡人</span>
            <span v-if="c.can_pickup" class="tag pickup">可接送</span>
            <span class="tag status">{{ lifecycleLabel(c.lifecycle_status) }}</span>
          </span>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.section-count {
  color: var(--pt-text-faint);
  font-size: 12px;
  font-weight: 700;
}

.children-section { display: flex; flex-direction: column; }
.empty {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: 24px 16px;
  text-align: center;
  color: var(--pt-text-placeholder);
  font-size: var(--text-base, 14px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
}
.children-track {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 82%);
  gap: 10px;
  overflow-x: auto;
  padding: 2px 2px 4px;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
}
.children-track::-webkit-scrollbar { display: none; }
.child-card {
  background: var(--pt-surface-card);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  width: 100%;
  text-align: left;
  display: flex;
  gap: 12px;
  scroll-snap-align: start;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.child-card:active {
  background: var(--pt-surface-mute-soft);
}
.child-card--active {
  border-color: var(--brand-primary);
  border-width: 2px;
  box-shadow: 0 0 0 3px var(--brand-primary-soft);
}

.child-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.child-name {
  font-size: var(--text-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-strong);
}
.child-profile-icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: 12px;
  color: var(--pt-text-soft);
  cursor: pointer;
  flex-shrink: 0;
}
.child-profile-icon:hover { background: var(--pt-surface-mute-soft); color: var(--brand-primary); }
.child-profile-icon:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 2px;
}

.child-classroom { font-size: var(--text-sm, 13px); color: var(--pt-text-faint); }
.child-meta {
  margin-top: 10px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-soft);
  align-items: center;
}
.tag {
  padding: 3px 10px;
  border-radius: var(--radius-full, 9999px);
  background: var(--pt-surface-mute);
  font-weight: var(--font-weight-medium, 500);
}
.tag.primary { background: var(--brand-primary-soft); color: var(--brand-primary); }
.tag.pickup { background: var(--color-warning-soft); color: var(--pt-warning-text-mid); }
.tag.status { background: var(--pt-surface-mute-warm); color: var(--pt-text-muted); }

.child-avatar-wrap { position: relative; display: inline-flex; flex-shrink: 0; }
.child-avatar {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--m3-secondary-container, var(--pt-tint-brand, var(--brand-primary-soft)));
  color: var(--brand-primary);
  font-size: 18px;
  font-weight: 900;
}
.child-copy {
  min-width: 0;
  flex: 1;
}
.child-crown {
  position: absolute;
  left: 50%;
  top: -10px;
  transform: translateX(-50%);
  z-index: 2;
}
</style>
```

- [ ] **Step 4: 跑測試確認 pass**

Run: `npx vitest run tests/unit/parent/components/home/ChildrenStrip.test.js`
Expected: PASS — 全 8 個 case 綠。

- [ ] **Step 5: typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tail -20`
Expected: 無新增 error。

- [ ] **Step 6: Commit**

```bash
git add src/parent/components/home/ChildrenStrip.vue \
        tests/unit/parent/components/home/ChildrenStrip.test.js
git commit -m "feat(parent): ChildrenStrip 從 navigation cards 改為 selector cards

- 點本體 = emit select(student_id) 切 selected
- 右上加 44×44 IconButton emit navigate(/children/:id) 保留進 profile 入口
- selectedId prop 對應卡片加 child-card--active 視覺 + aria-pressed
- stopPropagation 避免 IconButton click 同時觸發 card select"
```

---

## Task 4: TodayView 整合 ChildContextHeader + ChildrenStrip selector mode

**Files:**
- Modify: `src/parent/views/TodayView.vue`
- Modify: `tests/unit/parent/views/TodayView.test.js`

- [ ] **Step 1: 改 TodayView.test.js（先 fail）**

Read 既有 `tests/unit/parent/views/TodayView.test.js`：

Run: `cat tests/unit/parent/views/TodayView.test.js | head -180`

找到原 stubs section（約 line 60-70）與「多孩子 hero」測試（約 line 142）。改動兩處：

**改動 A**：ChildrenStrip stub 補上 selectedId + select emit：

```js
// 原（約 line 63）
ChildrenStrip: { props: ['children'], template: '<div class="children-strip-stub" :data-count="children.length"></div>' },
// 改為
ChildrenStrip: {
  props: ['children', 'selectedId'],
  emits: ['select', 'navigate'],
  template: '<div class="children-strip-stub" :data-count="children.length" :data-selected="selectedId"></div>',
},
```

**改動 B**：補上 `ChildContextHeader` stub（與 ContactBookDayCard 等同列）：

```js
ChildContextHeader: { props: ['variant'], template: '<div class="cch-stub" :data-variant="variant"></div>' },
```

**改動 C**：將 `多孩子：hero 顯示「今天 N 位小朋友」` 測試改為新行為：

找到既有 test：
```js
it('多孩子：hero 顯示「今天 N 位小朋友」，ChildrenStrip 接力', ...)
```

改為：
```js
it('多孩子：hero 改顯示 ChildContextHeader（hero variant），不再顯示「今天 N 位」聚合文案', async () => {
  // 用既有 mountTodayView helper 與 2 child mock 資料
  const wrapper = await mountTodayView({
    children: [
      { student_id: 1, name: '小明', classroom_name: '星辰班' },
      { student_id: 2, name: '小華', classroom_name: '晨曦班' },
    ],
    todayChildren: [
      { student_id: 1, name: '小明', attendance: { status: '在園中' } },
      { student_id: 2, name: '小華', attendance: { status: '在園中' } },
    ],
  })
  // 新行為：hero 區渲染 ChildContextHeader stub（variant=hero）
  expect(wrapper.find('.cch-stub[data-variant="hero"]').exists()).toBe(true)
  // 不再有「今天 N 位」聚合文案
  expect(wrapper.text()).not.toContain('今天 2 位小朋友')
  // ChildrenStrip 接力顯示
  expect(wrapper.find('.children-strip-stub').exists()).toBe(true)
})
```

> 注意：原 test 用的 mountTodayView / mock 結構保持不變；只替換這一個 `it()` 的 assertions。若該 helper 缺 `todayChildren` 參數，仿照原 test 的 mock 既有方式注入（不改 helper 介面）。

- [ ] **Step 2: 跑 TodayView 測試確認 fail**

Run: `npx vitest run tests/unit/parent/views/TodayView.test.js`
Expected: FAIL — `.cch-stub` 找不到（TodayView 還沒接 ChildContextHeader）。

- [ ] **Step 3: 改 TodayView.vue**

對 `src/parent/views/TodayView.vue` 做以下三處編輯：

**改動 A**：import 加 ChildContextHeader（接在 ChildrenStrip 之後）：

找：
```vue
import ChildrenStrip from '../components/home/ChildrenStrip.vue'
```
後加一行：
```vue
import ChildContextHeader from '../components/ChildContextHeader.vue'
```

**改動 B**：`hero` computed 改寫——`multi` 分支改顯示 selected 單孩的 status，不再聚合：

找：
```ts
const hero = computed(() => {
  const tc = todayChildren.value || []
  if (tc.length === 0) {
    if (!summaryData.value) return null
    return {
      kind: 'empty',
      label: '尚未綁定子女',
      note: '可從「我的」分頁加綁，或請園所協助。',
    }
  }
  if (tc.length === 1) {
    const c = tc[0]
    return {
      kind: 'single',
      label: childStatusLabel(c),
      note: [c.name, c.classroom_name].filter(Boolean).join('　·　') || null,
    }
  }
  return {
    kind: 'multi',
    label: `今天 ${tc.length} 位小朋友`,
    note: null,
  }
})
```

改為：
```ts
const selectedTodayChild = computed(() => {
  const tc = todayChildren.value || []
  return tc.find((c) => (c as { student_id?: number }).student_id === selectedStudentId.value) || null
})

const hero = computed(() => {
  const tc = todayChildren.value || []
  if (tc.length === 0) {
    if (!summaryData.value) return null
    return {
      kind: 'empty',
      label: '尚未綁定子女',
      note: '可從「我的」分頁加綁，或請園所協助。',
    }
  }
  if (tc.length === 1) {
    const c = tc[0]
    return {
      kind: 'single',
      label: childStatusLabel(c),
      note: [c.name, c.classroom_name].filter(Boolean).join('　·　') || null,
    }
  }
  // 多寶家庭：顯示 selected 單孩的 status，ChildContextHeader 自行顯示姓名/班級
  return {
    kind: 'multi',
    label: childStatusLabel(selectedTodayChild.value),
    note: null,
  }
})
```

**改動 C**：template hero 區插入 ChildContextHeader + ChildrenStrip 接 selectedId/select：

找：
```vue
<header class="today-head">
  <LaurelWreath
    side="right"
    :opacity="0.08"
    :size="132"
    class="today-laurel"
    aria-hidden="true"
  />
  <p class="today-date">{{ todayDateLine }}</p>
  <h1 v-if="hero" class="today-hero">{{ hero.label }}</h1>
  <p v-if="hero?.note" class="today-note">{{ hero.note }}</p>
</header>
```

改為：
```vue
<header class="today-head">
  <LaurelWreath
    side="right"
    :opacity="0.08"
    :size="132"
    class="today-laurel"
    aria-hidden="true"
  />
  <p class="today-date">{{ todayDateLine }}</p>
  <ChildContextHeader v-if="children.length >= 1" variant="hero" class="today-cch" />
  <h1 v-if="hero" class="today-hero">{{ hero.label }}</h1>
  <p v-if="hero?.note" class="today-note">{{ hero.note }}</p>
</header>
```

找：
```vue
<ChildrenStrip
  v-if="children.length > 1"
  :children="children"
  @navigate="go"
/>
```

改為：
```vue
<ChildrenStrip
  v-if="children.length > 1"
  :children="children"
  :selected-id="selectedStudentId"
  @select="setSelected"
  @navigate="go"
/>
```

於 `<script setup>` 區的 destructure 補 `setSelected`：

找：
```ts
const { selectedId: selectedStudentId, ensureSelected } = useChildSelection()
```

改為：
```ts
const { selectedId: selectedStudentId, ensureSelected, setSelected } = useChildSelection()
```

於 `<style scoped>` 加 ChildContextHeader 與 hero 間距：

找：
```css
.today-hero {
  margin: var(--space-2, 8px) 0 0;
```

在 `.today-date { ... }` 後加：
```css
.today-cch {
  margin-top: var(--space-3, 12px);
}
```

- [ ] **Step 4: 跑 TodayView 測試確認 pass**

Run: `npx vitest run tests/unit/parent/views/TodayView.test.js`
Expected: PASS — 所有原 test + 新 assertion 綠。

- [ ] **Step 5: typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tail -20`
Expected: 無新增 error。

- [ ] **Step 6: Commit**

```bash
git add src/parent/views/TodayView.vue \
        tests/unit/parent/views/TodayView.test.js
git commit -m "feat(parent): TodayView hero 接 <ChildContextHeader>，ChildrenStrip 變 selector

- header 插入 ChildContextHeader (variant=hero)，顯示「正在看誰」
- hero.kind=multi 不再顯示「今天 N 位小朋友」聚合，改 selected 單孩 status
- ChildrenStrip 接 selectedId + select event，點卡片切 selected
- profile 入口降為 ChildrenStrip 右上 IconButton（Task 3 已加）"
```

---

## Task 5: 7 子 view 替換 `<ChildSelector />` 為 `<ChildContextHeader variant="page" />`

**Files:**
- Modify: `src/parent/views/ContactBookView.vue`
- Modify: `src/parent/views/AttendanceView.vue`
- Modify: `src/parent/views/LeavesView.vue`
- Modify: `src/parent/views/FeesView.vue`
- Modify: `src/parent/views/MedicationListView.vue`
- Modify: `src/parent/views/ActivityView.vue`
- Modify: `src/parent/views/FamilyView.vue`
- Modify: `tests/unit/parent/views/ContactBookView.test.js`
- Modify: `tests/unit/parent/views/ContactBookView.routerNav.spec.js`

> 7 個 view 都是同一 pattern：import 換 + template 換。逐檔做避免一次性破多檔難排查。

- [ ] **Step 1: 改 ContactBookView.vue**

於 `src/parent/views/ContactBookView.vue`：

找：
```vue
import ChildSelector from '../components/ChildSelector.vue'
```
改為：
```vue
import ChildContextHeader from '../components/ChildContextHeader.vue'
```

找：
```vue
    <ChildSelector />
```
改為：
```vue
    <ChildContextHeader variant="page" />
```

- [ ] **Step 2: 改 ContactBookView 兩個 test 的 stubs**

於 `tests/unit/parent/views/ContactBookView.test.js`：

找（兩處）：
```js
          ChildSelector: true,
```
改為：
```js
          ChildContextHeader: true,
```

於 `tests/unit/parent/views/ContactBookView.routerNav.spec.js`：

找（兩處）：
```js
          ChildSelector: true,
```
改為：
```js
          ChildContextHeader: true,
```

- [ ] **Step 3: 跑 ContactBook 相關測試**

Run: `npx vitest run tests/unit/parent/views/ContactBookView.test.js tests/unit/parent/views/ContactBookView.routerNav.spec.js`
Expected: PASS。

- [ ] **Step 4: 改 AttendanceView.vue**

於 `src/parent/views/AttendanceView.vue`：

找：
```vue
import ChildSelector from '../components/ChildSelector.vue'
```
改為：
```vue
import ChildContextHeader from '../components/ChildContextHeader.vue'
```

找：
```vue
    <ChildSelector />
```
改為：
```vue
    <ChildContextHeader variant="page" />
```

- [ ] **Step 5: 改 LeavesView.vue**

於 `src/parent/views/LeavesView.vue`：相同兩處替換（import + `<ChildSelector />`）。

- [ ] **Step 6: 改 FeesView.vue**

於 `src/parent/views/FeesView.vue`：相同兩處替換。

- [ ] **Step 7: 改 MedicationListView.vue**

於 `src/parent/views/MedicationListView.vue`：相同兩處替換。

- [ ] **Step 8: 改 ActivityView.vue（保留條件 v-if）**

於 `src/parent/views/ActivityView.vue`：

找：
```vue
import ChildSelector from '../components/ChildSelector.vue'
```
改為：
```vue
import ChildContextHeader from '../components/ChildContextHeader.vue'
```

找：
```vue
    <ChildSelector v-if="tab === 'my'" />
```
改為：
```vue
    <ChildContextHeader v-if="tab === 'my'" variant="page" />
```

- [ ] **Step 9: 改 FamilyView.vue**

於 `src/parent/views/FamilyView.vue`：相同兩處替換（import + `<ChildSelector />`）。

- [ ] **Step 10: 確認 ChildSelector 已 0 引用**

Run: `grep -rn "ChildSelector" src/ tests/unit/parent/ 2>/dev/null`
Expected: 只有 `src/parent/components/ChildSelector.vue` 本檔（spec §3 保留），其他全部 0 hit。

- [ ] **Step 11: 跑全套 parent vitest**

Run: `npx vitest run tests/unit/parent/`
Expected: PASS — 既有 test 全綠 + Task 1-4 新增的 test 全綠。如有 fail 通常是漏改某個 stub，再對應補上。

- [ ] **Step 12: typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | tail -20`
Expected: 無新增 error。

- [ ] **Step 13: build 確認 production bundle OK**

Run: `npm run build 2>&1 | tail -30`
Expected: build success（dist/ 產出），無 chunk warning。

- [ ] **Step 14: Commit**

```bash
git add src/parent/views/ContactBookView.vue \
        src/parent/views/AttendanceView.vue \
        src/parent/views/LeavesView.vue \
        src/parent/views/FeesView.vue \
        src/parent/views/MedicationListView.vue \
        src/parent/views/ActivityView.vue \
        src/parent/views/FamilyView.vue \
        tests/unit/parent/views/ContactBookView.test.js \
        tests/unit/parent/views/ContactBookView.routerNav.spec.js
git commit -m "feat(parent): 7 子 view 以 <ChildContextHeader variant=page> 取代 <ChildSelector>

Contact / Attendance / Leaves / Fees / Medication / Activity / Family 7 view 同步。
ActivityView 保留 v-if=\"tab === 'my'\" 條件。
ChildSelector.vue 檔案保留 0 引用，下個 sprint 確認後刪。
view test 兩處 ChildSelector stub 同步換名。"
```

---

## Task 6: 全套驗證 + handoff

**Files:** N/A（驗證）

- [ ] **Step 1: 跑全套 parent + utils vitest**

Run: `npx vitest run tests/unit/parent/ tests/unit/composables/ tests/unit/utils/`
Expected: PASS — 0 regression。

- [ ] **Step 2: typecheck blocking**

Run: `npm run typecheck 2>&1 | tail -10`
Expected: 0 error。

- [ ] **Step 3: 全套 vitest（不限 parent）**

Run: `npx vitest run 2>&1 | tail -30`
Expected: 全綠（既有 admin / utils / api 等 0 regression）。

- [ ] **Step 4: 漂移檢查 — schema.d.ts 不變**

Run: `git diff --stat src/api/_generated/`
Expected: 無 diff（純前端改動不該影響 OpenAPI codegen）。

- [ ] **Step 5: 啟動 dev server 手動驗收前置**

Run（背景）：`npm run dev`
等待 `ready in Xms` 出現後，於另一終端 curl 確認：
```bash
curl -sI http://localhost:5173/parent | head -5
```
Expected: HTTP/1.1 200。

> 完整 UX 驗收（多寶切換、PWA 重啟記憶、IconButton 進 profile）user 在瀏覽器手動跑，不在本 plan 範圍。

- [ ] **Step 6: 結帳清單 — 確認 commits**

Run: `git log --oneline origin/main..HEAD`
Expected：看到 5 個 commits（Task 1/2/3/4/5），每筆訊息符合 Conventional Commits。

- [ ] **Step 7: 產 handoff doc**

新建 `.scratch/parent_child_selector_handoff.md`（workspace 根 `.scratch/`）：

```md
# Parent Child Selector Unification — Handoff

## Branch
feat/parent-child-selector-2026-05-22-frontend  
Worktree: ivy-frontend/.claude/worktrees/parent-child-selector-2026-05-22-frontend

## 改動範圍
- composable: useChildSelection localStorage 升級（key v2）
- 新元件: ChildContextHeader (page + hero variant)
- ChildrenStrip selector mode + profile IconButton
- TodayView hero 整合 + multi 文案收斂
- 7 子 view 換 ChildContextHeader

## Commits (5)
（貼 git log --oneline origin/main..HEAD 輸出）

## 測試
- 全套 parent vitest: PASS
- typecheck: 0 error
- build: success

## 手動驗收清單
- [ ] 多寶家庭：登入後 TodayView 看得到 hero header（avatar + 姓名 + 班級 + chevron）
- [ ] 點 header → BottomSheet 開啟列出 N 個孩子，當前選擇有 check
- [ ] 切換孩子後 TodayView 聯絡簿 hero card 同步換人
- [ ] 點 ChildrenStrip 卡片本體 → selected 改變、active 視覺套上
- [ ] 點卡片右上 IconButton → 跳 /children/:id profile
- [ ] tap ContactBook → ChildContextHeader 顯示同一個孩子（不重置）
- [ ] 切 Attendance / Leaves / Fees / Medication / Activity / Family 都看到同一個孩子
- [ ] 關閉 PWA 重開 → selected 仍是上次選的
- [ ] 單孩家庭：ChildContextHeader 顯示但不可 tap、ChildrenStrip 不顯示

## 未做（spec §3 不在範圍）
- ChildSelector.vue 檔案刪除（下個 sprint）
- 跨裝置同步（需後端 user preference）
- /contact-book/:sid 等深連結
```

- [ ] **Step 8: 結束本 plan**

回報 user：
- worktree 與 branch 名
- 5 commits 摘要
- handoff doc 路徑
- 提示「請手動驗收後 merge + push」

---

## Self-Review Notes

**Spec coverage**：
- §5.1 useChildSelection 升 localStorage → Task 1 ✓
- §5.2 ChildContextHeader 新元件 → Task 2 ✓
- §5.3 改動 A ChildrenStrip selector mode → Task 3 ✓
- §5.3 改動 B/C/D TodayView 重整 → Task 4 ✓
- §5.4 7 子 view 替換 → Task 5 ✓
- §6 測試策略 → Task 1/2/3/4/5 step 1 ✓
- §9 驗收條件 → Task 6 ✓

**Type 一致性**：
- `selectedId: number | null` 全 Task 一致
- `setSelected(id: number | null | undefined)` 簽章不變
- `emit('select', studentId: number)` / `emit('navigate', path: string)` 一致

**Placeholder**：0 個 TBD/TODO，所有 code block 含完整內容。

**潛在風險**：
- TodayView test 既有 helper `mountTodayView` 介面未在本 plan 顯示——Task 4 step 1 註明「保持不變，只替換 it 的 assertions」，若實際 helper 不接受 `todayChildren` 參數，依現有 mock 注入方式調整即可（不改 helper）。
- 7 view 替換 step 拆細是刻意：避免一次大改 7 檔導致 lint/typecheck 報多筆錯難分辨來源。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-parent-child-selector-unification.md`. Two execution options:

1. **Subagent-Driven (recommended)** — 每個 Task 派一個 fresh subagent，task 間我 review checkpoint，反覆迭代快。
2. **Inline Execution** — 本 session 直接跑，batch with checkpoints。

哪一個？
