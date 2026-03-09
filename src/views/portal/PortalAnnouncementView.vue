<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getPortalAnnouncements, markAnnouncementRead } from '@/api/portal'

const loading = ref(false)
const announcements = ref([])
const totalAnnouncements = ref(0)
const currentPage = ref(1)
const pageSize = 20
const expandedId = ref(null)
const noMore = ref(false)

const priorityConfig = {
  normal: { label: '一般', type: 'info' },
  important: { label: '重要', type: 'warning' },
  urgent: { label: '緊急', type: 'danger' },
}

const fetchAnnouncements = async (append = false) => {
  loading.value = true
  try {
    const skip = append ? announcements.value.length : 0
    const res = await getPortalAnnouncements({ skip, limit: pageSize })
    const { items, total } = res.data
    totalAnnouncements.value = total
    if (append) {
      announcements.value.push(...items)
    } else {
      announcements.value = items
    }
    noMore.value = announcements.value.length >= total
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '載入失敗')
  } finally {
    loading.value = false
  }
}

const loadMore = () => {
  if (!noMore.value && !loading.value) {
    fetchAnnouncements(true)
  }
}

const toggleExpand = async (ann) => {
  if (expandedId.value === ann.id) {
    expandedId.value = null
    return
  }
  expandedId.value = ann.id

  if (!ann.is_read) {
    try {
      await markAnnouncementRead(ann.id)
      ann.is_read = true
    } catch (e) {
      // Silent fail for read tracking
    }
  }
}

const formatDate = (isoStr) => {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const unreadCount = () => announcements.value.filter(a => !a.is_read).length

onMounted(fetchAnnouncements)
</script>

<template>
  <div class="portal-announcements" v-loading="loading">
    <h3 style="margin: 0 0 16px;">公告通知</h3>

    <el-alert
      v-if="unreadCount() > 0"
      :title="`您有 ${unreadCount()} 則未讀公告`"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
    />

    <div v-if="announcements.length" class="announcement-list">
      <div
        v-for="ann in announcements"
        :key="ann.id"
        class="ann-card"
        :class="{
          'ann-unread': !ann.is_read,
          'ann-expanded': expandedId === ann.id,
          'ann-pinned': ann.is_pinned,
          'ann-urgent': ann.priority === 'urgent',
        }"
        @click="toggleExpand(ann)"
      >
        <div class="ann-header">
          <div class="ann-title-row">
            <span v-if="!ann.is_read" class="unread-dot"></span>
            <el-icon v-if="ann.is_pinned" style="color: #E6A23C; margin-right: 4px;"><Top /></el-icon>
            <el-tag
              :type="priorityConfig[ann.priority]?.type || 'info'"
              size="small"
              style="margin-right: 8px;"
            >
              {{ priorityConfig[ann.priority]?.label || ann.priority }}
            </el-tag>
            <span class="ann-title">{{ ann.title }}</span>
          </div>
          <div class="ann-meta">
            <span>{{ ann.created_by_name }}</span>
            <span style="margin-left: 12px; color: #C0C4CC;">{{ formatDate(ann.created_at) }}</span>
          </div>
        </div>

        <div v-if="expandedId !== ann.id" class="ann-preview">
          {{ ann.content.length > 80 ? ann.content.slice(0, 80) + '...' : ann.content }}
        </div>

        <div v-if="expandedId === ann.id" class="ann-content">
          {{ ann.content }}
        </div>
      </div>
    </div>

    <div v-if="announcements.length && !noMore" style="text-align: center; margin-top: 16px;">
      <el-button @click="loadMore" :loading="loading">載入更多</el-button>
    </div>
    <div v-if="announcements.length && noMore" style="text-align: center; margin-top: 12px; color: var(--text-tertiary); font-size: var(--text-xs);">
      已顯示全部 {{ totalAnnouncements }} 則公告
    </div>

    <el-empty v-else-if="!loading && !announcements.length" description="目前沒有公告" />
  </div>
</template>

<style scoped>
.portal-announcements {
  padding: 10px;
}

.announcement-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ann-card {
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 14px var(--space-4);
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.ann-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.ann-unread {
  border-left: 4px solid var(--color-info);
  background: #f0f7ff;
}

.ann-urgent {
  border-left-color: var(--color-danger);
}

.ann-urgent.ann-unread {
  background: #fef0f0;
}

.ann-pinned {
  border-top: 2px solid var(--color-warning);
}

.ann-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 6px;
}

.ann-title-row {
  display: flex;
  align-items: center;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-info);
  margin-right: 8px;
  flex-shrink: 0;
}

.ann-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.ann-meta {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  white-space: nowrap;
}

.ann-preview {
  margin-top: 8px;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  line-height: 1.5;
}

.ann-content {
  margin-top: 10px;
  font-size: var(--text-base);
  color: var(--text-secondary);
  line-height: 1.7;
  white-space: pre-wrap;
  padding: 10px;
  background: var(--bg-color);
  border-radius: 4px;
}

.ann-expanded {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

@media (max-width: 768px) {
  .ann-header {
    flex-direction: column;
  }
  .ann-meta {
    margin-top: 4px;
  }
}
</style>
