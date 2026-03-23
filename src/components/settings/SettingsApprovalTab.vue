<script setup>
import { ref, onMounted } from 'vue'
import { getApprovalPolicies, updateApprovalPolicies } from '@/api/approvalSettings'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'

const approvalPolicies = ref([])
const loadingApproval = ref(false)

const ROLE_HIERARCHY = { teacher: 1, supervisor: 2, hr: 3, admin: 4 }
const ROLE_LABELS_MAP = { teacher: '教師', supervisor: '主管', hr: '人資', admin: '管理員' }
const ALL_APPROVER_ROLES = ['supervisor', 'hr', 'admin']

const fetchApprovalPolicies = async () => {
  loadingApproval.value = true
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data.map(p => ({
      ...p,
      approver_roles_arr: p.approver_roles.split(',').map(r => r.trim()).filter(Boolean),
    }))
  } catch (error) {
    ElMessage.error('載入審核政策失敗')
  } finally {
    loadingApproval.value = false
  }
}

const isApproverRoleChecked = (policy, role) => {
  return policy.approver_roles_arr.includes(role)
}

const toggleApproverRole = (policy, role) => {
  const idx = policy.approver_roles_arr.indexOf(role)
  if (idx >= 0) {
    if (role === 'admin') {
      ElMessage.warning('admin 永遠具有審核資格，不可移除')
      return
    }
    policy.approver_roles_arr.splice(idx, 1)
  } else {
    if (role !== 'admin' && ROLE_HIERARCHY[role] < ROLE_HIERARCHY[policy.submitter_role]) {
      ElMessage.warning(`${ROLE_LABELS_MAP[role]} 層級低於申請人 ${ROLE_LABELS_MAP[policy.submitter_role]}，不可設為審核者`)
      return
    }
    policy.approver_roles_arr.push(role)
  }
}

const saveApprovalPolicies = async () => {
  loadingApproval.value = true
  try {
    const payload = approvalPolicies.value.map(p => ({
      submitter_role: p.submitter_role,
      approver_roles: p.approver_roles_arr.join(','),
      is_active: p.is_active,
    }))
    await updateApprovalPolicies(payload)
    ElMessage.success('審核政策已儲存')
    fetchApprovalPolicies()
  } catch (error) {
    ElMessage.error(apiError(error, '儲存審核政策失敗'))
  } finally {
    loadingApproval.value = false
  }
}

onMounted(fetchApprovalPolicies)
</script>

<template>
  <div v-loading="loadingApproval" style="margin-top: 16px;">
    <el-alert type="info" :closable="false" style="margin-bottom: 16px;">
      <template #default>
        <p style="margin: 4px 0;">設定哪些角色有資格審核哪些角色的請假、加班、補打卡申請。</p>
        <p style="margin: 4px 0;">規則：審核者層級必須 ≥ 申請人層級（admin 不受此限制）。</p>
      </template>
    </el-alert>
    <el-table :data="approvalPolicies" border style="width: auto;">
      <el-table-column label="申請人角色" width="130">
        <template #default="{ row }">
          <el-tag>{{ ROLE_LABELS_MAP[row.submitter_role] || row.submitter_role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        v-for="role in ALL_APPROVER_ROLES"
        :key="role"
        :label="ROLE_LABELS_MAP[role]"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-checkbox
            :model-value="isApproverRoleChecked(row, role)"
            :disabled="role === 'admin'"
            @change="toggleApproverRole(row, role)"
          />
        </template>
      </el-table-column>
    </el-table>
    <div style="margin-top: 16px;">
      <el-button type="primary" @click="saveApprovalPolicies">儲存審核政策</el-button>
    </div>
  </div>
</template>
