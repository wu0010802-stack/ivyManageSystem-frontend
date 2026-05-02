<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { logout } from '../api/auth'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import ParentIcon from '../components/ParentIcon.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { useTheme } from '../composables/useTheme'
import { useA11y } from '../composables/useA11y'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()
const { preference: themePref, setPreference: setTheme } = useTheme()
const { fontSize, highContrast, setFontSize, setHighContrast } = useA11y()

const THEME_OPTIONS = [
  { key: 'system', label: '跟隨系統' },
  { key: 'light', label: '亮色' },
  { key: 'dark', label: '深色' },
]

const FONT_SIZE_OPTIONS = [
  { key: 'sm', label: '小' },
  { key: 'md', label: '中' },
  { key: 'lg', label: '大' },
  { key: 'xl', label: '特大' },
]

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
    <div class="user-card">
      <div class="user-card-content">
        <div class="user-avatar" aria-hidden="true">
          {{ (me?.name || '家').charAt(0) }}
        </div>
        <div class="user-info">
          <div class="user-name">{{ me?.name || '家長' }}</div>
          <div class="user-children">
            子女：{{ (childrenStore.items || []).map(c => c.name).join('、') || '尚未綁定' }}
          </div>
        </div>
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
      <div class="user-decoration" aria-hidden="true">
        <span class="user-blob user-blob-1" />
        <span class="user-blob user-blob-2" />
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
          <span class="icon" :class="`tint-${item.tint}`">
            <ParentIcon :name="item.icon" size="sm" />
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

    <!-- 無障礙：字級 + 高對比 -->
    <div class="group">
      <div class="group-title">無障礙</div>
      <div class="a11y-card">
        <div class="a11y-row">
          <div class="a11y-label">
            <strong>字級</strong>
            <span class="a11y-sub">調整 App 內全部文字大小</span>
          </div>
          <div
            class="size-grid"
            role="radiogroup"
            aria-label="字級偏好"
          >
            <button
              v-for="opt in FONT_SIZE_OPTIONS"
              :key="opt.key"
              type="button"
              class="size-btn press-scale"
              :class="{ active: fontSize === opt.key }"
              role="radio"
              :aria-checked="fontSize === opt.key"
              @click="setFontSize(opt.key)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div class="a11y-row">
          <div class="a11y-label">
            <strong>高對比</strong>
            <span class="a11y-sub">加深文字與框線、提高 brand 色對比度</span>
          </div>
          <button
            type="button"
            class="hc-toggle press-scale"
            :class="{ active: highContrast }"
            role="switch"
            :aria-checked="highContrast"
            @click="setHighContrast(!highContrast)"
          >
            <span class="hc-thumb" />
            <span class="sr-only">{{ highContrast ? '已開啟' : '已關閉' }}</span>
          </button>
        </div>
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
  gap: var(--space-4, 16px);
}

.menu-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  overflow: hidden;
}

/* ==========================================================
 * User card — hero style
 * ========================================================== */
.user-card {
  position: relative;
  background: var(--pt-gradient-hero);
  border-radius: var(--radius-xl, 16px);
  padding: 18px 20px 20px;
  color: var(--neutral-0, #fff);
  box-shadow: var(--pt-elev-2);
  overflow: hidden;
  isolation: isolate;
}

.user-card-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.user-avatar {
  width: 52px;
  height: 52px;
  border-radius: var(--radius-full, 9999px);
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.30);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-2xl, 22px);
  font-weight: var(--font-weight-bold, 700);
  color: var(--neutral-0, #fff);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  flex-shrink: 0;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: var(--text-xl, 18px);
  font-weight: var(--font-weight-bold, 700);
  letter-spacing: 0.01em;
}

.user-children {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.94);
  font-size: var(--text-sm, 13px);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-push {
  position: relative;
  z-index: 1;
  margin-top: var(--space-3, 12px);
}

.user-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.user-blob {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  filter: blur(2px);
}
.user-blob-1 {
  top: -36px;
  right: -28px;
  width: 130px;
  height: 130px;
}
.user-blob-2 {
  bottom: -52px;
  right: 64px;
  width: 90px;
  height: 90px;
  background: rgba(255, 255, 255, 0.10);
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-xs, 12px);
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  font-weight: var(--font-weight-medium, 500);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
}
.badge.ok {
  background: rgba(255, 255, 255, 0.22);
  color: var(--neutral-0, #fff);
  border: 1px solid rgba(255, 255, 255, 0.28);
}
.badge.warn {
  background: rgba(254, 243, 199, 0.95);
  color: #92400e;
}

/* ==========================================================
 * Menu groups
 * ========================================================== */
.group {
  display: flex;
  flex-direction: column;
}

.group-title {
  font-size: var(--text-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--pt-text-muted);
  margin: 4px 4px 8px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  min-height: 52px;
  padding: 10px var(--space-4, 16px);
  border-bottom: 1px solid var(--pt-border-light);
  text-decoration: none;
  color: var(--pt-text-strong);
  transition: background var(--transition-fast, 0.15s ease);
}

.menu-item:last-child { border-bottom: none; }

.menu-item:active {
  background: var(--pt-surface-mute-soft);
}

.menu-item .icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md, 8px);
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
.menu-item .icon.tint-money       { background: var(--pt-tint-money);        color: var(--pt-tint-money-fg); }
.menu-item .icon.tint-message     { background: var(--pt-tint-message);      color: var(--pt-tint-message-fg); }
.menu-item .icon.tint-event       { background: var(--pt-tint-event);        color: var(--pt-tint-event-fg); }
.menu-item .icon.tint-announcement{ background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.menu-item .icon.tint-leave       { background: var(--pt-tint-leave);        color: var(--pt-tint-leave-fg); }
.menu-item .icon.tint-activity    { background: var(--pt-tint-activity);     color: var(--pt-tint-activity-fg); }
.menu-item .icon.tint-medication  { background: var(--pt-tint-medication);   color: var(--pt-tint-medication-fg); }
.menu-item .icon.tint-calendar    { background: var(--pt-tint-calendar);     color: var(--pt-tint-calendar-fg); }
.menu-item .icon.tint-contact     { background: var(--pt-tint-contact);      color: var(--pt-tint-contact-fg); }

.menu-item .title {
  flex: 1;
  font-size: var(--text-base, 15px);
  font-weight: var(--font-weight-medium, 500);
}

.menu-item .arrow {
  color: var(--pt-text-hint);
  flex-shrink: 0;
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

/* ===== 外觀切換 ===== */
.theme-card {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2, 8px);
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-2, 8px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
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

/* ===== 無障礙偏好 ===== */
.a11y-card {
  background: var(--pt-surface-card, var(--neutral-0));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  box-shadow: var(--pt-elev-1);
  border: var(--pt-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.a11y-row {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.a11y-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.a11y-label strong {
  font-size: var(--text-base, 14px);
  color: var(--pt-text-strong);
  font-weight: var(--font-weight-medium, 500);
}

.a11y-label .a11y-sub {
  font-size: var(--text-xs, 12px);
  color: var(--pt-text-soft);
}

/* 字級 4 連按 */
.size-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  flex-shrink: 0;
}

.size-btn {
  min-width: 38px;
  min-height: var(--touch-target-min, 44px);
  padding: 0 var(--space-2, 8px);
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

.size-btn.active {
  background: var(--brand-primary-soft);
  border-color: var(--brand-primary);
  color: var(--brand-primary);
  font-weight: var(--font-weight-semibold, 600);
}

/* iOS-style switch */
.hc-toggle {
  position: relative;
  width: 50px;
  height: 30px;
  border-radius: 15px;
  background: var(--pt-border-strong);
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--transition-fast, 0.15s ease);
}

.hc-toggle.active {
  background: var(--brand-primary);
}

.hc-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 12px;
  background: var(--neutral-0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-fast, 0.15s ease);
}

.hc-toggle.active .hc-thumb {
  transform: translateX(20px);
}

@media (prefers-reduced-motion: reduce) {
  .hc-thumb,
  .hc-toggle {
    transition: none;
  }
}
</style>
