<script setup lang="ts">
/**
 * 「現在該做」置頂卡（Phase 2 任務流首頁）。
 *
 * 資料源＝班級工作台摘要（getTodayHub）：sticky_next 為下一件班級任務、
 * counts 為四類待辦計數。把班級待辦帶進首頁，細項營運仍在 ClassroomOpsCard
 * 與班級工作台，這裡只做「當下焦點＋一眼計數」。
 */
import { computed } from 'vue'

interface NextTask {
  kind?: string
  student_name?: string
  detail?: string
  due_at?: string | null
  deep_link?: string
}

interface HubCounts {
  attendance_pending?: number
  medications_pending?: number
  observations_pending?: number
  contact_books_pending?: number
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  next?: NextTask | null
  counts?: HubCounts
  classroomName?: string
}>(), {
  next: null,
  counts: () => ({}),
  classroomName: '',
})

defineEmits<{ 'jump': [deepLink: string | undefined]; 'open-hub': [] }>()

const dueLabel = computed(() => {
  const iso = props.next?.due_at
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const CHIP_DEFS: Array<{ key: keyof HubCounts; label: string }> = [
  { key: 'attendance_pending', label: '到園點名' },
  { key: 'medications_pending', label: '用藥' },
  { key: 'observations_pending', label: '課堂觀察' },
  { key: 'contact_books_pending', label: '聯絡簿' },
]

const chips = computed(() =>
  CHIP_DEFS
    .map((c) => ({ ...c, count: (props.counts?.[c.key] as number) || 0 }))
    .filter((c) => c.count > 0),
)
</script>

<template>
  <div class="pt-card-elevated today-focus">
    <div class="today-focus__head">
      <span class="today-focus__eyebrow">現在該做</span>
      <span v-if="classroomName" class="today-focus__class">{{ classroomName }}</span>
    </div>

    <div v-if="next" class="today-focus__main">
      <div class="today-focus__body">
        <div class="today-focus__detail">{{ next.detail }}</div>
        <div class="today-focus__meta">
          <span v-if="dueLabel">{{ dueLabel }}</span>
          <span v-if="next.student_name">{{ next.student_name }}</span>
        </div>
      </div>
      <button type="button" class="today-focus__cta" @click="$emit('jump', next.deep_link)">
        去處理
      </button>
    </div>

    <div v-else class="today-focus__done">
      <span class="today-focus__done-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
      今日班級任務都完成
    </div>

    <button
      v-if="chips.length"
      type="button"
      class="today-focus__strip"
      @click="$emit('open-hub')"
    >
      <span v-for="chip in chips" :key="chip.key" class="today-focus__chip">
        {{ chip.label }} <strong>{{ chip.count }}</strong>
      </span>
      <svg class="today-focus__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9.5 6.5 15 12l-5.5 5.5" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.today-focus {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.today-focus__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.today-focus__eyebrow {
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--color-primary);
}

.today-focus__class {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--pt-text-muted);
  background: var(--pt-surface-mute);
  border-radius: var(--radius-full);
  padding: 2px 10px;
}

.today-focus__main {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.today-focus__body {
  flex: 1 1 auto;
  min-width: 0;
}

.today-focus__detail {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--pt-text-strong);
}

.today-focus__meta {
  margin-top: 2px;
  display: flex;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}

.today-focus__cta {
  flex-shrink: 0;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-5);
  background: var(--color-primary);
  color: #ffffff;
  border: none;
  border-radius: var(--btn-radius, 8px);
  font-family: inherit;
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);
  -webkit-tap-highlight-color: transparent;
}

.today-focus__cta:hover {
  background: var(--color-primary-soft);
}

.today-focus__cta:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.today-focus__done {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-success-darker);
}

.today-focus__done-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--color-success-soft);
  color: var(--color-success-darker);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.today-focus__done-icon svg {
  width: 16px;
  height: 16px;
}

.today-focus__strip {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
  background: var(--pt-surface-mute);
  border: var(--pt-hairline);
  border-radius: var(--radius-md);
  font-family: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.today-focus__strip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.today-focus__chip {
  font-size: var(--text-sm);
  color: var(--pt-text-muted);
}

.today-focus__chip strong {
  color: var(--pt-text-strong);
}

.today-focus__chev {
  width: 14px;
  height: 14px;
  color: var(--pt-text-faint);
  margin-left: auto;
  flex-shrink: 0;
}
</style>
