<script setup>
import { computed } from 'vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'

const childrenStore = useChildrenStore()
const { selectedId, setSelected } = useChildSelection()

const items = computed(() => childrenStore.items || [])
</script>

<template>
  <div
    v-if="items.length > 1"
    class="child-selector"
    role="radiogroup"
    aria-label="選擇子女"
  >
    <button
      v-for="c in items"
      :key="c.student_id"
      type="button"
      class="chip press-scale"
      :class="{ active: selectedId === c.student_id }"
      role="radio"
      :aria-checked="selectedId === c.student_id"
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
  min-height: var(--touch-target-min, 44px);
  padding: 6px 16px;
  border-radius: 16px;
  border: 1px solid var(--pt-border-strong);
  background: var(--neutral-0);
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.chip.active {
  background: var(--brand-primary);
  border-color: var(--brand-primary);
  color: var(--neutral-0);
}
</style>
