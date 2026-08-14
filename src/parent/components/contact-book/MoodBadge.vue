<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  mood?: string | null
  size?: string
  showLabel?: boolean
}>(), {
  mood: null,
  size: 'md',
  showLabel: false,
})

const MOOD_MAP: Record<string, { emoji: string; text: string; tone: string }> = {
  happy:  { emoji: '😄', text: '開心', tone: 'sun' },
  normal: { emoji: '🙂', text: '普通', tone: 'cream' },
  tired:  { emoji: '😴', text: '想睡', tone: 'grape' },
  sad:    { emoji: '😢', text: '難過', tone: 'sky' },
  sick:   { emoji: '🤒', text: '不舒服', tone: 'coral' },
}

// P2-FE-Parent-1：null / 未知 mood 回傳 fallback chip（灰色中性「未記錄」）。
// 原本 `info=null` → `v-if` 整個不渲染，使用者完全看不出有此欄位；
// 改為渲染灰色 chip 表達「沒記錄」的語意，與其他 timeline row 一致。
const FALLBACK = { emoji: '・', text: '未記錄', tone: 'muted' }
const info = computed(() => (props.mood ? MOOD_MAP[props.mood] : null) || FALLBACK)
</script>

<template>
  <span class="mood-badge" :class="[`is-${size}`, `tone-${info.tone}`]">
    <span class="mood-emoji" role="img" :aria-label="`心情：${info.text}`">{{ info.emoji }}</span>
    <span v-if="showLabel" class="mood-label">{{ info.text }}</span>
  </span>
</template>

<style scoped>
.mood-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.mood-emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-style: normal;
  line-height: 1;
  flex-shrink: 0;
}
.mood-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--pt-text-strong);
  letter-spacing: 0.02em;
}

.is-sm .mood-emoji { width: 28px; height: 28px; font-size: 18px; }
.is-md .mood-emoji { width: 40px; height: 40px; font-size: 24px; }
.is-lg .mood-emoji { width: 64px; height: 64px; font-size: 36px; }
.is-lg .mood-label { font-size: 15px; }

.tone-sun    .mood-emoji { background: var(--pt-accent-sun-container); }
.tone-cream  .mood-emoji { background: var(--cream, #fffcf2); border: 1px solid var(--pt-border-light); }
.tone-grape  .mood-emoji { background: var(--pt-accent-grape-container); }
.tone-sky    .mood-emoji { background: var(--pt-accent-sky-container); }
.tone-coral  .mood-emoji { background: var(--pt-accent-coral-container); }
.tone-muted  .mood-emoji {
  background: var(--pt-surface-mute-soft, #f5f5f5);
  color: var(--pt-text-faint, #9a9a9a);
  border: 1px dashed var(--pt-border-light, #ecf5f9);
}
.tone-muted .mood-label { color: var(--pt-text-muted); font-weight: 500; }
</style>
