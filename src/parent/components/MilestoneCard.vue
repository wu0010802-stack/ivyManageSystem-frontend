<script setup lang="ts">
import { computed } from 'vue'
import MilestoneReactionBar from './MilestoneReactionBar.vue'

interface Milestone {
  id: number | string
  icon?: string
  title?: string
  achieved_on?: string
  occurred_at?: string
  summary?: string
  description?: string
  parent_reaction?: string | null
  parent_acknowledged_at?: string | null
  [key: string]: unknown
}

const props = defineProps<{
  milestone: Milestone
}>()
const emit = defineEmits<{
  'react': [reaction: string]
  'acknowledge': []
}>()

const isAcknowledged = computed<boolean>(() => !!props.milestone.parent_acknowledged_at)

const dateLabel = computed<string>(() => {
  const raw = props.milestone.achieved_on || props.milestone.occurred_at || ''
  const [y, m, d] = String(raw).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(raw)
  return `${y} 年 ${m} 月 ${d} 日`
})
</script>

<template>
  <div class="milestone-card">
    <div class="icon" role="img" :aria-label="milestone.title || '里程碑'">
      {{ milestone.icon || '✨' }}
    </div>
    <div class="title">{{ milestone.title }}</div>
    <div class="date">{{ dateLabel }}</div>
    <div v-if="milestone.summary || milestone.description" class="desc">
      {{ milestone.summary || milestone.description }}
    </div>

    <MilestoneReactionBar
      :current="milestone.parent_reaction"
      @select="(reaction) => emit('react', reaction)"
    />

    <!--
      「我看到了」＝後端的 acknowledge（純標記已看過、first-ack-wins、不動 reaction）。
      端點一直都在，只是沒有 UI 入口（api/childMilestones.ts 舊 TODO）。
      對老師而言這是「家長確實看到孩子的成長紀錄」的回饋訊號。
    -->
    <p v-if="isAcknowledged" class="acked">
      <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
      已確認
    </p>
    <button v-else type="button" class="ack-btn" @click="emit('acknowledge')">
      我看到了
    </button>
  </div>
</template>

<style scoped>
.milestone-card {
  min-width: 180px;
  max-width: 220px;
  padding: 16px;
  background: var(--m3-tertiary-container, linear-gradient(135deg, #fff6e8, #fef3c7));
  border-radius: 16px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.icon { font-size: 32px; }
.title { font-weight: 700; font-size: 15px; color: var(--m3-primary, #0d9053); }
.date { font-size: 12px; color: var(--m3-on-surface-variant, #6b7280); }
.desc { font-size: 13px; color: var(--m3-on-surface, #374151); }

.ack-btn {
  margin-top: 2px;
  padding: 7px 12px;
  border: 1px solid rgba(13, 144, 83, 0.28);
  border-radius: 999px;
  background: transparent;
  color: var(--m3-primary, #006d3d);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 140ms ease;
}
.ack-btn:hover { background: rgba(13, 144, 83, 0.08); }
.ack-btn:active { background: rgba(13, 144, 83, 0.14); }

.acked {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--pt-text-muted, #6b5e54);
}
.acked .material-symbols-rounded {
  font-size: 16px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
  color: var(--brand-primary, #0d9053);
}

@media (prefers-reduced-motion: reduce) {
  .ack-btn { transition: none; }
}
</style>
