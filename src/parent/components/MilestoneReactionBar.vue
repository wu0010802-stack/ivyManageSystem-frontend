<!-- src/parent/components/MilestoneReactionBar.vue -->
<script setup lang="ts">
import { REACTION_EMOJI } from '@/parent/api/childMilestones'

withDefaults(defineProps<{
  current?: string | null
}>(), {
  current: null,
})
const emit = defineEmits<{
  'select': [reaction: string]
}>()

const REACTION_EMOJI_MAP = REACTION_EMOJI as Record<string, string>
const reactions: string[] = ['like', 'love', 'celebrate']

// emoji 按鈕對螢幕閱讀器不會念出有意義的內容，必須補中文標籤。
const REACTION_LABEL: Record<string, string> = {
  like: '按讚',
  love: '好喜歡',
  celebrate: '恭喜',
}
</script>

<template>
  <div class="reaction-bar">
    <button
      v-for="r in reactions"
      :key="r"
      type="button"
      class="reaction"
      :class="{ active: current === r }"
      :aria-label="REACTION_LABEL[r]"
      :aria-pressed="current === r"
      @click="emit('select', r)"
    >
      <span aria-hidden="true">{{ REACTION_EMOJI_MAP[r] }}</span>
    </button>
  </div>
</template>

<style scoped>
.reaction-bar { display: flex; gap: 4px; }
.reaction {
  background: var(--pt-surface-mute, #f3f4f6);
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
.reaction:hover:not(.active) { background: var(--pt-surface-mute-soft, #e5e7eb); }
</style>
