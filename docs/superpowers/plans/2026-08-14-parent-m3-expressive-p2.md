# 家長端 M3 Expressive 改版 P2（IA 導航重整）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 spec §7（IA 與導航重整）：3 tab＋抽屜 → 5 tab（首頁／孩子／訊息／事務／我的）。新增「孩子」hub 頁聚合聯絡簿／照片／成長報告／健康紀錄／孩子檔案五個入口；「我的」（既有 `/me` route）從抽屜轉正為常駐 tab；MeDrawer 觸發退場。

**Architecture:** 新增一個 hub view（`ChildHubView.vue`，仿照既有 `AdminListView.vue` 的 M3List/M3ListItem 模式）與一條新路由 `/child`；六個既有孩子相關路由的 `meta.tab` 從 `home`/`admin` 改指向 `child`；`AdminListView.vue` 移除「孩子檔案」項目與其專屬邏輯（避免雙入口，邏輯搬到 ChildHubView）；`ParentLayout.vue` 的 `TABS` 陣列從 3 項擴充為 5 項，top bar 頭像改直接導向 `/me`，`MeDrawer` 掛載點與觸發邏輯移除（`.vue` 檔案本身保留，不刪除，符合 spec 過渡期決策）。

**Tech Stack:** Vue 3 SFC（`<script setup lang="ts">`）、vue-router 4（`meta.tab: string`，型別已是裸 string 不需改宣告）、Pinia（`useChildrenStore`）、Vitest（`@vue/test-utils` mount + router mock）。

**Spec:** `docs/superpowers/specs/2026-08-14-parent-liff-m3-expressive-redesign-design.md` §7

## Global Constraints

- **分支基底＝`origin/staging`**，獨立於 P1 分支（`feat/parent-m3-expressive-p1`）。兩批檔案幾乎不重疊（P1 動 styles/m3 元件，P2 動 router/layout/views），各自獨立可回滾，任一批先上都不影響另一批。嚴禁在共用 checkout 切分支，一律 worktree。
- **既有已核實的事實**（勿重新假設）：`tab=me` 路由與 `MeView.vue` 已存在且完整（含通知偏好、費用查詢、個資權利、加綁子女〔在 `ChildrenList.vue` 內建〕、登出）——MeDrawer 的全部 4 個功能在 `/me` 頁都已有對應入口，轉正不會遺失任何功能。
- **`useHomeSummary` composable 目前沒有「孩子」tab 可用的 badge 欄位**（無聯絡簿未讀數等）。本批「孩子」tab **不加 badge**，不為此新增後端欄位、不動 `HomeBadges` interface。
- **已知陷阱（必須處理）**：`tests/unit/parent/components/ParentLayoutTabReTap.test.js` 用 `tabs[1]` 硬編索引代表「訊息」tab（現行 3-tab 陣列的第二項）。TABS 擴充為 `[home, child, messages, admin, me]` 後，訊息變成 index 2。若不同步修正，該測試會靜默驗證錯誤的 tab（表面仍綠，但驗證內容跟測試名稱不符）——Task 5 必須修正，不可漏。
- 元件 API（props/emits/slots）零變動原則延續 P1；`M3List`/`M3ListItem` 直接複用 P1 已 Expressive 化的版本（圓角、按壓回饋皆已就緒，本批不重複處理）。
- 測試指令不可接 `| tail`；vitest 目標檔單獨跑。
- 收尾 gate：`npm run test`、`npm run typecheck`、`npm run build` 三綠。typecheck 若在本機 OOM，比照 P1 做法用 `NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit` 重跑（純環境限制，非程式碼問題）。
- Commit 訊息繁體中文、Conventional Commits，結尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。**不 push**——本計畫終點是本地完成＋驗證綠。

---

### Task 1: 開 worktree

**Files:**
- 無程式碼變更

**Interfaces:**
- Produces: worktree `~/Desktop/ivy-frontend/.claude/worktrees/parent-p2`，分支 `feat/parent-m3-expressive-p2`，基底 `origin/staging`。

- [ ] **Step 1: 開 worktree**

```bash
cd ~/Desktop/ivy-frontend
git fetch origin
git worktree add .claude/worktrees/parent-p2 -b feat/parent-m3-expressive-p2 origin/staging
```

- [ ] **Step 2: node_modules symlink**

```bash
cd ~/Desktop/ivy-frontend/.claude/worktrees/parent-p2
ln -s ~/Desktop/ivy-frontend/node_modules node_modules
```

- [ ] **Step 3: baseline——AdminListView／ParentLayout 既有測試須綠**

```bash
npx vitest run tests/unit/parent/views/AdminListView.test.js src/parent/views/__tests__/AdminListView.badges.test.ts src/parent/views/__tests__/AdminListView.threestates.test.ts tests/unit/parent/components/ParentLayoutTabReTap.test.js tests/unit/parent/components/ParentLayoutBrandMark.test.js
```
Expected: 全 PASS。

---

### Task 2: 新建 ChildHubView.vue ＋ `/child` 路由

**Files:**
- Create: `src/parent/views/ChildHubView.vue`
- Modify: `src/parent/router.ts`（新增 route，插入位置：`/admin` route 之前，維持既有「主 tab 根路徑」群聚慣例）
- Test: `tests/unit/parent/views/ChildHubView.test.js`（新建，仿照 `tests/unit/parent/views/AdminListView.test.js` 的 mock 手法）

**Interfaces:**
- Consumes: `useChildrenStore()`（`items: Ref<{student_id:number,name?:string,classroom_name?:string}[]>`, `load(): Promise<void>`）、`useChildSelection()`（`selectedId: Ref<number|null>`, `ensureSelected(children): void`）——两者签名与 `AdminListView.vue` 现有用法一致。
- Produces: route `/child`（name `parent-child-hub`，`meta: { title: '孩子', tab: 'child' }`）供 Task 5 的 TABS 陣列引用。

- [ ] **Step 1: 寫失敗測試**

```js
// tests/unit/parent/views/ChildHubView.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChildHubView from '@/parent/views/ChildHubView.vue'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/parent/stores/children', () => {
  const useChildrenStore = vi.fn()
  return { useChildrenStore }
})

vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: vi.fn(),
}))

import { useChildrenStore } from '@/parent/stores/children'
import { useChildSelection } from '@/parent/composables/useChildSelection'

function setupStores({ children = [], selectedId = null } = {}) {
  useChildrenStore.mockReturnValue({
    items: children,
    load: vi.fn().mockResolvedValue(undefined),
  })
  useChildSelection.mockReturnValue({
    selectedId: { value: selectedId },
    ensureSelected: vi.fn(),
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  pushMock.mockClear()
})

describe('ChildHubView', () => {
  it('渲染 5 個入口', () => {
    setupStores({ children: [{ student_id: 11, name: '小明' }], selectedId: 11 })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    expect(items).toHaveLength(5)
    expect(w.text()).toContain('今日聯絡簿')
    expect(w.text()).toContain('照片牆')
    expect(w.text()).toContain('成長報告')
    expect(w.text()).toContain('健康紀錄')
    expect(w.text()).toContain('孩子檔案')
  })

  it('5 個入口路徑對齊選中子女', async () => {
    setupStores({ children: [{ student_id: 11 }], selectedId: 11 })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    const paths = ['/contact-book', '/children/11/photos', '/children/11/reports', '/children/11/measurements', '/children/11']
    for (let i = 0; i < paths.length; i++) {
      pushMock.mockClear()
      await items[i].trigger('click')
      expect(pushMock).toHaveBeenCalledWith(paths[i])
    }
  })

  it('無子女時全部 item disabled 且孩子檔案 supporting 顯示尚未綁定', () => {
    setupStores({ children: [], selectedId: null })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    items.forEach((item) => expect(item.classes()).toContain('is-disabled'))
    expect(w.text()).toContain('尚未綁定子女')
  })

  it('selectedId 為 null 但有 children 時 fallback 用第一個 child', async () => {
    setupStores({ children: [{ student_id: 22 }], selectedId: null })
    const w = mount(ChildHubView)
    const items = w.findAll('.m3-list-item')
    await items[4].trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/children/22')
  })

  it('多子女時孩子檔案 supporting 顯示人數', () => {
    setupStores({
      children: [{ student_id: 11, name: '小明' }, { student_id: 12, name: '小華' }],
      selectedId: 11,
    })
    const w = mount(ChildHubView)
    expect(w.text()).toContain('2 位 · 基本資料')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/views/ChildHubView.test.js
```
Expected: FAIL（`ChildHubView.vue` 不存在）。

- [ ] **Step 3: 實作 ChildHubView.vue**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import M3List from '../components/m3/M3List.vue'
import M3ListItem from '../components/m3/M3ListItem.vue'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const children = computed(() =>
  (childrenStore.items || []) as { student_id: number; name?: string }[],
)

/** 目前操作對象子女：優先用選中 id，無選中時 fallback 第一位。 */
const targetId = computed(() => selectedId.value || children.value[0]?.student_id || null)

const childSupporting = computed(() => {
  const list = children.value
  if (list.length === 0) return '尚未綁定子女'
  if (list.length === 1) return `${list[0].name || ''} · 基本資料 / 健康 / 照片 / 報告`
  return `${list.length} 位 · 基本資料 / 健康 / 照片 / 報告`
})

interface HubItem {
  key: string
  headline: string
  supportingText: string
  leadingIcon: string
  path: string | null
}

const items = computed<HubItem[]>(() => {
  const id = targetId.value
  return [
    {
      // path 依 id 而非固定字串：無子女時本項也要 disabled（聯絡簿依所選子女顯示，
      // 沒有子女就沒有聯絡簿可看），維持五項一致的 disabled 語意。
      key: 'contact-book',
      headline: '今日聯絡簿',
      supportingText: '出席、餐點、午睡、老師留言',
      leadingIcon: 'auto_stories',
      path: id ? '/contact-book' : null,
    },
    {
      key: 'photos',
      headline: '照片牆',
      supportingText: '在園日常隨手拍',
      leadingIcon: 'photo_library',
      path: id ? `/children/${id}/photos` : null,
    },
    {
      key: 'reports',
      headline: '成長報告',
      supportingText: '歷次評量與發展紀錄',
      leadingIcon: 'insights',
      path: id ? `/children/${id}/reports` : null,
    },
    {
      key: 'measurements',
      headline: '健康紀錄',
      supportingText: '身高體重、疫苗、過敏資訊',
      leadingIcon: 'monitor_heart',
      path: id ? `/children/${id}/measurements` : null,
    },
    {
      key: 'profile',
      headline: '孩子檔案',
      supportingText: childSupporting.value,
      leadingIcon: 'folder_shared',
      path: id ? `/children/${id}` : null,
    },
  ]
})

function go(item: HubItem) {
  if (item.path) router.push(item.path)
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(children.value)
})
</script>

<template>
  <div class="child-hub-view">
    <M3List>
      <M3ListItem
        v-for="item in items"
        :key="item.key"
        :headline="item.headline"
        :supporting-text="item.supportingText"
        :leading-icon="item.leadingIcon"
        trailing-icon="chevron_right"
        :clickable="!!item.path"
        :disabled="!item.path"
        @click="go(item)"
      />
    </M3List>
  </div>
</template>

<style scoped>
.child-hub-view {
  padding: 8px 0 16px;
  background: var(--m3-surface, #f7fbf3);
  min-height: 100%;
}
</style>
```

- [ ] **Step 4: 新增路由**

於 `src/parent/router.ts`，在 `/admin` route 定義之前插入：

```ts
    {
      path: '/child',
      name: 'parent-child-hub',
      component: () => import('./views/ChildHubView.vue'),
      meta: { title: '孩子', tab: 'child' },
    },
```

- [ ] **Step 5: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/views/ChildHubView.test.js
```
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/parent/views/ChildHubView.vue src/parent/router.ts tests/unit/parent/views/ChildHubView.test.js
git commit -m "feat(parent): 新增孩子 hub 頁聚合聯絡簿/照片/成長報告/健康紀錄/孩子檔案五入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 既有孩子相關路由 meta.tab 改為 'child'

**Files:**
- Modify: `src/parent/router.ts`
- Test: `tests/unit/parent/routerChildTab.spec.ts`（新建）

**Interfaces:**
- Consumes: 無
- Produces: 六條既有路由的 `meta.tab` 從 `home`/`admin` 改為 `child`，供 Task 5 的 nav bar active 狀態判斷正確歸屬。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/routerChildTab.spec.ts
import { describe, it, expect } from 'vitest'
import router from '@/parent/router'

const CHILD_TAB_PATHS = [
  '/contact-book',
  '/contact-book/:entryId',
  '/children/:studentId',
  '/children/:studentId/reports',
  '/children/:studentId/photos',
  '/children/:studentId/measurements',
]

describe('孩子相關路由 tab 歸屬（P2 IA 重整）', () => {
  it.each(CHILD_TAB_PATHS)('%s 的 meta.tab 為 child', (path) => {
    const route = router.getRoutes().find((r) => r.path === path)
    expect(route).toBeTruthy()
    expect(route?.meta.tab).toBe('child')
  })

  it('/child hub 本身 meta.tab 為 child', () => {
    const route = router.getRoutes().find((r) => r.path === '/child')
    expect(route).toBeTruthy()
    expect(route?.meta.tab).toBe('child')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/routerChildTab.spec.ts
```
Expected: FAIL（6 個 `home`/`admin` 路由目前 tab 值不對）。

- [ ] **Step 3: 實作——逐一改 `router.ts` 六處 `meta.tab`**

```ts
// /contact-book
      meta: { title: '聯絡簿', tab: 'child', showBack: true },
// /contact-book/:entryId
      meta: { title: '聯絡簿詳情', tab: 'child', showBack: true },
// /children/:studentId
      meta: { title: '孩子檔案', tab: 'child', showBack: true },
// /children/:studentId/reports
      meta: { title: '歷次成長報告', tab: 'child', showBack: true },
// /children/:studentId/photos
      meta: { title: '照片牆', tab: 'child', showBack: true },
// /children/:studentId/measurements
      meta: { title: '健康紀錄', tab: 'child', showBack: true },
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/routerChildTab.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/parent/router.ts tests/unit/parent/routerChildTab.spec.ts
git commit -m "refactor(parent): 孩子相關六條路由 meta.tab 改歸屬 child（聯絡簿/孩子檔案/報告/照片/量測）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: AdminListView 移除「孩子檔案」項目（避免雙入口）

**Files:**
- Modify: `src/parent/views/AdminListView.vue`
- Modify: `tests/unit/parent/views/AdminListView.test.js`（移除 6 個孩子檔案相關測試、更新第一個測試斷言）

**Interfaces:**
- Consumes: 無
- Produces: `AdminListView` 只剩 7 個一般行政項目，不再依賴 `useChildrenStore`/`useChildSelection`。

- [ ] **Step 1: 修改 `AdminListView.vue`——移除孩子檔案相關程式碼**

刪除以下內容（對照現檔）：
- `import { useChildrenStore } from '../stores/children'`
- `import { useChildSelection } from '../composables/useChildSelection'`
- `import M3Divider from '../components/m3/M3Divider.vue'`
- `const childrenStore = useChildrenStore()`
- `const { selectedId, ensureSelected } = useChildSelection()`
- `const children = computed(...)` （`childProfileTarget` 用到的那個）
- `const childProfileTarget = computed(...)`
- `const childProfileSupporting = computed(...)`
- `function goChildProfile() {...}`
- `onMounted` 內的 `await childrenStore.load()` 與 `ensureSelected(children.value)`（若 `onMounted` 整個 block 只做這兩件事，整個 `onMounted` 一併刪除；若還有其他用途需保留，此檔案唯一 `onMounted` 只做這兩件事，故整段刪除，`import { onMounted, ref } from 'vue'` 也需同步移除 `onMounted`，保留 `ref`〔`pendingPickupCount` 用到〕）
- template 內 `<M3Divider class="admin-divider" />` 與其後整個「孩子檔案」`<M3ListItem>` 區塊
- `<style scoped>` 內 `.admin-divider` 規則（不再被消費）

- [ ] **Step 2: 更新既有測試——移除孩子檔案相關 6 個測試，修正第一個測試**

於 `tests/unit/parent/views/AdminListView.test.js`：

移除整個 `vi.mock('@/parent/stores/children', ...)`、`vi.mock('@/parent/composables/useChildSelection', ...)` 兩個 mock 區塊，以及對應的 `import { useChildrenStore } from ...`、`import { useChildSelection } from ...`、`setupStores` 函式（改為不需要這些 store，直接呼叫 `mount(AdminListView)` 不需前置 setup）。

移除以下 5 個測試（邏輯已搬到 `ChildHubView.test.js`）：
- `'有單一子女時 孩子檔案 supporting text 含名字'`
- `'多子女時 孩子檔案 supporting 顯示人數'`
- `'無子女時 孩子檔案 supporting 顯示尚未綁定，item disabled'`
- `'點孩子檔案 → /children/:selectedId'`
- `'selectedId 為 null 但有 children 時 fallback 用第一個 child'`

修改第一個測試：

```js
  it('渲染 7 個主行政 item', () => {
    const w = mount(AdminListView)
    const items = w.findAll('.m3-list-item')
    expect(items).toHaveLength(7)
    expect(w.text()).toContain('請假')
    expect(w.text()).toContain('繳費')
    expect(w.text()).toContain('用藥委託')
    expect(w.text()).toContain('課後才藝')
    expect(w.text()).toContain('待簽紀錄')
    expect(w.text()).toContain('活動調查')
    expect(w.text()).toContain('臨時接送')
    expect(w.text()).not.toContain('孩子檔案')
  })
```

其餘測試（`'點請假 → /leaves'`、`'6 行政 item 路徑對齊'`）不需要 `setupStores()` 前置呼叫，直接移除該行呼叫即可，測試邏輯本身不變。

- [ ] **Step 3: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/views/AdminListView.test.js src/parent/views/__tests__/AdminListView.badges.test.ts src/parent/views/__tests__/AdminListView.threestates.test.ts
```
Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add src/parent/views/AdminListView.vue tests/unit/parent/views/AdminListView.test.js
git commit -m "refactor(parent): AdminListView 移除孩子檔案二級入口——已移至孩子 hub 避免雙入口

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: ParentLayout TABS 擴充為 5 項 ＋ 頭像改導向 /me ＋ MeDrawer 觸發退場

**Files:**
- Modify: `src/parent/layouts/ParentLayout.vue`
- Modify: `tests/unit/parent/components/ParentLayoutTabReTap.test.js`（修正硬編 tab index，見 Global Constraints 已知陷阱）
- Test: `tests/unit/parent/components/ParentLayoutTabs.spec.ts`（新建）

**Interfaces:**
- Consumes: Task 2 產出的 `/child` route
- Produces: `TABS` 陣列 5 項（`home, child, messages, admin, me`）；頭像 icon 點擊導航 `/me`；`MeDrawer` 元件不再掛載於 `ParentLayout`（`.vue` 檔案本身不刪除）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/parent/components/ParentLayoutTabs.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import ParentLayout from '@/parent/layouts/ParentLayout.vue'

vi.mock('@/parent/api/announcements', () => ({
  getUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))
vi.mock('@/parent/api/messages', () => ({
  getMessageUnreadCount: vi.fn().mockResolvedValue({ data: { unread_count: 0 } }),
}))

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home', name: 'h', meta: { tab: 'home', title: '首頁' }, component: { template: '<div/>' } },
    ],
  })
  router.push('/home')
  return router
}

async function mountLayout() {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.isReady()
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(ParentLayout, {
    global: {
      plugins: [router],
      stubs: {
        M3TopAppBar: {
          template: '<header><slot name="actions" /></header>',
        },
        M3NavigationBar: {
          template: '<nav><button v-for="item in items" :key="item.key" class="tab" :data-key="item.key">{{ item.label }}</button></nav>',
          props: ['items', 'currentKey'],
          emits: ['select'],
        },
        ConnectionBanner: true,
        MeDrawer: true,
      },
    },
  })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

describe('ParentLayout 5-tab 導航（P2 IA 重整）', () => {
  it('TABS 依序為 home/child/messages/admin/me', async () => {
    const { wrapper } = await mountLayout()
    const keys = wrapper.findAll('.tab').map((el) => el.attributes('data-key'))
    expect(keys).toEqual(['home', 'child', 'messages', 'admin', 'me'])
  })

  it('點頭像 icon 導向 /me，不再開啟 MeDrawer', async () => {
    const { wrapper, pushSpy } = await mountLayout()
    const avatarBtn = wrapper.find('[aria-label="開啟個人選單"]')
    // 若頭像已改語意，aria-label 也應同步更新；先驗證能找到頭像觸發點並點擊後導航正確
    expect(avatarBtn.exists() || wrapper.find('[aria-label="我的"]').exists()).toBe(true)
    const target = avatarBtn.exists() ? avatarBtn : wrapper.find('[aria-label="我的"]')
    await target.trigger('click')
    expect(pushSpy).toHaveBeenCalledWith('/me')
  })

  it('不再掛載 MeDrawer（drawerOpen 邏輯已退場）', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.findComponent({ name: 'MeDrawer' }).exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/unit/parent/components/ParentLayoutTabs.spec.ts
```
Expected: FAIL（TABS 目前只有 3 項；頭像仍開 drawer；MeDrawer 仍掛載）。

- [ ] **Step 3: 實作——修改 `ParentLayout.vue`**

(a) `TABS` computed 改為 5 項：

```ts
const TABS = computed<TabItem[]>(() => [
  {
    key: 'home',
    label: '首頁',
    icon: 'home',
    activeIcon: 'home',
    path: '/home',
  },
  {
    key: 'child',
    label: '孩子',
    icon: 'child_care',
    activeIcon: 'child_care',
    path: '/child',
  },
  {
    key: 'messages',
    label: '訊息',
    icon: 'chat_bubble',
    activeIcon: 'chat_bubble',
    path: '/messages',
    badge: messagesTabBadge.value,
  },
  {
    key: 'admin',
    label: '事務',
    icon: 'assignment',
    activeIcon: 'assignment',
    path: '/admin',
    badge: adminTabBadge.value,
  },
  {
    key: 'me',
    label: '我的',
    icon: 'account_circle',
    activeIcon: 'account_circle',
    path: '/me',
  },
])
```

(b) 移除 `const drawerOpen = ref(false)`；移除 `import MeDrawer from '../components/layout/MeDrawer.vue'`；移除 `<MeDrawer v-if="!isPublic" v-model="drawerOpen" />`。

(c) 頭像按鈕改為導航：

```html
      <template #actions>
        <M3IconButton
          icon="account_circle"
          aria-label="我的"
          @click="router.push('/me')"
        />
      </template>
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/unit/parent/components/ParentLayoutTabs.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 5: 修正既有 `ParentLayoutTabReTap.test.js` 的硬編 index（Global Constraints 已知陷阱）**

新 5-tab 順序 `[home, child, messages, admin, me]` 下，「訊息」是 index 2（非原本 index 1）。修改：

- 第 2 個測試 `'在 /home，點 messages tab → 不觸發 scrollTo（讓 router 正常導航）'`：`tabs[1]` → `tabs[2]`，並更新行內註解「messages 是第二個 tab（IA v2 Phase 3 4-tab）」為「messages 是第三個 tab（P2 5-tab：home/child/messages/admin/me）」
- 第 3 個測試 `'在 /messages/123 深層，點 messages tab → 不觸發 scrollTo（仍應導航回 /messages）'`：同上 `tabs[1]` → `tabs[2]`，註解同步更新
- 第 1、4 個測試（`tabs[0]` 代表 home）不需要改

- [ ] **Step 6: 跑修正後的測試確認通過（含既有 BrandMark 測試）**

```bash
npx vitest run tests/unit/parent/components/ParentLayoutTabReTap.test.js tests/unit/parent/components/ParentLayoutBrandMark.test.js tests/unit/parent/components/ParentLayoutTabs.spec.ts
```
Expected: 全 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/parent/layouts/ParentLayout.vue tests/unit/parent/components/ParentLayoutTabReTap.test.js tests/unit/parent/components/ParentLayoutTabs.spec.ts
git commit -m "feat(parent): 底部導航擴充為 5 tab（home/child/messages/admin/me），頭像改導向我的頁

- TABS 新增 child（孩子 hub）與 me（我的，既有 /me route 轉正常駐）
- top bar 頭像 icon 點擊改直接導航 /me，MeDrawer 掛載與 drawerOpen 狀態移除
  （.vue 檔案本身保留一個 release 週期，功能已全數存在於 /me 頁）
- 修正 ParentLayoutTabReTap.test.js 硬編 tab index（原 index 1=訊息，
  5-tab 下訊息變 index 2，未修正會靜默驗證錯誤的 tab）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 全量驗證與收尾

**Files:**
- 無新變更（驗證＋必要修補）

**Interfaces:**
- Consumes: Task 1–5 全部產出
- Produces: 三綠（test/typecheck/build）＋視覺抽查證據，P2 本地完成。

- [ ] **Step 1: 全量測試**

```bash
npx vitest run
```
Expected: 全 PASS。紅的逐一判定（斷言過時→同步更新為精確新斷言；回歸→修）。若出現與本次改動無關的 timeout 型紅燈，先確認是否為機器資源競爭（單獨重跑該檔案），比照 P1 教訓不要同時疊加多個重量級背景任務。

- [ ] **Step 2: typecheck**

```bash
npm run typecheck
```
若 OOM：

```bash
NODE_OPTIONS="--max-old-space-size=6144" npx vue-tsc --noEmit
```
Expected: 零錯誤。

- [ ] **Step 3: build＋chunk gate**

```bash
npm run build
```
Expected: 成功；`check-entry-chunks` 通過；家長端首屏 gz 與 P1 完成時的 232.2KB 量級比對，新增一個 route/view 預期增幅在數 KB 內（`ChildHubView.vue` 邏輯簡單），不應逼近 245KB 預算；若逼近，檢查 `ChildHubView.vue` 是否誤 import 了不該進首屏 eager chunk 的模組。

- [ ] **Step 4: 視覺抽查**

在 worktree 起 `npx vite --port 5175`（與 P1 worktree 可能同時開著的 5174 錯開），瀏覽器開 `http://localhost:5175/parent.html`。比照 P1 的降級路徑：登入頁本身無法展示導航列（`hideTabBar: true`），若本機無 LIFF／無測試帳密卡在登入頁，改用 `mcp__claude-in-chrome__javascript_tool` 於 devtools console 執行以下任一種降級驗證：
1. 直接對 `ParentLayoutTabs.spec.ts` 的 mount 結果做元件級驗證（已在 Task 5 完成，vitest 已覆蓋 5-tab 渲染正確性），視覺抽查改為**確認 build 產物中 `parent-app` chunk 內含 `ChildHubView` 且未誤入其他 chunk**：
```bash
grep -o "ChildHubView[^\"']*" dist/assets/parent-app-*.js | head -3
```
2. 若能取得登入態（使用者提供測試帳密或走 debug token），截圖 `/child`、`/admin`（確認孩子檔案已移除）、底部 5-tab 導航列 light/dark 各一張，存 workspace `.scratch/`。
完成後關掉 dev server。

- [ ] **Step 5: 收尾狀態回報（不 push）**

```bash
git log --oneline origin/staging..HEAD
git status
```
整理：commit 清單、測試/typecheck/build 結果、首屏 gz 差、視覺抽查證據或降級說明。回報使用者等待 staging 授權——**本計畫到此為止，push 與 promotion 不在 scope**。

---

## Self-Review 紀錄

- **Spec 覆蓋**：§7 全部要求對應——5 tab 結構（Task 5）、孩子 hub 聚合五入口（Task 2）、既有孩子路由改 tab 歸屬（Task 3）、事務頁孩子相關條目移除避免雙入口（Task 4）、我的轉正＋MeDrawer 退場（Task 5）、孩子 tab 不加 badge（Global Constraints 明訂，無 Task 誤做）。
- **無 placeholder**：所有程式碼與測試皆為實際內容；Task 2 的 Step 3→4 修正是刻意保留的「先寫出會被自己抓到問題的版本、再修正」流程紀錄，非佔位符。
- **型別/命名一致**：`ChildHubView.vue` 的 `targetId`/`items`/`go()` 在 Task 2 內自洽；Task 3 的六個 path 字串與 Task 2 `ChildHubView.vue` 內組出的路徑（`/children/${id}/...`）核對一致；Task 5 的 `TABS` key `child`/`me` 與 Task 2/3 產出的 `meta.tab` 值一致。
- **已知陷阱**：`ParentLayoutTabReTap.test.js` 的硬編 index 問題已納入 Global Constraints 與 Task 5 Step 5，非事後補救。
