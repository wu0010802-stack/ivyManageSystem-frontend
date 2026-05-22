<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function open() {
  router.push('/assistant')
}
</script>

<template>
  <button
    type="button"
    class="messages-search-bar"
    aria-label="開啟搜尋與小幫手"
    @click="open"
  >
    <span class="msb-icon material-symbols-rounded" aria-hidden="true">search</span>
    <span class="msb-placeholder">搜尋訊息、公告或問小幫手</span>
  </button>
</template>

<style scoped>
.messages-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 32px);
  margin: 8px 16px 4px;
  padding: 12px 14px;
  border: 1px solid var(--m3-outline-variant, #c2c8be);
  background: var(--m3-surface-container, #ebefe8);
  color: var(--pt-text-muted, #6b5e54);
  border-radius: 24px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 120ms ease;
}
.messages-search-bar:hover {
  background: var(--m3-surface-container-high, #e1e8df);
}
.messages-search-bar:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: 2px;
}

.msb-icon {
  flex-shrink: 0;
  font-size: 20px;
  color: var(--pt-text-muted, #6b5e54);
  font-variation-settings: 'wght' 500;
}

.msb-placeholder {
  flex: 1;
  font-size: 14px;
  color: var(--pt-text-muted, #6b5e54);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
