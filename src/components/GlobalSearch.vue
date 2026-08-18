<template>
  <Teleport to="body">
    <Transition name="gs-fade">
      <div v-if="visible" class="gs-overlay" @click.self="close">
        <div ref="modalRef" class="gs-modal" role="dialog" aria-modal="true" aria-label="全局搜尋" @keydown="onKeydown">
          <div class="gs-input-wrap">
            <el-icon class="gs-input-icon"><Search /></el-icon>
            <!--
              combobox 模式：焦點永遠留在 input，用 aria-activedescendant 指出目前
              highlight 的選項。**刻意不給 .gs-item 加 tabindex** —— 這裡已經有
              ArrowDown/Enter 導航（onKeydown），加 tabindex 會讓 Tab 逐一走過每一
              筆結果，反而破壞既有的方向鍵操作。
            -->
            <input
              ref="inputRef"
              v-model="query"
              class="gs-input"
              placeholder="搜尋學生、員工、家長、班級、學費、才藝、招生、公告、頁面…"
              autocomplete="off"
              role="combobox"
              aria-controls="gs-listbox"
              aria-autocomplete="list"
              :aria-expanded="query.trim().length >= 2"
              :aria-activedescendant="activeIndex >= 0 ? `gs-opt-${activeIndex}` : undefined"
            />
            <span v-if="isLoading" class="gs-spinner"></span>
            <kbd class="gs-esc-hint" @click="close">esc</kbd>
          </div>

          <div class="gs-results" ref="resultsRef" id="gs-listbox" role="listbox" aria-label="搜尋結果">
            <template v-if="query.trim().length >= 2">
              <div v-if="isLoading && !groups.length && !pageEntries.length" class="gs-skeleton" aria-hidden="true">
                <div v-for="n in 3" :key="n" class="gs-skel-row">
                  <span class="gs-skel-icon"></span>
                  <span class="gs-skel-bar" :style="{ width: `${72 - n * 14}%` }"></span>
                </div>
              </div>
              <template v-for="group in groups" :key="group.key">
                <div class="gs-section-title" role="presentation">
                  {{ group.title }}<span class="gs-count">{{ group.items.length }}</span>
                </div>
                <div
                  v-for="entry in group.items"
                  :key="group.key + '-' + entry.flatIndex"
                  :id="`gs-opt-${entry.flatIndex}`"
                  class="gs-item"
                  role="option"
                  :aria-selected="activeIndex === entry.flatIndex"
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
                <div class="gs-section-title" role="presentation">頁面</div>
                <div
                  v-for="entry in pageEntries"
                  :key="'page-' + entry.flatIndex"
                  :id="`gs-opt-${entry.flatIndex}`"
                  class="gs-item"
                  role="option"
                  :aria-selected="activeIndex === entry.flatIndex"
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
            <template v-else>
              <template v-if="idleRecentEntries.length">
                <div class="gs-section-title" role="presentation">
                  最近搜尋
                  <button class="gs-clear-btn" type="button" @click="clearRecent">清除</button>
                </div>
                <div
                  v-for="entry in idleRecentEntries"
                  :key="'recent-' + entry.flatIndex"
                  :id="`gs-opt-${entry.flatIndex}`"
                  class="gs-item"
                  role="option"
                  :aria-selected="activeIndex === entry.flatIndex"
                  :class="{ 'gs-item--active': activeIndex === entry.flatIndex }"
                  @mouseenter="activeIndex = entry.flatIndex"
                  @click="selectByFlat(entry.flatIndex)"
                >
                  <el-icon class="gs-item-icon"><Clock /></el-icon>
                  <span class="gs-item-label">{{ entry.label }}</span>
                </div>
              </template>

              <template v-if="idleQuickEntries.length">
                <div class="gs-section-title" role="presentation">常用頁面</div>
                <div
                  v-for="entry in idleQuickEntries"
                  :key="'quick-' + entry.flatIndex"
                  :id="`gs-opt-${entry.flatIndex}`"
                  class="gs-item"
                  role="option"
                  :aria-selected="activeIndex === entry.flatIndex"
                  :class="{ 'gs-item--active': activeIndex === entry.flatIndex }"
                  @mouseenter="activeIndex = entry.flatIndex"
                  @click="selectByFlat(entry.flatIndex)"
                >
                  <el-icon class="gs-item-icon"><Grid /></el-icon>
                  <span class="gs-item-label">{{ entry.label }}</span>
                  <span class="gs-item-sub">{{ entry.sub }}</span>
                </div>
              </template>

              <div v-if="!idleEntries.length" class="gs-hint">輸入至少 2 個字搜尋</div>
            </template>
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
import { Search, User, Avatar, Bell, Grid, Clock } from '@element-plus/icons-vue'
import { globalSearch } from '@/api/search'
import { canAccessRoute } from '@/utils/auth'
import { highlight } from '@/utils/highlight'
import { tenantGetItem, tenantSetItem, tenantRemoveItem } from '@/utils/tenantStorage'

const router = useRouter()

const visible = ref(false)
const query = ref('')
const activeIndex = ref(-1)
const isLoading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const modalRef = ref<HTMLElement | null>(null)

type Item = Record<string, unknown>
const data = ref<Record<string, Item[]>>({})

// ── 最近搜尋（per-tenant localStorage）────────────────────────────────────────
const RECENT_KEY = 'gs_recent_searches_v1'
const RECENT_MAX = 8
const recent = ref<string[]>([])

function loadRecent() {
  try {
    const raw = tenantGetItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    recent.value = Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string').slice(0, RECENT_MAX)
      : []
  } catch {
    recent.value = []
  }
}

function recordRecent(q: string) {
  const s = q.trim()
  if (s.length < 2) return
  const next = [s, ...recent.value.filter(x => x !== s)].slice(0, RECENT_MAX)
  recent.value = next
  tenantSetItem(RECENT_KEY, JSON.stringify(next))
}

function clearRecent() {
  recent.value = []
  tenantRemoveItem(RECENT_KEY)
}

// ── 常用頁面快捷（空 query 狀態；依權限過濾）─────────────────────────────────
interface QuickLink { title: string; path: string }
const QUICK_LINKS: QuickLink[] = [
  { title: '學生管理', path: '/students' },
  { title: '員工管理', path: '/employees' },
  { title: '班級管理', path: '/classrooms' },
  { title: '考勤管理', path: '/attendance' },
  { title: '請假管理', path: '/leaves' },
  { title: '薪資管理', path: '/salary' },
  { title: '學費管理', path: '/fees' },
  { title: '公告', path: '/announcements' },
]
const quickLinks = computed(() => QUICK_LINKS.filter(l => canAccessRoute(l.path)))

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
    navigate: i => router.push(`/employees/${i.id}`) },
  { key: 'guardians', title: '家長', icon: markRaw(Avatar),
    label: i => String(i.name ?? ''),
    sub: i => [i.child_name, i.phone_masked].filter(Boolean).join('．'),
    navigate: i => router.push(`/students/profile/${i.student_id}`) },
  { key: 'classrooms', title: '班級', icon: markRaw(Grid),
    label: i => String(i.name ?? ''),
    sub: i => i.school_year ? `${i.school_year} 學年` : '',
    navigate: i => router.push({ path: '/classrooms', query: { selected: String(i.id) } }) },
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

// 口語同義詞 → 頁面標題關鍵字：query 與左側詞互含時，額外用右側詞比對標題
const PAGE_TITLE_ALIASES: Record<string, string[]> = {
  薪水: ['薪資'],
  打卡: ['考勤', '出勤'],
  出勤: ['考勤'],
  小孩: ['學生'],
  幼生: ['學生'],
  小朋友: ['學生'],
  休假: ['請假'],
  放假: ['請假', '行事曆'],
  繳費: ['學費', '收費'],
  收費: ['學費'],
}

function pageMatchTerms(q: string): string[] {
  const terms = [q]
  for (const [alias, targets] of Object.entries(PAGE_TITLE_ALIASES)) {
    if (q.includes(alias) || alias.includes(q)) terms.push(...targets)
  }
  return terms
}

interface PageRow { title: string; path: string }
const pages = computed<PageRow[]>(() => {
  const q = query.value.trim()
  if (q.length < 2) return []
  const terms = pageMatchTerms(q)
  const seen = new Set<string>()
  const out: PageRow[] = []
  for (const r of router.getRoutes()) {
    const title = r.meta?.title
    if (!title || r.path.includes(':') || seen.has(r.path)) continue
    if (!canAccessRoute(r.path)) continue
    if (!terms.some(t => String(title).includes(t))) continue
    seen.add(r.path)
    out.push({ title: String(title), path: r.path })
  }
  return out.slice(0, 8)
})

const pageBase = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0))
const pageEntries = computed<RenderedEntry[]>(() =>
  pages.value.map((p, i) => ({ item: p as unknown as Item, flatIndex: pageBase.value + i, label: p.title, sub: p.path })),
)

// ── 空 query（idle）狀態的扁平清單：最近搜尋 + 常用頁面，共用鍵盤導航 ─────────
const isIdle = computed(() => query.value.trim().length < 2)

interface IdleEntry { kind: 'recent' | 'quick'; label: string; sub: string; flatIndex: number; path?: string }
const idleEntries = computed<IdleEntry[]>(() => {
  if (!isIdle.value) return []
  let idx = 0
  const out: IdleEntry[] = []
  for (const s of recent.value) out.push({ kind: 'recent', label: s, sub: '', flatIndex: idx++ })
  for (const l of quickLinks.value) out.push({ kind: 'quick', label: l.title, sub: l.path, flatIndex: idx++, path: l.path })
  return out
})
const idleRecentEntries = computed(() => idleEntries.value.filter(e => e.kind === 'recent'))
const idleQuickEntries = computed(() => idleEntries.value.filter(e => e.kind === 'quick'))

const totalCount = computed(() =>
  isIdle.value ? idleEntries.value.length : pageBase.value + pages.value.length,
)

function selectByFlat(flat: number) {
  if (isIdle.value) {
    const entry = idleEntries.value[flat]
    if (!entry) return
    if (entry.kind === 'recent') { query.value = entry.label; return } // 回填後交給 watch 重新搜尋
    if (entry.path) { router.push(entry.path); close() }
    return
  }
  // 先找實體區塊
  let idx = 0
  for (const sec of SECTIONS) {
    const rows = data.value[sec.key] || []
    if (flat < idx + rows.length) {
      recordRecent(query.value)
      sec.navigate(rows[flat - idx])
      close()
      return
    }
    idx += rows.length
  }
  const page = pages.value[flat - idx]
  if (page) { recordRecent(query.value); router.push(page.path); close() }
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
  } else if (e.key === 'Tab') {
    // focus trap：Tab / Shift+Tab 在 modal 內循環，不讓焦點外洩到背景頁面
    const root = modalRef.value
    if (!root) return
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'input, button, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute('disabled'))
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else if (active === last || !root.contains(active)) {
      e.preventDefault()
      first.focus()
    }
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
  loadRecent()
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
  /* outline 移除的可見替代：聚焦時由 .gs-input-wrap:focus-within 亮起底線 accent */
  outline: none;
  font-size: 15px;
  padding: 16px 0;
  background: transparent;
  color: var(--text-primary, #111827);
}

.gs-input-wrap:focus-within {
  border-bottom-color: var(--color-primary, #4f46e5);
  box-shadow: inset 0 -1px 0 var(--color-primary, #4f46e5);
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

.gs-count {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-tertiary, #9ca3af);
}

.gs-clear-btn {
  float: right;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  cursor: pointer;
  padding: 0;
  text-transform: none;
  letter-spacing: normal;
}

.gs-clear-btn:hover {
  color: var(--color-primary, #4f46e5);
  text-decoration: underline;
}

/* ===== Loading skeleton ===== */
.gs-skel-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 0 8px;
}

.gs-skel-icon {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: var(--border-color-light, #e5e7eb);
  flex-shrink: 0;
  animation: gs-pulse 1.2s ease-in-out infinite;
}

.gs-skel-bar {
  height: 12px;
  border-radius: 6px;
  background: var(--border-color-light, #e5e7eb);
  animation: gs-pulse 1.2s ease-in-out infinite;
}

@keyframes gs-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
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
/* dark mode：硬編淺黃底 + *-darker 文字（a11y.css 把 darker 翻亮）會變「亮字疊淺底」近乎
   不可見。窄覆寫成深底亮字維持 highlight 對比。 */
html.dark .search-highlight {
  background-color: #78350f;
  color: #fde68a;
}
</style>
