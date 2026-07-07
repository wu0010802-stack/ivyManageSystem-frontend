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
import { formatWeekday, formatTimeRange } from '../../utils/activitySchedule'
import M3Card from '../m3/M3Card.vue'
import M3Icon from '../m3/M3Icon.vue'
import StatusPill from '../StatusPill.vue'

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
  return !!(scheduleText(c) || isConflict(c) || c.instructor_name || c.next_session_date)
}

/**
 * 課程名額狀態 → StatusPill tone。
 * - 可報名（open）→ warn（提示名額有限）
 * - 可候補（full + allow_waitlist）→ neutral（額滿但可等補）
 * - 已額滿（full + no waitlist）→ neutral（已額滿）
 */
function enrollTone(c: Course): 'ok' | 'warn' | 'danger' | 'neutral' | 'info' {
  if (!c.is_full) return 'warn'   // 可報名，剩名額，吸引行動
  return 'neutral'                 // 額滿（可候補或完全額滿）
}

function enrollLabel(c: Course): string {
  if (!c.is_full) return `${c.enrolled_count}/${c.capacity} 可報名`
  if (c.allow_waitlist) return `${c.enrolled_count}/${c.capacity} 可候補`
  return `${c.enrolled_count}/${c.capacity} 已額滿`
}
</script>

<template>
  <div id="act-upcoming" class="card-list">
    <M3Card
      v-for="c in courses"
      :key="c.id"
      variant="elevated"
      padding="14px"
      class="course-card"
    >
      <div class="course-card-body">
        <!-- Icon tile -->
        <div class="course-icon-tile" aria-hidden="true">
          <M3Icon name="sports" :size="28" />
        </div>
        <!-- Main content -->
        <div class="course-card-content">
          <div class="course-card-row1">
            <span class="course-card-name">{{ c.name }}</span>
            <span class="course-card-price">${{ c.price?.toLocaleString() }}</span>
          </div>
          <div class="course-card-row2">
            <span>{{ c.school_year }}-{{ c.semester === 1 ? '上' : '下' }}</span>
            <span v-if="c.sessions">・{{ c.sessions }} 堂</span>
            <StatusPill
              :label="enrollLabel(c)"
              :tone="enrollTone(c)"
              class="enroll-pill"
            />
          </div>
          <div v-if="hasMeta(c)" class="course-card-meta">
            <span v-if="scheduleText(c)" class="meta-chip">
              <M3Icon name="schedule" :size="13" aria-hidden="true" />
              {{ scheduleText(c) }}
            </span>
            <span v-if="c.next_session_date" class="meta-chip">
              <M3Icon name="event" :size="13" aria-hidden="true" />
              下次 {{ nextSessionText(c) }}
            </span>
            <span v-if="c.instructor_name" class="meta-chip">
              <M3Icon name="person" :size="13" aria-hidden="true" />
              {{ c.instructor_name }}
            </span>
            <span v-if="isConflict(c)" class="meta-chip conflict">
              <M3Icon name="warning" :size="13" aria-hidden="true" />
              時段衝突
            </span>
          </div>
          <div v-if="c.description" class="course-card-desc">{{ c.description }}</div>
        </div>
      </div>
    </M3Card>
  </div>
</template>

<style scoped>
.card-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 10px);
}

.course-card-body {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: flex-start;
}

.course-icon-tile {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--m3-secondary-container, #d3e8d3);
  color: var(--m3-on-secondary-container, #0e1f12);
  display: flex;
  align-items: center;
  justify-content: center;
}

.course-card-content {
  flex: 1;
  min-width: 0;
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
  margin-top: var(--space-1, 4px);
  color: var(--pt-text-faint);
  font-size: 12px;
  display: flex;
  gap: var(--space-2, 6px);
  flex-wrap: wrap;
  align-items: center;
}

.enroll-pill {
  margin-left: auto;
}

.course-card-meta {
  margin-top: var(--space-2, 6px);
  display: flex;
  gap: var(--space-2, 6px);
  flex-wrap: wrap;
  align-items: center;
}

.meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  background: var(--pt-surface-subtle, var(--m3-surface-container-high));
  color: var(--pt-text-soft);
}

.meta-chip.conflict {
  background: var(--color-warning-soft, #fff3e0);
  color: var(--pt-warning-text-soft, var(--pt-warning-text, #c2740a));
  font-weight: 800;
}

.course-card-desc {
  margin-top: var(--space-2, 6px);
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.5;
}
</style>
