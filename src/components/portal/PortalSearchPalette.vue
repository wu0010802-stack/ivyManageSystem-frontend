<script setup lang="ts">
import { ref, computed, watch, nextTick, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  Close,
  Sunny,
  Timer,
  Clock,
  Refresh,
  Money,
  Calendar,
  View,
  ChatDotRound,
  Bell,
  HomeFilled,
  User,
  UserFilled,
  Notebook,
} from '@element-plus/icons-vue'
import { searchPortal } from '@/api/portalSearch'
import { usePortalSearch } from '@/composables/usePortalSearch'

const router = useRouter()
const { isOpen, closePalette } = usePortalSearch()

const COMMANDS: { id: string; keywords: string[]; label: string; icon: Component; route: string }[] = [
  { id: 'leave', keywords: ['請假', '請假申請', 'leave'], label: '申請請假', icon: Sunny, route: '/portal/leave' },
  { id: 'punch', keywords: ['補打卡', 'punch'], label: '補打卡申請', icon: Timer, route: '/portal/punch-correction' },
  { id: 'overtime', keywords: ['加班', '加班申請', 'overtime'], label: '加班申請', icon: Clock, route: '/portal/overtime' },
  { id: 'swap', keywords: ['換班', '代課', 'swap'], label: '換班 / 代課', icon: Refresh, route: '/portal/schedule' },
  { id: 'salary', keywords: ['薪資', '薪水', 'salary'], label: '薪資預覽', icon: Money, route: '/portal/salary' },
  { id: 'calendar', keywords: ['行事曆', 'calendar'], label: '行事曆', icon: Calendar, route: '/portal/calendar' },
  { id: 'observation', keywords: ['觀察', '新增觀察', 'observation'], label: '新增觀察', icon: View, route: '/portal/observations' },
  { id: 'messages', keywords: ['訊息', '家長訊息', 'messages'], label: '家長訊息', icon: ChatDotRound, route: '/portal/messages' },
  { id: 'announcement', keywords: ['公告', 'announcement'], label: '公告通知', icon: Bell, route: '/portal/announcements' },
  { id: 'hub', keywords: ['今日', '工作台', 'hub', 'today'], label: '今日工作台', icon: HomeFilled, route: '/portal/class-hub' },
]

// 結果分類圖示（對齊 EP icon 系統，取代原本的裝飾 emoji）
const KIND_ICON: Record<string, Component> = {
  student: User,
  guardian: UserFilled,
  message: ChatDotRound,
  contact_book: Notebook,
  announcement: Bell,
}

const query = ref('')
const results = ref<{
  students: Record<string, unknown>[]
  guardians: Record<string, unknown>[]
  messages: Record<string, unknown>[]
  contact_book: Record<string, unknown>[]
  announcements: Record<string, unknown>[]
}>({
  students: [],
  guardians: [],
  messages: [],
  contact_book: [],
  announcements: [],
})
const loading = ref(false)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const modalRef = ref<HTMLElement | null>(null)
// 開啟前的焦點元素，關閉時還原（a11y：焦點不遺失到 document.body）
let previouslyFocused: HTMLElement | null = null

// 各分類在扁平清單中的起始 index（供 role=option 的 aria-selected / id 定位）
const stuBase = computed(() => commandResults.value.length)
const guaBase = computed(() => stuBase.value + results.value.students.length)
const msgBase = computed(() => guaBase.value + results.value.guardians.length)
const cbBase = computed(() => msgBase.value + results.value.messages.length)
const annBase = computed(() => cbBase.value + results.value.contact_book.length)
const activeDescId = computed(() =>
  flatItems.value.length ? `psp-opt-${activeIndex.value}` : undefined,
)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

const commandResults = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q.length < 1) return []
  return COMMANDS.filter(
    (c) =>
      c.keywords.some((k) => k.toLowerCase().includes(q)) ||
      c.label.toLowerCase().includes(q),
  )
})

const flatItems = computed(() => {
  const items = []
  for (const c of commandResults.value) items.push({ kind: 'command', payload: c })
  for (const s of results.value.students) items.push({ kind: 'student', payload: s })
  for (const g of results.value.guardians) items.push({ kind: 'guardian', payload: g })
  for (const m of results.value.messages) items.push({ kind: 'message', payload: m })
  for (const e of results.value.contact_book) items.push({ kind: 'contact_book', payload: e })
  for (const a of results.value.announcements) items.push({ kind: 'announcement', payload: a })
  return items
})

watch(isOpen, async (v) => {
  if (v) {
    previouslyFocused = (document.activeElement as HTMLElement) ?? null
    query.value = ''
    results.value = { students: [], guardians: [], messages: [], contact_book: [], announcements: [] }
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  } else {
    // 關閉時把焦點還給開啟前的元素（搜尋觸發鈕 / FAB）
    previouslyFocused?.focus?.()
    previouslyFocused = null
  }
})

// 鍵盤移動 active 項時，捲入可視區（清單可能超出 psp-results 視窗）
watch(activeIndex, async () => {
  await nextTick()
  const el = document.getElementById(`psp-opt-${activeIndex.value}`)
  el?.scrollIntoView?.({ block: 'nearest' })
})

watch(query, (q) => {
  activeIndex.value = 0
  if (debounceTimer) clearTimeout(debounceTimer)
  if (q.trim().length < 2) {
    results.value = { students: [], guardians: [], messages: [], contact_book: [], announcements: [] }
    return
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true
    try {
      const { data } = await searchPortal(q.trim())
      results.value = {
        students: data.students || [],
        guardians: data.guardians || [],
        messages: data.messages || [],
        contact_book: data.contact_book || [],
        announcements: data.announcements || [],
      }
    } catch (_) {
      // silent
    } finally {
      loading.value = false
    }
  }, 300)
})

function selectItem(item: { kind: string; payload: Record<string, unknown> } | null | undefined) {
  if (!item) return
  closePalette()
  switch (item.kind) {
    case 'command':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push(item.payload.route as any)
      break
    case 'student':
      // 路由為 students/:studentId（name=portal-student-detail），原本多加的 /detail
      // 段不匹配任何路由 → 點了沒反應。改用 named route。
      router.push({ name: 'portal-student-detail', params: { studentId: String(item.payload.id) } })
      break
    case 'guardian':
      router.push({
        name: 'portal-student-detail',
        params: { studentId: String(item.payload.student_id) },
        query: { tab: 'guardians' },
      })
      break
    case 'message':
      // /portal/messages 靜態 redirect 會丟棄 query；改走 messages/:threadId
      // redirect（會把 threadId 轉為 class-hub ?panel=messages&thread=<id>）。
      router.push(`/portal/messages/${item.payload.thread_id}`)
      break
    case 'contact_book':
      router.push({ name: 'portal-contact-book', query: { log_date: item.payload.log_date as string } })
      break
    case 'announcement':
      router.push({ name: 'portal-announcements', query: { id: item.payload.id as string } })
      break
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (activeIndex.value < flatItems.value.length - 1) activeIndex.value += 1
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (activeIndex.value > 0) activeIndex.value -= 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    selectItem(flatItems.value[activeIndex.value])
  }
}

// 焦點陷阱：Tab 在 modal 內（輸入框 ↔ 關閉鈕）循環，不逃逸到背景
function trapTab(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const focusables = modalRef.value?.querySelectorAll<HTMLElement>(
    'input, button, [tabindex]:not([tabindex="-1"])',
  )
  if (!focusables || focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

defineExpose({ activeIndex })
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="psp-overlay" @click.self="closePalette">
      <div
        ref="modalRef"
        class="psp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="搜尋"
        @keydown="trapTab"
      >
        <div class="psp-input-wrap">
          <el-icon class="psp-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            class="psp-input"
            placeholder="搜尋學生 / 家長 / 訊息 / 聯絡簿 / 公告…"
            autocomplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="psp-listbox"
            aria-label="搜尋學生、家長、訊息、聯絡簿、公告"
            :aria-activedescendant="activeDescId"
            data-test="search-input"
            @keydown="onKeydown"
          />
          <span v-if="loading" class="psp-spinner" role="status" aria-label="搜尋中"></span>
          <kbd class="psp-esc" aria-hidden="true">esc</kbd>
          <button type="button" class="psp-close" aria-label="關閉搜尋" @click="closePalette">
            <el-icon><Close /></el-icon>
          </button>
        </div>

        <div id="psp-listbox" class="psp-results" role="listbox" aria-label="搜尋結果">
          <template v-if="commandResults.length">
            <div class="psp-section" role="presentation">快捷</div>
            <div
              v-for="(c, i) in commandResults"
              :id="`psp-opt-${i}`"
              :key="`cmd-${c.id}`"
              role="option"
              :aria-selected="activeIndex === i"
              :class="['psp-item', { active: activeIndex === i }]"
              :data-test="`command-${c.id}`"
              @click="selectItem({ kind: 'command', payload: c })"
              @mouseenter="activeIndex = i"
            >
              <el-icon class="psp-item-icon"><component :is="c.icon" /></el-icon>
              <span class="psp-item-label">{{ c.label }}</span>
            </div>
          </template>

          <template v-if="results.students.length">
            <div class="psp-section" role="presentation">學生</div>
            <div
              v-for="(s, i) in results.students"
              :id="`psp-opt-${stuBase + i}`"
              :key="`stu-${s.id}`"
              role="option"
              :aria-selected="activeIndex === stuBase + i"
              :class="['psp-item', { active: activeIndex === stuBase + i }]"
              @click="selectItem({ kind: 'student', payload: s })"
              @mouseenter="activeIndex = stuBase + i"
            >
              <el-icon class="psp-item-icon"><component :is="KIND_ICON.student" /></el-icon>
              <span class="psp-item-label">{{ s.name }}</span>
              <span class="psp-item-sub">{{ s.classroom_name }} · 家長 {{ s.parent_name || '—' }}</span>
            </div>
          </template>

          <template v-if="results.guardians.length">
            <div class="psp-section" role="presentation">家長</div>
            <div
              v-for="(g, i) in results.guardians"
              :id="`psp-opt-${guaBase + i}`"
              :key="`gua-${g.id}`"
              role="option"
              :aria-selected="activeIndex === guaBase + i"
              :class="['psp-item', { active: activeIndex === guaBase + i }]"
              @click="selectItem({ kind: 'guardian', payload: g })"
              @mouseenter="activeIndex = guaBase + i"
            >
              <el-icon class="psp-item-icon"><component :is="KIND_ICON.guardian" /></el-icon>
              <span class="psp-item-label">{{ g.name }}</span>
              <span class="psp-item-sub">{{ g.child_name }} · {{ g.phone_masked }}</span>
            </div>
          </template>

          <template v-if="results.messages.length">
            <div class="psp-section" role="presentation">親師訊息</div>
            <div
              v-for="(m, i) in results.messages"
              :id="`psp-opt-${msgBase + i}`"
              :key="`msg-${m.thread_id}`"
              role="option"
              :aria-selected="activeIndex === msgBase + i"
              :class="['psp-item', { active: activeIndex === msgBase + i }]"
              @click="selectItem({ kind: 'message', payload: m })"
              @mouseenter="activeIndex = msgBase + i"
            >
              <el-icon class="psp-item-icon"><component :is="KIND_ICON.message" /></el-icon>
              <span class="psp-item-label">{{ m.student_name }}</span>
              <span class="psp-item-sub">{{ m.snippet }}</span>
            </div>
          </template>

          <template v-if="results.contact_book.length">
            <div class="psp-section" role="presentation">聯絡簿</div>
            <div
              v-for="(e, i) in results.contact_book"
              :id="`psp-opt-${cbBase + i}`"
              :key="`cb-${e.entry_id}`"
              role="option"
              :aria-selected="activeIndex === cbBase + i"
              :class="['psp-item', { active: activeIndex === cbBase + i }]"
              @click="selectItem({ kind: 'contact_book', payload: e })"
              @mouseenter="activeIndex = cbBase + i"
            >
              <el-icon class="psp-item-icon"><component :is="KIND_ICON.contact_book" /></el-icon>
              <span class="psp-item-label">{{ e.log_date }} · {{ e.student_name }}</span>
              <span class="psp-item-sub">{{ e.snippet }}</span>
            </div>
          </template>

          <template v-if="results.announcements.length">
            <div class="psp-section" role="presentation">公告</div>
            <div
              v-for="(a, i) in results.announcements"
              :id="`psp-opt-${annBase + i}`"
              :key="`ann-${a.id}`"
              role="option"
              :aria-selected="activeIndex === annBase + i"
              :class="['psp-item', { active: activeIndex === annBase + i }]"
              @click="selectItem({ kind: 'announcement', payload: a })"
              @mouseenter="activeIndex = annBase + i"
            >
              <el-icon class="psp-item-icon"><component :is="KIND_ICON.announcement" /></el-icon>
              <span class="psp-item-label">{{ a.title }}</span>
            </div>
          </template>

          <div v-if="query.trim().length >= 2 && flatItems.length === 0 && !loading" class="psp-empty">
            找不到結果
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.psp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 10vh;
}
.psp-modal {
  width: 100%;
  max-width: 600px;
  max-height: 70vh;
  /* 主題感知表面色（teleport 到 body，脫離 .portal-layout 鎖定範圍，
   * dark 模式下不再白底亮字） */
  background: var(--el-bg-color-overlay);
  color: var(--el-text-color-primary);
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
@media (--to-sm) {
  .psp-overlay {
    padding-top: 0;
    align-items: stretch;
  }
  .psp-modal {
    max-width: 100%;
    max-height: 100vh;
    height: 100vh;
    border-radius: 0;
  }
}
.psp-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.psp-icon {
  color: var(--el-text-color-secondary);
}
.psp-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  background: transparent;
  color: var(--el-text-color-primary);
}
.psp-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--el-color-primary);
  border-top-color: transparent;
  border-radius: 50%;
  animation: psp-spin 0.7s linear infinite;
}
@keyframes psp-spin {
  to {
    transform: rotate(360deg);
  }
}
.psp-esc {
  padding: 2px 6px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 明確的關閉鈕（≥44px 觸控目標）：手機滿版時是唯一可靠的關閉方式 */
.psp-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 8px;
  -webkit-tap-highlight-color: transparent;
}
.psp-close:hover {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
}
.psp-close:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
}
/* 桌面隱藏 esc 提示以外的重複關閉鈕不需要；手機才特別需要大關閉鈕 */
@media (min-width: 768px) {
  .psp-close {
    display: none;
  }
}
.psp-results {
  overflow-y: auto;
  flex: 1;
}
.psp-section {
  padding: 8px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color-lighter);
}
.psp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
}
.psp-item.active {
  background: var(--el-color-primary-light-9);
}
.psp-item-icon {
  font-size: 18px;
  width: 24px;
  flex: 0 0 24px;
  color: var(--el-text-color-secondary);
}
.psp-item-label {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.psp-item-sub {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.psp-empty {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
