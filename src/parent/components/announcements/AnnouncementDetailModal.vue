<script setup lang="ts">
import { computed } from 'vue'
import AppModal from '../AppModal.vue'
import ParentIcon from '../ParentIcon.vue'

interface Announcement {
  id: number | string
  priority: string
  title: string
  content?: string
  created_at: string
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
</style>
