<script setup lang="ts">
/**
 * 取件碼大字卡：接送人到園出示、家長 LINE 轉傳用。
 *
 * 明碼只在建立/重發當下短暫顯示（不落 localStorage），離開頁面即遺失——
 * 遺失時請家長回「臨時接送」頁對該筆授權按「重發取件碼」。
 */
import { ref } from 'vue'
import { toast } from '../../utils/toast'

const props = defineProps<{
  code: string
  personName: string
  pickupDate: string
}>()

const copied = ref(false)

async function copyCode() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.code)
      copied.value = true
      toast.success('已複製取件碼')
      setTimeout(() => { copied.value = false }, 2000)
    } else {
      toast.warn('此裝置不支援自動複製，請手動輸入')
    }
  } catch {
    toast.warn('複製失敗，請手動輸入')
  }
}
</script>

<template>
  <div class="pickup-code-card">
    <p class="code-hint">請將此碼轉傳給接送人，到園時向老師出示</p>
    <div class="code-display" role="status" aria-live="polite">{{ code }}</div>
    <p class="code-meta">{{ personName }} · {{ pickupDate }}</p>
    <button type="button" class="copy-btn" @click="copyCode">
      {{ copied ? '已複製' : '複製取件碼' }}
    </button>
    <p class="code-warning">此碼只顯示一次，離開後遺失請回「臨時接送」頁重發</p>
  </div>
</template>

<style scoped>
.pickup-code-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}
.code-hint {
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin: 0;
}
.code-display {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: 6px;
  color: var(--m3-primary, var(--brand-primary));
  padding: 16px 24px;
  background: var(--m3-surface-container-low, var(--pt-surface-mute-soft));
  border-radius: 12px;
  font-variant-numeric: tabular-nums;
}
.code-meta {
  font-size: 13px;
  color: var(--m3-on-surface-variant, var(--pt-text-muted));
  margin: 0;
}
.copy-btn {
  margin-top: 8px;
  padding: 10px 24px;
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
}
.code-warning {
  margin-top: 8px;
  font-size: 12px;
  color: var(--m3-error, var(--color-danger));
}
</style>
