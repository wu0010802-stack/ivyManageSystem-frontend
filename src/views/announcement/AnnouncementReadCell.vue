<script setup lang="ts">
import { formatDate } from '@/utils/format'

export interface ReaderRow {
  employee_id: number
  name: string
  read_at: string | null
}

// 已讀狀況＋已讀名單 popover。名單由父層 lazy 載入並快取（點開才打 API），
// 這裡只負責呈現；載入失敗要明說，不能顯示成「尚未有人已讀」。
withDefaults(defineProps<{
  readCount?: number
  parentReadCount?: number
  preview?: { employee_id: number; name: string }[]
  readers?: ReaderRow[]
  loading?: boolean
  error?: boolean
  /** 手機卡片：不顯示姓名預覽 tags */
  compact?: boolean
}>(), {
  readCount: 0,
  parentReadCount: 0,
  preview: () => [],
  readers: () => [],
  loading: false,
  error: false,
  compact: false,
})

const emit = defineEmits<{ show: []; retry: [] }>()
</script>

<template>
  <div class="read-cell" :class="{ 'read-cell--compact': compact }">
    <!-- 家長已讀另計：純家長導向公告 read_count 恆 0，原本會誤顯「尚未有人已讀」 -->
    <span v-if="parentReadCount > 0" class="parent-read-count">家長已讀 {{ parentReadCount }} 人</span>
    <template v-if="readCount > 0">
      <div v-if="!compact" class="read-preview-tags">
        <el-tag
          v-for="reader in preview"
          :key="reader.employee_id"
          type="success"
          size="small"
          effect="plain"
        >
          {{ reader.name }}
        </el-tag>
      </div>
      <el-popover
        placement="top-start"
        trigger="click"
        :width="compact ? 260 : 280"
        @show="emit('show')"
      >
        <template #reference>
          <el-button link type="success" class="read-preview-button">
            已讀 {{ readCount }} 人
          </el-button>
        </template>
        <div v-loading="loading" class="reader-popover">
          <div class="reader-popover-title">已讀名單</div>
          <div v-for="reader in readers" :key="reader.employee_id" class="reader-row">
            <span>{{ reader.name }}</span>
            <span class="reader-read-at">{{ formatDate(reader.read_at) }}</span>
          </div>
          <div v-if="error" class="reader-error" role="alert">
            名單載入失敗
            <el-button link type="primary" size="small" @click="emit('retry')">重試</el-button>
          </div>
          <div v-else-if="!loading && readers.length === 0" class="text-muted">尚未有人已讀</div>
        </div>
      </el-popover>
    </template>
    <span v-else-if="!parentReadCount" class="text-muted">尚未有人已讀</span>
  </div>
</template>

<style scoped>
.read-cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.read-cell--compact {
  align-items: flex-end;
}
.parent-read-count {
  font-size: var(--text-xs);
  color: var(--color-success-darker);
  font-weight: 600;
}
.read-preview-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.read-preview-button {
  padding: 0;
  justify-content: flex-start;
  height: auto;
}
.reader-popover {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.reader-popover-title {
  font-weight: 600;
  color: var(--text-primary);
}
.reader-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--text-secondary);
}
.reader-read-at {
  color: var(--text-tertiary);
  white-space: nowrap;
}
.reader-error {
  color: var(--el-color-danger);
  font-size: 13px;
}
.text-muted {
  color: var(--text-tertiary);
}
</style>
