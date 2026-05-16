<script setup>
const props = defineProps({
  role: { type: String, required: true, validator: v => ['assistant', 'user'].includes(v) },
})
</script>

<template>
  <div class="bubble-row" :class="role">
    <img v-if="role === 'assistant'" class="avatar" src="/LOGO.png" alt="助理" />
    <div class="bubble" :class="role">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bubble-row { display: flex; align-items: flex-end; gap: 8px; margin-bottom: 10px; }
.bubble-row.user { justify-content: flex-end; }
.avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: #fff; padding: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  flex-shrink: 0;
}
.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.5;
  word-break: break-word;
}
.bubble.assistant {
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
  border-top-left-radius: 4px;
}
.bubble.user {
  background: #0d9053;
  color: #fff;
  border-top-right-radius: 4px;
}
</style>
