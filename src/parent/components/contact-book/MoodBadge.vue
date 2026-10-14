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

// 心情 → Material icon。對照與 ContactBookDayCard 統計格的 MOOD_STAT_ICON 相同；
// 宣告名含 icon 的物件字面值，值行才會被 scripts/lib/parent-icon-names.mjs 收進子集字型
// （不含 icon 字樣的行會漏收，prod 就 render 成 ligature 原文）。
const MOOD_ICON: Record<string, string> = {
  happy: 'sentiment_very_satisfied',
  normal: 'sentiment_neutral',
  tired: 'bedtime',
  sad: 'sentiment_dissatisfied',
  sick: 'sick',
}
const MOOD_FALLBACK_ICON = 'remove'

const MOOD_MAP: Record<string, { text: string; tone: string }> = {
  happy:  { text: '開心', tone: 'sun' },
  normal: { text: '普通', tone: 'cream' },
  tired:  { text: '想睡', tone: 'grape' },
  sad:    { text: '難過', tone: 'sky' },
  sick:   { text: '不舒服', tone: 'coral' },
}

// P2-FE-Parent-1：null / 未知 mood 回傳 fallback chip（灰色中性「未記錄」）。
// 原本 `info=null` → `v-if` 整個不渲染，使用者完全看不出有此欄位；
// 改為渲染灰色 chip 表達「沒記錄」的語意，與其他 timeline row 一致。
const FALLBACK = { text: '未記錄', tone: 'muted' }
const info = computed(() => (props.mood ? MOOD_MAP[props.mood] : null) || FALLBACK)
const glyph = computed(() => (props.mood ? MOOD_ICON[props.mood] : null) || MOOD_FALLBACK_ICON)
</script>

<template>
  <span class="mood-badge" :class="[`is-${size}`, `tone-${info.tone}`]">
    <span class="mood-icon" role="img" :aria-label="`心情：${info.text}`">
      <span class="material-symbols-rounded" aria-hidden="true">{{ glyph }}</span>
    </span>
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
.mood-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--pt-text-strong);
  flex-shrink: 0;
}
.mood-icon .material-symbols-rounded {
  font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}
.mood-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--pt-text-strong);
  letter-spacing: 0.02em;
}

.is-sm .mood-icon { width: 28px; height: 28px; }
.is-sm .mood-icon .material-symbols-rounded { font-size: 18px; }
.is-md .mood-icon { width: 40px; height: 40px; }
.is-md .mood-icon .material-symbols-rounded { font-size: 24px; }
.is-lg .mood-icon { width: 64px; height: 64px; }
.is-lg .mood-icon .material-symbols-rounded { font-size: 36px; }
.is-lg .mood-label { font-size: 0.9375rem; }

.tone-sun    .mood-icon { background: var(--pt-accent-sun-container);   color: var(--pt-accent-sun-on); }
.tone-cream  .mood-icon { background: var(--cream, #fffcf2); border: 1px solid var(--pt-border-light); color: var(--pt-text-strong); }
.tone-grape  .mood-icon { background: var(--pt-accent-grape-container); color: var(--pt-accent-grape-on); }
.tone-sky    .mood-icon { background: var(--pt-accent-sky-container);   color: var(--pt-accent-sky-on); }
.tone-coral  .mood-icon { background: var(--pt-accent-coral-container); color: var(--pt-accent-coral-on); }
.tone-muted  .mood-icon {
  background: var(--pt-surface-mute-soft, #f5f5f5);
  color: var(--pt-text-faint, #9a9a9a);
  border: 1px dashed var(--pt-border-light, #ecf5f9);
}
.tone-muted .mood-label { color: var(--pt-text-muted); font-weight: 500; }
</style>
