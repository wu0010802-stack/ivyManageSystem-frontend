<script setup>
import { computed, onMounted, ref } from 'vue'
import { listAnnouncements, markRead } from '../api/announcements'
import { toast } from '../utils/toast'

const items = ref([])
const loading = ref(false)
const selected = ref(null) // 開啟詳情的公告

const PRIORITY_LABEL = {
  normal: '一般',
  important: '重要',
  urgent: '緊急',
}

const PRIORITY_COLOR = {
  normal: { bg: '#f0f2f5', color: '#666' },
  important: { bg: '#fff4e6', color: '#a25e0a' },
  urgent: { bg: '#fde8e8', color: '#a51c1c' },
}

async function fetchData() {
  loading.value = true
  try {
    const { data } = await listAnnouncements({ limit: 50 })
    items.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function openDetail(item) {
  selected.value = item
  if (!item.is_read) {
    try {
      await markRead(item.id)
      item.is_read = true
    } catch {
      /* ignore — UI 已開啟詳情 */
    }
  }
}

function close() {
  selected.value = null
}

const formatTime = (s) =>
  s ? s.replace('T', ' ').slice(0, 16) : ''

onMounted(fetchData)
</script>

<template>
  <div class="announcements-view">
    <div v-if="!loading && items.length === 0" class="empty">目前沒有公告</div>

    <div
      v-for="item in items"
      :key="item.id"
      class="ann-card"
      :class="{ unread: !item.is_read }"
      @click="openDetail(item)"
    >
      <div class="ann-row">
        <span
          class="priority-tag"
          :style="{
            background: PRIORITY_COLOR[item.priority]?.bg,
            color: PRIORITY_COLOR[item.priority]?.color,
          }"
        >
          {{ PRIORITY_LABEL[item.priority] || item.priority }}
        </span>
        <span class="title">{{ item.title }}</span>
        <span v-if="!item.is_read" class="unread-dot" />
      </div>
      <div class="preview">
        {{ item.content?.slice(0, 60) }}{{ item.content?.length > 60 ? '...' : '' }}
      </div>
      <div class="time">{{ formatTime(item.created_at) }}</div>
    </div>

    <div v-if="loading" class="loading">載入中...</div>

    <!-- 詳情 modal -->
    <div v-if="selected" class="modal-mask" @click.self="close">
      <div class="modal">
        <div class="modal-header">
          <span
            class="priority-tag"
            :style="{
              background: PRIORITY_COLOR[selected.priority]?.bg,
              color: PRIORITY_COLOR[selected.priority]?.color,
            }"
          >
            {{ PRIORITY_LABEL[selected.priority] || selected.priority }}
          </span>
          <span class="modal-title">{{ selected.title }}</span>
          <button class="close" @click="close">✕</button>
        </div>
        <div class="modal-time">{{ formatTime(selected.created_at) }}</div>
        <div class="modal-content">{{ selected.content }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.announcements-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty,
.loading {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}

.ann-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.ann-card.unread {
  border-left: 3px solid #3f7d48;
}

.ann-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.priority-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  white-space: nowrap;
}

.title {
  flex: 1;
  font-weight: 600;
  color: #2c3e50;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: #c0392b;
  border-radius: 50%;
}

.preview {
  margin-top: 6px;
  color: #666;
  font-size: 13px;
  line-height: 1.4;
}

.time {
  margin-top: 6px;
  color: #aaa;
  font-size: 12px;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid #eee;
}

.modal-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
  color: #2c3e50;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #888;
  cursor: pointer;
}

.modal-time {
  padding: 4px 16px 12px;
  color: #aaa;
  font-size: 12px;
}

.modal-content {
  padding: 0 16px 20px;
  overflow-y: auto;
  white-space: pre-wrap;
  line-height: 1.6;
  color: #2c3e50;
  font-size: 14px;
}
</style>
