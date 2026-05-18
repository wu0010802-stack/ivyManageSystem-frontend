<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { searchPortal } from '@/api/portalSearch'
import { usePortalSearch } from '@/composables/usePortalSearch'

const router = useRouter()
const { isOpen, closePalette } = usePortalSearch()

const COMMANDS = [
  { id: 'leave', keywords: ['請假', '請假申請', 'leave'], label: '申請請假', icon: '🏖️', route: '/portal/leave' },
  { id: 'punch', keywords: ['補打卡', 'punch'], label: '補打卡申請', icon: '✋', route: '/portal/punch-correction' },
  { id: 'overtime', keywords: ['加班', '加班申請', 'overtime'], label: '加班申請', icon: '⏰', route: '/portal/overtime' },
  { id: 'swap', keywords: ['換班', '代課', 'swap'], label: '換班 / 代課', icon: '🔄', route: '/portal/schedule' },
  { id: 'salary', keywords: ['薪資', '薪水', 'salary'], label: '薪資預覽', icon: '💰', route: '/portal/salary' },
  { id: 'calendar', keywords: ['行事曆', 'calendar'], label: '行事曆', icon: '📅', route: '/portal/calendar' },
  { id: 'observation', keywords: ['觀察', '新增觀察', 'observation'], label: '新增觀察', icon: '👁️', route: '/portal/observations' },
  { id: 'messages', keywords: ['訊息', '家長訊息', 'messages'], label: '家長訊息', icon: '💬', route: '/portal/messages' },
  { id: 'announcement', keywords: ['公告', 'announcement'], label: '公告通知', icon: '📢', route: '/portal/announcements' },
  { id: 'hub', keywords: ['今日', '工作台', 'hub', 'today'], label: '今日工作台', icon: '🏠', route: '/portal/class-hub' },
]

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
    query.value = ''
    results.value = { students: [], guardians: [], messages: [], contact_book: [], announcements: [] }
    activeIndex.value = 0
    await nextTick()
    inputRef.value?.focus()
  }
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
      router.push(`/portal/students/${item.payload.id}/detail`)
      break
    case 'guardian':
      router.push(`/portal/students/${item.payload.student_id}/detail#guardians`)
      break
    case 'message':
      router.push({ path: '/portal/messages', query: { thread_id: item.payload.thread_id as string } })
      break
    case 'contact_book':
      router.push({ path: '/portal/contact-book', query: { log_date: item.payload.log_date as string } })
      break
    case 'announcement':
      router.push({ path: '/portal/announcements', query: { id: item.payload.id as string } })
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

defineExpose({ activeIndex })
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="psp-overlay" @click.self="closePalette">
      <div class="psp-modal" role="dialog" aria-modal="true" aria-label="搜尋">
        <div class="psp-input-wrap">
          <el-icon class="psp-icon"><Search /></el-icon>
          <input
            ref="inputRef"
            v-model="query"
            class="psp-input"
            placeholder="搜尋學生 / 家長 / 訊息 / 聯絡簿 / 公告…"
            autocomplete="off"
            data-test="search-input"
            @keydown="onKeydown"
          />
          <span v-if="loading" class="psp-spinner"></span>
          <kbd class="psp-esc" @click="closePalette">esc</kbd>
        </div>

        <div class="psp-results">
          <template v-if="commandResults.length">
            <div class="psp-section">快捷</div>
            <div
              v-for="(c, i) in commandResults"
              :key="`cmd-${c.id}`"
              :class="['psp-item', { active: activeIndex === i }]"
              :data-test="`command-${c.id}`"
              @click="selectItem({ kind: 'command', payload: c })"
              @mouseenter="activeIndex = i"
            >
              <span class="psp-item-icon">{{ c.icon }}</span>
              <span class="psp-item-label">{{ c.label }}</span>
            </div>
          </template>

          <template v-if="results.students.length">
            <div class="psp-section">學生</div>
            <div
              v-for="(s, i) in results.students"
              :key="`stu-${s.id}`"
              :class="['psp-item', { active: activeIndex === commandResults.length + i }]"
              @click="selectItem({ kind: 'student', payload: s })"
              @mouseenter="activeIndex = commandResults.length + i"
            >
              <span class="psp-item-icon">👤</span>
              <span class="psp-item-label">{{ s.name }}</span>
              <span class="psp-item-sub">{{ s.classroom_name }} · 家長 {{ s.parent_name || '—' }}</span>
            </div>
          </template>

          <template v-if="results.guardians.length">
            <div class="psp-section">家長</div>
            <div
              v-for="(g, i) in results.guardians"
              :key="`gua-${g.id}`"
              :class="['psp-item', { active: activeIndex === commandResults.length + results.students.length + i }]"
              @click="selectItem({ kind: 'guardian', payload: g })"
              @mouseenter="activeIndex = commandResults.length + results.students.length + i"
            >
              <span class="psp-item-icon">👪</span>
              <span class="psp-item-label">{{ g.name }}</span>
              <span class="psp-item-sub">{{ g.child_name }} · {{ g.phone_masked }}</span>
            </div>
          </template>

          <template v-if="results.messages.length">
            <div class="psp-section">親師訊息</div>
            <div
              v-for="(m, i) in results.messages"
              :key="`msg-${m.thread_id}`"
              :class="['psp-item', { active: activeIndex === commandResults.length + results.students.length + results.guardians.length + i }]"
              @click="selectItem({ kind: 'message', payload: m })"
              @mouseenter="activeIndex = commandResults.length + results.students.length + results.guardians.length + i"
            >
              <span class="psp-item-icon">💬</span>
              <span class="psp-item-label">{{ m.student_name }}</span>
              <span class="psp-item-sub">{{ m.snippet }}</span>
            </div>
          </template>

          <template v-if="results.contact_book.length">
            <div class="psp-section">聯絡簿</div>
            <div
              v-for="(e, i) in results.contact_book"
              :key="`cb-${e.entry_id}`"
              :class="['psp-item', { active: activeIndex === commandResults.length + results.students.length + results.guardians.length + results.messages.length + i }]"
              @click="selectItem({ kind: 'contact_book', payload: e })"
              @mouseenter="activeIndex = commandResults.length + results.students.length + results.guardians.length + results.messages.length + i"
            >
              <span class="psp-item-icon">📓</span>
              <span class="psp-item-label">{{ e.log_date }} · {{ e.student_name }}</span>
              <span class="psp-item-sub">{{ e.snippet }}</span>
            </div>
          </template>

          <template v-if="results.announcements.length">
            <div class="psp-section">公告</div>
            <div
              v-for="(a, i) in results.announcements"
              :key="`ann-${a.id}`"
              :class="['psp-item', { active: activeIndex === commandResults.length + results.students.length + results.guardians.length + results.messages.length + results.contact_book.length + i }]"
              @click="selectItem({ kind: 'announcement', payload: a })"
              @mouseenter="activeIndex = commandResults.length + results.students.length + results.guardians.length + results.messages.length + results.contact_book.length + i"
            >
              <span class="psp-item-icon">📢</span>
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
  background: white;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}
@media (max-width: 767px) {
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
  cursor: pointer;
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
  font-size: 20px;
  width: 24px;
  text-align: center;
}
.psp-item-label {
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 500;
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
