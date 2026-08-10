<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  count: number
}>()

const router = useRouter()

const show = computed(() => props.count > 0)

function go() {
  router.push('/surveys')
}
</script>

<template>
  <button
    v-if="show"
    type="button"
    class="psb-banner"
    :aria-label="`有 ${count} 份活動調查待回覆，點擊前往回覆`"
    @click="go"
  >
    <span class="psb-icon material-symbols-rounded" aria-hidden="true">fact_check</span>
    <span class="psb-text">
      <span class="psb-headline">有 {{ count }} 份活動調查待回覆</span>
      <span class="psb-supporting">戶外教學/親子活動參加意願回覆</span>
    </span>
    <span class="psb-cta">
      檢視
      <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
    </span>
  </button>
</template>

<style scoped>
.psb-banner {
  position: sticky;
  top: 64px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 24px);
  margin: 12px;
  padding: 12px 14px;
  border: 1px solid var(--m3-tertiary-container, #ffd9aa);
  background: var(--pt-amber-bg, #fff4dc);
  color: var(--pt-text-strong, #2a2520);
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  text-align: left;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.psb-banner:active {
  transform: scale(0.99);
  box-shadow: 0 0 0 rgba(0, 0, 0, 0);
}
.psb-banner:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}

.psb-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 9999px;
  background: var(--pt-amber-icon-bg, #f5b637);
  color: var(--pt-on-accent, #fff);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-variation-settings: 'wght' 700;
}

.psb-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.psb-headline {
  font-size: 15px;
  font-weight: 700;
  color: var(--pt-text-strong, #2a2520);
}
.psb-supporting {
  font-size: 12.5px;
  color: var(--pt-text-muted, #6b5e54);
}

.psb-cta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-primary, #0d9053);
}
.psb-cta .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'wght' 500;
}

@media (prefers-reduced-motion: reduce) {
  .psb-banner { transition: none; }
}
</style>
