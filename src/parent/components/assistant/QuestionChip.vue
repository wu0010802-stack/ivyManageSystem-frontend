<script setup>
defineProps({
  item: { type: Object, required: true },
})
defineEmits(['click'])
</script>

<template>
  <button class="chip" @click="$emit('click', item)">
    {{ item.question }}
  </button>
</template>

<style scoped>
.chip {
  display: inline-block;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  color: #374151;
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
  max-width: 100%;
}
.chip:active { background: #f3f4f6; }
</style>
