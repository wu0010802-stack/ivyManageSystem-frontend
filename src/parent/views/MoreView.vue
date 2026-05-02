<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import ParentIcon from '../components/ParentIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useTheme } from '../composables/useTheme'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()
const { preference: themePref, setPreference: setTheme } = useTheme()

const THEME_OPTIONS = [
  { key: 'system', label: '跟隨系統' },
  { key: 'light', label: '亮色' },
  { key: 'dark', label: '深色' },
]

const me = ref(null)
const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

const groups = [
  {
    title: '孩子與園所',
    items: [
      { icon: 'notebook', title: '聯絡簿', path: '/contact-book' },
      { icon: 'calendar', title: '本週行程', path: '/calendar' },
      { icon: 'clipboard', title: '請假', path: '/leaves' },
      { icon: 'pill', title: '用藥單', path: '/medications' },
      { icon: 'art', title: '才藝課', path: '/activity' },
    ],
  },
  {
    title: '財務與簽閱',
    items: [
      { icon: 'money', title: '費用查詢', path: '/fees' },
      { icon: 'signature', title: '事件簽閱', path: '/events' },
    ],
  },
  {
    title: '帳號設定',
    items: [
      { icon: 'bell', title: '通知偏好', path: '/notifications/preferences' },
      { icon: 'plus', title: '加綁子女', path: '/bind-additional' },
    ],
  },
]

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
    <div class="card user-card">
      <div class="user-name">{{ me?.name || '家長' }}</div>
      <div class="user-children">
        子女：{{ (childrenStore.items || []).map(c => c.name).join('、') || '尚未綁定' }}
      </div>
      <div v-if="me" class="user-push">
        <span v-if="me.can_push" class="badge ok">
          <ParentIcon name="check" size="xs" />
          LINE 推播已啟用
        </span>
        <span v-else class="badge warn">
          <ParentIcon name="warn" size="xs" />
          尚未加 LINE 為好友（無法收推播）
        </span>
      </div>
    </div>

    <div v-for="g in groups" :key="g.title" class="group">
      <div class="group-title">{{ g.title }}</div>
      <div class="menu-card">
        <router-link
          v-for="item in g.items"
          :key="item.path"
          :to="item.path"
          class="menu-item press-scale"
        >
          <span class="icon">
            <ParentIcon :name="item.icon" size="md" />
          </span>
          <span class="title">{{ item.title }}</span>
          <ParentIcon name="chevron-right" size="sm" class="arrow" />
        </router-link>
      </div>
    </div>

    <!-- 外觀（亮 / 深 / 跟隨系統） -->
    <div class="group">
      <div class="group-title">外觀</div>
      <div
        class="theme-card"
        role="radiogroup"
        aria-label="主題顏色偏好"
      >
        <button
          v-for="opt in THEME_OPTIONS"
          :key="opt.key"
          type="button"
          class="theme-btn press-scale"
          :class="{ active: themePref === opt.key }"
          role="radio"
          :aria-checked="themePref === opt.key"
          @click="setTheme(opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

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
  gap: var(--space-3, 12px);
}

.card,
.menu-card {
  background: var(--neutral-0);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-sm);
}

.user-card {
  padding: var(--space-4, 16px);
}

.user-name {
  font-size: var(--text-xl, 18px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-strong);
}

.user-children {
  margin-top: 6px;
  color: var(--pt-text-soft);
  font-size: var(--text-sm, 13px);
}

.user-push {
  margin-top: var(--space-2, 8px);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 12px);
  padding: 2px 8px;
  border-radius: 10px;
}
.badge.ok {
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
}
.badge.warn {
  background: var(--color-warning-soft);
  color: var(--pt-warning-text-mid);
}

.menu-card {
  overflow: hidden;
}

.group {
  display: flex;
  flex-direction: column;
}

.group-title {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-placeholder);
  margin: 4px 4px 6px;
  letter-spacing: 0.5px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  border-bottom: 1px solid var(--pt-surface-mute);
  text-decoration: none;
  color: var(--pt-text-strong);
  transition: background var(--transition-fast, 0.15s ease);
}

.menu-item:last-child { border-bottom: none; }

.menu-item:active {
  background: var(--pt-surface-mute-soft);
}

.menu-item .icon {
  width: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--brand-primary);
}

.menu-item .title {
  flex: 1;
  font-size: var(--text-lg, 15px);
}

.menu-item .arrow {
  color: var(--pt-text-hint);
  flex-shrink: 0;
}

.logout {
  width: 100%;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-3, 12px);
  background: var(--neutral-0);
  border: 1px solid var(--pt-border-strong);
  border-radius: var(--radius-lg, 12px);
  color: var(--color-danger);
  font-size: var(--text-lg, 15px);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease);
}

.logout:active {
  background: var(--color-danger-soft);
}

/* ===== 外觀切換 ===== */
.theme-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2, 8px);
  background: var(--neutral-0);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-2, 8px);
  box-shadow: var(--shadow-sm);
}

.theme-btn {
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px);
  background: transparent;
  border: 1px solid var(--pt-border);
  border-radius: var(--radius-md, 8px);
  font-size: var(--text-sm, 13px);
  color: var(--pt-text-muted);
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.theme-btn.active {
  background: var(--brand-primary-soft);
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}
</style>
