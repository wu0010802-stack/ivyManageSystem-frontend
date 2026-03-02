
<template>
  <el-header height="64px" class="admin-header">
    <div class="header-content">
      <div class="header-left">
        <button v-if="isMobile" class="hamburger-btn" @click="$emit('toggle-sidebar')">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <h2 class="page-title">{{ pageTitle }}</h2>
      </div>

      <div class="header-right">
        <!-- 進入前台按鈕 -->
        <el-button
          v-if="canEnterPortal"
          type="primary"
          size="small"
          plain
          :icon="Monitor"
          @click="goToPortal"
        >
          進入前台
        </el-button>

        <el-dropdown trigger="click" @command="handleCommand">
          <div class="user-profile">
            <el-avatar :size="36" class="user-avatar" icon="UserFilled" />
            <div class="user-info">
              <span class="user-name">{{ displayName }}</span>
              <span class="user-role">{{ displayRole }}</span>
            </div>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu class="user-dropdown">
              <el-dropdown-item command="profile">
                <el-icon><User /></el-icon>個人資料
              </el-dropdown-item>
              <el-dropdown-item command="settings">
                <el-icon><Setting /></el-icon>系統設定
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
    <el-input v-model="empSearch" placeholder="搜尋員工姓名 / 工號" clearable style="margin-bottom: 12px" />
    <el-scrollbar max-height="320px">
      <div
        v-for="emp in filteredEmployees"
        :key="emp.id"
        class="emp-picker-item"
        @click="doImpersonate(emp.id)"
      >
        <span>{{ emp.employee_id }} — {{ emp.name }}</span>
        <span class="emp-title">{{ emp.job_title || emp.title || emp.position || '' }}</span>
      </div>
      <div v-if="filteredEmployees.length === 0" style="padding: 12px; color: var(--text-tertiary); text-align: center;">
        無符合條件的員工
      </div>
    </el-scrollbar>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Monitor } from '@element-plus/icons-vue'
import api from '@/api'
import { getUserInfo, clearAuth, getToken, setToken, setUserInfo } from '@/utils/auth'

defineProps({
  isMobile: { type: Boolean, default: false }
})
defineEmits(['toggle-sidebar'])

const route = useRoute()
const router = useRouter()

const pageTitle = computed(() => route.meta?.title || '')

const userInfo = computed(() => getUserInfo() || {})
const displayName = computed(() => userInfo.value.name || '管理員')
const displayRole = computed(() => userInfo.value.role === 'admin' ? 'Administrator' : userInfo.value.role || '')

// 是否有員工記錄（行政/園長/主任）
const hasEmployee = computed(() => userInfo.value.employee_id != null)

// 所有 admin 相關角色都能看到「進入前台」按鈕
const canEnterPortal = computed(() => {
  const role = userInfo.value.role
  return ['admin', 'hr', 'supervisor'].includes(role)
})

const showEmployeePicker = ref(false)
const employeeList = ref([])
const empSearch = ref('')

const filteredEmployees = computed(() =>
  empSearch.value
    ? employeeList.value.filter(e =>
        (e.name || '').includes(empSearch.value) ||
        (e.employee_id || '').toString().includes(empSearch.value))
    : employeeList.value
)

const goToPortal = async () => {
  if (hasEmployee.value) {
    // 行政/園長/主任：直接以自己身份進入前台
    router.push('/portal/attendance')
  } else {
    // 最高管理員：先載入員工清單再彈 dialog
    try {
      const res = await api.get('/employees')
      employeeList.value = res.data
    } catch {
      // silent
    }
    empSearch.value = ''
    showEmployeePicker.value = true
  }
}

const doImpersonate = async (employeeId) => {
  try {
    const res = await api.impersonate(employeeId)
    // 備份管理員 token（用於返回後台 & 在前台再次切換員工）
    localStorage.setItem('adminToken', getToken())
    localStorage.setItem('adminUserInfo', localStorage.getItem('userInfo'))
    // 替換為目標員工 token
    setToken(res.data.token)
    setUserInfo(res.data.user)
    showEmployeePicker.value = false
    router.push('/portal/attendance')
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '切換失敗')
  }
}

const handleCommand = (command) => {
  if (command === 'logout') {
    clearAuth()
    router.push('/login')
    ElMessage.success('已登出')
  } else if (command === 'settings') {
    router.push('/settings')
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
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.page-title {
  margin: 0;
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-6);
}

.user-profile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-md);
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
  width: 40px;
  height: 40px;
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
  transition: all var(--transition-slow);
}

/* Employee Picker */
.emp-picker-item {
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

@media (max-width: 767px) {
  .admin-header {
    padding: 0 var(--space-4);
  }

  .page-title {
    font-size: var(--text-lg);
  }

  .user-info {
    display: none;
  }
}
</style>
