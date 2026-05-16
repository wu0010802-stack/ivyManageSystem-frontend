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
import ParentIcon from '../components/ParentIcon.vue'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()

const me = ref(null)
const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

// 沿用既有 home/summary 取繳費資訊；60s cache 與 HomeView 共用 key 不衝突
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

    <section class="prefs">
      <h2 class="title">偏好設定</h2>
      <router-link to="/notifications/preferences" class="pref-link">
        <ParentIcon name="bell" size="md" class="icon" />
        <span class="label">通知偏好</span>
        <ParentIcon name="chevron-right" size="sm" class="chev" />
      </router-link>
      <AppearanceSettings />
    </section>

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
.me-view { display: flex; flex-direction: column; gap: var(--space-4, 16px); }
.prefs {
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  box-shadow: var(--m3-elev-1, var(--pt-elev-1));
  display: flex; flex-direction: column; gap: var(--space-2, 8px);
}
.title { font-size: var(--text-base, 15px); font-weight: var(--font-weight-semibold, 600); margin: 0 0 var(--space-2, 8px); }
.pref-link {
  display: flex; align-items: center; gap: var(--space-3, 12px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) 0;
  text-decoration: none; color: inherit;
}
.pref-link .icon { color: var(--brand-primary); }
.pref-link .label { flex: 1; }
.pref-link .chev { color: var(--m3-on-surface-variant, var(--pt-text-placeholder)); }
.logout {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  margin-top: var(--space-2, 8px);
  padding: var(--space-3, 12px);
  background: var(--m3-surface-container-low, var(--pt-surface-card, var(--neutral-0)));
  border: var(--m3-outline-variant, var(--pt-hairline));
  border-radius: var(--radius-lg, 12px);
  color: var(--color-danger);
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-semibold, 600);
  cursor: pointer;
  box-shadow: var(--m3-elev-1, var(--pt-elev-1));
}
.logout:active { background: var(--color-danger-soft); transform: scale(0.99); }
</style>
