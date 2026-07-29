<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowDown,
  Bell,
  Clock,
  Document,
  OfficeBuilding,
  Plus,
  School,
  User,
  UserFilled,
} from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

// 主頁彈 dialog 類型：emit 給 HomeView 決定要開哪個 dialog
export type QuickAddDialogType =
  | 'overtime'
  | 'leave'
  | 'student'
  | 'announcement'
  | 'classroom'

const emit = defineEmits<{
  (e: 'open', type: QuickAddDialogType): void
}>()

const router = useRouter()

// 7 個項目：5 個主頁彈 (action='dialog')，2 個跳轉 (action='navigate')
type DialogItem = {
  key: QuickAddDialogType
  label: string
  icon: typeof Plus
  permission: string
  action: 'dialog'
}
type NavigateItem = {
  key: 'employee' | 'recruitment'
  label: string
  icon: typeof Plus
  permission: string
  action: 'navigate'
  path: string
  query?: Record<string, string>
}
type MenuItem = DialogItem | NavigateItem

const allItems: MenuItem[] = [
  { key: 'overtime', label: '加班', icon: Clock, permission: 'OVERTIME_WRITE', action: 'dialog' },
  { key: 'leave', label: '請假', icon: Document, permission: 'LEAVES_WRITE', action: 'dialog' },
  { key: 'student', label: '學生', icon: UserFilled, permission: 'STUDENTS_WRITE', action: 'dialog' },
  { key: 'announcement', label: '公告', icon: Bell, permission: 'ANNOUNCEMENTS_WRITE', action: 'dialog' },
  { key: 'classroom', label: '班級', icon: OfficeBuilding, permission: 'CLASSROOMS_WRITE', action: 'dialog' },
  { key: 'employee', label: '員工', icon: User, permission: 'EMPLOYEES_WRITE', action: 'navigate', path: '/employees' },
  { key: 'recruitment', label: '招生訪視紀錄', icon: School, permission: 'RECRUITMENT_WRITE', action: 'navigate', path: '/students/admissions', query: { tab: 'records' } },
]

const visibleItems = computed(() => allItems.filter((item) => hasPermission(item.permission)))

// 跳頁項與彈窗項行為不同（會離開本頁），第一個跳頁項前加分隔線做視覺區分
const firstNavigateKey = computed(
  () => visibleItems.value.find((item) => item.action === 'navigate')?.key
)

const handleCommand = (key: string) => {
  const item = allItems.find((i) => i.key === key)
  if (!item) return
  if (item.action === 'navigate') {
    router.push({ path: item.path, query: { ...(item.query ?? {}), quick_add: '1' } })
  } else {
    emit('open', item.key)
  }
}
</script>

<template>
  <el-dropdown
    v-if="visibleItems.length > 0"
    trigger="click"
    @command="handleCommand"
  >
    <el-button type="primary" size="default" class="quick-add-trigger">
      <el-icon><Plus /></el-icon>
      <span>快速新增</span>
      <el-icon class="quick-add-trigger__caret"><ArrowDown /></el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="item in visibleItems"
          :key="item.key"
          :command="item.key"
          :divided="item.key === firstNavigateKey"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <span
            v-if="item.action === 'navigate'"
            class="quick-add-nav-hint"
            aria-label="開啟頁面"
          >→</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.quick-add-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.quick-add-trigger__caret {
  font-size: 12px;
  opacity: 0.85;
}

.quick-add-nav-hint {
  margin-left: auto;
  padding-left: 12px;
  color: var(--text-secondary);
}
</style>
