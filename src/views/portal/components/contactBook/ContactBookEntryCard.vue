<script setup lang="ts">
import { Camera, ArrowRight } from '@element-plus/icons-vue'
import MoodChip from './MoodChip.vue'

interface EntryRecord {
  published_at?: string | null
  mood?: string
  teacher_note?: string
  photos?: unknown[]
  parent_ack_count?: number
  parent_reply_count?: number
  [key: string]: unknown
}
interface ItemEntry { student_name?: string; entry?: EntryRecord | null; [key: string]: unknown }

defineProps<{
  item: ItemEntry
  /** 手機用的單列緊湊版：一班 27 人時，200px 高的卡片會讓整頁長到 10,500px（P1-03） */
  compact?: boolean
}>()

defineEmits<{ 'click': [item: ItemEntry] }>()

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'

function statusOf(entry: EntryRecord | null | undefined): { label: string; type: TagType } {
  if (!entry) return { label: '未填', type: 'info' }
  if (entry.published_at) return { label: '已發布', type: 'success' }
  return { label: '草稿', type: 'warning' }
}
</script>

<template>
  <!-- 緊湊單列（手機）：姓名、狀態、心情、一行摘要，整列可點 -->
  <button
    v-if="compact"
    type="button"
    class="entry-row"
    @click="$emit('click', item)"
  >
    <MoodChip :mood="item.entry?.mood ?? null" size="sm" />
    <span class="entry-row__name">{{ item.student_name }}</span>
    <span class="entry-row__note" :class="{ muted: !item.entry?.teacher_note }">
      {{ item.entry?.teacher_note || '尚未填寫' }}
    </span>
    <span v-if="item.entry?.photos?.length" class="entry-row__photos">
      <el-icon aria-hidden="true"><Camera /></el-icon>{{ item.entry.photos.length }}
    </span>
    <el-tag :type="statusOf(item.entry).type" size="small">
      {{ statusOf(item.entry).label }}
    </el-tag>
    <el-icon class="entry-row__chev" aria-hidden="true"><ArrowRight /></el-icon>
  </button>

  <el-card
    v-else
    class="student-card"
    shadow="hover"
    @click="$emit('click', item)"
  >
    <div class="card-top">
      <div class="card-name">{{ item.student_name }}</div>
      <el-tag :type="statusOf(item.entry).type" size="small">
        {{ statusOf(item.entry).label }}
      </el-tag>
    </div>
    <div class="card-body">
      <div class="card-mood">
        <MoodChip :mood="item.entry?.mood ?? null" size="md" />
      </div>
      <div class="card-meta">
        <div v-if="item.entry?.teacher_note" class="card-note">{{ item.entry.teacher_note }}</div>
        <div v-else class="card-note muted">尚未填寫</div>
        <div v-if="item.entry?.photos?.length" class="card-photos">
          <el-icon><Camera /></el-icon>
          <span>{{ item.entry.photos.length }} 張</span>
        </div>
        <!-- 家長端回流（只對已發布顯示；草稿家長看不到，沒有「已讀 0」可言） -->
        <div v-if="item.entry?.published_at" class="card-parent" data-testid="cb-parent-signals">
          <span
            class="card-parent__item"
            :class="{ 'is-on': (item.entry.parent_ack_count ?? 0) > 0 }"
          >已讀 {{ item.entry.parent_ack_count ?? 0 }}</span>
          <span
            v-if="(item.entry.parent_reply_count ?? 0) > 0"
            class="card-parent__item is-reply"
          >回覆 {{ item.entry.parent_reply_count }}</span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.entry-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2) var(--space-3);
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-md);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.entry-row__name {
  font-weight: 600;
  flex-shrink: 0;
}
.entry-row__note {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.entry-row__photos {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}
.entry-row__chev {
  flex-shrink: 0;
  color: var(--text-tertiary);
}

.student-card {
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.student-card:hover {
  transform: translateY(-2px);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.card-name {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.card-body {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-height: 56px;
}

.card-mood {
  flex-shrink: 0;
  padding-top: 2px;
}

.card-meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.card-note {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-photos {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.card-parent {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--text-xs);
}

.card-parent__item {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-color-page);
  color: var(--text-tertiary);
}

.card-parent__item.is-on {
  background: var(--color-success-lighter);
  color: var(--color-success-darker);
}

.card-parent__item.is-reply {
  background: var(--color-primary-lighter);
  color: var(--color-primary-darker);
}

.muted {
  color: var(--text-tertiary);
}
</style>
