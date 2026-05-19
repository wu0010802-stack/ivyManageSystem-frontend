<script setup lang="ts">
/**
 * 請假詳情 BottomSheet（snap mid/full）。
 *
 * 內含 timeline 與附件區塊（presentational 包裝 ParentBottomSheet + LeaveAttachments）。
 *
 * Props/Emits 由父層 LeavesView 注入資料與 API callback；本元件無業務邏輯。
 */
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'
import LeaveAttachments from './LeaveAttachments.vue'

interface TimelineStep {
  key: string
  label: string
  done: boolean
  timestamp?: string
}

interface LeaveRecord {
  leave_type?: string
  start_date?: string
  end_date?: string
  reason?: string
  review_note?: string
  attachments?: Attachment[]
  [key: string]: unknown
}

interface Attachment {
  id: number
  original_filename?: string
  [key: string]: unknown
}

withDefaults(defineProps<{
  modelValue: boolean
  leave?: LeaveRecord | null
  studentName?: string
  timelineSteps?: TimelineStep[]
  attUploading?: boolean
  attEditable?: boolean
  urlResolver: (attachment: Attachment) => string
}>(), {
  leave: null,
  studentName: '',
  timelineSteps: () => [],
  attUploading: false,
  attEditable: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'att-upload': [file: File]
  'att-remove': [attachment: Attachment]
}>()
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    :title="leave ? `${leave.leave_type} 申請` : ''"
    :snap-points="['mid', 'full']"
    default-snap="mid"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="leave">
      <div class="detail-line">
        <span class="detail-label">學生</span>
        <span>{{ studentName || '—' }}</span>
      </div>
      <div class="detail-line">
        <span class="detail-label">期間</span>
        <span>{{ leave.start_date }} ~ {{ leave.end_date }}</span>
      </div>
      <div v-if="leave.reason" class="detail-line">
        <span class="detail-label">原因</span>
        <span>{{ leave.reason }}</span>
      </div>
      <div v-if="leave.review_note" class="detail-line">
        <span class="detail-label">校方備註</span>
        <span>{{ leave.review_note }}</span>
      </div>

      <h4 class="section-h">審核進度</h4>
      <div class="timeline">
        <div
          v-for="step in timelineSteps"
          :key="step.key"
          class="step"
          :class="{ done: step.done }"
        >
          <span class="step-dot" />
          <span class="step-label">{{ step.label }}</span>
          <span v-if="step.timestamp" class="step-time">
            {{ step.timestamp.replace('T', ' ').slice(0, 16) }}
          </span>
        </div>
      </div>

      <h4 class="section-h">佐證附件</h4>
      <LeaveAttachments
        :attachments="leave.attachments || []"
        :editable="attEditable"
        :uploading="attUploading"
        :url-resolver="urlResolver"
        @upload="(f) => emit('att-upload', f)"
        @remove="(a) => emit('att-remove', a)"
      />
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.detail-line {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--m3-on-surface, var(--pt-text-strong));
}
.detail-label {
  width: 56px;
  color: var(--m3-on-surface-variant, var(--pt-text-placeholder));
  flex-shrink: 0;
}

.section-h {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
}

/* 時間軸 */
.timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 4px;
}
.step {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-faint));
}
.step.done {
  color: var(--m3-on-surface, var(--pt-text-strong));
}
.step-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--m3-outline-variant, var(--pt-border));
  border: 2px solid var(--m3-outline-variant, var(--pt-border-strong));
}
.step.done .step-dot {
  background: var(--m3-primary, var(--brand-primary));
  border-color: var(--m3-primary, var(--brand-primary));
}
.step-label {
  flex: 1;
}
.step-time {
  font-size: 12px;
  color: var(--m3-on-surface-variant, var(--pt-text-placeholder));
}
</style>
