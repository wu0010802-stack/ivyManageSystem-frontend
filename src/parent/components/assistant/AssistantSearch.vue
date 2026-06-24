<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string
}>(), {
  modelValue: '',
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const local = ref<string>(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null
watch(local, v => {
  clearTimeout(timer ?? undefined)
  timer = setTimeout(() => emit('update:modelValue', v), 150)
})
watch(() => props.modelValue, v => { local.value = v })
</script>

<template>
  <div class="search">
    <span class="material-symbols-rounded">search</span>
    <input v-model="local" type="text" placeholder="搜尋常見問題…" enterkeyhint="search" />
    <button v-if="local" class="clear" @click="local = ''">
      <span class="material-symbols-rounded">close</span>
    </button>
  </div>
</template>

<style scoped>
.search {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: var(--pt-surface-card, #fff);
  border-bottom: 1px solid #e5e7eb;
}
.material-symbols-rounded { color: var(--pt-text-muted, #6b7280); font-size: 20px; }
input {
  flex: 1; border: none; outline: none;
  font-size: 15px; background: transparent;
}
.clear {
  background: none; border: none; cursor: pointer;
  padding: 4px; display: flex; align-items: center;
}
</style>
