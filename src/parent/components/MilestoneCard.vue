<script setup lang="ts">
import { computed } from 'vue'
import MilestoneReactionBar from './MilestoneReactionBar.vue'

interface Milestone {
  id: number | string
  milestone_type?: string
  icon?: string | null
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

/**
 * milestone_type → Material 圖示與色調（2026-09-02 孩子頁圖示對齊首頁）。
 *
 * 後端 `icon` 欄位是 emoji（🎂🏆 等，教師端在用）；已知類型一律改用 Material，
 * 只有老師自訂的 `custom`（或未來新增、前端還不認得的類型）才退回 emoji，
 * 放在同一個 48px 淡色方塊裡，畫面上不會突兀。
 */
const TYPE_STYLE: Record<string, { icon: string; tone: string }> = {
  birthday: { icon: 'cake', tone: 'coral' },
  first_day: { icon: 'waving_hand', tone: 'leaf' },
  perfect_attendance_month: { icon: 'workspace_premium', tone: 'sun' },
  first_solo_event: { icon: 'star', tone: 'sun' },
  assessment_excellence: { icon: 'military_tech', tone: 'sky' },
  activity_first_join: { icon: 'celebration', tone: 'sun' },
  graduation: { icon: 'school', tone: 'grape' },
}
const EMOJI_TONE = 'sky'

const typeStyle = computed(() => TYPE_STYLE[props.milestone.milestone_type ?? ''] ?? null)
const tone = computed<string>(() => typeStyle.value?.tone ?? EMOJI_TONE)

const dateLabel = computed<string>(() => {
  const raw = props.milestone.achieved_on || props.milestone.occurred_at || ''
  const [y, m, d] = String(raw).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return String(raw)
  return `${y} 年 ${m} 月 ${d} 日`
})
</script>

<template>
  <div class="milestone-card" :class="`tone-${tone}`">
    <div class="icon" role="img" :aria-label="milestone.title || '里程碑'">
      <span v-if="typeStyle" class="material-symbols-rounded" aria-hidden="true">{{ typeStyle.icon }}</span>
      <template v-else>{{ milestone.icon || '✨' }}</template>
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
  /* 卡底跟著色調走：container 調淡到 45%，方塊本體才維持完整 container/on 對比 */
  background: color-mix(in srgb, var(--tone-container) 45%, var(--pt-surface-card, #fff));
  border-radius: 20px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.tone-sun   { --tone-container: var(--pt-accent-sun-container);   --tone-on: var(--pt-accent-sun-on); }
.tone-coral { --tone-container: var(--pt-accent-coral-container); --tone-on: var(--pt-accent-coral-on); }
.tone-sky   { --tone-container: var(--pt-accent-sky-container);   --tone-on: var(--pt-accent-sky-on); }
.tone-leaf  { --tone-container: var(--pt-accent-leaf-container);  --tone-on: var(--pt-accent-leaf-on); }
.tone-grape { --tone-container: var(--pt-accent-grape-container); --tone-on: var(--pt-accent-grape-on); }

.icon {
  width: 48px;
  height: 48px;
  border-radius: 16px;
  margin-bottom: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--tone-container);
  color: var(--tone-on);
  font-size: 26px;
  line-height: 1;
}
.icon .material-symbols-rounded {
  font-size: 26px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
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
