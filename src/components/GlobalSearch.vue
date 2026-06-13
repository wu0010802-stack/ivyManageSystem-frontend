<template>
  <Teleport to="body">
    <Transition name="gs-fade">
      <div v-if="visible" class="gs-overlay" @click.self="close">
        <div class="gs-modal" role="dialog" aria-modal="true" aria-label="全局搜尋">
          <div class="gs-input-wrap">
            <el-icon class="gs-input-icon"><Search /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              class="gs-input"
              placeholder="搜尋學生、員工、家長、班級、學費、才藝、招生、公告、頁面…"
              autocomplete="off"
              @keydown="onKeydown"
            />
            <span v-if="isLoading" class="gs-spinner"></span>
            <kbd class="gs-esc-hint" @click="close">esc</kbd>
          </div>

          <div class="gs-results" ref="resultsRef">
            <template v-if="query.trim().length >= 2">
              <template v-for="group in groups" :key="group.key">
                <div class="gs-section-title">{{ group.title }}</div>
                <div
                  v-for="entry in group.items"
                  :key="group.key + '-' + entry.flatIndex"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === entry.flatIndex }"
                  @mouseenter="activeIndex = entry.flatIndex"
                  @click="selectByFlat(entry.flatIndex)"
                >
                  <el-icon class="gs-item-icon"><component :is="group.icon" /></el-icon>
                  <span class="gs-item-label" v-html="highlight(entry.label, query)"></span>
                  <span class="gs-item-sub">{{ entry.sub }}</span>
                </div>
              </template>

              <template v-if="pageEntries.length">
                <div class="gs-section-title">頁面</div>
                <div
                  v-for="entry in pageEntries"
                  :key="'page-' + entry.flatIndex"
                  class="gs-item"
                  :class="{ 'gs-item--active': activeIndex === entry.flatIndex }"
                  @mouseenter="activeIndex = entry.flatIndex"
                  @click="selectByFlat(entry.flatIndex)"
                >
                  <el-icon class="gs-item-icon"><Grid /></el-icon>
                  <span class="gs-item-label" v-html="highlight(entry.label, query)"></span>
                  <span class="gs-item-sub">{{ entry.sub }}</span>
                </div>
              </template>

              <div v-if="!groups.length && !pageEntries.length && !isLoading" class="gs-empty">
                無符合「{{ query }}」的結果
              </div>
            </template>
            <div v-else class="gs-hint">輸入至少 2 個字搜尋</div>
          </div>

          <div class="gs-footer">
            <span><kbd>↑</kbd><kbd>↓</kbd> 導航</span>
            <span><kbd>Enter</kbd> 選擇</span>
            <span><kbd>Esc</kbd> 關閉</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { Search, User, Avatar, Bell, Grid } from '@element-plus/icons-vue'
import { globalSearch } from '@/api/search'
import { canAccessRoute } from '@/utils/auth'
import { highlight } from '@/utils/highlight'

const router = useRouter()

const visible = ref(false)
const query = ref('')
const activeIndex = ref(-1)
const isLoading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)

type Item = Record<string, unknown>
const data = ref<Record<string, Item[]>>({})

interface SectionDef {
  key: string
  title: string
  icon: unknown
  label: (i: Item) => string
  sub: (i: Item) => string
  navigate: (i: Item) => void
}

const SECTIONS: SectionDef[] = [
  { key: 'students', title: '學生', icon: markRaw(Avatar),
    label: i => String(i.name ?? ''),
    sub: i => String(i.classroom_name || i.student_id || ''),
    navigate: i => router.push(`/students/profile/${i.id}`) },
  { key: 'employees', title: '員工', icon: markRaw(User),
    label: i => String(i.name ?? ''),
    sub: i => String(i.title || i.employee_id || ''),
    navigate: i => router.push({ path: '/employees', query: { section: 'employees', search: String(i.name ?? '') } }) },
  { key: 'guardians', title: '家長', icon: markRaw(Avatar),
    label: i => String(i.name ?? ''),
    sub: i => [i.child_name, i.phone_masked].filter(Boolean).join('．'),
    navigate: i => router.push(`/students/profile/${i.student_id}`) },
  { key: 'classrooms', title: '班級', icon: markRaw(Grid),
    label: i => String(i.name ?? ''),
    sub: i => i.school_year ? `${i.school_year} 學年` : '',
    navigate: () => router.push('/classrooms') },
  { key: 'fees', title: '學費', icon: markRaw(Grid),
    label: i => String(i.student_name ?? ''),
    sub: i => [i.period, i.status === 'paid' ? '已繳' : '未繳'].filter(Boolean).join('．'),
    navigate: i => router.push({ path: '/fees', query: { search: String(i.student_name ?? '') } }) },
  { key: 'activity_registrations', title: '才藝報名', icon: markRaw(Grid),
    label: i => String(i.student_name ?? ''),
    sub: i => String(i.class_name ?? ''),
    navigate: i => router.push({ path: '/activity/registrations', query: { search: String(i.student_name ?? '') } }) },
  { key: 'recruitment', title: '招生', icon: markRaw(Grid),
    label: i => String(i.child_name ?? ''),
    sub: i => i.target_school_year ? `${i.target_school_year} 學年` : '',
    navigate: i => router.push({ path: '/students/admissions', query: { keyword: String(i.child_name ?? '') } }) },
  { key: 'announcements', title: '公告', icon: markRaw(Bell),
    label: i => String(i.title ?? ''),
    sub: () => '',
    navigate: () => router.push('/announcements') },
]

interface RenderedEntry { item: Item; flatIndex: number; label: string; sub: string }
interface RenderedGroup { key: string; title: string; icon: unknown; items: RenderedEntry[] }

const groups = computed<RenderedGroup[]>(() => {
  const out: RenderedGroup[] = []
  let idx = 0
  for (const sec of SECTIONS) {
    const rows = data.value[sec.key] || []
    const items = rows.map(item => ({ item, flatIndex: idx++, label: sec.label(item), sub: sec.sub(item) }))
    if (items.length) out.push({ key: sec.key, title: sec.title, icon: sec.icon, items })
  }
  return out
})

interface PageRow { title: string; path: string }
const pages = computed<PageRow[]>(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  const seen = new Set<string>()
  const out: PageRow[] = []
  for (const r of router.getRoutes()) {
    const title = r.meta?.title
    if (!title || r.path.includes(':') || seen.has(r.path)) continue
    if (!canAccessRoute(r.path)) continue
    if (!String(title).includes(q)) continue
    seen.add(r.path)
    out.push({ title: String(title), path: r.path })
  }
  return out.slice(0, 8)
})

const pageBase = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))
const pageEntries = computed<RenderedEntry[]>(() =>
  pages.value.map((p, i) => ({ item: p as unknown as Item, flatIndex: pageBase.value + i, label: p.title, sub: p.path })),
)

const totalCount = computed(() => pageBase.value + pages.value.length)

function selectByFlat(flat: number) {
  // 先找實體區塊
  let idx = 0
  for (const sec of SECTIONS) {
    const rows = data.value[sec.key] || []
    if (flat < idx + rows.length) { sec.navigate(rows[flat - idx]); close(); return }
    idx += rows.length
  }
  const page = pages.value[flat - idx]
  if (page) { router.push(page.path); close() }
}

let timer: ReturnType<typeof setTimeout> | null = null
watch(query, (q) => {
  activeIndex.value = -1
  if (timer) clearTimeout(timer)
  const s = q.trim()
  if (s.length < 2) { data.value = {}; isLoading.value = false; return }
  timer = setTimeout(async () => {
    isLoading.value = true
    try {
      const res = await globalSearch(s)
      // 回傳含 q:string + 各類陣列，先轉 unknown 再視為各區塊 map（不用 any）
      data.value = (res.data as unknown as Record<string, Item[]>) || {}
    } catch {
      data.value = {}
    } finally {
      isLoading.value = false
    }
  }, 300)
})

function onKeydown(e: KeyboardEvent) {
  const total = totalCount.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = total ? (activeIndex.value + 1) % total : -1
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = total ? (activeIndex.value - 1 + total) % total : -1
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (activeIndex.value >= 0 && activeIndex.value < total) selectByFlat(activeIndex.value)
  } else if (e.key === 'Escape') {
    close()
  }
}

function scrollActiveIntoView() {
  nextTick(() => {
    resultsRef.value?.querySelector('.gs-item--active')?.scrollIntoView({ block: 'nearest' })
  })
}

function open() {
  visible.value = true
  query.value = ''
  activeIndex.value = -1
  data.value = {}
  nextTick(() => inputRef.value?.focus())
}

function close() {
  visible.value = false
  if (timer) clearTimeout(timer)
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    visible.value ? close() : open()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  if (timer) clearTimeout(timer)
})

defineExpose({ open })
</script>

<style scoped>
/* ===== Overlay ===== */
.gs-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 10vh;
}

/* ===== Modal ===== */
.gs-modal {
  background: var(--surface-color, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  width: min(640px, calc(100vw - 32px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== Input ===== */
.gs-input-wrap {
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color-light, #e5e7eb);
  gap: 10px;
  flex-shrink: 0;
}

.gs-input-icon {
  font-size: 18px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  padding: 16px 0;
  background: transparent;
  color: var(--text-primary, #111827);
}

.gs-input::placeholder {
  color: var(--text-tertiary, #9ca3af);
}

.gs-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border-color-light, #e5e7eb);
  border-top-color: var(--color-primary, var(--color-info));
  border-radius: 50%;
  animation: gs-spin 0.6s linear infinite;
  flex-shrink: 0;
}

@keyframes gs-spin {
  to { transform: rotate(360deg); }
}

.gs-esc-hint {
  font-size: 12px;
  padding: 2px 6px;
  border: 1px solid var(--border-color-light, #e5e7eb);
  border-radius: 4px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
}

/* ===== Results ===== */
.gs-results {
  overflow-y: auto;
  padding: 8px 0;
  flex: 1;
}

.gs-section-title {
  padding: 6px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, #9ca3af);
}

.gs-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 8px;
  transition: background 0.1s;
}

.gs-item:hover,
.gs-item--active {
  background: var(--color-primary-lighter, #ecf5ff);
}

.gs-item-icon {
  font-size: 16px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-item-label {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gs-item-sub {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-empty,
.gs-hint {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-tertiary, #9ca3af);
  font-size: 14px;
}

/* ===== Footer ===== */
.gs-footer {
  display: flex;
  gap: 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color-light, #e5e7eb);
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  flex-shrink: 0;
}

.gs-footer kbd {
  font-family: inherit;
  font-size: 12px;
  padding: 1px 5px;
  border: 1px solid var(--border-color-light, #d1d5db);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--bg-color, #f9fafb);
  color: var(--text-secondary, #4b5563);
}

/* ===== Transition ===== */
.gs-fade-enter-active,
.gs-fade-leave-active {
  transition: opacity 0.15s ease;
}
.gs-fade-enter-active .gs-modal,
.gs-fade-leave-active .gs-modal {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.gs-fade-enter-from,
.gs-fade-leave-to {
  opacity: 0;
}
.gs-fade-enter-from .gs-modal,
.gs-fade-leave-to .gs-modal {
  transform: translateY(-8px);
  opacity: 0;
}
</style>

<!-- 全域 mark 樣式（不加 scoped 才能套用到 v-html 內部） -->
<style>
.search-highlight {
  background-color: #fef08a;
  color: var(--color-warning-darker);
  border-radius: 2px;
  padding: 0 1px;
  font-style: normal;
}
</style>
