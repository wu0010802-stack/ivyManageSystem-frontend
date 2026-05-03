<script setup>
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
const props = defineProps({
  leave: { type: Object, required: true },
  studentName: { type: String, default: '' },
  statusLabel: { type: String, required: true },
  statusColor: { type: Object, default: null },
  canCancel: { type: Boolean, default: false },
})
const emit = defineEmits(['click', 'cancel'])
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
        :style="{ background: props.statusColor.bg, color: props.statusColor.color }"
      >{{ props.statusLabel }}</span>
      <span v-else class="status">{{ props.statusLabel }}</span>
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
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--pt-elev-1);
  cursor: pointer;
}

.leave-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.student {
  font-weight: 600;
  color: var(--pt-text-strong);
}

.type {
  background: var(--color-info-soft);
  color: var(--pt-info-link);
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.status {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.leave-row2 {
  margin-top: 6px;
  color: var(--pt-text-muted);
  font-size: 14px;
}

.leave-reason,
.leave-review {
  margin-top: 4px;
  color: var(--pt-text-faint);
  font-size: 13px;
}

.leave-actions {
  margin-top: 8px;
}

.cancel-btn {
  padding: 4px 12px;
  background: var(--neutral-0);
  color: var(--color-danger);
  border: 1px solid #e0c4c0;
  border-radius: 6px;
  font-size: 12px;
}
</style>
