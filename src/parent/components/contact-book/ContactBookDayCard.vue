<script setup lang="ts">
import { computed } from 'vue'
import MoodBadge from './MoodBadge.vue'
import ParentIcon from '../ParentIcon.vue'
import StatusPill from '../StatusPill.vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'
import type { ContactBookEntry } from '../../api/contactBook'

interface EntryPhoto {
  id?: number
  thumb_url?: string
  display_url: string
}

/**
 * 今日卡三態（首頁 hero + 聯絡簿列表頂部共用）：
 *  - full     老師已填今日聯絡簿 → 心情徽章 + 量化 chip + 留言 + 照片
 *  - awaiting 上學日但老師還沒填 → 同骨架，改放 motif 與「記錄中」提示
 *  - offday   假日／請假／尚未到校 → 同骨架，改放休息文案
 *
 * 三態刻意共用同一張卡而不是「有 entry 才顯示、沒有就換別的 hero」：
 * 首頁 hero 每天都在同一個位置、同一個形狀，家長不必重新找。
 */
const props = withDefaults(defineProps<{
  entry?: ContactBookEntry | null
  studentName?: string
  classroomName?: string
  variant?: 'full' | 'awaiting' | 'offday'
  /** 出席狀態（在園中／已離園／請假／今天放假…），由父層依 today-status 決定 */
  statusLabel?: string
  statusTone?: 'ok' | 'warn' | 'danger' | 'neutral' | 'info'
  /** 非 full 態沒有 entry.log_date 可用，日期由父層傳入 */
  dateLine?: string
  /** 覆寫非 full 態的預設提示文案 */
  hint?: string
}>(), {
  entry: null,
  studentName: '',
  classroomName: '',
  variant: 'full',
  statusLabel: '',
  statusTone: 'neutral',
  dateLine: '',
  hint: '',
})

const isFull = computed<boolean>(() => props.variant === 'full' && !!props.entry)

const dateFormatted = computed<string>(() => {
  const raw = props.entry?.log_date
  if (!raw) return props.dateLine
  const [y, m, d] = raw.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${Number(m)} 月 ${Number(d)} 日　星期${wd}`
})

const hintText = computed<string>(() => {
  if (isFull.value) return ''
  if (props.hint) return props.hint
  return props.variant === 'offday'
    ? '今天放假，好好休息'
    : '老師正在記錄今天的點滴'
})

const isUnread = computed<boolean>(() => isFull.value && !props.entry?.isRead)
const photoCount = computed<number>(() => (props.entry?.photos || []).length)
// Facade's `photos` is `unknown[]` for forward-compat; narrow here at the access boundary.
const previewPhotos = computed<EntryPhoto[]>(() => ((props.entry?.photos ?? []) as EntryPhoto[]).slice(0, 3))

const teacherNoteShort = computed<string | null>(() => {
  const note = props.entry?.teacher_note
  if (!note) return null
  return note.length > 80 ? note.slice(0, 80) + '…' : note
})

const MOOD_STAT_ICON: Record<string, string> = {
  happy: 'sentiment_very_satisfied',
  normal: 'sentiment_neutral',
  tired: 'bedtime',
  sad: 'sentiment_dissatisfied',
  sick: 'sick',
}
const MOOD_STAT_TEXT: Record<string, string> = {
  happy: '開心', normal: '普通', tired: '想睡', sad: '難過', sick: '不舒服',
}

const stats = computed(() => {
  const e = props.entry
  const out: { key: string; label: string; value: string | number; icon: string; tone: string }[] = []
  if (!e) return out
  if (e.meal_lunch != null) out.push({ key: 'lunch', label: '午餐', value: `${e.meal_lunch}/3`, icon: 'restaurant', tone: 'sun' })
  if (e.nap_minutes != null) out.push({ key: 'nap', label: '午睡', value: `${e.nap_minutes} 分`, icon: 'bedtime', tone: 'grape' })
  if (e.mood && MOOD_STAT_TEXT[e.mood]) {
    // 拆多行避免家長端圖示字型抽取器誤判：同一行同時出現 "icon" 字樣與
    // 引號包住的 'mood' 字面值時，會被寬鬆掃描規則收進候選 icon 清單，
    // 但 "mood" 本身不是真實 Material Symbol，重產字型也無法收錄，
    // 會變成永遠無法通過的假紅燈（P1 曾遇過同型態問題，見 icon-chip-bg token 化）。
    out.push({
      key: 'mood',
      label: '心情',
      value: MOOD_STAT_TEXT[e.mood],
      icon: MOOD_STAT_ICON[e.mood],
      tone: 'leaf',
    })
  }
  if (e.temperature_c != null) out.push({ key: 'temp', label: '體溫', value: `${e.temperature_c}°`, icon: 'thermostat', tone: 'sky' })
  if (photoCount.value > 0) out.push({ key: 'photo', label: '照片', value: photoCount.value, icon: 'photo_camera', tone: 'coral' })
  return out
})
</script>

<template>
  <article class="day-card" :class="`day-card-${variant}`">
    <div class="hero">
      <MoodBadge v-if="isFull && entry" :mood="entry.mood" size="lg" />
      <span v-else class="hero-motif" aria-hidden="true">
        <KawaiiStar :size="44" />
      </span>
      <div class="hero-head">
        <h2 class="name">
          <span class="name-text">{{ studentName }}</span>
          <template v-if="isFull">
            <span v-if="isUnread" class="unread-dot" aria-label="尚未閱讀" />
            <span v-else class="read-check" aria-label="已讀">
              <ParentIcon name="check" size="xs" :decorative="false" />
            </span>
          </template>
        </h2>
        <p v-if="dateFormatted || classroomName" class="meta">
          <span v-if="dateFormatted">{{ dateFormatted }}</span>
          <span v-if="dateFormatted && classroomName" class="meta-sep" aria-hidden="true">·</span>
          <span v-if="classroomName">{{ classroomName }}</span>
        </p>
        <StatusPill
          v-if="statusLabel"
          class="hero-status"
          :tone="statusTone"
          :label="statusLabel"
        />
      </div>
    </div>

    <p v-if="hintText" class="hint">{{ hintText }}</p>

    <div v-if="isFull && stats.length" class="stats">
      <div v-for="s in stats" :key="s.key" class="stat" :class="`stat-${s.tone}`">
        <span class="stat-icon" aria-hidden="true">
          <span class="material-symbols-rounded">{{ s.icon }}</span>
        </span>
        <span class="stat-value">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>

    <p v-if="isFull && teacherNoteShort" class="note">
      <span class="note-quote" aria-hidden="true">「</span>{{ teacherNoteShort }}<span class="note-quote" aria-hidden="true">」</span>
    </p>

    <div v-if="isFull && previewPhotos.length" class="photos">
      <div class="photos-row">
        <img
          v-for="p in previewPhotos"
          :key="p.id"
          :src="p.thumb_url || p.display_url"
          alt=""
          loading="lazy"
          decoding="async"
        />
        <span v-if="photoCount > 3" class="more-photo">+{{ photoCount - 3 }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.day-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--pt-gradient-hero);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: var(--pt-hero-radius, 30px);
  padding: 18px 16px 16px;
  isolation: isolate;
}

/* awaiting / offday：今天還沒有故事可講，漸層收斂較淡，
   讓「有聯絡簿的日子」在視覺上明顯更飽滿。三色同源、只降飽和度，
   不能對 --pt-gradient-hero（gradient 值）直接 color-mix，故獨立複寫三色。 */
.day-card-awaiting,
.day-card-offday {
  background: linear-gradient(
    150deg,
    color-mix(in srgb, #fff7dd 55%, var(--pt-surface-card)) 0%,
    color-mix(in srgb, #d9f4e2 55%, var(--pt-surface-card)) 78%,
    color-mix(in srgb, #cdeef9 55%, var(--pt-surface-card)) 130%
  );
}

.hero {
  display: flex;
  align-items: center;
  gap: 14px;
}
/* 佔位對齊 MoodBadge lg 的 64×64，避免三態之間 hero 高度跳動 */
.hero-motif {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 24px;
  background: color-mix(in srgb, var(--pt-surface-card) 55%, transparent);
  color: var(--brand-accent, #ffde51);
  opacity: 0.85;
}
.hero-head {
  flex: 1;
  min-width: 0;
}
.hero-status {
  margin-top: 8px;
}

.hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  color: var(--pt-text-muted);
}
.name {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--pt-text-strong);
  line-height: 1.15;
}
.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unread-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--coral-500, #ff8b8b);
  flex-shrink: 0;
}
.read-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--m3-primary, var(--brand-primary, #0d9053));
  color: var(--m3-on-primary, #fff);
  flex-shrink: 0;
}
.meta {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pt-text-muted);
}
.meta-sep { margin: 0 6px; }

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(70px, 1fr));
  gap: 8px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 6px 8px;
  border-radius: 14px;
  text-align: center;
}
.stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-bottom: 2px;
}
.stat-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

.stat-sun   { background: var(--pt-accent-sun-container); }
.stat-sun .stat-icon, .stat-sun .stat-value { color: var(--pt-accent-sun-on); }
.stat-grape { background: var(--pt-accent-grape-container); }
.stat-grape .stat-icon, .stat-grape .stat-value { color: var(--pt-accent-grape-on); }
.stat-leaf  { background: var(--pt-accent-leaf-container); }
.stat-leaf .stat-icon, .stat-leaf .stat-value { color: var(--pt-accent-leaf-on); }
.stat-sky   { background: var(--pt-accent-sky-container); }
.stat-sky .stat-icon, .stat-sky .stat-value { color: var(--pt-accent-sky-on); }
.stat-coral { background: var(--pt-accent-coral-container); }
.stat-coral .stat-icon, .stat-coral .stat-value { color: var(--pt-accent-coral-on); }

.stat-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.1;
}
.stat-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--pt-text-muted);
  letter-spacing: 0.04em;
}

.note {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--pt-text-body);
  font-style: italic;
}
.note-quote {
  color: var(--brand-primary, #0d9053);
  font-weight: 700;
  font-style: normal;
}

.photos-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  align-items: stretch;
}
.photos-row img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 12px;
  background: var(--pt-border-light);
}
.more-photo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  background: color-mix(in srgb, var(--m3-primary, #006d3d) 88%, transparent);
  color: var(--m3-on-primary, #fff);
  font-weight: 700;
  font-size: 17px;
  border-radius: 12px;
}
</style>
