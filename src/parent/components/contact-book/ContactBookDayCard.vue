<script setup lang="ts">
import { computed } from 'vue'
import MoodBadge from './MoodBadge.vue'
import ParentIcon from '../ParentIcon.vue'
import type { ContactBookEntry } from '../../api/contactBook'

interface EntryPhoto {
  id?: number
  thumb_url?: string
  display_url: string
}

const props = withDefaults(defineProps<{
  entry: ContactBookEntry
  studentName?: string
  classroomName?: string
}>(), {
  studentName: '',
  classroomName: '',
})

const dateFormatted = computed<string>(() => {
  const raw = props.entry?.log_date
  if (!raw) return ''
  const [y, m, d] = raw.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  const wd = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()]
  return `${Number(m)} 月 ${Number(d)} 日　星期${wd}`
})

const isUnread = computed<boolean>(() => !props.entry?.isRead)
const photoCount = computed<number>(() => (props.entry?.photos || []).length)
// Facade's `photos` is `unknown[]` for forward-compat; narrow here at the access boundary.
const previewPhotos = computed<EntryPhoto[]>(() => ((props.entry?.photos ?? []) as EntryPhoto[]).slice(0, 3))

const teacherNoteShort = computed<string | null>(() => {
  const note = props.entry?.teacher_note
  if (!note) return null
  return note.length > 80 ? note.slice(0, 80) + '…' : note
})

const stats = computed(() => {
  const e = props.entry || {}
  const out: { key: string; label: string; value: string | number; icon: string }[] = []
  if (e.meal_lunch != null) out.push({ key: 'lunch', label: '午餐', value: `${e.meal_lunch}/3`, icon: 'restaurant' })
  if (e.nap_minutes != null) out.push({ key: 'nap', label: '午睡', value: `${e.nap_minutes} 分`, icon: 'bedtime' })
  if (e.temperature_c != null) out.push({ key: 'temp', label: '體溫', value: `${e.temperature_c}°`, icon: 'thermostat' })
  if (photoCount.value > 0) out.push({ key: 'photo', label: '照片', value: photoCount.value, icon: 'photo_camera' })
  return out
})
</script>

<template>
  <article class="day-card">
    <div class="hero">
      <MoodBadge :mood="entry.mood" size="lg" />
      <div class="hero-head">
        <h2 class="name">
          <span class="name-text">{{ studentName }}</span>
          <span v-if="isUnread" class="unread-dot" aria-label="尚未閱讀" />
          <span v-else class="read-check" aria-label="已讀">
            <ParentIcon name="check" size="xs" :decorative="false" />
          </span>
        </h2>
        <p class="meta">
          <span>{{ dateFormatted }}</span>
          <span v-if="classroomName" class="meta-sep" aria-hidden="true">·</span>
          <span v-if="classroomName">{{ classroomName }}</span>
        </p>
      </div>
    </div>

    <div v-if="stats.length" class="stats">
      <div v-for="s in stats" :key="s.key" class="stat" :class="`stat-${s.key}`">
        <span class="stat-icon" aria-hidden="true">
          <span class="material-symbols-rounded">{{ s.icon }}</span>
        </span>
        <span class="stat-value">{{ s.value }}</span>
        <span class="stat-label">{{ s.label }}</span>
      </div>
    </div>

    <p v-if="teacherNoteShort" class="note">
      <span class="note-quote" aria-hidden="true">「</span>{{ teacherNoteShort }}<span class="note-quote" aria-hidden="true">」</span>
    </p>

    <div v-if="previewPhotos.length" class="photos">
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
  background:
    linear-gradient(135deg, var(--cream, #fffcf2) 0%, var(--leaf-100, #dcf4e6) 100%);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: 20px;
  padding: 18px 16px 16px;
  isolation: isolate;
}

.hero {
  display: flex;
  align-items: center;
  gap: 14px;
}
.hero-head {
  flex: 1;
  min-width: 0;
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
  background: var(--brand-primary, #0d9053);
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
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(13, 144, 83, 0.08);
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
  color: var(--brand-primary, #0d9053);
}
.stat-icon .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}
.stat-lunch .stat-icon { color: var(--coral-600, #e96b6b); }
.stat-nap   .stat-icon { color: var(--grape-700, #6e3f94); }
.stat-temp  .stat-icon { color: var(--sun-700, #c99500); }
.stat-photo .stat-icon { color: var(--sky-700, #2d6f8e); }

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
  background: rgba(13, 144, 83, 0.85);
  color: var(--m3-on-primary, #fff);
  font-weight: 700;
  font-size: 17px;
  border-radius: 12px;
}
</style>
