
<template>
  <el-aside
    id="admin-navigation"
    :width="isMobile ? '260px' : (isCollapse ? '64px' : '260px')"
    class="admin-sidebar"
    :class="{ 'is-collapsed': isCollapse && !isMobile, 'sidebar-mobile': isMobile, 'sidebar-mobile-open': isMobile && mobileOpen, 'sidebar-mobile-hidden': isMobile && !mobileOpen }"
    :aria-hidden="isMobile && !mobileOpen ? 'true' : undefined"
    :inert="isMobile && !mobileOpen"
    @keydown.esc.stop="requestClose"
  >
    <button
      v-if="isMobile"
      ref="closeButtonRef"
      type="button"
      class="mobile-sidebar-close"
      aria-label="關閉導覽選單"
      @click="requestClose"
    >
      <el-icon><Close /></el-icon>
    </button>
    <div class="logo-container">
      <!-- /LOGO.png 的 URL 刻意不變（L3）：nginx 依 $host 從 /brand/<slug>/ overlay
           換檔案內容，HTML/template/manifest/SW 四處引用點零改動。 -->
      <img src="/LOGO.png" class="logo-icon-img" :alt="branding.short_name" />
      <transition name="fade">
        <span v-if="!isCollapse" class="logo-text">{{ branding.titles.admin }}</span>
      </transition>
    </div>

    <el-scrollbar>
      <el-menu
        :default-active="activeMenu"
        class="el-menu-vertical"
        :collapse="isCollapse && !isMobile"
        :router="true"
        unique-opened
        text-color="#94a3b8"
        active-text-color="#7dd3fc"
        background-color="#1e2a3a"
        @select="onMenuSelect"
      >
        <!-- 選單樹由 src/constants/navigation manifest 衍生（SIDEBAR_TREE），
             項目/群組/圖示/badge 全數資料驅動；新增後台頁請改 manifest，勿回頭手寫。 -->
        <el-menu-item v-for="node in visibleTopLevel" :key="node.index" :index="node.index">
          <el-icon><component :is="node.icon" /></el-icon>
          <template #title>
            {{ node.title }}
            <el-badge
              v-if="node.badgeKey && badgeValues[node.badgeKey] > 0"
              :value="badgeValues[node.badgeKey]"
              :max="99"
              class="menu-badge"
            />
          </template>
        </el-menu-item>

        <el-sub-menu v-for="group in visibleGroups" :key="group.index" :index="group.index">
          <template #title>
            <el-icon><component :is="group.icon" /></el-icon>
            <span>{{ group.title }}</span>
          </template>
          <el-menu-item v-for="item in group.items" :key="item.index" :index="item.index">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>
              {{ item.title }}
              <el-badge
                v-if="item.badgeKey && badgeValues[item.badgeKey] > 0"
                :value="badgeValues[item.badgeKey]"
                :max="99"
                class="menu-badge"
              />
            </template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-scrollbar>

    <button
      v-if="!isMobile"
      type="button"
      class="collapse-toggle"
      :aria-label="isCollapse ? '展開側邊欄' : '收合側邊欄'"
      @click="toggleCollapse"
    >
      <el-icon v-if="isCollapse"><Expand /></el-icon>
      <el-icon v-else><Fold /></el-icon>
    </button>
  </el-aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
// 選單項圖示改由 SIDEBAR_TREE（manifest 衍生）攜帶；此處只 import 側欄骨架自用的三顆。
import { Expand, Fold, Close } from '@element-plus/icons-vue'
import { PERMISSION_NAMES, hasPermission, isPlatformAdmin } from '@/utils/auth'
import { PLATFORM_ONLY_CODES } from '@/constants/permissions'
import { SIDEBAR_TREE, ACTIVE_MENU_PATHS } from '@/constants/navigation'
import { useTenantBranding } from '@/composables/useTenantBranding'

const { branding } = useTenantBranding()

const props = withDefaults(defineProps<{
  pendingApprovals?: number
  pendingActivityInquiries?: number
  pendingActivityReview?: number
  pendingHighRiskAudit?: number
  isMobile?: boolean
  mobileOpen?: boolean
}>(), {
  pendingApprovals: 0,
  pendingActivityInquiries: 0,
  pendingActivityReview: 0,
  pendingHighRiskAudit: 0,
  isMobile: false,
  mobileOpen: false,
})

const emit = defineEmits<{
  'close-sidebar': []
}>()

const route = useRoute()
const isCollapse = ref(false)
const closeButtonRef = ref<HTMLButtonElement | null>(null)

// 直接委派 src/utils/auth.ts 的 hasPermission()（含 teacher 短路 / null-lockdown /
// wildcard / bare 命中 / scope-qualified 後綴四段判斷），避免側欄自己重寫第二份權限實作
// 而漏掉 scope-aware 分支（曾發生：持 'STUDENTS_READ:own_class' 者路由可達但選單被隱藏）。
const canView = computed(() =>
  // hasPermission() 讀 auth.ts 的 _userInfoRef（shallowRef），login / 權限變更
  // （setUserInfo 整物件替換）會自動觸發本 computed 重算，無需靠 route.path 強制重算。
  // 不依賴 route.path，避免每次路由導航都重跑 ~74 個權限檢查並讓下游 hasVisibleX 全失效。
  Object.fromEntries(
    Object.keys(PERMISSION_NAMES).map((name) => [name, hasPermission(name)])
  )
)

/**
 * 總部（platform）與分校（school）選單的雙向過濾（CT-P-04(3)）。
 *
 * 權限碼本身已經擋住九成：`PLATFORM_*` 只授予 kind='platform' 租戶的角色，分校 admin
 * 的 `canView` 對它們恆 false。這裡再加一道以 **`platform_admin` flag** 為準的顯式過濾，
 * 理由是「設定錯誤（有人把 PLATFORM_* 勾給分校角色）不該直接變成 UI 可達」——後端仍會
 * 403/404，但選單先擋住比較不會有人去點。
 *
 * ⚠ 判準用 `isPlatformAdmin()`（flag）而非契約字面的 `tenant.kind`：登入 payload
 * （`AuthUserOut`）目前只有 `tenant_slug` / `tenant_name`，**沒有 `kind`**。flag 與
 * kind 在 CT-P-01 下是綁定的（platform_admin 只存在於 hq 租戶），且 flag 缺失時
 * `isPlatformAdmin()` 回 false ⇒ 總部選單隱藏，方向是 fail-closed。
 */
const platformView = computed(() => isPlatformAdmin())
const isPlatformItem = (visibleCodes: readonly string[]): boolean =>
  visibleCodes.length > 0 && visibleCodes.every((code) => PLATFORM_ONLY_CODES.has(code))

const itemAllowed = (item: { visibleCodes: readonly string[] }): boolean => {
  const platformItem = isPlatformItem(item.visibleCodes)
  // platform 頁：非總部身分一律不顯示；總部身分：只顯示 platform 頁（分校業務頁隱藏）。
  if (platformItem !== platformView.value) return false
  return item.visibleCodes.some((code) => canView.value[code])
}

// 側欄樹由 manifest 衍生（SIDEBAR_TREE 靜態）；項目可見性 = visibleCodes
//（views ∪ sharedViews）任一命中，OR 語意與舊手寫 v-if 串一致。
const visibleTopLevel = computed(() => SIDEBAR_TREE.topLevel.filter(itemAllowed))

// 群組可見性 =「子項權限濾後非空」，取代先前 6 個手寫 hasVisibleXxx OR 串。
// 舊串的兩個殘渣（人事薪資的 SALARY_WRITE、報表的 SALARY_READ——無任何子項以其為
// gate，卻會撐開空殼群組）就此消失，屬行為修正而非回歸。
const visibleGroups = computed(() =>
  SIDEBAR_TREE.groups
    .map((group) => ({
      ...group,
      items: group.items.filter(itemAllowed),
    }))
    .filter((group) => group.items.length > 0)
)

// ACTIVE_MENU_PATHS（全部選單頁 routePath）最長前綴匹配：/salary/settle → /salary、
// /appraisal-year-end/rules/* → /appraisal-year-end 自動涵蓋；/students/admissions、
// /settings/accounts 等本身即選單頁者，比 /students、/settings 更長而勝出（精確高亮）。
const activeMenu = computed(() => {
  const currentPath = route.path
  let best = ''
  for (const path of ACTIVE_MENU_PATHS) {
    if ((currentPath === path || currentPath.startsWith(`${path}/`)) && path.length > best.length) {
      best = path
    }
  }
  return best || currentPath
})

// badgeKey → badge 數值（工作台 = 待簽核 + 高風險未確認）
const badgeValues = computed<Record<'workbench' | 'activityInquiries' | 'activityReview', number>>(() => ({
  workbench: (props.pendingApprovals ?? 0) + (props.pendingHighRiskAudit ?? 0),
  activityInquiries: props.pendingActivityInquiries ?? 0,
  activityReview: props.pendingActivityReview ?? 0,
}))

const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

const requestClose = () => {
  if (props.isMobile) emit('close-sidebar')
}

defineExpose({
  focusCloseButton: () => closeButtonRef.value?.focus(),
})

const onMenuSelect = () => {
  if (props.isMobile) {
    emit('close-sidebar')
  }
}
</script>

<style scoped>
/* 色票對應 design-tokens.css 的 --sidebar-*；el-menu 的 color props 需 hex 字面值
 * （collapsed 子選單 popup 由 EP 從 props 帶色），改色時兩處同步 */
.admin-sidebar {
  background-color: var(--sidebar-bg);
  color: #fff;
  height: 100vh;
  display: flex;
  flex-direction: column;
  transition: width var(--transition-slow);
  overflow: hidden;
  border-right: 1px solid var(--neutral-700);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  z-index: 20;
}

.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-5);
  background-color: var(--neutral-900);
  border-bottom: 1px solid var(--neutral-700);
  overflow: hidden;
  white-space: nowrap;
}

.mobile-sidebar-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--sidebar-text-hover);
  cursor: pointer;
}

.mobile-sidebar-close:hover {
  background-color: var(--sidebar-bg-active);
}

.sidebar-mobile .logo-container {
  padding-right: 60px;
}

.is-collapsed .logo-container {
  justify-content: center;
  padding: 0;
}

.logo-icon-img {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
}

.logo-text {
  margin-left: var(--space-3);
  font-size: var(--text-xl);
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.el-menu-vertical {
  border-right: none;
  background-color: transparent !important;
}

:deep(.el-menu-item) {
  height: 50px;
  line-height: 50px;
  margin: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  border: none;
}

:deep(.el-menu-item:hover) {
  background-color: var(--sidebar-bg-active) !important;
  color: var(--sidebar-text-hover) !important;
}

:deep(.el-menu-item.is-active) {
  background-color: var(--sidebar-bg-active);
  color: var(--sidebar-text-active) !important;
}

:deep(.el-menu-item .el-icon) {
  font-size: var(--text-xl);
}

/* 子選單樣式 */
:deep(.el-sub-menu) {
  margin: 0 var(--space-3);
  padding: var(--space-1) 0;
}

:deep(.el-sub-menu .el-sub-menu__title) {
  height: 50px;
  line-height: 50px;
  border-radius: var(--radius-md);
  color: var(--text-tertiary) !important;
  position: relative;
  z-index: 1;
}

:deep(.el-sub-menu .el-sub-menu__title:hover) {
  background-color: var(--sidebar-bg-active) !important;
  color: var(--sidebar-text-hover) !important;
}

:deep(.el-sub-menu .el-sub-menu__title .el-icon) {
  font-size: var(--text-xl);
}

:deep(.el-sub-menu .el-menu-item) {
  margin: 2px 0 2px var(--space-2);
  height: 44px;
  line-height: 44px;
  padding-left: 48px !important;
  font-size: 13px;
}

:deep(.el-sub-menu .el-menu-item .el-icon) {
  font-size: 16px;
}

:deep(.el-sub-menu.is-opened > .el-sub-menu__title) {
  color: #fff !important;
}

/* 收合（64px）時：自訂左右 margin 12px 讓項目只剩 40px 寬，EP collapse 仍套
 * padding-left 20px → 圖示被推到 x=32..56、超出 active 底塊右緣。歸零 padding
 * 改用 flex 置中，圖示與底塊才會同軸。 */
.is-collapsed :deep(.el-menu--collapse > .el-menu-item),
.is-collapsed :deep(.el-menu--collapse > .el-sub-menu > .el-sub-menu__title) {
  padding: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* EP collapse 把 menu-item 內容包進 absolute 的 tooltip trigger（自帶 padding 0 20px），
 * icon 實際位置由它決定，須一併歸零置中 */
.is-collapsed :deep(.el-menu--collapse .el-menu-tooltip__trigger) {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.collapse-toggle {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-top: 1px solid var(--neutral-700);
  transition: background-color var(--transition-base), color var(--transition-base);
}

.collapse-toggle:hover {
  background-color: var(--neutral-700);
  color: #fff;
}

.collapse-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.menu-badge {
  margin-left: 8px;
  transform: scale(0.9);
  display: inline-flex;
  vertical-align: middle;
}

:deep(.el-badge__content) {
  border: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

/* 確保選單項目不會有溢出元素遮擋其他項目的點擊 */
:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  overflow: hidden;
}

/* Mobile sidebar */
.sidebar-mobile {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-slow);
  z-index: 2000;
}

.sidebar-mobile-hidden {
  transform: translateX(-100%);
}

.sidebar-mobile-open {
  transform: translateX(0);
}

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
