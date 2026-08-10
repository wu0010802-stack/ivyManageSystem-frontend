<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getMonthAgenda, getWeekAgenda } from '../api/calendar'
import { localDateISO } from '../utils/date'
import { toast } from '../utils/toast'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

interface AgendaItem {
  date?: string
  kind?: string
  category?: string
  target_id?: unknown
  ref?: { id?: unknown }
  title?: string
  subtitle?: string
  requires_acknowledgment?: boolean
  [key: string]: unknown
}

const router = useRouter()
const data = ref<{ items?: AgendaItem[] } | null>(null)
const loading = ref(false)
const days = ref(7)

/**
 * 'days' = 未來 N 天（原有行為）；'month' = 整個當月。
 *
 * 後端 /calendar/month 一直都在，前端只接了 week，家長因此看不到
 * 「這個月還有什麼活動」。兩者共用同一份 items 形狀，只差查詢區間。
 */
const mode = ref<'days' | 'month'>('days')
const now = new Date()
const monthYear = now.getFullYear()
const monthNo = now.getMonth() + 1

const rangeLabel = computed(() =>
  mode.value === 'month' ? `${monthNo} 月` : `未來 ${days.value} 天`,
)

const CATEGORY_META: Record<string, { icon: string; tone: string; label: string }> = {
  event:         { icon: 'event',          tone: 'grape', label: '活動' },
  fee_due:       { icon: 'payments',       tone: 'sun',   label: '繳費截止' },
  announcement:  { icon: 'campaign',       tone: 'coral', label: '公告' },
  holiday:       { icon: 'celebration',    tone: 'sky',   label: '假日' },
  contact_book:  { icon: 'menu_book',      tone: 'leaf',  label: '聯絡簿' },
  leave:         { icon: 'event_busy',     tone: 'sky',   label: '請假' },
  medication:    { icon: 'medication',     tone: 'grape', label: '用藥' },
}

const groupedByDate = computed(() => {
  if (!data.value?.items) return []
  const groups = new Map<string, AgendaItem[]>()
  for (const it of data.value.items) {
    const key = it.date || ''
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(it)
  }
  return Array.from(groups.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, items]) => ({ date, items }))
})

async function fetchData() {
  loading.value = true
  try {
    const { data: d } =
      mode.value === 'month'
        ? await getMonthAgenda(monthYear, monthNo)
        : await getWeekAgenda(days.value)
    data.value = d
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入行事曆失敗'))
  } finally {
    loading.value = false
  }
}

function selectDays(d: number) {
  mode.value = 'days'
  days.value = d
  fetchData()
}

function selectMonth() {
  if (mode.value === 'month') return
  mode.value = 'month'
  fetchData()
}

function gotoItem(it: AgendaItem) {
  const kind = it.kind || it.category
  const id = it.target_id ?? it.ref?.id
  if (kind === 'fee_due') router.push('/fees')
  else if (kind === 'event' || kind === 'holiday') router.push('/events')
  else if (kind === 'announcement') router.push('/announcements')
  else if (kind === 'contact_book' && id) router.push(`/contact-book/${id}`)
  else if (kind === 'leave') router.push('/leaves')
  else if (kind === 'medication' && id) router.push(`/medications/${id}`)
}

// P2-FE-Parent-7：原本 `new Date(iso)` 對 'YYYY-MM-DD' 走 UTC midnight，
// 跨午夜/跨時區會把今天判為昨天。改用 string compare 對 localDateISO，
// 並用 split('-') 解析建構本地 Date 取 weekday，徹底避開 UTC trap。
const todayStr = ref(localDateISO(new Date()))
const tomorrowStr = computed(() => {
  const [y, m, d] = todayStr.value.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return localDateISO(dt)
})

let todayInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  fetchData()
  todayInterval = setInterval(() => {
    const next = localDateISO(new Date())
    if (next !== todayStr.value) todayStr.value = next
  }, 60 * 1000)
})
onBeforeUnmount(() => {
  if (todayInterval) clearInterval(todayInterval)
})

function dayLabel(iso: string) {
  // 用 string compare 而非 `new Date(iso)`，避開 UTC 解析
  const [y, m, d] = iso.split('-').map(Number)
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(y, m - 1, d).getDay()]
  if (iso === todayStr.value) return { primary: '今天', secondary: `${iso} 星期${wd}`, isToday: true }
  if (iso === tomorrowStr.value) return { primary: '明天', secondary: `${iso} 星期${wd}`, isToday: false }
  return { primary: `星期${wd}`, secondary: iso, isToday: false }
}
</script>

<template>
  <div class="cal-view">
    <header class="pt-page-hero">
      <p class="pt-page-hero-eyebrow">行事曆</p>
      <h1 class="pt-page-hero-title">{{ rangeLabel }}</h1>
      <div class="day-filter" role="group" aria-label="行事曆範圍">
        <button
          v-for="d in [3, 7, 14]"
          :key="d"
          type="button"
          :class="{ active: mode === 'days' && days === d }"
          :aria-pressed="mode === 'days' && days === d"
          @click="selectDays(d)"
        >
          {{ d }} 天
        </button>
        <button
          type="button"
          :class="{ active: mode === 'month' }"
          :aria-pressed="mode === 'month'"
          @click="selectMonth"
        >
          整月
        </button>
      </div>
    </header>

    <template v-if="loading && !data">
      <div class="skeleton-wrap">
        <SkeletonBlock variant="card" :count="3" />
      </div>
    </template>

    <EmptyState
      v-else-if="data && groupedByDate.length === 0"
      variant="mobile"
      :icon="KawaiiStar"
      :title="mode === 'month' ? `${monthNo} 月沒有特別行程` : `未來 ${days} 天沒有特別行程`"
      description="園所行程更新後會出現在這裡"
    />

    <div v-else-if="data" class="pt-stack-12 pt-section-pad-x">
      <section v-for="g in groupedByDate" :key="g.date" class="day-card">
        <header class="day-head">
          <div class="day-label">
            <span class="day-primary" :class="{ 'is-today': dayLabel(g.date).isToday }">
              {{ dayLabel(g.date).primary }}
            </span>
            <span class="day-secondary">{{ dayLabel(g.date).secondary }}</span>
          </div>
          <span class="day-count">{{ g.items.length }} 項</span>
        </header>
        <div class="items">
          <button
            v-for="(it, i) in g.items"
            :key="`${it.category}-${it.ref?.id}-${i}`"
            type="button"
            class="item"
            @click="gotoItem(it)"
          >
            <span class="cat-dot" :class="`tone-${CATEGORY_META[it.category || '']?.tone || 'leaf'}`" aria-hidden="true">
              <span class="material-symbols-rounded">{{ CATEGORY_META[it.category || '']?.icon || 'info' }}</span>
            </span>
            <span class="content">
              <span class="cat-label">{{ CATEGORY_META[it.category || '']?.label || it.category }}</span>
              <span class="title">{{ it.title }}</span>
              <span v-if="it.subtitle" class="subtitle">{{ it.subtitle }}</span>
            </span>
            <span v-if="it.requires_acknowledgment" class="pt-pill pt-pill-danger">需簽閱</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cal-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-bottom: 24px;
}
.skeleton-wrap { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

.day-filter {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.day-filter > button {
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: var(--pt-text-body);
  cursor: pointer;
  font-family: inherit;
  transition: background 160ms ease;
}
.day-filter > button.active {
  background: var(--brand-primary, #0d9053);
  color: var(--pt-on-accent, #fff);
  border-color: var(--brand-primary, #0d9053);
}

.day-card {
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  border-radius: 18px;
  overflow: hidden;
}
.day-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--pt-border-light, #ecf5f9);
  background: var(--cream, #fffcf2);
}
.day-label { display: flex; flex-direction: column; gap: 2px; }
.day-primary {
  font-size: 16px;
  font-weight: 800;
  color: var(--pt-text-strong);
}
.day-primary.is-today { color: var(--brand-primary, #0d9053); }
.day-secondary {
  font-size: 11px;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
}
.day-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
}

.items {
  display: flex;
  flex-direction: column;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--pt-border-light, #ecf5f9);
  text-align: left;
  cursor: pointer;
  transition: background 160ms ease;
  font-family: inherit;
}
.item:last-child { border-bottom: none; }
.item:hover { background: var(--pt-surface-mute-soft, #fefcf3); }
.item:active { background: var(--cream, #fffcf2); }

.cat-dot {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cat-dot .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.cat-dot.tone-leaf  { background: var(--leaf-100, #dcf4e6);  color: var(--brand-primary, #0d9053); }
.cat-dot.tone-coral { background: var(--coral-100, #ffe3e0); color: var(--coral-700, #b14545); }
.cat-dot.tone-grape { background: var(--grape-100, #ebe0f5); color: var(--grape-700, #6e3f94); }
.cat-dot.tone-sun   { background: var(--sun-100, #fff4c9);   color: var(--sun-700, #c99500); }
.cat-dot.tone-sky   { background: var(--sky-100, #dceef5);   color: var(--sky-700, #2d6f8e); }

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.cat-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pt-text-muted);
}
.title {
  font-size: 14px;
  font-weight: 600;
  color: var(--pt-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.subtitle {
  font-size: 12px;
  color: var(--pt-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .day-filter > button, .item { transition: none; }
}
</style>
