<script setup lang="ts">
/**
 * 園所公告獨立頁（`/announcements`）。
 *
 * 2026-08-28 起清單本體抽到 AnnouncementsPanel，與聯絡簿頁的「公告」分頁共用；
 * 本頁只保留 page hero。獨立路由保留是因為 LINE 推播的既有深連結指向這裡。
 */
import AnnouncementsPanel from '../components/announcements/AnnouncementsPanel.vue'
</script>

<template>
  <AnnouncementsPanel>
    <template #hero="{ unreadCount, total }">
      <!-- top bar 已標「公告」，hero 不再放同義 eyebrow（原「園所公告／學校的
           訊息」為三層同義重複，且「學校」與全站「園所」用語不一致） -->
      <header class="page-hero pt-page-hero">
        <h1 class="pt-page-hero-title">園所最新消息</h1>
        <p v-if="unreadCount > 0" class="pt-page-hero-note">
          有 <strong>{{ unreadCount }}</strong> 則尚未閱讀
        </p>
        <p v-else-if="total" class="pt-page-hero-note">所有公告都看完了</p>
      </header>
    </template>
  </AnnouncementsPanel>
</template>

<style scoped>
.page-hero { margin-bottom: 4px; }
</style>
