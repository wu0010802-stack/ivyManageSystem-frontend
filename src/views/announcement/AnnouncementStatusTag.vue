<script setup lang="ts">
import { formatDate } from '@/utils/format'

// 預定發佈的公告同時列出發佈時間：行政最常問「什麼時候會出去」，不必再點進編輯才看得到
defineProps<{
  status?: string
  publishAt?: string | null
}>()
</script>

<template>
  <span class="announcement-status">
    <template v-if="status === 'scheduled'">
      <el-tag type="info" size="small">預定發佈</el-tag>
      <span v-if="publishAt" class="announcement-status__time">{{ formatDate(publishAt) }}</span>
    </template>
    <el-tag v-else-if="status === 'expired'" size="small">已過期</el-tag>
    <el-tag v-else type="success" size="small">進行中</el-tag>
  </span>
</template>

<style scoped>
.announcement-status {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.announcement-status__time {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}
</style>
