<script setup lang="ts">
import { computed } from 'vue'
import AppModal from '../AppModal.vue'
import ParentIcon from '../ParentIcon.vue'

type AttachmentItem = {
  id: number
  filename: string
  mime_type: string
  size_bytes: number
  url: string
  thumb_url: string | null
}

interface Announcement {
  id: number | string
  priority: string
  title: string
  content?: string
  created_at: string
  attachments?: AttachmentItem[]
}

const props = defineProps<{
  modelValue: boolean
  announcement: Announcement | null
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
}>()

const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  normal: { label: '一般', tone: 'info' },
  important: { label: '重要', tone: 'warn' },
  urgent: { label: '緊急', tone: 'danger' },
}

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

function close() {
  open.value = false
}

function formatTime(s: string | null | undefined) {
  return s ? s.replace('T', ' ').slice(0, 16) : ''
}

function openAttachment(att: { url: string }) {
  window.open(att.url, '_blank', 'noopener')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <AppModal v-model:open="open" labelled-by="announcement-detail-title">
    <template v-if="announcement">
      <div class="detail-header">
        <span
          class="pt-pill"
          :class="`pt-pill-${PRIORITY_META[announcement.priority]?.tone || 'info'}`"
        >
          {{ PRIORITY_META[announcement.priority]?.label || announcement.priority }}
        </span>
        <button class="close" type="button" aria-label="關閉" @click="close">
          <ParentIcon name="close" size="sm" />
        </button>
      </div>
      <h2 id="announcement-detail-title" class="detail-title">{{ announcement.title }}</h2>
      <p class="detail-time">{{ formatTime(announcement.created_at) }}</p>
      <div class="detail-content">{{ announcement.content }}</div>

      <div v-if="(announcement?.attachments?.length ?? 0) > 0" class="parent-att-list">
        <div
          v-for="att in announcement.attachments"
          :key="att.id"
          class="parent-att-row"
          @click="openAttachment(att)"
          role="button"
          :tabindex="0"
          @keydown.enter="openAttachment(att)"
        >
          <img v-if="att.thumb_url" :src="att.thumb_url" :alt="att.filename" class="parent-att-thumb" />
          <div v-else class="parent-att-pdf-icon">PDF</div>
          <div class="parent-att-meta">
            <span class="parent-att-name">{{ att.filename }}</span>
            <span class="parent-att-size">{{ formatSize(att.size_bytes) }}</span>
          </div>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 8px;
}
.detail-title {
  margin: 0 18px;
  font-weight: 700;
  font-size: 18px;
  color: var(--pt-text-strong);
  line-height: 1.4;
}
.close {
  position: relative;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--cream, #fffcf2);
  border-radius: 50%;
  color: var(--pt-text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.close::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  transform: translate(-50%, -50%);
}
.detail-time {
  margin: 4px 18px 14px;
  color: var(--pt-text-faint);
  font-size: 12px;
}
.detail-content {
  padding: 0 18px 20px;
  white-space: pre-wrap;
  line-height: 1.7;
  color: var(--pt-text-body);
  font-size: 15px;
}

.parent-att-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  padding: 0 18px 20px;
}

.parent-att-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--pt-border-light, #ecf5f9);
  min-height: 56px;
  cursor: pointer;
}

.parent-att-row:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}

.parent-att-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 6px;
}

.parent-att-pdf-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--coral-50, #fff5f5);
  color: var(--coral-700, #c4452c);
  font-weight: 700;
  border-radius: 6px;
}

.parent-att-meta {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.parent-att-name {
  font-size: 14px;
  color: var(--pt-text-strong);
  word-break: break-word;
}

.parent-att-size {
  font-size: 12px;
  color: var(--pt-text-faint, #6b7280);
}
</style>
