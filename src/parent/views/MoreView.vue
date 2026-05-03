<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import UserHeroCard from '../components/more/UserHeroCard.vue'
import MoreMenuGroup from '../components/more/MoreMenuGroup.vue'
import AppearanceSettings from '../components/more/AppearanceSettings.vue'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()

const me = ref(null)
const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

const groups = [
  {
    title: '孩子與園所',
    items: [
      { icon: 'notebook', title: '聯絡簿', path: '/contact-book', tint: 'contact' },
      { icon: 'calendar', title: '本週行程', path: '/calendar', tint: 'calendar' },
      { icon: 'clipboard', title: '請假', path: '/leaves', tint: 'leave' },
      { icon: 'pill', title: '用藥單', path: '/medications', tint: 'medication' },
      { icon: 'art', title: '才藝課', path: '/activity', tint: 'activity' },
    ],
  },
  {
    title: '財務與簽閱',
    items: [
      { icon: 'money', title: '費用查詢', path: '/fees', tint: 'money' },
      { icon: 'signature', title: '事件簽閱', path: '/events', tint: 'event' },
    ],
  },
  {
    title: '帳號設定',
    items: [
      { icon: 'bell', title: '通知偏好', path: '/notifications/preferences', tint: 'announcement' },
      { icon: 'plus', title: '加綁子女', path: '/bind-additional', tint: 'message' },
    ],
  },
]

const childrenLabel = computed(() => {
  const names = (childrenStore.items || []).map(c => c.name)
  return names.length ? names.join('、') : '尚未綁定'
})

const avatarInitial = computed(() => (me.value?.name || '家').charAt(0))
const userName = computed(() => me.value?.name || '家長')

function askLogout() {
  showLogoutConfirm.value = true
}

async function doLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logout()
  } catch {
    /* ignore */
  } finally {
    authStore.clear()
    router.replace('/login')
  }
}

onMounted(async () => {
  me.value = authStore.user
  await childrenStore.load()
})
</script>

<template>
  <div class="more-view">
    <UserHeroCard
      :user-name="userName"
      :avatar-initial="avatarInitial"
      :children-label="childrenLabel"
      :can-push="!!me?.can_push"
      :push-status-known="!!me"
    />

    <MoreMenuGroup
      v-for="g in groups"
      :key="g.title"
      :title="g.title"
      :items="g.items"
    />

    <AppearanceSettings />

    <button class="logout" type="button" @click="askLogout">登出</button>

    <ConfirmDialog
      v-model:open="showLogoutConfirm"
      title="確定要登出？"
      message="登出後需重新從 LINE 進入家長 App。"
      confirm-label="登出"
      cancel-label="取消"
      destructive
      @confirm="doLogout"
    />
  </div>
</template>

<style scoped>
.more-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.logout {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  margin-top: var(--space-2, 8px);
  padding: var(--space-3, 12px);
  background: var(--pt-surface-card, var(--neutral-0));
  border: var(--pt-hairline);
  border-radius: var(--radius-lg, 12px);
  color: var(--color-danger);
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  cursor: pointer;
  box-shadow: var(--pt-elev-1);
  transition: background var(--transition-fast, 0.15s ease), transform var(--transition-fast, 0.15s ease);
}

.logout:active {
  background: var(--color-danger-soft);
  transform: scale(0.99);
}
</style>
