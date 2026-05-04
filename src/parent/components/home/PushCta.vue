<script setup>
/**
 * 家長首頁推播 CTA 卡片。
 *
 * 純呈現元件：當家長尚未透過 LINE 加為好友（無法收到推播）時，
 * 顯示暖色提醒卡，引導前往設定頁。
 *
 * Props: 無（顯示與否由父層用 v-if 控制）
 * Emits:
 *   - enable: 使用者點擊「前往設定」按鈕。父層自行決定導頁目的地或 API 呼叫。
 */
import ParentIcon from '../ParentIcon.vue'

const emit = defineEmits(['enable'])

function onClick() {
  emit('enable')
}
</script>

<template>
  <section class="push-cta">
    <div class="push-cta-head">
      <span class="push-cta-icon" aria-hidden="true">
        <ParentIcon name="bell" size="lg" />
      </span>
      <div>
        <div class="push-cta-title">尚未加 LINE 為好友</div>
        <div class="push-cta-sub">以下通知將收不到推播</div>
      </div>
    </div>
    <ul class="push-cta-list">
      <li>新公告 / 校外教學簽閱</li>
      <li>老師訊息回覆</li>
      <li>請假審核結果</li>
      <li>接送通知狀態變更</li>
      <li>才藝候補升正式提醒</li>
    </ul>
    <button class="push-cta-btn press-scale" type="button" @click="onClick">
      前往設定
      <ParentIcon name="chevron-right" size="sm" />
    </button>
  </section>
</template>

<style scoped>
/* ==========================================================
 * 推播 CTA — token-based 暖色卡
 * ========================================================== */
.push-cta {
  background: var(--pt-gradient-warm);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-lg, 12px);
  padding: 14px 16px 16px;
  box-shadow: var(--pt-elev-1);
}
.push-cta-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.push-cta-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(217, 119, 6, 0.18);
  color: var(--pt-warning-text-mid);
  flex-shrink: 0;
}
.push-cta-title {
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-warning-text);
}
.push-cta-sub {
  font-size: var(--text-xs, 12px);
  color: var(--pt-warning-text-mid);
  margin-top: 2px;
}
.push-cta-list {
  margin: 10px 0 12px 56px;
  padding: 0;
  list-style: disc;
  color: var(--pt-warning-text);
  font-size: var(--text-xs, 12px);
  line-height: 1.6;
}
.push-cta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding: 12px;
  background: var(--pt-warning-text-mid);
  color: var(--neutral-0);
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.02em;
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.32);
  cursor: pointer;
}
</style>
