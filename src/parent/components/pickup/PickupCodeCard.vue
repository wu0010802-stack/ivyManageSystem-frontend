<script setup lang="ts">
/**
 * 取件碼大字卡：接送人到園出示、家長 LINE 轉傳用。
 *
 * T-024 起進行中授權的明碼會常駐在「臨時接送」頁的授權卡上（後端只對 active 回傳），
 * 所以這裡不再警告「只顯示一次」；授權結束（完成／取消／過期）後才看不到。
 */
import { ref } from 'vue'
import { toast } from '../../utils/toast'
import { copyText } from '../../utils/clipboard'

const props = defineProps<{
  code: string
  personName: string
  pickupDate: string
}>()

const copied = ref(false)

async function copyCode() {
  if (await copyText(props.code)) {
    copied.value = true
    toast.success('已複製取件碼')
    setTimeout(() => { copied.value = false }, 2000)
  } else {
    toast.warn('無法自動複製，請長按取件碼手動複製')
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
    <p class="code-note pt-muted-note">授權有效期間，隨時可到「臨時接送」頁的授權卡查看或複製這組碼</p>
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
  /* 長按即整組選取，複製失敗時家長仍能手動複製 */
  user-select: all;
  -webkit-user-select: all;
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
  min-height: var(--touch-target-min, 44px);
  margin-top: 8px;
  padding: 10px 24px;
  background: var(--m3-primary, var(--brand-primary));
  color: var(--neutral-0);
  border: none;
  border-radius: 8px;
  font-size: 14px;
}
.code-note { margin: 8px 0 0; }
</style>
