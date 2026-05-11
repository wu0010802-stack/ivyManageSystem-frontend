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
  gap: 6px;
  overflow-x: auto;
  padding: 4px;
  margin-bottom: 14px;
  background: var(--pt-surface-recessed, var(--pt-surface-mute));
  border: 1px solid var(--pt-page-border, var(--pt-border));
  border-radius: 18px;
  scrollbar-width: none;
}

.child-selector::-webkit-scrollbar {
  display: none;
}

.chip {
  min-height: var(--touch-target-min, 44px);
  padding: 7px 16px;
  border-radius: 14px;
  border: 1px solid transparent;
  background: transparent;
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-soft);
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease),
    box-shadow var(--transition-fast, 0.15s ease);
}

.chip.active {
  background: var(--pt-surface-raised, var(--pt-surface-card));
  border-color: var(--pt-page-border, var(--pt-border));
  color: var(--brand-primary);
  box-shadow: var(--pt-shadow-press, var(--pt-elev-1));
}
</style>
