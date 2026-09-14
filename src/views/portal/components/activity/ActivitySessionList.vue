<script setup lang="ts">
/**
 * 課程點名的場次列表（2026-09-14 改版）。
 *
 * 改版前是整月 36 列的 el-table：依日期升冪、沒有「今天」、沒有上課時間，老師要自己
 * 掃過整個月才找得到今天那一堂；手機上表格還會橫向溢出，「出席」欄被擠出畫面。
 *
 * 現在的結構：今天固定在第一屏 → 漏點名主動浮出 → 其餘依日分組 → 更早的自己選範圍。
 * 一列一堂的 grid（不是 table），窄螢幕直接堆疊，不會有橫捲。
 */
import { computed } from 'vue'
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import EmptyState from '@/components/common/EmptyState.vue'
import {
  courseOptions,
  groupByDay,
  toSessionView,
  type BoardSession,
  type SessionView,
} from '@/utils/activitySessionBoard'

const props = withDefaults(
  defineProps<{
    sessions: BoardSession[]
    /** 漏點名（過去 N 天沒點完的），由父層另外撈，可能不在目前顯示範圍內 */
    overdue?: SessionView[]
    loading?: boolean
    today: string
    /** 目前範圍的標題，例：本週 9/14 至 9/20 */
    rangeLabel: string
    mode?: 'week' | 'custom'
    filterCourseId?: number | null
    customStart?: string | null
    customEnd?: string | null
  }>(),
  {
    overdue: () => [],
    loading: false,
    mode: 'week',
    filterCourseId: null,
    customStart: null,
    customEnd: null,
  },
)

const emit = defineEmits<{
  'shift-week': [delta: number]
  'go-today': []
  'update:filterCourseId': [value: number | null]
  'update:customStart': [value: string | null]
  'update:customEnd': [value: string | null]
  'apply-custom': []
  'open-rollcall': [session: SessionView]
}>()

const courses = computed(() => courseOptions(props.sessions))

const visible = computed(() => {
  const views = props.sessions.map((s) => toSessionView(s, props.today))
  if (props.filterCourseId == null) return views
  return views.filter((s) => s.course_id === props.filterCourseId)
})

const todaySessions = computed(() =>
  visible.value
    .filter((s) => s.isToday)
    .sort((a, b) => (a.meeting_start_time ?? '').localeCompare(b.meeting_start_time ?? '')),
)

const otherGroups = computed(() => groupByDay(visible.value.filter((s) => !s.isToday)))

/** 漏點名也吃課程篩選，否則篩了某一門課還冒出別門課的提示。 */
const overdueVisible = computed(() =>
  props.filterCourseId == null
    ? props.overdue
    : props.overdue.filter((s) => s.course_id === props.filterCourseId),
)

const overdueSummary = computed(() =>
  overdueVisible.value
    .slice(0, 3)
    .map((s) => `${(s.session_date ?? '').slice(5)} ${s.course_name}`)
    .join('、'),
)

function statusText(s: SessionView): string {
  if (s.status === 'unmarked') return '未點名'
  if (s.status === 'partial') return `已點 ${s.markedCount}／${s.totalCount}`
  if (s.status === 'done') return `已完成 ${s.markedCount}／${s.totalCount}`
  return '尚未開始'
}

function statusClass(s: SessionView): string {
  return {
    unmarked: 'is-warn',
    partial: 'is-progress',
    done: 'is-ok',
    upcoming: 'is-mute',
  }[s.status]
}

function actionLabel(s: SessionView): string {
  if (s.status === 'unmarked') return '開始點名'
  if (s.status === 'partial') return '繼續點名'
  if (s.status === 'upcoming') return '查看名冊'
  return '查看'
}

function startTime(s: SessionView): string {
  return (s.meeting_start_time ?? '').slice(0, 5)
}

function endTime(s: SessionView): string {
  return (s.meeting_end_time ?? '').slice(0, 5)
}

function rosterLabel(s: SessionView): string {
  return s.totalCount > 0 ? `${s.totalCount} 人` : ''
}

function absentNote(s: SessionView): string {
  if (s.status !== 'done') return ''
  const absent = s.markedCount - s.present_count
  return absent > 0 ? `${absent} 缺席` : ''
}
</script>

<template>
  <div class="session-board">
    <!-- 課程篩選：chip 取代下拉，不展開就看得到有哪幾門課 -->
    <div v-if="courses.length > 1" class="board-chips" role="group" aria-label="課程篩選">
      <button
        type="button"
        class="chip"
        :class="{ 'is-on': filterCourseId == null }"
        :aria-pressed="filterCourseId == null"
        @click="emit('update:filterCourseId', null)"
      >
        全部 {{ courses.length }} 門
      </button>
      <button
        v-for="c in courses"
        :key="c.id"
        type="button"
        class="chip"
        :class="{ 'is-on': filterCourseId === c.id }"
        :aria-pressed="filterCourseId === c.id"
        @click="emit('update:filterCourseId', c.id)"
      >
        {{ c.name }}
      </button>
    </div>

    <!-- 範圍導覽：週切換取代「上月／本月／下月＋兩個日期框」 -->
    <div class="board-nav">
      <el-button-group>
        <el-button :icon="ArrowLeft" aria-label="上一週" @click="emit('shift-week', -1)" />
        <el-button class="board-nav__label" data-test="range-label" @click="emit('go-today')">
          {{ rangeLabel }}
        </el-button>
        <el-button :icon="ArrowRight" aria-label="下一週" @click="emit('shift-week', 1)" />
      </el-button-group>
      <el-button link type="primary" data-test="go-today" @click="emit('go-today')">
        回到今天
      </el-button>
    </div>

    <div v-if="loading" v-loading="true" class="board-loading" data-test="board-loading" />

    <template v-else>
      <!-- 漏點名：不夾在列表裡等人自己翻 -->
      <div v-if="overdueVisible.length" class="overdue" data-test="overdue-strip">
        <div class="overdue__text">
          <strong>過去兩週還有 {{ overdueVisible.length }} 堂沒點完</strong>
          <span class="overdue__list">
            {{ overdueSummary }}<template v-if="overdueVisible.length > 3"> 等</template>
          </span>
        </div>
        <el-button size="small" @click="emit('open-rollcall', overdueVisible[0])">補點名</el-button>
      </div>

      <!-- 今天：永遠在第一屏 -->
      <section class="board-section" data-test="today-section">
        <h2 class="board-section__title">今天</h2>
        <div v-if="todaySessions.length" class="board-list">
          <article
            v-for="s in todaySessions"
            :key="s.id"
            class="row row--today"
            data-test="session-row"
          >
            <div class="row__time">
              <span class="row__time-start">{{ startTime(s) || '—' }}</span>
              <small v-if="endTime(s)">至 {{ endTime(s) }}</small>
            </div>
            <div class="row__main">
              <span class="row__name">{{ s.course_name }}</span>
              <small v-if="rosterLabel(s)" class="row__meta">{{ rosterLabel(s) }}</small>
            </div>
            <div class="row__status">
              <span class="pill" :class="statusClass(s)">{{ statusText(s) }}</span>
            </div>
            <div class="row__action">
              <el-button type="primary" @click="emit('open-rollcall', s)">
                {{ actionLabel(s) }}
              </el-button>
            </div>
          </article>
        </div>
        <p v-else class="board-none">今天沒有才藝課。</p>
      </section>

      <!-- 其餘場次：依日分組 -->
      <section v-if="otherGroups.length" class="board-section">
        <h2 class="board-section__title">其他場次</h2>
        <div class="board-list">
          <template v-for="g in otherGroups" :key="g.date">
            <p class="board-day">{{ g.label }}</p>
            <article
              v-for="s in g.sessions"
              :key="s.id"
              class="row"
              :class="{ 'row--done': s.status === 'done' }"
              data-test="session-row"
            >
              <div class="row__time">
                <span class="row__time-start">{{ startTime(s) || '—' }}</span>
              </div>
              <div class="row__main">
                <span class="row__name">{{ s.course_name }}</span>
                <small v-if="s.status === 'upcoming' && rosterLabel(s)" class="row__meta">
                  {{ rosterLabel(s) }}
                </small>
              </div>
              <div class="row__status">
                <span class="pill" :class="statusClass(s)">{{ statusText(s) }}</span>
                <small v-if="absentNote(s)" class="row__absent">{{ absentNote(s) }}</small>
              </div>
              <div class="row__action">
                <el-button size="small" @click="emit('open-rollcall', s)">
                  {{ actionLabel(s) }}
                </el-button>
              </div>
            </article>
          </template>
        </div>
      </section>

      <EmptyState
        v-if="!todaySessions.length && !otherGroups.length"
        variant="inline"
        title="這個範圍沒有才藝場次"
        description="場次由行政端在「才藝管理」建立。換一週看看，或用下方的日期範圍查更早的紀錄。"
      />

      <!-- 自訂範圍：偶爾才用，收在最後 -->
      <details class="board-more">
        <summary>更早的場次</summary>
        <div class="board-more__body">
          <el-date-picker
            :model-value="customStart"
            type="date"
            placeholder="開始日期"
            value-format="YYYY-MM-DD"
            @update:model-value="emit('update:customStart', $event)"
          />
          <span class="board-more__sep">至</span>
          <el-date-picker
            :model-value="customEnd"
            type="date"
            placeholder="結束日期"
            value-format="YYYY-MM-DD"
            @update:model-value="emit('update:customEnd', $event)"
          />
          <el-button @click="emit('apply-custom')">查詢</el-button>
        </div>
      </details>
    </template>
  </div>
</template>

<style scoped>
.session-board {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

/* ── 課程 chip ─────────────────────────────────────────── */
.board-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
}
.chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: 999px;
  background: var(--pt-surface-card, #fff);
  color: var(--pt-text-body);
  font: inherit;
  font-size: var(--text-sm, 13px);
  cursor: pointer;
}
.chip.is-on {
  background: var(--el-color-primary-light-9, #eef2ff);
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
.chip:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

/* ── 週導覽 ───────────────────────────────────────────── */
.board-nav {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.board-nav__label {
  min-width: 11rem;
}
.board-loading {
  min-height: 200px;
}

/* ── 漏點名 ───────────────────────────────────────────── */
.overdue {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-lg, 12px);
  background: var(--color-warning-soft);
  color: var(--pt-text-body);
  font-size: var(--text-sm, 13px);
}
.overdue__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 12rem;
  min-width: 0;
}
.overdue__list {
  color: var(--pt-text-muted);
}

/* ── 分區與列 ─────────────────────────────────────────── */
.board-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
.board-section__title {
  margin: 0;
  font-size: var(--text-sm, 13px);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--pt-text-muted);
}
.board-list {
  border: 1px solid var(--pt-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background: var(--pt-surface-card, #fff);
  overflow: hidden;
}
.board-day {
  margin: 0;
  padding: var(--space-2, 8px) var(--space-4, 16px);
  background: var(--pt-surface-mute, #f1f5f9);
  border-top: 1px solid var(--pt-border, #e2e8f0);
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--pt-text-muted);
}
.board-day:first-child {
  border-top: 0;
}

.row {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2, 8px) var(--space-4, 16px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-top: 1px solid var(--pt-border, #e2e8f0);
}
.row:first-child {
  border-top: 0;
}
.row--today {
  padding-block: var(--space-4, 16px);
}
.row__time {
  display: flex;
  flex-direction: column;
  font-variant-numeric: tabular-nums;
}
.row__time-start {
  font-weight: 700;
  color: var(--pt-text-strong);
}
.row__time small,
.row__meta,
.row__absent {
  color: var(--pt-text-muted);
  font-size: var(--text-xs, 12px);
}
.row__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}
.row__name {
  font-weight: 700;
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
}
.row__status {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.row--done .row__name,
.row--done .row__time-start {
  font-weight: 500;
  color: var(--pt-text-muted);
}

.pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  white-space: nowrap;
}
.pill.is-warn {
  background: var(--color-warning-soft);
  color: var(--color-warning-darker);
}
.pill.is-ok {
  background: var(--color-success-soft);
  color: var(--color-success-darker);
}
.pill.is-progress {
  background: var(--el-color-primary-light-9, #eef2ff);
  color: var(--el-color-primary);
}
.pill.is-mute {
  background: var(--pt-surface-mute, #f1f5f9);
  color: var(--pt-text-muted);
  font-weight: 500;
}

.board-none {
  margin: 0;
  padding: var(--space-4, 16px);
  border: 1px dashed var(--pt-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  color: var(--pt-text-muted);
  font-size: var(--text-sm, 13px);
  text-align: center;
}

/* ── 更早的場次 ───────────────────────────────────────── */
.board-more {
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
}
.board-more summary {
  cursor: pointer;
  color: var(--el-color-primary);
  min-height: 32px;
  display: flex;
  align-items: center;
}
.board-more__body {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  padding-top: var(--space-2, 8px);
}

/* ── 窄螢幕：整列改堆疊，不做橫捲 ─────────────────────── */
@media (max-width: 767.98px) {
  .board-chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .chip {
    flex: none;
  }
  .board-nav__label {
    min-width: 9rem;
  }
  .row {
    grid-template-columns: 3.5rem minmax(0, 1fr);
    grid-template-areas:
      'time main'
      'status action';
    row-gap: var(--space-2, 8px);
  }
  .row__time {
    grid-area: time;
  }
  .row__main {
    grid-area: main;
  }
  .row__status {
    grid-area: status;
  }
  .row__action {
    grid-area: action;
    justify-self: end;
  }
  .row__action :deep(.el-button) {
    min-height: var(--touch-target-min, 44px);
  }
}
</style>
