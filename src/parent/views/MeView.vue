<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../api/auth'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import { useCachedAsync } from '@/composables/useCachedAsync'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import UserHeroCard from '../components/more/UserHeroCard.vue'
import AppearanceSettings from '../components/more/AppearanceSettings.vue'
import FeeSummaryCard from '../components/me/FeeSummaryCard.vue'
import ChildrenList from '../components/me/ChildrenList.vue'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()

const me = ref(null)
const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

const { data: summaryData } = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    if (res.data?.me) authStore.setUser(res.data.me)
    return res.data
  },
  { ttl: 60_000 },
)

const fees = computed(() => summaryData.value?.summary?.fees || null)
const outstanding = computed(() => fees.value?.outstanding || 0)
const overdue = computed(() => fees.value?.overdue || 0)

const childrenLabel = computed(() => {
  const names = (childrenStore.items || []).map(c => c.name)
  return names.length ? names.join('、') : '尚未綁定'
})
const avatarInitial = computed(() => (me.value?.name || '家').charAt(0))
const userName = computed(() => me.value?.name || '家長')

function askLogout() { showLogoutConfirm.value = true }

async function doLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logout()
  } catch { /* ignore */ } finally {
    authStore.clear()
    router.replace('/login')
  }
}

onMounted(async () => {
  me.value = authStore.user
  await childrenStore.load()
})

const PREFS = [
  { key: 'notifications', label: '通知偏好', icon: 'notifications', path: '/notifications/preferences', hint: '推播 / 訊息 / 公告' },
  { key: 'fees', label: '費用查詢', icon: 'payments', path: '/fees', hint: '繳費紀錄與證明' },
]
</script>

<template>
  <div class="me-view" data-testid="me-view">
    <UserHeroCard
      :user-name="userName"
      :avatar-initial="avatarInitial"
      :children-label="childrenLabel"
      :can-push="!!me?.can_push"
      :push-status-known="!!me"
    />

    <FeeSummaryCard :outstanding="outstanding" :overdue="overdue" />

    <ChildrenList :children="childrenStore.items || []" />

    <div class="pt-eyebrow-row">
      <p class="pt-eyebrow">偏好設定</p>
    </div>

    <div class="pt-list-group">
      <router-link
        v-for="p in PREFS"
        :key="p.key"
        :to="p.path"
        class="pt-list-row pref-link"
      >
        <span class="pref-icon" aria-hidden="true">
          <span class="material-symbols-rounded">{{ p.icon }}</span>
        </span>
        <span class="pt-list-row-body">
          <span class="pref-label">{{ p.label }}</span>
          <span class="pref-hint">{{ p.hint }}</span>
        </span>
        <span class="material-symbols-rounded chev" aria-hidden="true">chevron_right</span>
      </router-link>
    </div>

    <AppearanceSettings />

    <button class="logout" type="button" @click="askLogout">
      <span class="material-symbols-rounded" aria-hidden="true">logout</span>
      <span>登出</span>
    </button>

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
.me-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
}

.pref-link {
  text-decoration: none;
  color: inherit;
}
.pref-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--leaf-100, #dcf4e6);
  border-radius: 12px;
  color: var(--brand-primary, #0d9053);
  flex-shrink: 0;
}
.pref-icon .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.pref-label {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--pt-text-strong);
  line-height: 1.3;
}
.pref-hint {
  display: block;
  font-size: 12px;
  color: var(--pt-text-muted);
  margin-top: 2px;
}
.chev {
  color: var(--pt-text-faint);
  font-size: 20px;
  flex-shrink: 0;
}

.logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  min-height: 48px;
  padding: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--coral-300, #ffb5ad);
  border-radius: 14px;
  color: var(--coral-700, #b14545);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, transform 120ms ease;
}
.logout:active { background: var(--coral-100, #ffe3e0); transform: scale(0.99); }
.logout .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'wght' 500;
}

@media (prefers-reduced-motion: reduce) {
  .logout { transition: none; }
}
</style>
