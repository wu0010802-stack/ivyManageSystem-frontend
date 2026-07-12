<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { getApprovalPolicies } from '@/api/approvalSettings'
import { ElMessage } from 'element-plus'

interface ApprovalPolicy {
  doc_type: string
  submitter_role: string
  approver_roles: string
  approver_roles_arr: string[]
  is_active: boolean
}

const approvalPolicies = ref<ApprovalPolicy[]>([])
const loadingApproval = ref<boolean>(false)

const ROLE_LABELS_MAP: Record<string, string> = { teacher: '教師', supervisor: '主管', hr: '人資', admin: '管理員' }

// doc_type 顯示順序與中文標籤；未列於此的 doc_type 會依字母序排在後面，並直接顯示原始值。
const DOC_TYPE_ORDER = ['all', 'leave', 'overtime', 'punch_correction']
const DOC_TYPE_LABELS: Record<string, string> = {
  all: '全部類型（預設政策）',
  leave: '請假',
  overtime: '加班',
  punch_correction: '補打卡',
}

// 逐級簽核鏈序標號，超過範圍則退回「N.」數字表示
const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

const docTypeLabel = (docType: string) => DOC_TYPE_LABELS[docType] || docType

const chainLabel = (index: number) => CIRCLED_DIGITS[index] || `${index + 1}.`

const formatChain = (rolesArr: string[]) =>
  rolesArr
    .map((role, idx) => `${chainLabel(idx)}${ROLE_LABELS_MAP[role] || role}`)
    .join(' → ')

// 依 doc_type 分組，未知 doc_type 排在已知順序之後
const groupedPolicies = computed(() => {
  const groups = new Map<string, ApprovalPolicy[]>()
  for (const policy of approvalPolicies.value) {
    const list = groups.get(policy.doc_type) || []
    list.push(policy)
    groups.set(policy.doc_type, list)
  }
  const knownKeys = DOC_TYPE_ORDER.filter((key) => groups.has(key))
  const unknownKeys = [...groups.keys()].filter((key) => !DOC_TYPE_ORDER.includes(key)).sort()
  return [...knownKeys, ...unknownKeys].map((docType) => ({
    docType,
    policies: groups.get(docType) || [],
  }))
})

const fetchApprovalPolicies = async () => {
  loadingApproval.value = true
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data.map((p: { doc_type: string; submitter_role: string; approver_roles: string; is_active: boolean }) => ({
      ...p,
      approver_roles_arr: p.approver_roles.split(',').map((r: string) => r.trim()).filter(Boolean),
    }))
  } catch (error) {
    ElMessage.error('載入審核政策失敗')
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
        <p style="margin: 4px 0;">
          審核流程已升級為逐級簽核，關卡順序即簽核順序（例如「①主管 → ②人資」代表先由主管簽核，通過後再交由人資簽核）。
        </p>
        <p style="margin: 4px 0;">
          流程編輯功能將移至新的角色設定頁，本頁暫為唯讀檢視。
        </p>
      </template>
    </el-alert>

    <div v-for="group in groupedPolicies" :key="group.docType" style="margin-bottom: 24px;">
      <h4 style="margin: 0 0 8px;">{{ docTypeLabel(group.docType) }}</h4>
      <el-table :data="group.policies" border style="width: auto;">
        <el-table-column label="申請人角色" width="130">
          <template #default="{ row }">
            <el-tag>{{ ROLE_LABELS_MAP[row.submitter_role] || row.submitter_role }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="簽核關卡順序">
          <template #default="{ row }">
            <span>{{ formatChain(row.approver_roles_arr) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="100">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '啟用中' : '已停用' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>
