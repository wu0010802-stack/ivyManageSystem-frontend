<script setup lang="ts">
import { useRouter } from 'vue-router'
import M3List from '../components/m3/M3List.vue'
import M3ListItem from '../components/m3/M3ListItem.vue'

const router = useRouter()

const ITEMS = [
  { headline: '請假', supportingText: '送出請假申請、查詢假單狀態', leadingIcon: 'event_busy', path: '/leaves' },
  { headline: '繳費', supportingText: '查詢應繳/已繳費用', leadingIcon: 'payments', path: '/fees' },
  { headline: '用藥委託', supportingText: '新增/查詢委託用藥單', leadingIcon: 'medication', path: '/medications' },
  { headline: '課後才藝', supportingText: '才藝課程報名與紀錄', leadingIcon: 'palette', path: '/activity' },
  { headline: '待簽紀錄', supportingText: '需家長簽收的通知事項', leadingIcon: 'mark_email_read', path: '/events' },
] as const

function go(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="admin-list-view">
    <M3List>
      <M3ListItem
        v-for="item in ITEMS"
        :key="item.path"
        :headline="item.headline"
        :supporting-text="item.supportingText"
        :leading-icon="item.leadingIcon"
        trailing-icon="chevron_right"
        clickable
        @click="go(item.path)"
      />
    </M3List>
  </div>
</template>

<style scoped>
.admin-list-view {
  padding: 8px 0 16px;
  background: var(--m3-surface, #f7fbf3);
  min-height: 100%;
}
</style>
