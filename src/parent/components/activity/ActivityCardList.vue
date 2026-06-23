<script setup lang="ts">
/**
 * 可報名才藝課程卡片列表（presentational）。
 *
 * Props:
 *  - courses: ActivityCourse 陣列
 *  - conflictIds: 與所選孩子已報名課程時段衝突的 course id 集合（advisory 標記）
 *
 * 根節點帶 id="act-upcoming" 提供 hero scrollIntoView 錨點。
 *
 * 注：目前後端 course response 無 poster/image 欄位，故未使用 LazyImage。
 */
import { formatWeekday, formatTimeRange, formatAgeRange } from '../../utils/activitySchedule'

interface Course {
  id: number
  name: string
  price?: number
  school_year: number
  semester: number
  sessions?: number
  capacity: number
  enrolled_count: number
  is_full: boolean
  allow_waitlist: boolean
  description?: string
  min_age_months?: number | null
  max_age_months?: number | null
  meeting_weekday?: number | null
  meeting_start_time?: string | null
  meeting_end_time?: string | null
  instructor_name?: string | null
  next_session_date?: string | null
}

const props = withDefaults(defineProps<{
  courses?: Course[]
  conflictIds?: Set<number>
}>(), {
  courses: () => [],
  conflictIds: () => new Set<number>(),
})

// 課程時段摘要：'週三 15:30–16:30'（缺 weekday 或時間則只顯示有的部分）。
function scheduleText(c: Course): string {
  return [formatWeekday(c.meeting_weekday), formatTimeRange(c.meeting_start_time, c.meeting_end_time)]
    .filter(Boolean)
    .join(' ')
}

function ageText(c: Course): string {
  return formatAgeRange(c.min_age_months, c.max_age_months)
}

function isConflict(c: Course): boolean {
  return props.conflictIds.has(c.id)
}

// "YYYY-MM-DD" → "M/D"（下次上課顯示用；缺值回空字串）。
function nextSessionText(c: Course): string {
  const d = c.next_session_date
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${Number(m)}/${Number(day)}`
}

function hasMeta(c: Course): boolean {
  return !!(scheduleText(c) || ageText(c) || isConflict(c) || c.instructor_name || c.next_session_date)
}
</script>

<template>
  <div id="act-upcoming" class="card-list">
    <div
      v-for="c in courses"
      :key="c.id"
      class="course-card"
    >
      <div class="course-card-row1">
        <span class="course-card-name">{{ c.name }}</span>
        <span class="course-card-price">${{ c.price?.toLocaleString() }}</span>
      </div>
      <div class="course-card-row2">
        <span>{{ c.school_year }}-{{ c.semester === 1 ? '上' : '下' }}</span>
        <span v-if="c.sessions">・{{ c.sessions }} 堂</span>
        <span :class="['enroll-tag', c.is_full ? 'full' : 'open']">
          {{ c.enrolled_count }}/{{ c.capacity }}
          {{ c.is_full ? (c.allow_waitlist ? '可候補' : '已額滿') : '可報名' }}
        </span>
      </div>
      <div v-if="hasMeta(c)" class="course-card-meta">
        <span v-if="scheduleText(c)" class="meta-chip">🕒 {{ scheduleText(c) }}</span>
        <span v-if="c.next_session_date" class="meta-chip">📅 下次 {{ nextSessionText(c) }}</span>
        <span v-if="c.instructor_name" class="meta-chip">👤 {{ c.instructor_name }}</span>
        <span v-if="ageText(c)" class="meta-chip">適齡 {{ ageText(c) }}</span>
        <span v-if="isConflict(c)" class="meta-chip conflict">時段衝突</span>
      </div>
      <div v-if="c.description" class="course-card-desc">{{ c.description }}</div>
    </div>
  </div>
</template>

<style scoped>
.card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.course-card {
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: 1px solid var(--m3-outline-variant, var(--pt-border));
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.course-card-row1 {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.course-card-name {
  font-weight: 800;
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.course-card-price {
  color: var(--m3-primary, var(--brand-primary));
  font-weight: 800;
}

.course-card-row2 {
  margin-top: 4px;
  color: var(--pt-text-faint);
  font-size: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.enroll-tag {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  margin-left: auto;
}
.enroll-tag.open { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.enroll-tag.full { background: var(--pt-tint-money); color: var(--pt-tint-money-fg); }

.course-card-meta {
  margin-top: 6px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}

.meta-chip {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: var(--pt-surface-subtle, var(--m3-surface-container-high));
  color: var(--pt-text-soft);
}

.meta-chip.conflict {
  background: var(--color-warning-soft);
  color: var(--pt-warning-text-soft);
  font-weight: 800;
}

.course-card-desc {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.5;
}
</style>
