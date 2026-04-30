<script setup>
import { computed } from 'vue'
import { Warning, Phone, MoreFilled, SwitchButton, ArrowRight } from '@element-plus/icons-vue'
import { hasPermission } from '@/utils/auth'

const props = defineProps({
  profile: { type: Object, default: null },
  context: { type: String, default: 'students' }, // 'students' | 'classroom'
  showOpenFullPage: { type: Boolean, default: false },
})
const emit = defineEmits(['lifecycle-click', 'edit-click', 'open-full-page', 'goto-link'])

const canLifecycleWrite = computed(() => hasPermission('STUDENTS_LIFECYCLE_WRITE'))
const canStudentsWrite = computed(() => hasPermission('STUDENTS_WRITE'))

const LIFECYCLE_LABELS = {
  prospect: '招生中',
  enrolled: '已報到',
  active: '在學',
  on_leave: '休學',
  transferred: '轉出',
  withdrawn: '退學',
  graduated: '畢業',
}
const LIFECYCLE_TAG = {
  prospect: 'info',
  enrolled: 'warning',
  active: 'success',
  on_leave: 'warning',
  transferred: 'info',
  withdrawn: 'danger',
  graduated: 'success',
}

const basic = computed(() => props.profile?.basic || {})
const health = computed(() => props.profile?.health || {})
const lifecycle = computed(() => props.profile?.lifecycle || {})

const lifecycleLabel = computed(() =>
  LIFECYCLE_LABELS[lifecycle.value.status] || lifecycle.value.status || '—',
)
const lifecycleTagType = computed(() =>
  LIFECYCLE_TAG[lifecycle.value.status] || 'info',
)

const primaryGuardian = computed(() =>
  (props.profile?.guardians || []).find((g) => g.is_primary)
    || (props.profile?.guardians || [])[0]
    || null,
)

const healthAlerts = computed(() => {
  const alerts = []
  if (health.value.allergy) alerts.push({ label: '過敏', text: health.value.allergy })
  if (health.value.medication) alerts.push({ label: '用藥', text: health.value.medication })
  if (health.value.special_needs) alerts.push({ label: '特殊需求', text: health.value.special_needs })
  return alerts
})

const initial = computed(() => basic.value.name?.[0] || '?')

const avatarColor = computed(() => {
  if (basic.value.gender === '男') return 'var(--el-color-primary)'
  if (basic.value.gender === '女') return '#e91e8c'
  return '#909399'
})
</script>

<template>
  <div class="summary-header" v-if="profile">
    <div class="header-main">
      <el-avatar :size="56" :style="{ backgroundColor: avatarColor, fontSize: '22px' }">
        {{ initial }}
      </el-avatar>

      <div class="identity">
        <div class="name-row">
          <h2 class="student-name">{{ basic.name }}</h2>
          <span class="student-id">#{{ basic.student_id }}</span>
          <el-tag :type="lifecycleTagType" size="small">{{ lifecycleLabel }}</el-tag>
          <el-tag v-if="basic.gender === '男'" type="primary" size="small" effect="light">男</el-tag>
          <el-tag v-else-if="basic.gender === '女'" type="danger" size="small" effect="light">女</el-tag>
        </div>
        <div class="meta-row">
          <span class="meta-item">
            <span class="meta-label">班級：</span>
            <span class="meta-value">{{ basic.classroom_name || '未分班' }}</span>
          </span>
          <span class="meta-item" v-if="basic.birthday">
            <span class="meta-label">生日：</span>
            <span class="meta-value">{{ basic.birthday }}</span>
          </span>
          <span class="meta-item" v-if="primaryGuardian">
            <el-icon class="phone-icon"><Phone /></el-icon>
            <span class="meta-value">
              {{ primaryGuardian.name }}（{{ primaryGuardian.relation || '聯絡人' }}）
              <span v-if="primaryGuardian.phone" class="muted"> · {{ primaryGuardian.phone }}</span>
            </span>
          </span>
          <span class="meta-item" v-else>
            <el-tag type="warning" size="small">尚未設定主要聯絡人</el-tag>
          </span>
        </div>
      </div>

      <div class="actions">
        <el-button
          v-if="showOpenFullPage"
          plain
          size="small"
          @click="emit('open-full-page')"
        >
          完整檔案
          <el-icon style="margin-left: 4px"><ArrowRight /></el-icon>
        </el-button>
        <el-button
          v-if="canLifecycleWrite"
          size="small"
          type="warning"
          plain
          :icon="SwitchButton"
          @click="emit('lifecycle-click')"
        >變更狀態</el-button>
        <el-dropdown
          v-if="canStudentsWrite"
          trigger="click"
          @command="(cmd) => emit('goto-link', cmd)"
        >
          <el-button size="small" :icon="MoreFilled" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="edit">編輯基本資料</el-dropdown-item>
              <el-dropdown-item divided command="attendance">學生出席紀錄頁</el-dropdown-item>
              <el-dropdown-item command="fees">學費管理頁</el-dropdown-item>
              <el-dropdown-item v-if="context === 'students'" command="classrooms">班級學生管理</el-dropdown-item>
              <el-dropdown-item v-else command="students">回到學生列表</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="alert-row" v-if="healthAlerts.length">
      <el-icon class="alert-icon"><Warning /></el-icon>
      <span class="alert-label">健康警示</span>
      <el-tag
        v-for="(a, idx) in healthAlerts"
        :key="idx"
        type="warning"
        effect="light"
        size="small"
      >
        {{ a.label }}：{{ a.text }}
      </el-tag>
    </div>
  </div>
</template>

<style scoped>
.summary-header {
  background: linear-gradient(135deg, var(--el-bg-color) 0%, var(--el-fill-color-lighter) 100%);
  border-radius: 8px;
  padding: 16px 18px;
  border: 1px solid var(--el-border-color-lighter);
  margin-bottom: 14px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 14px;
}

.identity {
  flex: 1;
  min-width: 0;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.student-name {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
}

.student-id {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: var(--el-fill-color);
  padding: 1px 8px;
  border-radius: 4px;
}

.meta-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--el-text-color-regular);
  align-items: center;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-label {
  color: var(--el-text-color-secondary);
}

.meta-value {
  color: var(--el-text-color-primary);
}

.muted {
  color: var(--el-text-color-secondary);
}

.phone-icon {
  color: var(--el-color-primary);
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.alert-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 8px 10px;
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 4px;
  flex-wrap: wrap;
}

.alert-icon {
  color: var(--el-color-warning);
}

.alert-label {
  font-size: 12px;
  color: var(--el-color-warning);
  font-weight: 600;
  margin-right: 4px;
}

@media (max-width: 768px) {
  .header-main {
    flex-wrap: wrap;
  }
  .actions {
    margin-left: auto;
  }
}
</style>
