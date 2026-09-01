<script setup lang="ts">
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

const emit = defineEmits<{
  'enable': []
}>()

function onClick(): void {
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
        <div class="push-cta-sub">公告、聯絡簿與審核結果可能會延遲看到</div>
      </div>
    </div>
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
  display: flex;
  flex-direction: column;
  background: var(--pt-tint-sun, var(--pt-gradient-warm));
  border: 1px solid color-mix(in srgb, var(--ivy-tile-yellow-fg) 28%, transparent);
  border-radius: 16px;
  padding: 14px;
  box-shadow: var(--pt-shadow-card, var(--pt-elev-1));
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
/* 系統性提醒卡的按鈕走 tonal、靠右——原「近黑實底＋全寬＋投影」是整個
   首頁視覺最重的元素，蓋過逾期繳費等真正待辦；提醒卡不該搶主角 */
.push-cta-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-end;
  margin-top: 10px;
  padding: 9px 14px;
  background: color-mix(in srgb, var(--ivy-tile-yellow-fg) 14%, transparent);
  color: var(--pt-warning-text);
  border: none;
  border-radius: 999px;
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  letter-spacing: 0.02em;
  cursor: pointer;
  min-height: 40px;
}
</style>
