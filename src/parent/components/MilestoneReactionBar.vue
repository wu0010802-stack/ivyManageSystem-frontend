<!-- src/parent/components/MilestoneReactionBar.vue -->
<script setup>
import { REACTION_EMOJI } from '@/parent/api/childMilestones'

defineProps({
  current: { type: String, default: null },
})
const emit = defineEmits(['select'])

const reactions = ['like', 'love', 'celebrate']
</script>

<template>
  <div class="reaction-bar">
    <button
      v-for="r in reactions"
      :key="r"
      class="reaction"
      :class="{ active: current === r }"
      @click="emit('select', r)"
    >
      {{ REACTION_EMOJI[r] }}
    </button>
  </div>
</template>

<style scoped>
.reaction-bar { display: flex; gap: 4px; }
.reaction {
  background: #f3f4f6;
  border: none;
  padding: 4px 10px;
  border-radius: 16px;
  cursor: pointer;
  font-size: 16px;
  transition: transform 0.15s;
}
.reaction.active {
  background: var(--color-warning-soft);
  transform: scale(1.1);
}
.reaction:hover:not(.active) { background: #e5e7eb; }
</style>
