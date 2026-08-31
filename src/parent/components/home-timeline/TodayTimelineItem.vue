<script setup lang="ts">
import { computed } from 'vue'
import CrownIcon from '@/components/brand/CrownIcon.vue'

interface TimelineEvent {
  id?: number | string
  path?: string
  time?: string
  primary?: string
  secondary?: string
  tone?: string
  variant?: string
  motif?: string
}

const props = withDefaults(defineProps<{
  event: TimelineEvent
  isFirst?: boolean
  isLast?: boolean
}>(), {
  isFirst: false,
  isLast: false,
})

const emit = defineEmits<{
  'navigate': [path: string]
}>()

/**
 * tone → icon 對照，僅供展示層使用，刻意不進 useTodayTimeline.ts 資料結構
 * （見 P3 計畫 Global Constraints：純展示邏輯留在展示層，降低改動面）。
 */
const TONE_ICON: Record<string, string> = {
  success: 'check_circle',
  leave: 'event_busy',
  muted: 'schedule',
  violet: 'medication',
  info: 'directions_walk',
  danger: 'payments',
  money: 'payments',
  event: 'mark_email_read',
  message: 'chat_bubble',
  activity: 'palette',
  announcement: 'campaign',
}
const DEFAULT_ICON = 'circle'

const iconName = computed<string>(() => TONE_ICON[props.event.tone || ''] || DEFAULT_ICON)

const dotClasses = computed<string[]>(() => [
  'tdot',
  `tone-${props.event.tone || 'muted'}`,
  `variant-${props.event.variant || 'info'}`,
])

function handle(): void {
  if (props.event.path) emit('navigate', props.event.path)
}
</script>

<template>
  <li class="row" :class="{ 'row-info': event.variant === 'info' }">
    <button
      type="button"
      class="entry press-scale"
      :disabled="!event.path"
      @click="handle"
    >
      <span :class="dotClasses">
        <span class="material-symbols-rounded" aria-hidden="true">{{ iconName }}</span>
        <CrownIcon v-if="event.motif === 'crown'" :size="12" decorative class="motif" />
      </span>
      <span class="body">
        <span class="primary">{{ event.primary }}</span>
        <span v-if="event.secondary" class="secondary">{{ event.secondary }}</span>
      </span>
      <span v-if="event.time" class="time">{{ event.time }}</span>
    </button>
  </li>
</template>

<style scoped>
.row {
  position: relative;
}
.row + .row {
  border-top: 1px solid var(--pt-border-light);
}
.row-info { opacity: 0.78; }

.entry {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 13px 4px;
  display: flex;
  align-items: center;
  gap: 14px;
  text-align: left;
  width: 100%;
  cursor: pointer;
  color: inherit;
  border-radius: var(--radius-md, 10px);
  min-height: var(--touch-target-min, 44px);
}
.entry:disabled { cursor: default; }
.entry:not(:disabled):active { background: var(--pt-surface-mute-soft); }

.tdot {
  width: 40px;
  height: 40px;
  border-radius: 15px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.tdot .material-symbols-rounded {
  font-size: 21px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.tdot .motif { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); }

.tone-success      { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-announcement { background: var(--pt-accent-leaf-container); color: var(--pt-accent-leaf-on); }
.tone-money        { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-activity     { background: var(--pt-accent-sun-container); color: var(--pt-accent-sun-on); }
.tone-danger       { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-event        { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-info         { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-leave        { background: var(--pt-accent-sky-container); color: var(--pt-accent-sky-on); }
.tone-violet       { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-message      { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-muted        { background: var(--m3-surface-container-high); color: var(--pt-text-faint); }

.variant-pending .tdot {
  background: transparent;
  border: 2px solid currentColor;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.primary {
  font-size: var(--text-base, 15px);
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.35;
}
.row-info .primary { font-weight: 600; }

.secondary {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-muted);
  font-weight: 500;
  line-height: 1.4;
}

.time {
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--pt-text-faint);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  align-self: flex-start;
  padding-top: 2px;
}

.row + .row-info,
.row.row-info + :not(.row-info) {
  margin-top: var(--space-1, 4px);
}
</style>
