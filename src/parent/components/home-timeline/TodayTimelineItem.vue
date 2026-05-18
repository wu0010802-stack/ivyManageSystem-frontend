<script setup lang="ts">
import { computed } from 'vue'
import ParentIcon from '../ParentIcon.vue'
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

const dotClasses = computed<string[]>(() => [
  'dot',
  `tone-${props.event.tone || 'neutral'}`,
  `variant-${props.event.variant || 'info'}`,
])

function handle(): void {
  if (props.event.path) emit('navigate', props.event.path)
}
</script>

<template>
  <li
    class="row"
    :class="{ 'row-first': isFirst, 'row-last': isLast, 'row-info': event.variant === 'info' }"
  >
    <span class="rail" aria-hidden="true">
      <span v-if="!isFirst" class="rail-up"></span>
      <span :class="dotClasses">
        <CrownIcon v-if="event.motif === 'crown'" :size="12" decorative class="motif" />
      </span>
      <span v-if="!isLast" class="rail-down"></span>
    </span>

    <button
      type="button"
      class="entry press-scale"
      :disabled="!event.path"
      @click="handle"
    >
      <span v-if="event.time" class="time">{{ event.time }}</span>
      <span v-else class="time time-placeholder" aria-hidden="true"></span>
      <span class="body">
        <span class="primary">{{ event.primary }}</span>
        <span v-if="event.secondary" class="secondary">{{ event.secondary }}</span>
      </span>
      <ParentIcon
        v-if="event.path"
        name="chevron-right"
        size="sm"
        class="arrow"
      />
    </button>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 56px 1fr;
}
.row-info { opacity: 0.78; }

.rail {
  position: relative;
  display: grid;
  grid-template-rows: 1fr auto 1fr;
  justify-items: center;
  align-items: center;
}
.rail-up,
.rail-down {
  width: 1px;
  background: var(--pt-border, rgba(0, 0, 0, 0.08));
  align-self: stretch;
  justify-self: center;
}
.row-first .rail-up { visibility: hidden; }
.row-last .rail-down { visibility: hidden; }

.dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-primary);
  box-shadow: 0 0 0 3px var(--pt-surface-page, #fff);
  z-index: 1;
  position: relative;
}
.dot .motif { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); }

.variant-pending {
  background: var(--pt-surface-page, #fff);
  border: 2px solid currentColor;
}
.variant-info {
  background: var(--pt-surface-mute);
  border: 1px solid var(--pt-border);
}

.tone-success     { color: var(--brand-primary); background: var(--brand-primary); }
.tone-warn        { color: var(--pt-warning-text); background: var(--pt-warning-text); }
.tone-danger      { color: var(--color-danger); background: var(--color-danger); }
.tone-money       { color: var(--pt-tint-money-fg); background: var(--pt-tint-money-fg); }
.tone-info        { color: var(--pt-info-text); background: var(--pt-info-text); }
.tone-event       { color: var(--pt-tint-event-fg); background: var(--pt-tint-event-fg); }
.tone-message     { color: var(--pt-tint-message-fg); background: var(--pt-tint-message-fg); }
.tone-activity    { color: var(--pt-tint-activity-fg); background: var(--pt-tint-activity-fg); }
.tone-leave       { color: var(--pt-tint-leave-fg); background: var(--pt-tint-leave-fg); }
.tone-violet      { color: var(--pt-violet-text, #6d4ed5); background: var(--pt-violet-text, #6d4ed5); }
.tone-announcement{ color: var(--pt-tint-announcement-fg); background: var(--pt-tint-announcement-fg); }
.tone-muted       { color: var(--pt-text-placeholder); background: var(--pt-surface-mute); }

.variant-pending.tone-success { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-warn { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-danger { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-money { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-info { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-event { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-message { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-activity { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-leave { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-violet { background: var(--pt-surface-page, #fff); }
.variant-pending.tone-announcement { background: var(--pt-surface-page, #fff); }

.entry {
  appearance: none;
  background: transparent;
  border: 0;
  padding: var(--space-3, 12px) var(--space-3, 12px) var(--space-3, 12px) 0;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  text-align: left;
  width: 100%;
  cursor: pointer;
  color: inherit;
  border-radius: var(--radius-md, 10px);
  min-height: var(--touch-target-min, 44px);
}
.entry:disabled { cursor: default; }
.entry:not(:disabled):active { background: var(--pt-surface-mute-soft); }

.time {
  font-size: var(--text-xs, 12px);
  font-weight: 800;
  color: var(--pt-text-faint);
  flex-shrink: 0;
  min-width: 38px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.time-placeholder {
  visibility: hidden;
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

.arrow {
  color: var(--pt-text-disabled);
  flex-shrink: 0;
}

/* 變化間距：past 群 → pending 群 → info 群之間給多一點呼吸 */
.row + .row-info,
.row.row-info + :not(.row-info) {
  margin-top: var(--space-3, 12px);
}
</style>
