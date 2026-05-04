# 家長溝通整合到班級教務工作台 Implementation Plan

> **⚠ SCOPE 變更（2026-05-04 mid-execution）：** 公告通知不再合進 class-hub，改為 sidebar 頂層獨立 menu item。
> - Task 2（ClassHubAnnouncementsDrawer）已撤銷（commit 後又 git rm）
> - Task 4 CommBar 改為單卡（家長訊息）
> - Task 5 PortalClassHubView 不引用 AnnouncementsDrawer
> - Task 6 PortalLayout 新增頂層「公告通知」menu item，badge 聚合不含 announcements
> - Task 7 router 不對 `/portal/announcements` 做 redirect
> - Task 8 不刪 `PortalAnnouncementView.vue`
>
> 詳見 spec § 1, § 2 變更說明。實作時以 spec 為準，plan 內部 Task 5-8 程式碼需改寫（對應 task 在 dispatch 時用更新後的 prompt）。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把教師端側欄「家長訊息」深度整合進 `/portal/class-hub`，老師一站式處理班務 + 家長溝通；公告通知獨立到 sidebar 頂層 menu item（非家園溝通）；舊 messages 路由透過 router redirect 接住 deeplink 存量。

**Scope 變更（2026-05-04）：** 公告通知不再合進 class-hub。原因：業主反饋公告通知為校內內部通知（學校→教師），不屬家園溝通範疇。改為獨立 sidebar 頂層 menu item，與「我的排班」「學校行事曆」並列。

**Architecture:** `PortalClassHubView` 頂端新增 `ClassHubCommBar`（一張家長訊息摘要卡），點擊從右側滑入 `ClassHubMessagesDrawer`（list ↔ thread 雙視圖）。Drawer 開關狀態由 URL `?panel=messages&thread=:id` query 同步，舊 `/portal/messages*` 路由改成 redirect 到 class-hub 對應 query。`/portal/announcements` 維持原 view 與路由不變。前端純改動，後端 / store / API client 完全 reuse。

**Tech Stack:** Vue 3 + Vite + Pinia + Vue Router 4 + Element Plus + Vitest（unit）。

**對應 spec：** `docs/superpowers/specs/2026-05-04-class-hub-parent-comms-integration-design.md`

**分支：** `feat/portal-comm-classhub-merge-v1`（前端，從 main 開新分支執行；不要繼承 `feat/portal-mobile-ux-v1` 的 WIP）。

**重要慣例（依 user CLAUDE.md memory）：**
- 所有 commit 用具名 file（`git add path/to/file`），不要 `git add -A`，避免帶到 baseline WIP
- commit message 用繁體中文 Conventional Commits

---

## File Structure

### 新增檔案

| 路徑 | 職責 | 行數預估 |
|------|------|----------|
| `src/composables/useClassHubPanelQuery.js` | URL `?panel=` `&thread=` query 同步 helper（open/close panel、open/close thread + 重複呼叫 guard） | ~50 |
| `src/components/portal/class-hub/ClassHubCommBar.vue` | 一張置頂摘要卡（家長訊息）；權限分流；emit `open-panel` 事件 | ~80 |
| `src/components/portal/class-hub/ClassHubMessagesDrawer.vue` | 訊息 drawer 容器；雙視圖切換（list ↔ thread）；reuse `MessageBubble` + `MessageComposer` | ~370 |
| `tests/unit/composables/useClassHubPanelQuery.test.js` | composable 單元測試（含 guard 驗證） | ~140 |

### 修改檔案

| 路徑 | 修改內容 |
|------|---------|
| `src/views/portal/PortalClassHubView.vue` | 加入 `<ClassHubCommBar>` + messages drawer；用 `useClassHubPanelQuery` 接 URL；listen drawer 內 emit |
| `src/layouts/PortalLayout.vue` | 移除「家園溝通」`el-sub-menu`（L310-325）；新增頂層「公告通知」menu item；class-hub menu item badge 改聚合（hub + messages） |
| `src/router/index.js` | 刪除兩條 portal-messages / portal-message-thread routes 與 view import；新增兩條 redirect routes；保留 portal-announcements route 不動 |

### 刪除檔案

- `src/views/portal/PortalMessagesView.vue`
- `src/views/portal/PortalMessageThreadView.vue`

**保留**：`src/views/portal/PortalAnnouncementView.vue`（仍由獨立 sidebar 入口使用）

### 完全不動

- `src/api/portalMessages.js`、`src/api/portal.js`、`src/api/announcements.js`
- `src/stores/portalMessages.js`
- `src/components/portal/messages/MessageBubble.vue`、`MessageComposer.vue`
- 後端所有檔案

---

## Task 0：建立分支與基線檢查

**Files:** 無（git 操作）

- [ ] **Step 1：確認 main 為乾淨基底**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git status
git checkout main
git pull --ff-only origin main
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2：建立新分支**

```bash
git checkout -b feat/portal-comm-classhub-merge-v1
git status
```

Expected: `On branch feat/portal-comm-classhub-merge-v1`

- [ ] **Step 3：把 spec doc cherry-pick 過來（spec 已 commit 在 feat/portal-mobile-ux-v1）**

```bash
git log feat/portal-mobile-ux-v1 --oneline | grep "docs(spec): 家長溝通"
# 找到 commit hash，例如 fa27ecdf
git cherry-pick <hash>
```

Expected: spec 檔出現在新分支。若衝突 → `git cherry-pick --abort` 並改用以下備案：

```bash
# 備案：直接 checkout spec 檔到新分支
git checkout feat/portal-mobile-ux-v1 -- docs/superpowers/specs/2026-05-04-class-hub-parent-comms-integration-design.md
git add docs/superpowers/specs/2026-05-04-class-hub-parent-comms-integration-design.md
git commit -m "docs(spec): 家長溝通整合 spec（從 portal-mobile-ux-v1 引用）"
```

- [ ] **Step 4：驗證 baseline 測試全綠**

```bash
npm test -- --run
```

Expected: 所有既有 unit 測試 PASS。若有 fail → 處理掉（baseline 必須乾淨）才能往下。

---

## Task 1：useClassHubPanelQuery composable（TDD）

**Files:**
- Create: `src/composables/useClassHubPanelQuery.js`
- Test: `tests/unit/composables/useClassHubPanelQuery.test.js`

設計目標：以 URL query 表達 drawer 開關狀態 + thread 焦點，避免 component state 與 URL 脫鉤；含 guard 防止重複 push 污染 history。

- [ ] **Step 1：寫失敗的測試**

完整貼上 `tests/unit/composables/useClassHubPanelQuery.test.js`：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const mockRoute = { query: {} }
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
}

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => mockRouter,
}))

import { useClassHubPanelQuery } from '@/composables/useClassHubPanelQuery'

describe('useClassHubPanelQuery', () => {
  beforeEach(() => {
    mockRoute.query = {}
    mockRouter.push.mockClear()
    mockRouter.replace.mockClear()
  })

  describe('panel computed', () => {
    it('query 沒有 panel 時回傳 null', () => {
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBeNull()
    })

    it('query 有 panel=messages 時回傳 messages', () => {
      mockRoute.query = { panel: 'messages' }
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBe('messages')
    })

    it('query 有 panel=announcements 時回傳 announcements', () => {
      mockRoute.query = { panel: 'announcements' }
      const { panel } = useClassHubPanelQuery()
      expect(panel.value).toBe('announcements')
    })
  })

  describe('threadId computed', () => {
    it('query 沒有 thread 時回傳 null', () => {
      const { threadId } = useClassHubPanelQuery()
      expect(threadId.value).toBeNull()
    })

    it('query 有 thread=42 時回傳 number 42', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { threadId } = useClassHubPanelQuery()
      expect(threadId.value).toBe(42)
    })
  })

  describe('openPanel', () => {
    it('開啟 messages panel 時 push query', () => {
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: undefined },
      })
    })

    it('已在同 panel 且無 thread 時不重複 push（guard）', () => {
      mockRoute.query = { panel: 'messages' }
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('在同 panel 但有 thread 時，openPanel 會清掉 thread', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { openPanel } = useClassHubPanelQuery()
      openPanel('messages')
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: undefined },
      })
    })
  })

  describe('closePanel', () => {
    it('panel 與 thread 都不存在時不 replace（guard）', () => {
      const { closePanel } = useClassHubPanelQuery()
      closePanel()
      expect(mockRouter.replace).not.toHaveBeenCalled()
    })

    it('清掉 panel 與 thread query，保留其他 query', () => {
      mockRoute.query = { panel: 'messages', thread: '42', foo: 'bar' }
      const { closePanel } = useClassHubPanelQuery()
      closePanel()
      expect(mockRouter.replace).toHaveBeenCalledWith({ query: { foo: 'bar' } })
    })
  })

  describe('openThread', () => {
    it('push messages panel 加 thread', () => {
      const { openThread } = useClassHubPanelQuery()
      openThread(42)
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages', thread: '42' },
      })
    })

    it('已在同 thread 時不重複 push（guard）', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { openThread } = useClassHubPanelQuery()
      openThread(42)
      expect(mockRouter.push).not.toHaveBeenCalled()
    })
  })

  describe('closeThread', () => {
    it('當前已在 list（panel=messages 無 thread）時不重複 push', () => {
      mockRoute.query = { panel: 'messages' }
      const { closeThread } = useClassHubPanelQuery()
      closeThread()
      expect(mockRouter.push).not.toHaveBeenCalled()
    })

    it('從 thread view 返 list 時 push panel=messages 不帶 thread', () => {
      mockRoute.query = { panel: 'messages', thread: '42' }
      const { closeThread } = useClassHubPanelQuery()
      closeThread()
      expect(mockRouter.push).toHaveBeenCalledWith({
        query: { panel: 'messages' },
      })
    })
  })
})
```

- [ ] **Step 2：跑測試確認 fail**

```bash
npm test -- --run tests/unit/composables/useClassHubPanelQuery.test.js
```

Expected: FAIL，原因為「Cannot find module '@/composables/useClassHubPanelQuery'」。

- [ ] **Step 3：寫 composable 實作**

完整貼上 `src/composables/useClassHubPanelQuery.js`：

```js
/**
 * Class-hub 內 drawer 開關狀態 + thread 焦點同步到 URL query。
 *
 * URL 規格：
 *   /portal/class-hub                              無 drawer
 *   /portal/class-hub?panel=messages               訊息 drawer list view
 *   /portal/class-hub?panel=messages&thread=42     訊息 drawer thread view
 *   /portal/class-hub?panel=announcements          公告 drawer
 *
 * 所有 mutator 內含 guard：相同狀態重複呼叫不會 push（避免 history 污染）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useClassHubPanelQuery() {
  const route = useRoute()
  const router = useRouter()

  const panel = computed(() => route.query.panel || null)
  const threadId = computed(() => {
    const t = route.query.thread
    return t ? Number(t) : null
  })

  function openPanel(name) {
    if (route.query.panel === name && !route.query.thread) return
    router.push({ query: { ...route.query, panel: name, thread: undefined } })
  }

  function closePanel() {
    if (!route.query.panel && !route.query.thread) return
    const { panel: _p, thread: _t, ...rest } = route.query
    router.replace({ query: rest })
  }

  function openThread(id) {
    if (
      route.query.panel === 'messages' &&
      Number(route.query.thread) === id
    ) {
      return
    }
    router.push({ query: { panel: 'messages', thread: String(id) } })
  }

  function closeThread() {
    if (route.query.panel === 'messages' && !route.query.thread) return
    router.push({ query: { panel: 'messages' } })
  }

  return { panel, threadId, openPanel, closePanel, openThread, closeThread }
}
```

- [ ] **Step 4：跑測試確認 pass**

```bash
npm test -- --run tests/unit/composables/useClassHubPanelQuery.test.js
```

Expected: PASS（13 個 it）。

- [ ] **Step 5：commit**

```bash
git add src/composables/useClassHubPanelQuery.js tests/unit/composables/useClassHubPanelQuery.test.js
git commit -m "$(cat <<'EOF'
feat(portal): 新增 useClassHubPanelQuery composable

drawer 狀態同步到 URL query（panel + thread），含 guard 避免
重複 push 污染 history。供 class-hub CommBar 與 drawer 共用。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：ClassHubAnnouncementsDrawer 元件

**Files:**
- Create: `src/components/portal/class-hub/ClassHubAnnouncementsDrawer.vue`

行為等同移植既有 `PortalAnnouncementView.vue` 的列表+expand 邏輯到 drawer 容器。資料 fetch 用既有 `getPortalAnnouncements`、`markAnnouncementRead`。

- [ ] **Step 1：建立元件檔**

完整貼上 `src/components/portal/class-hub/ClassHubAnnouncementsDrawer.vue`：

```vue
<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    :size="drawerSize"
    title="公告通知"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div v-loading="loading" class="ann-drawer">
      <el-alert
        v-if="unreadCount > 0"
        :title="`您有 ${unreadCount} 則未讀公告`"
        type="warning"
        :closable="false"
        show-icon
        class="ann-alert"
      />

      <div v-if="announcements.length" class="announcement-list">
        <div
          v-for="ann in announcements"
          :key="ann.id"
          class="ann-card"
          :class="{
            'ann-unread': !ann.is_read,
            'ann-expanded': expandedId === ann.id,
            'ann-pinned': ann.is_pinned,
            'ann-urgent': ann.priority === 'urgent',
          }"
          @click="toggleExpand(ann)"
        >
          <div class="ann-header">
            <div class="ann-title-row">
              <span v-if="!ann.is_read" class="unread-dot"></span>
              <el-icon v-if="ann.is_pinned" class="pin-icon"><Top /></el-icon>
              <el-tag
                :type="priorityConfig[ann.priority]?.type || 'info'"
                size="small"
                class="priority-tag"
              >
                {{ priorityConfig[ann.priority]?.label || ann.priority }}
              </el-tag>
              <span class="ann-title">{{ ann.title }}</span>
            </div>
            <div class="ann-meta">
              <span>{{ ann.created_by_name }}</span>
              <span class="ann-date">{{ formatDate(ann.created_at) }}</span>
            </div>
          </div>

          <div v-if="expandedId !== ann.id" class="ann-preview">
            {{ ann.content.length > 80 ? ann.content.slice(0, 80) + '...' : ann.content }}
          </div>

          <div v-if="expandedId === ann.id" class="ann-content">
            {{ ann.content }}
          </div>
        </div>
      </div>

      <div v-if="announcements.length && !noMore" class="load-more-wrap">
        <el-button @click="loadMore" :loading="loading">載入更多</el-button>
      </div>
      <div
        v-if="announcements.length && noMore"
        class="all-loaded"
      >
        已顯示全部 {{ totalAnnouncements }} 則公告
      </div>

      <el-empty v-else-if="!loading && !announcements.length" description="目前沒有公告" />
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Top } from '@element-plus/icons-vue'
import { getPortalAnnouncements, markAnnouncementRead } from '@/api/portal'
import { apiError } from '@/utils/error'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])

const drawerSize = computed(() =>
  window.innerWidth < 768 ? '100%' : '480px'
)

const loading = ref(false)
const announcements = ref([])
const totalAnnouncements = ref(0)
const pageSize = 20
const expandedId = ref(null)
const noMore = ref(false)
const loadedOnce = ref(false)

const priorityConfig = {
  normal: { label: '一般', type: 'info' },
  important: { label: '重要', type: 'warning' },
  urgent: { label: '緊急', type: 'danger' },
}

const unreadCount = computed(
  () => announcements.value.filter((a) => !a.is_read).length,
)

async function fetchAnnouncements(append = false) {
  loading.value = true
  try {
    const skip = append ? announcements.value.length : 0
    const { data } = await getPortalAnnouncements({ skip, limit: pageSize })
    const { items, total } = data
    totalAnnouncements.value = total
    if (append) {
      announcements.value.push(...items)
    } else {
      announcements.value = items
    }
    noMore.value = announcements.value.length >= total
  } catch (e) {
    ElMessage.error(apiError(e, '載入失敗'))
  } finally {
    loading.value = false
  }
}

function loadMore() {
  if (!noMore.value && !loading.value) fetchAnnouncements(true)
}

async function toggleExpand(ann) {
  if (expandedId.value === ann.id) {
    expandedId.value = null
    return
  }
  expandedId.value = ann.id
  if (!ann.is_read) {
    try {
      await markAnnouncementRead(ann.id)
      ann.is_read = true
    } catch {
      /* silent */
    }
  }
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function onOpen() {
  if (!loadedOnce.value) {
    loadedOnce.value = true
    fetchAnnouncements(false)
  }
}
</script>

<style scoped>
.ann-drawer { padding: 0 var(--space-2); }
.ann-alert { margin-bottom: var(--space-3); }
.announcement-list { display: flex; flex-direction: column; gap: 10px; }

.ann-card {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px var(--space-4);
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.ann-card:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); }

.ann-unread { border-left: 4px solid var(--color-info); background: #f0f7ff; }
.ann-urgent { border-left-color: var(--color-danger); }
.ann-urgent.ann-unread { background: #fef0f0; }
.ann-pinned { border-top: 2px solid var(--color-warning); }

.ann-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.ann-title-row { display: flex; align-items: center; }
.pin-icon { color: #E6A23C; margin-right: 4px; }
.priority-tag { margin-right: 8px; }

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-info);
  margin-right: 8px;
  flex-shrink: 0;
}

.ann-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.ann-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}
.ann-date { margin-left: 12px; color: #C0C4CC; }

.ann-preview {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.ann-content {
  margin-top: 10px;
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  padding: 10px;
  background: var(--bg-color);
  border-radius: 4px;
}

.ann-expanded { box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1); }

.load-more-wrap { text-align: center; margin-top: var(--space-3); }
.all-loaded {
  text-align: center;
  margin-top: var(--space-3);
  color: var(--text-tertiary);
  font-size: var(--text-xs);
}

@media (max-width: 768px) {
  .ann-header { flex-direction: column; }
  .ann-meta { margin-top: 4px; }
}
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/components/portal/class-hub/ClassHubAnnouncementsDrawer.vue
git commit -m "$(cat <<'EOF'
feat(portal): 新增 ClassHubAnnouncementsDrawer 元件

把舊 PortalAnnouncementView 的列表 / expand 行為移植進 drawer 容器；
fetch 沿用 getPortalAnnouncements / markAnnouncementRead，
不動 API 與 store。drawer 從右側滑入，桌面 480px、mobile 全寬。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：ClassHubMessagesDrawer 元件

**Files:**
- Create: `src/components/portal/class-hub/ClassHubMessagesDrawer.vue`

複合元件：drawer + list view + thread view 雙視圖切換。內部以 prop `threadId`（從 parent 傳入；parent 從 URL query 解析）驅動視圖切換。reuse `MessageBubble`、`MessageComposer` 子元件 + `usePortalMessagesStore` action。

- [ ] **Step 1：建立元件檔**

完整貼上 `src/components/portal/class-hub/ClassHubMessagesDrawer.vue`：

```vue
<template>
  <el-drawer
    :model-value="modelValue"
    direction="rtl"
    :size="drawerSize"
    :title="drawerTitle"
    :show-close="currentView === 'list'"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <template v-if="currentView === 'thread'" #header>
      <div class="thread-drawer-header">
        <el-button text @click="emitBackToList">← 訊息列表</el-button>
        <div class="title">
          <strong>{{ activeThread?.student_name || '學生' }}</strong>
          <span class="parent">家長：{{ activeThread?.parent_name || '—' }}</span>
        </div>
      </div>
    </template>

    <!-- list view -->
    <div v-if="currentView === 'list'" class="msg-drawer">
      <div class="page-header">
        <el-button type="primary" size="small" @click="openNew">+ 新訊息</el-button>
      </div>

      <div class="thread-list">
        <p v-if="!store.threadsLoaded" class="empty">讀取中…</p>
        <p v-else-if="store.threads.length === 0" class="empty">
          尚無對話。點選「+ 新訊息」主動聯繫家長。
        </p>
        <button
          v-for="t in store.threads"
          :key="t.id"
          class="thread-row pt-card"
          @click="onThreadClick(t)"
        >
          <div class="row-top">
            <strong>{{ t.student_name || '學生' }}</strong>
            <span v-if="t.unread_count > 0" class="unread-dot">{{ t.unread_count }}</span>
          </div>
          <div class="row-mid">
            <span class="parent">家長：{{ t.parent_name || '—' }}</span>
          </div>
          <div class="row-bot">
            <span class="preview">{{ t.last_message_preview || '（尚無訊息）' }}</span>
            <span class="time">{{ fmtTime(t.last_message_at) }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- thread view -->
    <div v-else-if="currentView === 'thread'" class="thread-view">
      <div class="messages">
        <button
          v-if="bucket.hasMore"
          class="load-more"
          @click="loadMore"
        >
          載入更早訊息
        </button>
        <p v-if="orderedMessages.length === 0" class="empty">尚無訊息</p>
        <MessageBubble
          v-for="m in orderedMessages"
          :key="m.id"
          :message="m"
          own-role="teacher"
          @recall="onRecall"
        />
      </div>
      <MessageComposer @send="onSend" />
    </div>

    <!-- 新對話 dialog（沿用既有實作） -->
    <el-dialog v-model="showNewDialog" title="主動發起訊息" width="500px" append-to-body>
      <el-form label-width="80px">
        <el-form-item label="班級">
          <el-select v-model="selectedClassroomId" placeholder="選擇班級" style="width: 100%">
            <el-option
              v-for="c in classrooms"
              :key="c.classroom_id"
              :label="c.classroom_name"
              :value="c.classroom_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="學生">
          <el-select
            v-model="selectedStudentId"
            placeholder="選擇學生"
            style="width: 100%"
            :disabled="!selectedClassroomId"
          >
            <el-option
              v-for="s in studentsInSelected"
              :key="s.id"
              :label="`${s.name}（${s.parent_name || '—'}）`"
              :value="s.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="家長帳號 ID">
          <el-input
            v-model="parentUserIdInput"
            placeholder="請填家長 user_id（後續可改用挑選器）"
          />
          <p class="hint">提示：可由「班級學生」頁進入學生個案，從監護人列表複製 user_id。</p>
        </el-form-item>
        <el-form-item label="訊息內容">
          <el-input
            v-model="newBody"
            type="textarea"
            :rows="4"
            placeholder="輸入給家長的第一則訊息…"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewDialog = false">取消</el-button>
        <el-button type="primary" :loading="sending" @click="submitNew">送出</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { broadcastDashboardInvalidate } from '@/composables/usePortalDashboard'
import { getMyStudents } from '@/api/portal'
import MessageBubble from '@/components/portal/messages/MessageBubble.vue'
import MessageComposer from '@/components/portal/messages/MessageComposer.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  threadId: { type: Number, default: null },
})
const emit = defineEmits([
  'update:modelValue',
  'open-thread',
  'close-thread',
])

const store = usePortalMessagesStore()

const drawerSize = computed(() =>
  window.innerWidth < 768 ? '100%' : '480px',
)
const currentView = computed(() =>
  props.threadId ? 'thread' : 'list',
)
const drawerTitle = computed(() =>
  currentView.value === 'list' ? '家長訊息' : '',
)

const activeThread = computed(() =>
  store.threads.find((t) => t.id === props.threadId),
)
const bucket = computed(
  () => store.messagesByThread[props.threadId] || { items: [], hasMore: false },
)
const orderedMessages = computed(() => [...bucket.value.items].reverse())

// drawer 第一次開啟時 fetch threads；之後由 store 維持
async function onOpen() {
  await store.fetchThreads()
}

// threadId 變化時 → 載 thread 訊息 + markRead
watch(
  () => props.threadId,
  async (newId) => {
    if (!newId) return
    try {
      await store.fetchMessages(newId, { reset: true })
      await store.markRead(newId)
      broadcastDashboardInvalidate()
    } catch (e) {
      ElMessage.error('載入對話失敗')
    }
  },
  { immediate: true },
)

function onThreadClick(t) {
  emit('open-thread', t.id)
}

function emitBackToList() {
  emit('close-thread')
}

async function onSend({ body, attachments }) {
  try {
    await store.send(props.threadId, body, attachments)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '送出失敗')
  }
}

async function onRecall(messageId) {
  try {
    await store.recall(messageId)
    ElMessage.success('已撤回')
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '撤回失敗')
  }
}

async function loadMore() {
  await store.fetchMessages(props.threadId)
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 新對話 dialog state
const showNewDialog = ref(false)
const classrooms = ref([])
const selectedClassroomId = ref(null)
const selectedStudentId = ref(null)
const parentUserIdInput = ref('')
const newBody = ref('')
const sending = ref(false)

const studentsInSelected = computed(() => {
  const c = classrooms.value.find((cr) => cr.classroom_id === selectedClassroomId.value)
  return c?.students || []
})

async function openNew() {
  showNewDialog.value = true
  if (classrooms.value.length === 0) {
    try {
      const res = await getMyStudents()
      classrooms.value = res.data?.classrooms || []
    } catch (e) {
      ElMessage.error('讀取班級學生失敗')
    }
  }
}

async function submitNew() {
  if (!selectedStudentId.value || !parentUserIdInput.value || !newBody.value.trim()) {
    ElMessage.warning('請完整填寫')
    return
  }
  sending.value = true
  try {
    const data = await store.startThread({
      studentId: Number(selectedStudentId.value),
      parentUserId: Number(parentUserIdInput.value),
      body: newBody.value.trim(),
    })
    showNewDialog.value = false
    newBody.value = ''
    selectedStudentId.value = null
    parentUserIdInput.value = ''
    emit('open-thread', data.thread.id)
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '發送失敗')
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.msg-drawer { padding: 0 var(--space-2); }
.page-header { display: flex; justify-content: flex-end; margin-bottom: var(--space-3); }

.thread-list { display: flex; flex-direction: column; gap: var(--space-2); }
.thread-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: var(--space-3);
  cursor: pointer;
  width: 100%;
  border: var(--pt-hairline);
  background: var(--pt-surface-card);
  border-radius: var(--radius-md);
}
.row-top { display: flex; justify-content: space-between; align-items: center; }
.row-mid { font-size: var(--text-sm); color: var(--pt-text-muted); }
.row-bot {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  color: var(--pt-text-soft);
  gap: var(--space-2);
}
.preview {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.time { color: var(--pt-text-faint); flex-shrink: 0; }

.unread-dot {
  background: var(--color-danger);
  color: white;
  padding: 0 var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
  min-width: 20px;
  text-align: center;
}

.empty {
  text-align: center;
  color: var(--pt-text-muted);
  padding: var(--space-6);
}

.hint {
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  margin: 4px 0 0;
}

/* thread view */
.thread-drawer-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.thread-drawer-header .title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-base);
}
.thread-drawer-header .parent {
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
  font-weight: normal;
}

.thread-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.messages {
  flex: 1;
  padding: var(--space-3);
  overflow-y: auto;
  background: var(--pt-surface-mute);
}
.load-more {
  display: block;
  margin: 0 auto var(--space-3);
  padding: var(--space-1) var(--space-3);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: 999px;
  cursor: pointer;
  font-size: var(--text-xs);
  color: var(--pt-text-muted);
}
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/components/portal/class-hub/ClassHubMessagesDrawer.vue
git commit -m "$(cat <<'EOF'
feat(portal): 新增 ClassHubMessagesDrawer 元件

drawer 容器同時包含 list view 與 thread view，由 prop threadId
驅動切換。reuse usePortalMessagesStore + MessageBubble +
MessageComposer，並沿用「+ 新對話」dialog 流程。

emit:
- update:modelValue（drawer 開關）
- open-thread(id)
- close-thread

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：ClassHubCommBar 元件

**Files:**
- Create: `src/components/portal/class-hub/ClassHubCommBar.vue`

兩張置頂摘要卡（家長訊息 / 公告通知），含未讀數 + 權限分流；點擊 emit `open-panel`。

- [ ] **Step 1：建立元件檔**

完整貼上 `src/components/portal/class-hub/ClassHubCommBar.vue`：

```vue
<template>
  <div v-if="showAny" class="comm-bar">
    <button
      v-if="canMessages"
      class="comm-card"
      :class="{ 'has-unread': messagesUnread > 0 }"
      @click="$emit('open-panel', 'messages')"
    >
      <div class="comm-card__icon">
        <el-icon><Message /></el-icon>
      </div>
      <div class="comm-card__body">
        <div class="comm-card__title">家長訊息</div>
        <div class="comm-card__sub">
          <span v-if="messagesUnread > 0">{{ messagesUnread }} 則未讀</span>
          <span v-else>無未讀</span>
        </div>
      </div>
      <el-badge
        v-if="messagesUnread > 0"
        :value="messagesUnread"
        :max="99"
        class="comm-card__badge"
      />
    </button>

    <button
      v-if="canAnnouncements"
      class="comm-card"
      :class="{ 'has-unread': announcementsUnread > 0 }"
      @click="$emit('open-panel', 'announcements')"
    >
      <div class="comm-card__icon">
        <el-icon><Bell /></el-icon>
      </div>
      <div class="comm-card__body">
        <div class="comm-card__title">公告通知</div>
        <div class="comm-card__sub">
          <span v-if="announcementsUnread > 0">{{ announcementsUnread }} 則未讀</span>
          <span v-else>無未讀</span>
        </div>
      </div>
      <el-badge
        v-if="announcementsUnread > 0"
        :value="announcementsUnread"
        :max="99"
        class="comm-card__badge"
      />
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Message, Bell } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

const props = defineProps({
  messagesUnread: { type: Number, default: 0 },
  announcementsUnread: { type: Number, default: 0 },
})
defineEmits(['open-panel'])

const canMessages = computed(() => hasPermission('PARENT_MESSAGES_WRITE'))
const canAnnouncements = computed(() => hasPermission('ANNOUNCEMENTS_READ'))
const showAny = computed(() => canMessages.value || canAnnouncements.value)
</script>

<style scoped>
.comm-bar {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.comm-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--pt-surface-card);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.15s, transform 0.05s;
}
.comm-card:hover { box-shadow: var(--pt-elev-2); }
.comm-card:active { transform: scale(0.98); }

.comm-card.has-unread { border-left: 4px solid var(--color-danger); }

.comm-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--pt-tint);
  color: var(--color-primary);
  font-size: 20px;
  flex-shrink: 0;
}
.comm-card__body { flex: 1; min-width: 0; }
.comm-card__title { font-size: var(--text-base); font-weight: 600; color: var(--text-primary); }
.comm-card__sub { font-size: var(--text-xs); color: var(--pt-text-muted); margin-top: 2px; }

.comm-card__badge { position: absolute; top: 8px; right: 12px; }

@media (max-width: 480px) {
  .comm-bar { grid-template-columns: 1fr; }
}
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/components/portal/class-hub/ClassHubCommBar.vue
git commit -m "$(cat <<'EOF'
feat(portal): 新增 ClassHubCommBar 元件

class-hub 頂端兩張摘要卡（家長訊息 / 公告通知），含未讀 badge
與權限分流。沒對應權限的卡不渲染；兩者都沒 → bar 整條不渲染。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：在 PortalClassHubView 接入 CommBar + 兩個 drawer + URL 同步

**Files:**
- Modify: `src/views/portal/PortalClassHubView.vue`

把新的三個元件接進現有 view，並加入 panel/thread query 同步邏輯。注意 `usePortalClassHub` composable 提供的 `data` 中已有 hub-level pending counts；訊息與公告 unread 由各自 store / API 取得（暫不動 backend hub aggregation，遵循 spec 的 Out of scope）。

- [ ] **Step 1：完整重寫 PortalClassHubView.vue**

完整貼上 `src/views/portal/PortalClassHubView.vue`：

```vue
<template>
  <div class="class-hub" v-loading="loading && !data">
    <ClassHubCommBar
      :messages-unread="messagesUnread"
      :announcements-unread="announcementsUnread"
      @open-panel="onOpenPanel"
    />

    <ClassHubStickyNext :next="data?.sticky_next" @jump="jumpDeep" />

    <div class="class-hub__header">
      <h2 class="class-hub__title">
        {{ data?.classroom_name || '今日工作台' }}
      </h2>
      <span v-if="data?.fetched_at" class="class-hub__updated">
        最後更新 {{ formatTime(data.fetched_at) }}
      </span>
      <el-button :loading="loading" size="small" @click="manualRefresh">
        手動刷新
      </el-button>
    </div>

    <div
      v-if="!data || data.classroom_id === 0"
      class="class-hub__empty"
    >
      <el-empty description="目前沒有班級任務" />
    </div>

    <template v-else>
      <ClassHubTimeSlotCard
        v-for="slot in data.slots"
        :key="slot.slot_id"
        :slot="slot"
        :is-current="slot.slot_id === currentSlotId"
        @open-sheet="onOpenSheet"
        @jump-page="onJumpPage"
      />
    </template>

    <ClassHubAttendanceSheet
      v-model:show="sheets.attendance"
      @done="onSheetDone('attendance_pending')"
    />
    <ClassHubMedicationSheet
      v-model:show="sheets.medication"
      @done="onSheetDone('medications_pending')"
    />
    <ClassHubIncidentQuickSheet
      v-model:show="sheets.incident"
      @done="manualRefresh"
    />

    <ClassHubMessagesDrawer
      :model-value="panel === 'messages'"
      :thread-id="threadId"
      @update:model-value="onMessagesDrawerToggle"
      @open-thread="openThread"
      @close-thread="closeThread"
    />
    <ClassHubAnnouncementsDrawer
      :model-value="panel === 'announcements'"
      @update:model-value="onAnnouncementsDrawerToggle"
    />
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { usePortalClassHub } from '@/composables/usePortalClassHub'
import { useClassHubPanelQuery } from '@/composables/useClassHubPanelQuery'
import { usePortalMessagesStore } from '@/stores/portalMessages'
import { hasPermission } from '@/utils/auth'
import { getUnreadCount as getAnnouncementsUnreadCount } from '@/api/portal'
import ClassHubStickyNext from '@/components/portal/class-hub/ClassHubStickyNext.vue'
import ClassHubTimeSlotCard from '@/components/portal/class-hub/ClassHubTimeSlotCard.vue'
import ClassHubAttendanceSheet from '@/components/portal/class-hub/ClassHubAttendanceSheet.vue'
import ClassHubMedicationSheet from '@/components/portal/class-hub/ClassHubMedicationSheet.vue'
import ClassHubIncidentQuickSheet from '@/components/portal/class-hub/ClassHubIncidentQuickSheet.vue'
import ClassHubCommBar from '@/components/portal/class-hub/ClassHubCommBar.vue'
import ClassHubMessagesDrawer from '@/components/portal/class-hub/ClassHubMessagesDrawer.vue'
import ClassHubAnnouncementsDrawer from '@/components/portal/class-hub/ClassHubAnnouncementsDrawer.vue'

const { data, loading, refresh, decrementCount } = usePortalClassHub()
const router = useRouter()
const messagesStore = usePortalMessagesStore()
const { unreadCount: messagesUnread } = storeToRefs(messagesStore)
const {
  panel,
  threadId,
  openPanel,
  closePanel,
  openThread,
  closeThread,
} = useClassHubPanelQuery()

const sheets = reactive({
  attendance: false,
  medication: false,
  incident: false,
})

// 公告未讀（從既有 portal API 取，暫不 aggregate 進 hub）
const announcementsUnread = ref(0)
async function refreshAnnouncementsUnread() {
  if (!hasPermission('ANNOUNCEMENTS_READ')) return
  try {
    const res = await getAnnouncementsUnreadCount()
    announcementsUnread.value = res.data.unread_count || 0
  } catch {
    /* silent */
  }
}

// 訊息未讀也要主動拉一次（store 沒有 auto-fetch）
async function refreshMessagesUnread() {
  if (!hasPermission('PARENT_MESSAGES_WRITE')) return
  try {
    await messagesStore.refreshUnread()
  } catch {
    /* silent */
  }
}

// Re-evaluate which slot is current every minute
const nowTick = ref(Date.now())
let tickTimer = null
onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60_000)
  refreshAnnouncementsUnread()
  refreshMessagesUnread()
})
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})

const currentSlotId = computed(() => {
  // eslint-disable-next-line no-unused-expressions
  nowTick.value
  const now = new Date()
  const m = now.getHours() * 60 + now.getMinutes()
  if (m < 9 * 60) return 'morning'
  if (m < 12 * 60) return 'forenoon'
  if (m < 14 * 60) return 'noon'
  return 'afternoon'
})

function manualRefresh() {
  refresh().catch(() => {})
  refreshAnnouncementsUnread()
  refreshMessagesUnread()
}

function onOpenSheet(task) {
  if (task.kind === 'attendance') sheets.attendance = true
  else if (task.kind === 'medication') sheets.medication = true
  else if (task.kind === 'incident') sheets.incident = true
}

function onSheetDone(countKey) {
  decrementCount(countKey)
}

function onJumpPage(task) {
  const map = {
    observation: '/portal/observations',
    contact_book: '/portal/contact-book',
  }
  const target = map[task.kind]
  if (target) router.push(`${target}?from=hub`)
}

function jumpDeep(deepLink) {
  if (!deepLink) return
  router.push(deepLink)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

// drawer 控制
function onOpenPanel(name) {
  openPanel(name)
}

function onMessagesDrawerToggle(val) {
  if (!val) closePanel()
}

function onAnnouncementsDrawerToggle(val) {
  if (!val) closePanel()
  else if (panel.value !== 'announcements') openPanel('announcements')
}

// 關閉 panel / thread 時刷未讀
watch(panel, (newPanel, oldPanel) => {
  if (oldPanel === 'messages' && newPanel !== 'messages') refreshMessagesUnread()
  if (oldPanel === 'announcements' && newPanel !== 'announcements') refreshAnnouncementsUnread()
})
</script>

<style scoped>
.class-hub {
  padding: 16px;
  max-width: 800px;
  margin: 0 auto;
}
.class-hub__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.class-hub__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.class-hub__updated {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: auto;
}
.class-hub__empty {
  padding: 48px 0;
}
</style>
```

- [ ] **Step 2：commit**

```bash
git add src/views/portal/PortalClassHubView.vue
git commit -m "$(cat <<'EOF'
feat(portal): class-hub 接入 CommBar + 訊息/公告 drawer

PortalClassHubView 頂端新增 ClassHubCommBar；點擊摘要卡或進入
帶 query 的 deeplink → 從右側滑入對應 drawer。drawer 開關狀態
透過 useClassHubPanelQuery 與 URL ?panel/&thread 雙向同步，
方便外部 deeplink（含後續 Task 7 的 router redirect）落點。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：PortalLayout 移除「家園溝通」群組 + 聚合 badge

**Files:**
- Modify: `src/layouts/PortalLayout.vue`

移除整個「家園溝通」`el-sub-menu`（目前 L310-325），並把「今日工作台」menu item 的 badge 從 `hubPendingCount` 改成 `hubPendingCount + messagesUnreadCount + unreadCount`（announcement）。`messagesUnreadCount`、`unreadCount`（announcement）、相關 fetch 函式仍保留 — 只是顯示位置改變。

- [ ] **Step 1：移除「家園溝通」`el-sub-menu`**

在 `src/layouts/PortalLayout.vue` 中刪除這整段（目前位於 L310-325）：

```vue
        <!-- 家園溝通 -->
        <el-sub-menu index="group-comm">
          <template #title>
            <el-icon><ChatLineRound /></el-icon>
            <span>家園溝通</span>
          </template>
          <el-menu-item index="/portal/messages">
            <el-icon><Message /></el-icon>
            <span>家長訊息</span>
            <el-badge v-if="messagesUnreadCount > 0" :value="messagesUnreadCount" :max="99" class="announcement-badge" />
          </el-menu-item>
          <el-menu-item index="/portal/announcements">
            <el-icon><Bell /></el-icon>
            <span>公告通知</span>
            <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="announcement-badge" />
          </el-menu-item>
        </el-sub-menu>
```

- [ ] **Step 2：在「班級教務」群組的「今日工作台」item 改 badge 為聚合**

找到「班級教務」`el-sub-menu` 內的 `/portal/class-hub` `el-menu-item`（目前 L373-382），把 `:value="hubPendingCount"` 改為 `:value="totalHubBadge"`：

```vue
<el-menu-item index="/portal/class-hub">
  <el-icon><Calendar /></el-icon>
  <span>今日工作台</span>
  <el-badge
    v-if="totalHubBadge > 0"
    :value="totalHubBadge"
    :max="99"
    class="announcement-badge"
  />
</el-menu-item>
```

- [ ] **Step 3：在 `<script setup>` 加入 `totalHubBadge` computed**

在 `src/layouts/PortalLayout.vue` 的 `<script setup>` 區塊（找到 `const hubPendingCount = ref(0)` 那段，於該段下方）加入：

```js
import { computed } from 'vue'

// ...（既有 ref 宣告）

const totalHubBadge = computed(
  () =>
    hubPendingCount.value +
    messagesUnreadCount.value +
    unreadCount.value,
)
```

注意：若 `import { computed } from 'vue'` 已存在則不要重複 import。

- [ ] **Step 4：移除 bottom-nav「更多」tab 上的 announcement badge**

找到 bottom-nav 的「更多」tab（目前 L505-512）：

```vue
<div class="bottom-tab" @click="toggleSidebar">
  <div class="tab-icon-wrapper">
    <el-icon><Menu /></el-icon>
    <el-badge v-if="unreadCount > 0" :value="unreadCount" :max="99" class="tab-badge" />
  </div>
  <span>更多</span>
</div>
```

改為（移除 `el-badge`，整段簡化）：

```vue
<div class="bottom-tab" @click="toggleSidebar">
  <el-icon><Menu /></el-icon>
  <span>更多</span>
</div>
```

`unreadCount` 變數仍保留用於 `totalHubBadge` 計算。

- [ ] **Step 5：手動 smoke test**

```bash
npm run dev
```

開瀏覽器 → `http://localhost:5173/#/portal/login` → 用 teacher 帳號登入 → 觀察側欄：

- 「家園溝通」群組已消失 ✓
- 「班級教務 → 今日工作台」項目若有未讀訊息或公告 → badge 數字 = hub pending + messages + announcements
- mobile 寬度（dev tools 切手機）→ bottom-nav「更多」按鈕沒有紅點 ✓

- [ ] **Step 6：commit**

```bash
git add src/layouts/PortalLayout.vue
git commit -m "$(cat <<'EOF'
feat(portal): 側欄移除「家園溝通」群組，badge 聚合到今日工作台

「家園溝通」群組（家長訊息 + 公告通知）整合進 class-hub，
側欄入口同步移除。hub menu item 顯示 hub + messages + announcements
未讀數總和，避免使用者錯失新訊息。

bottom-nav「更多」按鈕的 announcement badge 一併移除（避免雙重）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：router 刪除舊 routes、新增 redirect、刪除 view import

**Files:**
- Modify: `src/router/index.js`

把目前位於 portal children 內的三條 routes（`portal-messages`、`portal-message-thread`、`portal-announcements`，目前 L329-340 與 L431-434）替換為 redirect。刪除對應 view 的 lazy import 引用（lazy import 內嵌在 route 內，刪除 route 時自然移除）。

- [ ] **Step 1：刪除三條 portal routes**

在 `src/router/index.js` 的 portal children 陣列中，刪除以下三段：

```js
{
    path: 'messages',
    name: 'portal-messages',
    component: () => import('../views/portal/PortalMessagesView.vue'),
    meta: { title: '家長訊息' },
},
{
    path: 'messages/:threadId',
    name: 'portal-message-thread',
    component: () => import('../views/portal/PortalMessageThreadView.vue'),
    props: true,
    meta: { title: '訊息對話' },
},
```

以及：

```js
{
    path: 'announcements',
    name: 'portal-announcements',
    component: () => import('../views/portal/PortalAnnouncementView.vue'),
},
```

- [ ] **Step 2：新增三條 redirect routes**

在 portal children 區塊（同樣陣列內）加入以下三段（建議放在原刪除位置附近，維持 children 邏輯順序）：

```js
{
    path: 'messages',
    redirect: { name: 'portal-class-hub', query: { panel: 'messages' } },
},
{
    path: 'messages/:threadId',
    redirect: (to) => ({
        name: 'portal-class-hub',
        query: { panel: 'messages', thread: String(to.params.threadId) },
    }),
},
{
    path: 'announcements',
    redirect: { name: 'portal-class-hub', query: { panel: 'announcements' } },
},
```

- [ ] **Step 3：手動驗證 redirect**

```bash
npm run dev
```

瀏覽器測試（teacher 帳號登入後）：

- 開 `http://localhost:5173/#/portal/messages` → URL 應自動變 `#/portal/class-hub?panel=messages`，訊息 drawer 打開
- 開 `http://localhost:5173/#/portal/messages/1` → URL 應變 `#/portal/class-hub?panel=messages&thread=1`，drawer 進入 thread view（若 thread 1 不存在會 fetch 失敗，這是預期行為，spec 不包含 fetch 失敗 graceful handling）
- 開 `http://localhost:5173/#/portal/announcements` → URL 應變 `#/portal/class-hub?panel=announcements`，公告 drawer 打開
- 從 class-hub 直接點訊息卡 → drawer 開、URL 帶 `?panel=messages`
- 關閉 drawer（按 X 或點 mask）→ URL query 清掉

- [ ] **Step 4：commit**

```bash
git add src/router/index.js
git commit -m "$(cat <<'EOF'
feat(portal): 舊 messages / announcements 路由改 redirect 到 class-hub

刪除 portal-messages、portal-message-thread、portal-announcements
三條 routes 與 view import，改為 router 級 redirect 透明導向
class-hub 對應 query state。LINE 推送 / 通知中心 / PWA 快取的
舊 deeplink 全部被接住，無需後端配合更新 link_to 模板。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8：刪除舊 view 檔

**Files:**
- Delete: `src/views/portal/PortalMessagesView.vue`
- Delete: `src/views/portal/PortalMessageThreadView.vue`
- Delete: `src/views/portal/PortalAnnouncementView.vue`

- [ ] **Step 1：確認無其他引用**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
grep -rn "PortalMessagesView\|PortalMessageThreadView\|PortalAnnouncementView" src/ tests/ 2>/dev/null
```

Expected: 無輸出（router/index.js 已在 Task 7 移除 import）。若有殘留 → 排查後再刪檔。

- [ ] **Step 2：刪檔**

```bash
git rm src/views/portal/PortalMessagesView.vue
git rm src/views/portal/PortalMessageThreadView.vue
git rm src/views/portal/PortalAnnouncementView.vue
```

- [ ] **Step 3：跑全部既有測試確認沒打到引用**

```bash
npm test -- --run
```

Expected: 所有測試 PASS（含 Task 1 新增的 useClassHubPanelQuery 測試）。

- [ ] **Step 4：build 驗證**

```bash
npm run build
```

Expected: build 成功，無 import not found 錯誤。

- [ ] **Step 5：commit**

```bash
git commit -m "$(cat <<'EOF'
chore(portal): 刪除舊 messages / announcement view 檔

行為已整合進 ClassHubMessagesDrawer 與 ClassHubAnnouncementsDrawer；
路由由 redirect 接住舊 URL。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9：整合 smoke test

**Files:** 無（純驗證）

- [ ] **Step 1：本地全流程驗證（dev 模式）**

```bash
cd /Users/yilunwu/Desktop/ivyManageSystem
./start.sh
```

或單獨：

```bash
cd /Users/yilunwu/Desktop/ivy-frontend && npm run dev
```

開瀏覽器走完以下 checklist：

| 項目 | 預期 |
|------|------|
| teacher 登入 → 側欄 | 「家園溝通」群組消失，剩首頁 / 個人資料 / 假勤申請 / 我的排班 / 班級教務 / 學校行事曆 / 薪資查詢 |
| 進入 `/portal/class-hub` | 頂端兩張 CommBar 卡（若 teacher 無 PARENT_MESSAGES_WRITE 訊息卡不顯示；無 ANNOUNCEMENTS_READ 公告卡不顯示） |
| 點訊息卡 | 右側 drawer 滑入，顯示 thread 列表 |
| 點某 thread | drawer 內切換到 thread view，header 出現「← 訊息列表」 |
| 訊息送出 | 樂觀 UI 立即顯示；store 完成後替換 |
| 點「← 訊息列表」 | drawer 退回 list view，URL 變 `?panel=messages` |
| 關閉 drawer（X / esc / 點 mask） | URL query 清空 |
| 點公告卡 | 公告 drawer 滑入，顯示公告列表 |
| 點某公告展開 | 顯示全文，未讀變已讀，badge 數遞減 |
| 直接打 `/portal/messages` URL | 自動 redirect 到 `class-hub?panel=messages`，drawer 開 |
| 直接打 `/portal/messages/1` URL | redirect 到 `class-hub?panel=messages&thread=1`，drawer 進 thread view |
| 直接打 `/portal/announcements` URL | redirect，drawer 開 |
| Mobile 寬度（dev tools 切 iPhone 14） | drawer 全寬；CommBar 改單欄堆疊 |
| 用 admin 帳號 impersonate teacher 後返回 | 流程不破壞 |

- [ ] **Step 2：bundle size 檢查**

```bash
npm run build 2>&1 | tail -30
```

對照前次 build 紀錄（dev 環境通常 stash 在 stats），整合後應該 portal chunk 略增（多了三個元件），但因為刪掉三個 view 檔，淨變化可能持平或略減。

紀錄結果：portal chunk 大小變化 → 寫入 PR description。

- [ ] **Step 3：跑完整測試**

```bash
npm test -- --run
```

Expected: 所有測試 PASS（含新 composable 測試）。

- [ ] **Step 4：git status 最終檢查**

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git status
git log --oneline main..HEAD
```

Expected:
- `working tree clean`
- log 顯示 8 個 commit（spec + Task 1-8 各一）

---

## Task 10：開 PR

**Files:** 無

- [ ] **Step 1：push 分支**

```bash
git push -u origin feat/portal-comm-classhub-merge-v1
```

- [ ] **Step 2：開 PR**

```bash
gh pr create --base main --title "feat(portal): 家長溝通整合到班級教務工作台" --body "$(cat <<'EOF'
## Summary

- 把「家園溝通」群組（家長訊息 + 公告通知）深度整合進 `/portal/class-hub`
- class-hub 頂端新增 CommBar 摘要卡，點擊從右側滑入對應 drawer
- 訊息 drawer 內 list ↔ thread 雙視圖切換；URL `?panel=messages&thread=:id` 同步
- 舊 `/portal/messages*` 與 `/portal/announcements` 改為 router redirect，所有舊 deeplink 透明接住

## Spec
docs/superpowers/specs/2026-05-04-class-hub-parent-comms-integration-design.md

## Deeplink 兼容矩陣

| 舊 URL | 新行為 |
|--------|--------|
| `/portal/messages` | redirect 到 `/portal/class-hub?panel=messages` |
| `/portal/messages/:id` | redirect 到 `/portal/class-hub?panel=messages&thread=:id` |
| `/portal/announcements` | redirect 到 `/portal/class-hub?panel=announcements` |

LINE 推送、通知中心存量、PWA 快取的舊 URL 不需更動，全部由 router redirect 接住。

## Test plan

- [ ] teacher 帳號登入 → 側欄無「家園溝通」群組
- [ ] class-hub 頂端 CommBar 顯示，未讀數正確
- [ ] 點訊息卡 → drawer list view；點 thread → 進入對話視圖
- [ ] 「← 訊息列表」按鈕回到 list；URL 同步
- [ ] 公告卡點擊 → 公告 drawer，展開全文後未讀標記為已讀
- [ ] 直接打 `/portal/messages/:id` → drawer 自動進入 thread view
- [ ] 沒 PARENT_MESSAGES_WRITE 的 user → 訊息卡不渲染
- [ ] mobile（< 768px）drawer 全寬；CommBar 單欄堆疊
- [ ] `npm test -- --run` 全綠
- [ ] `npm run build` 成功

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

回傳 PR URL 給 user。

---

## 後續優化（不在此 PR）

依 spec § 12（Out of scope）與 § 8 優化建議：

- 後端 `class_hub` API 增加 `messages_unread / announcements_unread` 聚合欄位 → 前端可少 2 個 fetch
- `PortalLayout.fetchMessagesUnreadCount` 改為 subscribe `usePortalMessagesStore.unreadCount`，避免重複 fetch
- 把聯絡簿（contact-book）也整合進 class-hub
- mobile bottom-nav 結構調整
- 後端 LINE Rich Menu / 通知 link_to 模板更新（目前由 router redirect 接住，無急迫性）
