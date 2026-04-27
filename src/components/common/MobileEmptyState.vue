<script setup>
defineProps({
  icon: { type: String, default: '📭' },
  title: { type: String, default: '暫無資料' },
  description: { type: String, default: '' },
})
</script>

<template>
  <div class="mobile-empty-state">
    <div class="mobile-empty-state__icon" aria-hidden="true">{{ icon }}</div>
    <p class="mobile-empty-state__title">{{ title }}</p>
    <p v-if="description" class="mobile-empty-state__desc">{{ description }}</p>
    <div v-if="$slots.action" class="mobile-empty-state__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.mobile-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  text-align: center;
  color: #666;
}
.mobile-empty-state__icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 12px;
  opacity: 0.6;
}
.mobile-empty-state__title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 500;
  color: #555;
}
.mobile-empty-state__desc {
  margin: 0;
  font-size: 13px;
  color: #888;
  max-width: 280px;
}
.mobile-empty-state__action {
  margin-top: 16px;
}
</style>
