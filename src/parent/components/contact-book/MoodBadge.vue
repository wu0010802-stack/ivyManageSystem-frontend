<script setup>
import { computed } from 'vue'

const props = defineProps({
  mood: { type: String, default: null },
  size: { type: String, default: 'md' },
  showLabel: { type: Boolean, default: false },
})

const MOOD_MAP = {
  happy:  { emoji: '😄', text: '開心', tone: 'sun' },
  normal: { emoji: '🙂', text: '普通', tone: 'cream' },
  tired:  { emoji: '😴', text: '想睡', tone: 'grape' },
  sad:    { emoji: '😢', text: '難過', tone: 'sky' },
  sick:   { emoji: '🤒', text: '不舒服', tone: 'coral' },
}

const info = computed(() => MOOD_MAP[props.mood] || null)
</script>

<template>
  <span v-if="info" class="mood-badge" :class="[`is-${size}`, `tone-${info.tone}`]">
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

.tone-sun    .mood-emoji { background: var(--sun-100, #fff4c9); }
.tone-cream  .mood-emoji { background: var(--cream, #fffcf2); border: 1px solid var(--pt-border-light); }
.tone-grape  .mood-emoji { background: var(--grape-100, #ebe0f5); }
.tone-sky    .mood-emoji { background: var(--sky-100, #dceef5); }
.tone-coral  .mood-emoji { background: var(--coral-100, #ffe3e0); }
</style>
