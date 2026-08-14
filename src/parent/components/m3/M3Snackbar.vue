<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue'

interface SnackbarAction {
  label: string
  onClick: () => void
}

interface Snackbar {
  id: string | number
  message: string
  duration?: number
  action?: SnackbarAction
}

/**
 * Material 3 Snackbar host container.
 *
 * 整個 app 應該只在 ParentLayout 或 main 掛載一個 M3Snackbar，
 * 透過 useSnackbar() composable 觸發訊息。
 *
 * Spec: docs/superpowers/specs/2026-05-13-parent-material3-redesign-design.md §6.3
 */
const props = defineProps<{
  snackbars: Snackbar[]
}>()

const emit = defineEmits<{
  'dismiss': [id: string | number]
}>()

const current = computed<Snackbar | null>(() => props.snackbars[0] || null)

let dismissTimer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
}

watch(
  current,
  (snack) => {
    clearTimer()
    if (snack) {
      dismissTimer = setTimeout(() => {
        emit('dismiss', snack.id)
      }, snack.duration || 4000)
    }
  },
  { immediate: true },
)

function onActionClick(): void {
  if (current.value?.action?.onClick) {
    current.value.action.onClick()
  }
  emit('dismiss', current.value!.id)
}

onBeforeUnmount(clearTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="m3-snackbar">
      <div v-if="current" class="m3-snackbar" role="status" aria-live="polite">
        <span class="m3-snackbar-message m3-body-medium">{{ current.message }}</span>
        <button
          v-if="current.action"
          type="button"
          class="m3-snackbar-action m3-label-large"
          @click="onActionClick"
        >{{ current.action.label }}</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.m3-snackbar {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom, 0) + 16px);
  transform: translateX(-50%);
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 48px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: var(--pt-control-radius, 14px);
  background: var(--m3-inverse-surface, #2d3230);
  color: var(--m3-inverse-on-surface, #eef2eb);
  box-shadow: var(--pt-shadow-float, var(--m3-elev-3, 0 4px 8px rgba(0, 0, 0, 0.3)));
  font-family: var(--m3-font-body, 'Roboto', sans-serif);
}

.m3-snackbar-message {
  flex: 1;
  min-width: 0;
}

.m3-snackbar-action {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--m3-inverse-primary, #5fdb96);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}
.m3-snackbar-action:hover {
  background: rgba(255, 255, 255, 0.08);
}

.m3-snackbar-enter-active,
.m3-snackbar-leave-active {
  transition: transform var(--motion-base, 260ms) var(--motion-emphasized, ease),
    opacity var(--motion-base, 260ms) var(--motion-emphasized, ease);
}
.m3-snackbar-enter-from,
.m3-snackbar-leave-to {
  opacity: 0;
  transform: translate(-50%, 30px);
}
</style>
