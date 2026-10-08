<script setup lang="ts">
import { computed } from 'vue'
import KawaiiStar from '@/components/brand/KawaiiStar.vue'

interface TimelineItemData {
  type?: string
  icon?: string
  title?: string
  occurred_at?: string
  is_highlight?: boolean
  summary?: string
  [key: string]: unknown
}

const props = defineProps<{
  item: TimelineItemData
}>()

/**
 * type → Material 圖示與色調（2026-09-02 孩子頁圖示對齊首頁）。
 *
 * 後端 timeline_aggregator 仍會在 `icon` 欄位送 emoji（📝📏📒，教師端在用），
 * 家長端刻意不看它：emoji 在 iOS／Android／LINE 內建瀏覽器長相各異，也跟首頁
 * 「今日動態」的淡色方塊語言對不上。尺寸與 TodayTimelineItem 的 .tdot 完全同組。
 * 色調沿用 globals.css 童彩 tonal 配對；同色調的類型刻意錯開（觀察 sky／量測 grape），
 * 連著出現時分得開。
 */
const TYPE_STYLE: Record<string, { icon: string; tone: string }> = {
  observation: { icon: 'edit_note', tone: 'sky' },
  assessment: { icon: 'insights', tone: 'sky' },
  measurement: { icon: 'straighten', tone: 'grape' },
  communication: { icon: 'forum', tone: 'grape' },
  contact_book: { icon: 'auto_stories', tone: 'leaf' },
  attendance: { icon: 'fact_check', tone: 'leaf' },
  activity: { icon: 'palette', tone: 'sun' },
  milestone: { icon: 'emoji_events', tone: 'sun' },
  work_sample: { icon: 'photo_library', tone: 'sun' },
  incident: { icon: 'warning', tone: 'coral' },
}
const FALLBACK_STYLE = { icon: 'circle', tone: 'muted' }

const style = computed(() => TYPE_STYLE[props.item.type ?? ''] ?? FALLBACK_STYLE)
</script>

<template>
  <div class="timeline-item">
    <span class="tdot" :class="`tone-${style.tone}`">
      <span class="material-symbols-rounded" aria-hidden="true">{{ style.icon }}</span>
    </span>
    <div class="body">
      <div class="row-top">
        <span class="title">{{ item.title }}</span>
        <KawaiiStar v-if="item.is_highlight" :size="14" decorative class="badge" />
        <span class="date">{{ item.occurred_at }}</span>
      </div>
      <div v-if="item.summary" class="summary">{{ item.summary }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 列而非卡：pt-card 裡再疊白卡是雙層卡，改成與首頁今日動態相同的髮線分隔列 */
.timeline-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 4px;
}
.timeline-item + .timeline-item {
  border-top: 1px solid var(--pt-border-light);
}

.tdot {
  width: 40px;
  height: 40px;
  border-radius: 15px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.tdot .material-symbols-rounded {
  font-size: 21px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}

.tone-sun   { background: var(--pt-accent-sun-container);   color: var(--pt-accent-sun-on); }
.tone-coral { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-sky   { background: var(--pt-accent-sky-container);   color: var(--pt-accent-sky-on); }
.tone-leaf  { background: var(--pt-accent-leaf-container);  color: var(--pt-accent-leaf-on); }
.tone-grape { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-muted { background: var(--m3-surface-container-high); color: var(--pt-text-faint); }

.body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.row-top { display: flex; gap: 6px; align-items: center; }
.title {
  min-width: 0;
  font-size: var(--text-base, 15px);
  font-weight: 700;
  color: var(--pt-text-strong);
  line-height: 1.35;
}
.badge { flex-shrink: 0; }
.date {
  margin-left: auto;
  flex-shrink: 0;
  font-size: var(--text-xs, 12px);
  font-weight: 700;
  color: var(--pt-text-faint);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
.summary {
  font-size: var(--text-xs, 12px);
  font-weight: 500;
  color: var(--pt-text-muted);
  line-height: 1.4;
}
</style>
