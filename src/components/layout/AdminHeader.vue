
<template>
  <el-header height="64px" class="admin-header">
    <div class="header-content">
      <div class="header-left">
        <button
          v-if="isMobile"
          ref="sidebarToggleRef"
          type="button"
          class="hamburger-btn"
          aria-label="開啟導覽選單"
          aria-controls="admin-navigation"
          :aria-expanded="sidebarOpen"
          @click="$emit('toggle-sidebar')"
        >
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <h1 v-if="pageTitle" class="page-title">
          <template v-if="parentLink">
            <router-link
              :to="parentLink.path"
              class="page-title__parent"
              :aria-label="`返回${parentLink.title}`"
            >
              <el-icon class="page-title__back"><ArrowLeft /></el-icon>
              <span class="page-title__parent-text">{{ parentLink.title }}</span>
            </router-link>
            <span class="page-title__sep" aria-hidden="true">/</span>
          </template>
          <span class="page-title__current">{{ pageTitle }}</span>
        </h1>
      </div>

      <div class="header-right">
        <!-- 全局搜尋觸發按鈕 -->
        <button class="search-trigger" @click="openSearch" title="搜尋 (Ctrl+K)">
          <el-icon><Search /></el-icon>
          <span class="search-trigger-text">搜尋...</span>
          <kbd class="search-trigger-kbd">Ctrl K</kbd>
        </button>
        <GlobalSearch ref="globalSearchRef" />

        <AdminNotificationBell :is-mobile="isMobile" />

        <A11yMenu />

        <!-- 檢視老師教師端按鈕（園長/admin 持有 PORTAL_PREVIEW 可達） -->
        <el-button
          v-if="canPreviewPortal"
          type="warning"
          size="small"
          plain
          :icon="Monitor"
          aria-label="檢視老師教師端"
          :title="'檢視老師教師端'"
          @click="openTeacherPicker"
        >
          <span class="enter-portal-label">檢視老師教師端</span>
        </el-button>

        <!-- 進入前台按鈕 -->
        <el-button
          v-if="canEnterPortal"
          type="primary"
          size="small"
          plain
          :icon="Monitor"
          aria-label="進入前台"
          :title="'進入前台'"
          @click="goToPortal"
        >
          <span class="enter-portal-label">進入前台</span>
        </el-button>

        <el-dropdown trigger="click" @command="handleCommand">
          <button type="button" class="user-profile" aria-label="開啟帳號選單">
            <el-avatar :size="36" class="user-avatar" icon="UserFilled" />
            <div class="user-info">
              <span class="user-name">{{ displayName }}</span>
              <span class="user-role">
                <!-- 多租戶：園所名稱只在後端有下發 tenant_name 時才顯示（單租戶部署
                     不會下發，畫面與改造前逐字相同）。切換分校下拉屬 Phase 2（CT-A-08）。 -->
                <template v-if="tenantLabel">{{ tenantLabel }}・</template>{{ displayRole }}
              </span>
            </div>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu class="user-dropdown">
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>個人資料
              </el-dropdown-item>
              <el-dropdown-item command="settings">
                <el-icon><Setting /></el-icon>{{ PAGE_TERMS.settingsGeneral }}
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>登出
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </el-header>

  <!-- 超管員工選擇器 Dialog -->
  <el-dialog v-model="showEmployeePicker" title="選擇瀏覽身份" width="400px" append-to-body>
    <!-- 進入前台模式選擇 -->
    <div class="mode-selector" style="margin-bottom: 12px">
      <el-radio-group v-model="selectedMode">
        <el-radio label="readonly">預覽</el-radio>
        <el-radio v-if="canWriteImpersonate" label="write">代操作</el-radio>
      </el-radio-group>
    </div>
    <el-input
      v-model="empSearch"
      aria-label="搜尋員工姓名或工號"
      placeholder="搜尋員工姓名 / 工號"
      clearable
      style="margin-bottom: 12px"
    />
    <el-scrollbar max-height="320px">
      <button
        v-for="emp in filteredEmployees"
        :key="emp.id"
        type="button"
        class="emp-picker-item"
        @click="doImpersonate(emp.id)"
      >
        <span>{{ emp.employee_id }} — {{ emp.name }}</span>
        <span class="emp-title">{{ emp.job_title || emp.title || emp.position || '' }}</span>
      </button>
      <div v-if="filteredEmployees.length === 0" style="padding: 12px; color: var(--text-tertiary); text-align: center;">
        無符合條件的員工
      </div>
    </el-scrollbar>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Monitor, Search, Setting, SwitchButton, User, ArrowDown, ArrowLeft } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import { impersonate } from '@/api/auth'
import { getUserInfo, clearAuth, setUserInfo, hasPermission } from '@/utils/auth'
import GlobalSearch from '@/components/GlobalSearch.vue'
import { apiError } from '@/utils/error'
import AdminNotificationBell from '@/components/layout/AdminNotificationBell.vue'
import A11yMenu from '@/components/common/A11yMenu.vue'
import { roleDisplayLabel } from '@/constants/roleDisplay'
import { PAGE_TERMS } from '@/constants/moduleTerms'
import { BREADCRUMB_PARENTS } from '@/constants/navigation'
import { resolveBreadcrumbParent } from '@/utils/breadcrumb'

withDefaults(defineProps<{
  isMobile?: boolean
  sidebarOpen?: boolean
}>(), {
  isMobile: false,
  sidebarOpen: false,
})

interface EmployeeItem {
  id: number
  name?: string
  employee_id?: string | number
  job_title?: string
  title?: string
  position?: string
}

const globalSearchRef = ref<InstanceType<typeof GlobalSearch> | null>(null)
const sidebarToggleRef = ref<HTMLButtonElement | null>(null)
const openSearch = () => globalSearchRef.value?.open()
defineEmits<{
  'toggle-sidebar': []
}>()

defineExpose({
  focusSidebarToggle: () => sidebarToggleRef.value?.focus(),
})

const route = useRoute()
const router = useRouter()

const pageTitle = computed(() => route.meta?.title || '')

const parentLink = computed(() =>
  // 既有 AdminHeader.spec.ts 對 vue-router 整包 mock，useRoute() 只回傳
  // { meta: { title } }（無 path）；防禦性 fallback 避免該檔測試炸掉。
  resolveBreadcrumbParent(route.path ?? '', {
    parents: BREADCRUMB_PARENTS,
    // 純 redirect 容器（/workbench、/bus、/appraisal-year-end）點下去會被守衛
    // 轉走，常落回原頁 → 視為不可用父層。
    isContainer: (p) => {
      const matched = router.resolve(p).matched
      return Boolean(matched[matched.length - 1]?.redirect)
    },
    titleOf: (p) => {
      const title = router.resolve(p).meta?.title
      return typeof title === 'string' ? title : ''
    },
    metaParent: typeof route.meta?.parent === 'string' ? route.meta.parent : undefined,
  }),
)

const userInfo = computed(() => (getUserInfo() || {}) as Record<string, unknown>)
const displayName = computed(() => (userInfo.value.name as string | undefined) || '管理員')
// 角色中文顯示：role_label（DB 單一來源）優先，缺時走 ROLE_DISPLAY_LABELS 保底
const displayRole = computed(() =>
  roleDisplayLabel(userInfo.value as { role_label?: string; role?: string })
)

// 目前所屬園所名稱（多租戶）。沿用同一個 userInfo computed，登入/refresh/代操作
// 回填後自動重算。後端未下發（單租戶部署）→ 空字串 → 模板整段不渲染。
const tenantLabel = computed(() => {
  const name = userInfo.value.tenant_name
  return typeof name === 'string' ? name : ''
})

// 是否有員工記錄（行政/園長/主任）
const hasEmployee = computed(() => userInfo.value.employee_id != null)

// 所有 admin 相關角色都能看到「進入前台」按鈕
const canEnterPortal = computed(() => {
  const role = userInfo.value.role as string | undefined
  return ['admin', 'hr', 'supervisor'].includes(role ?? '')
})

const showEmployeePicker = ref<boolean>(false)
const employeeList = ref<EmployeeItem[]>([])
const empSearch = ref<string>('')
const employeeStore = useEmployeeStore()

// 是否有代操作權限（admin 才有，園長只有預覽）
const canWriteImpersonate = computed(() => hasPermission('PORTAL_IMPERSONATE'))

// 是否有教師端預覽入口權限（admin 通配符 + 園長持有 PORTAL_PREVIEW）
const canPreviewPortal = computed(() => hasPermission('PORTAL_PREVIEW'))

// 目前選定的進入前台模式；開啟 picker 時重置為 readonly
const selectedMode = ref<'readonly' | 'write'>('readonly')

const filteredEmployees = computed(() =>
  empSearch.value
    ? employeeList.value.filter(e =>
        (e.name || '').includes(empSearch.value) ||
        (e.employee_id || '').toString().includes(empSearch.value))
    : employeeList.value
)

// 開啟教師選擇器（獨立入口，供「檢視老師教師端」與超管「進入前台」共用）
const openTeacherPicker = async () => {
  try {
    await employeeStore.fetchEmployees()
    employeeList.value = (employeeStore.employees as unknown as EmployeeItem[])
  } catch {
    // silent
  }
  empSearch.value = ''
  selectedMode.value = 'readonly'
  showEmployeePicker.value = true
}

const goToPortal = async () => {
  if (hasEmployee.value) {
    // 行政/園長/主任：直接以自己身份進入前台（原行為保留）
    router.push('/portal/attendance')
  } else {
    // 最高管理員：先載入員工清單再彈 dialog
    await openTeacherPicker()
  }
}

const doImpersonate = async (employeeId: number) => {
  try {
    // 安全守衛：無 PORTAL_IMPERSONATE 權限者強制使用 readonly
    const mode: 'readonly' | 'write' =
      selectedMode.value === 'write' && canWriteImpersonate.value ? 'write' : 'readonly'
    const res = await impersonate(employeeId, mode)
    // 後端已透過 Set-Cookie 設定 access_token + admin_token Cookie
    setUserInfo(res.data.user)
    showEmployeePicker.value = false
    router.push('/portal/attendance')
  } catch (error) {
    ElMessage.error(apiError(error, '切換失敗'))
  }
}

const handleCommand = (command: string) => {
  if (command === 'logout') {
    clearAuth()
    router.push('/login')
    ElMessage.success('已登出')
  } else if (command === 'settings') {
    router.push('/settings')
  } else if (command === 'profile') {
    router.push('/profile')
  }
}
</script>

<style scoped>
.admin-header {
  background-color: var(--surface-color);
  border-bottom: 1px solid var(--border-color-light);
  padding: 0 var(--space-8);
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-sm);
  z-index: 10;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-width: 0;
  gap: var(--space-3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
}

.page-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  user-select: none;
  min-width: 0;
}

.page-title__parent {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--text-tertiary);
  font-weight: 400;
  white-space: nowrap;
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: color 0.15s ease;
}

.page-title__parent:hover,
.page-title__parent:focus-visible {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.page-title__back {
  font-size: 0.9em;
}

.page-title__sep {
  color: var(--text-tertiary);
  font-weight: 400;
  margin: 0 4px;
  flex: 0 0 auto;
}

.page-title__current {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-6);
  flex: 0 0 auto;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  transition: background-color var(--transition-base);
}

.user-profile:hover {
  background-color: var(--bg-color);
}

.user-avatar {
  background-color: var(--color-primary-lighter);
  color: var(--color-primary);
}

.user-info {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.user-name {
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
}

.user-role {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Hamburger button */
.hamburger-btn {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 5px;
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.hamburger-line {
  display: block;
  width: 20px;
  height: 2px;
  background-color: var(--text-primary);
  border-radius: 2px;
}

/* Employee Picker */
.emp-picker-item {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.emp-picker-item:hover {
  background: var(--bg-color);
}

.emp-title {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* ===== 全局搜尋觸發按鈕 ===== */
.search-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 140px;
  padding: 6px 10px;
  background: var(--bg-color, #f9fafb);
  border: 1px solid var(--border-color-light, #e5e7eb);
  border-radius: var(--radius-md, 6px);
  cursor: pointer;
  color: var(--text-tertiary, #9ca3af);
  font-size: var(--text-sm, 13px);
  transition: border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.search-trigger:hover {
  border-color: var(--color-primary, var(--color-info));
  color: var(--color-primary, var(--color-info));
}

.search-trigger-text {
  flex: 1;
  text-align: left;
}

.search-trigger-kbd {
  font-size: 12px;
  padding: 1px 5px;
  border: 1px solid var(--border-color-light, #d1d5db);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--surface-color, #fff);
  color: var(--text-tertiary, #9ca3af);
  font-family: inherit;
}

@media (--to-sm) {
  .admin-header {
    padding: 0 var(--space-3);
  }

  .header-content {
    gap: var(--space-2);
  }

  .header-right {
    gap: var(--space-2);
  }

  .page-title {
    font-size: var(--text-lg);
    padding: 2px 4px;
  }

  .page-title__parent-text {
    display: inline-block;
    max-width: 6em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  .user-info {
    display: none;
  }

  .search-trigger-text,
  .search-trigger-kbd {
    display: none;
  }

  .search-trigger {
    min-width: var(--touch-target-min);
    min-height: var(--touch-target-min);
    padding: 6px 8px;
  }

  /* 進入前台按鈕在手機只顯示 icon，文字隱藏 */
  .header-right :deep(.el-button) {
    padding: 6px 8px;
  }
  .enter-portal-label {
    display: none;
  }
}

/* P3-2：手機放大 header 圖示鈕觸控目標 ≥44px（桌機不變） */
@media (--to-sm) {
  .header-right :deep(.el-button) {
    min-width: 44px;
    min-height: 44px;
  }
  .search-trigger {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
