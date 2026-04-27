<script setup>
import { computed } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'

const childrenStore = useChildrenStore()
const { selectedId, setSelected } = useChildSelection()

const items = computed(() => childrenStore.items || [])
</script>

<template>
  <div v-if="items.length > 1" class="child-selector">
    <button
      v-for="c in items"
      :key="c.student_id"
      class="chip"
      :class="{ active: selectedId === c.student_id }"
      @click="setSelected(c.student_id)"
    >
      {{ c.name }}
    </button>
  </div>
</template>

<style scoped>
.child-selector {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.chip {
  padding: 6px 14px;
  border-radius: 16px;
  border: 1px solid #d0d0d0;
  background: #fff;
  font-size: 13px;
  color: #555;
  cursor: pointer;
}

.chip.active {
  background: #3f7d48;
  border-color: #3f7d48;
  color: #fff;
}
</style>
