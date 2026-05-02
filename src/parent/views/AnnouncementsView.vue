<script setup>
import { computed, onMounted, ref } from 'vue'
import { listAnnouncements, markRead } from '../api/announcements'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'
import { useIncrementalRender } from '../composables/useIncrementalRender'

const items = ref([])
const loading = ref(false)
const selected = ref(null) // 開啟詳情的公告

// 漸進渲染：列表 > 20 項時觸底自動載下一頁，避免一次渲染過多 DOM
const { visible: visibleItems, sentinelRef, hasMore } = useIncrementalRender(
  items,
  { pageSize: 20 },
)

const detailOpen = computed({
  get: () => selected.value !== null,
  set: (v) => {
    if (!v) selected.value = null
  },
})

const PRIORITY_LABEL = {
  normal: '一般',
  important: '重要',
  urgent: '緊急',
}

const PRIORITY_COLOR = {
  normal: { bg: 'var(--pt-surface-mute)', color: 'var(--pt-text-soft)' },
  important: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text-soft)' },
  urgent: { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
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
      v-for="item in visibleItems"
      :key="item.id"
      class="ann-card press-scale"
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

    <!-- 漸進渲染哨點：觸碰視窗時載入下一批 -->
    <div v-if="hasMore" ref="sentinelRef" class="render-sentinel" aria-hidden="true" />

    <div v-if="loading" class="loading">載入中...</div>

    <!-- 詳情 modal -->
    <AppModal
      v-model:open="detailOpen"
      labelled-by="announcement-detail-title"
    >
      <template v-if="selected">
        <div class="detail-header">
          <span
            class="priority-tag"
            :style="{
              background: PRIORITY_COLOR[selected.priority]?.bg,
              color: PRIORITY_COLOR[selected.priority]?.color,
            }"
          >
            {{ PRIORITY_LABEL[selected.priority] || selected.priority }}
          </span>
          <span id="announcement-detail-title" class="detail-title">{{ selected.title }}</span>
          <button class="close" type="button" aria-label="關閉" @click="close">
            <ParentIcon name="close" size="sm" />
          </button>
        </div>
        <div class="detail-time">{{ formatTime(selected.created_at) }}</div>
        <div class="detail-content">{{ selected.content }}</div>
      </template>
    </AppModal>
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
  color: var(--pt-text-placeholder);
}

.render-sentinel { height: 1px; }

.ann-card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: var(--pt-elev-1);
}

.ann-card.unread {
  border-left: 3px solid var(--brand-primary);
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
  color: var(--pt-text-strong);
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: var(--color-danger);
  border-radius: 50%;
}

.preview {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: 13px;
  line-height: 1.4;
}

.time {
  margin-top: 6px;
  color: var(--pt-text-disabled);
  font-size: 12px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pt-border-light);
}

.detail-title {
  flex: 1;
  font-weight: 600;
  font-size: 16px;
  color: var(--pt-text-strong);
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--pt-text-placeholder);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.detail-time {
  padding: 4px 16px 12px;
  color: var(--pt-text-disabled);
  font-size: 12px;
}

.detail-content {
  padding: 0 16px 20px;
  white-space: pre-wrap;
  line-height: 1.6;
  color: var(--pt-text-strong);
  font-size: 14px;
}
</style>
