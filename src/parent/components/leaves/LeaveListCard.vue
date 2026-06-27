<script setup lang="ts">
/**
 * 請假列表單筆卡片（presentational）。
 *
 * Props:
 *  - leave: Object（必填）— 含 leave_type / start_date / end_date / reason / review_note
 *  - studentName: 顯示用名稱（呼叫端 resolve）
 *  - statusLabel: status 文字（呼叫端 resolve）
 *  - statusColor: { bg, color } 或 null
 *  - canCancel: Boolean，控制取消按鈕顯示
 *
 * Emits:
 *  - click(leave) — 整張卡點擊
 *  - cancel(leave) — 取消按鈕點擊
 */
interface LeaveRecord {
  student_id?: number
  leave_type?: string
  start_date?: string
  end_date?: string
  reason?: string
  review_note?: string
  status?: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  leave: LeaveRecord
  studentName?: string
  statusLabel: string
  statusColor?: { bg: string; color: string } | null
  canCancel?: boolean
}>(), {
  studentName: '',
  statusColor: null,
  canCancel: false,
})
const emit = defineEmits<{
  'click': [leave: LeaveRecord]
  'cancel': [leave: LeaveRecord]
}>()
</script>

<template>
  <article
    class="leave-card press-scale"
    role="button"
    tabindex="0"
    @click="emit('click', props.leave)"
    @keydown.enter="emit('click', props.leave)"
  >
    <div class="leave-row1">
      <span class="student">{{ props.studentName || `學生 #${props.leave.student_id}` }}</span>
      <span class="type">{{ props.leave.leave_type }}</span>
      <span
        v-if="props.statusColor"
        class="status"
        :data-status="props.leave.status"
        :style="{ background: props.statusColor.bg, color: props.statusColor.color }"
      >{{ props.statusLabel }}</span>
      <span v-else class="status" :data-status="props.leave.status">{{ props.statusLabel }}</span>
    </div>
    <div class="leave-row2">
      {{ props.leave.start_date }} ~ {{ props.leave.end_date }}
    </div>
    <div v-if="props.leave.reason" class="leave-reason">原因：{{ props.leave.reason }}</div>
    <div v-if="props.leave.review_note" class="leave-review">校方備註：{{ props.leave.review_note }}</div>
    <div v-if="props.canCancel" class="leave-actions" @click.stop>
      <button type="button" class="cancel-btn" @click="emit('cancel', props.leave)">取消申請</button>
    </div>
  </article>
</template>

<style scoped>
.leave-card {
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 12px;
  padding: 14px;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
  cursor: pointer;
}

.leave-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.student {
  font-weight: 800;
  color: var(--m3-on-surface, var(--pt-text-strong));
}

.type {
  background: var(--color-info-soft);
  color: var(--pt-info-text);
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.status {
  margin-left: auto;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

/* 童彩狀態 chip */
.status[data-status="pending"]   { background: var(--pt-tint-money); color: var(--pt-tint-money-fg); }
.status[data-status="approved"]  { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.status[data-status="rejected"]  { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.status[data-status="withdrawn"] { background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }

.leave-row2 {
  margin-top: 6px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  font-size: 14px;
}

.leave-reason,
.leave-review {
  margin-top: 4px;
  color: var(--m3-on-surface-variant, var(--pt-text-faint));
  font-size: 13px;
}

.leave-actions {
  margin-top: 8px;
}

.cancel-btn {
  padding: 6px 12px;
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  color: var(--m3-error, var(--color-danger));
  border: 1px solid var(--pt-tint-announcement);
  border-radius: var(--pt-control-radius, 12px);
  font-size: 12px;
  font-weight: 800;
}
</style>
