<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { performParentLogout } from '../../composables/useParentLogout'
import { useParentAuthStore } from '../../stores/parentAuth'
import ConfirmDialog from '../ConfirmDialog.vue'
import { ref } from 'vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [v: boolean]
}>()

const router = useRouter()
const authStore = useParentAuthStore()

const open = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

const me = computed(() => authStore.user as Record<string, unknown> | null)
const userName = computed(() => String(me.value?.name || '家長'))
const avatarInitial = computed(() => String(me.value?.name || '家').charAt(0))

interface DrawerItem {
  key: string
  label: string
  icon: string
  path?: string
  action?: () => void
  tone?: 'danger'
}

function go(path: string) {
  open.value = false
  router.push(path)
}

function askLogout() {
  showLogoutConfirm.value = true
}

async function doLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  await performParentLogout()
  open.value = false
  router.replace('/login')
}

const items = computed<DrawerItem[]>(() => [
  { key: 'profile', label: '個人資料', icon: 'person', path: '/me' },
  { key: 'notifications', label: '通知偏好', icon: 'notifications', path: '/notifications/preferences' },
  { key: 'bind', label: '加綁子女', icon: 'group_add', path: '/bind-additional' },
  { key: 'logout', label: '登出', icon: 'logout', action: askLogout, tone: 'danger' },
])

function onItemClick(item: DrawerItem) {
  if (item.action) item.action()
  else if (item.path) go(item.path)
}

// ESC 關閉
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

// 鎖 body scroll while open
watch(open, (v) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = v ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <transition name="me-drawer-backdrop">
      <div v-if="open" class="me-drawer-backdrop" @click="open = false" />
    </transition>
    <transition name="me-drawer">
      <aside
        v-if="open"
        class="me-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="個人選單"
      >
        <header class="md-header">
          <div class="md-avatar" aria-hidden="true">{{ avatarInitial }}</div>
          <div class="md-user">
            <p class="md-user-name">{{ userName }}</p>
            <p class="md-user-role">家長</p>
          </div>
          <button
            type="button"
            class="md-close"
            aria-label="關閉選單"
            @click="open = false"
          >
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </header>

        <nav class="md-list" role="list">
          <button
            v-for="item in items"
            :key="item.key"
            type="button"
            class="md-item"
            :class="{ 'is-danger': item.tone === 'danger' }"
            role="listitem"
            @click="onItemClick(item)"
          >
            <span class="md-icon material-symbols-rounded" aria-hidden="true">{{ item.icon }}</span>
            <span class="md-label">{{ item.label }}</span>
            <span
              v-if="!item.action"
              class="md-chevron material-symbols-rounded"
              aria-hidden="true"
            >chevron_right</span>
          </button>
        </nav>
      </aside>
    </transition>

    <ConfirmDialog
      v-model:open="showLogoutConfirm"
      title="確認登出"
      message="登出後需要重新綁定 LINE 才能繼續使用。"
      confirm-label="登出"
      destructive
      @confirm="doLogout"
    />
  </Teleport>
</template>

<style scoped>
.me-drawer-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
}
.me-drawer-backdrop-enter-active,
.me-drawer-backdrop-leave-active {
  transition: opacity 200ms ease;
}
.me-drawer-backdrop-enter-from,
.me-drawer-backdrop-leave-to {
  opacity: 0;
}

.me-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: min(320px, 88vw);
  height: 100dvh;
  z-index: 101;
  background: var(--m3-surface, #f7fbf3);
  color: var(--m3-on-surface, #181d18);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.me-drawer-enter-active,
.me-drawer-leave-active {
  transition: transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.me-drawer-enter-from,
.me-drawer-leave-to {
  transform: translateX(100%);
}

.md-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px;
  border-bottom: 1px solid var(--m3-outline-variant, #c2c8be);
}
.md-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--brand-primary, #0d9053);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  flex-shrink: 0;
}
.md-user {
  flex: 1;
  min-width: 0;
}
.md-user-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--pt-text-strong, #2a2520);
}
.md-user-role {
  margin: 2px 0 0;
  font-size: 12.5px;
  color: var(--pt-text-muted, #6b5e54);
}
.md-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--pt-text-muted, #6b5e54);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: inherit;
  -webkit-tap-highlight-color: transparent;
}
.md-close:hover {
  background: var(--m3-surface-container, #ebefe8);
}
.md-close .material-symbols-rounded {
  font-size: 22px;
  font-variation-settings: 'wght' 500;
}

.md-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}
.md-item {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 14px 18px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 120ms ease;
}
.md-item:hover {
  background: var(--m3-surface-container, #ebefe8);
}
.md-item:focus-visible {
  outline: 2px solid var(--brand-primary, #0d9053);
  outline-offset: -2px;
}
.md-icon {
  flex-shrink: 0;
  font-size: 22px;
  color: var(--pt-text-muted, #6b5e54);
  font-variation-settings: 'wght' 500;
}
.md-label {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
  color: var(--pt-text-strong, #2a2520);
}
.md-chevron {
  font-size: 18px;
  color: var(--pt-text-faint, #9b8d83);
  font-variation-settings: 'wght' 500;
}
.md-item.is-danger .md-icon,
.md-item.is-danger .md-label {
  color: var(--m3-error, #ba1a1a);
}

@media (prefers-reduced-motion: reduce) {
  .me-drawer-enter-active,
  .me-drawer-leave-active,
  .me-drawer-backdrop-enter-active,
  .me-drawer-backdrop-leave-active {
    transition: none;
  }
}
</style>
