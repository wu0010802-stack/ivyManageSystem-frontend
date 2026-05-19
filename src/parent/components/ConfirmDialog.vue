<script setup lang="ts">
/**
 * 二擇一確認對話框，取代 window.confirm()。M3 化版本。
 *
 * 用法與舊版完全相同：
 *   <ConfirmDialog v-model:open="show" title="..." confirm-label="..." destructive @confirm="..." />
 *
 * P3 改造：內部按鈕換用 M3Button；外殼仍走 AppModal（AppModal 已 M3 視覺）。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.1
 */
import { computed } from 'vue'
import AppModal from './AppModal.vue'
import M3Button from './m3/M3Button.vue'

withDefaults(defineProps<{
  open?: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}>(), {
  open: false,
  message: '',
  confirmLabel: '確定',
  cancelLabel: '取消',
  destructive: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': []
  'cancel': []
}>()

const titleId = computed<string>(
  () => `confirm-title-${Math.random().toString(36).slice(2, 8)}`,
)
const messageId = computed<string>(
  () => `confirm-msg-${Math.random().toString(36).slice(2, 8)}`,
)

function onCancel(): void {
  emit('update:open', false)
  emit('cancel')
}

function onConfirm(): void {
  emit('update:open', false)
  emit('confirm')
}
</script>

<template>
  <AppModal
    :open="open"
    :labelled-by="titleId"
    :described-by="message ? messageId : undefined"
    @update:open="(v) => emit('update:open', v)"
  >
    <div class="confirm-dialog">
      <h2 :id="titleId" class="confirm-dialog-title m3-headline-small">{{ title }}</h2>
      <p v-if="message" :id="messageId" class="confirm-dialog-message m3-body-medium">{{ message }}</p>
      <div class="confirm-dialog-actions">
        <M3Button variant="text" @click="onCancel">{{ cancelLabel }}</M3Button>
        <M3Button
          variant="filled"
          :class="{ 'is-destructive': destructive }"
          @click="onConfirm"
        >{{ confirmLabel }}</M3Button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.confirm-dialog {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.confirm-dialog-title {
  margin: 0;
  color: var(--m3-on-surface, #181d18);
}
.confirm-dialog-message {
  margin: 0;
  color: var(--m3-on-surface-variant, #424941);
}
.confirm-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* destructive variant：覆寫 M3Button filled bg 為 M3 error */
.confirm-dialog-actions :deep(.is-destructive.m3-button-filled) {
  background: var(--m3-error, #ba1a1a);
  color: var(--m3-on-error, #ffffff);
}
</style>
