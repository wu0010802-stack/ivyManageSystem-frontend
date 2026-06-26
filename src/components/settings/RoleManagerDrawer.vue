<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createRole, updateRole, deleteRole } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import PermissionPicker, { type PermissionPickerDefinition } from './PermissionPicker.vue'

interface RoleDef { label: string; description: string; permissions: string[]; is_core: boolean }
export type RolesDefinition = PermissionPickerDefinition & { roles: Record<string, RoleDef> }

const props = defineProps<{
  visible: boolean
  definition: RolesDefinition
  users: Record<string, unknown>[]
}>()
const emit = defineEmits<{ 'update:visible': [v: boolean]; 'roles-changed': [] }>()

const drawerVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

function accountCount(code: string): number {
  return props.users.filter((u) => u.role === code).length
}

const roleRows = computed(() =>
  Object.entries(props.definition.roles).map(([code, r]) => ({
    code,
    label: r.label,
    description: r.description,
    permission_count: r.permissions.includes('*') ? '全部' : `${r.permissions.length} 條`,
    account_count: accountCount(code),
    is_core: r.is_core,
    permissions: r.permissions,
  })),
)

const roleDialogVisible = ref(false)
const roleEditMode = ref<'create' | 'edit'>('create')
const roleForm = reactive<{ code: string; label: string; description: string; permissions: string[]; is_core: boolean }>({
  code: '', label: '', description: '', permissions: [], is_core: false,
})

function handleAddRole() {
  roleEditMode.value = 'create'
  Object.assign(roleForm, { code: '', label: '', description: '', permissions: [], is_core: false })
  roleDialogVisible.value = true
}

function handleEditRole(row: typeof roleRows.value[0]) {
  roleEditMode.value = 'edit'
  Object.assign(roleForm, {
    code: row.code, label: row.label, description: row.description,
    permissions: [...row.permissions], is_core: row.is_core,
  })
  roleDialogVisible.value = true
}

const saving = ref(false)
async function saveRole() {
  if (saving.value) return  // 送出中防序列/併發重送（併發另有 api dedupe 兜底）
  saving.value = true
  try {
    if (roleEditMode.value === 'create') {
      await createRole({
        code: roleForm.code,
        label: roleForm.label,
        description: roleForm.description || undefined,
        permissions: roleForm.permissions,
      })
      ElMessage.success('角色已新增')
    } else {
      const payload: Record<string, unknown> = { label: roleForm.label, description: roleForm.description }
      if (!roleForm.is_core) payload.permissions = roleForm.permissions
      await updateRole(roleForm.code, payload)
      ElMessage.success('角色已更新')
    }
    roleDialogVisible.value = false
    emit('roles-changed')
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

function handleDeleteRole(row: typeof roleRows.value[0]) {
  ElMessageBox.confirm(`確定刪除角色「${row.label}」（code: ${row.code}）？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteRole(row.code)
        ElMessage.success('角色已刪除')
        emit('roles-changed')
      } catch (e) {
        ElMessage.error(apiError(e, '刪除失敗'))
      }
    })
    .catch(() => {})
}

defineExpose({ roleRows, roleForm, roleDialogVisible, roleEditMode, handleAddRole, handleEditRole, saveRole, handleDeleteRole, accountCount, saving })
</script>

<template>
  <el-drawer v-model="drawerVisible" title="管理角色" direction="rtl" size="680px">
    <div class="drawer-header">
      <el-button class="add-role-btn" type="primary" @click="handleAddRole">新增角色</el-button>
    </div>
    <el-table :data="roleRows" class="roles-table">
      <el-table-column prop="label" label="名稱" width="140" />
      <el-table-column prop="code" label="code" width="150" />
      <el-table-column prop="description" label="說明" />
      <el-table-column prop="permission_count" label="權限數" width="90" />
      <el-table-column prop="account_count" label="帳號數" width="80" />
      <el-table-column label="類型" width="70">
        <template #default="{ row }">
          <el-tag :type="row.is_core ? 'info' : 'warning'" size="small">{{ row.is_core ? '核心' : '自訂' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEditRole(row)">編輯</el-button>
          <el-button
            class="delete-role-btn" link type="danger"
            :disabled="row.is_core"
            :title="row.is_core ? '核心角色不可刪除' : ''"
            @click="handleDeleteRole(row)"
          >刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="roleDialogVisible" :title="roleEditMode === 'create' ? '新增角色' : '編輯角色'" width="640px" append-to-body class="role-edit-dialog">
      <el-form :model="roleForm" label-width="100px">
        <el-form-item label="code">
          <el-input v-model="roleForm.code" :disabled="roleEditMode === 'edit'" placeholder="例：custom_principal" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="roleForm.label" placeholder="例：兼會計園長" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="roleForm.description" type="textarea" :rows="2" placeholder="一句話描述適用對象" />
        </el-form-item>
        <el-form-item label="權限">
          <PermissionPicker v-model="roleForm.permissions" :definition="definition" :disabled="roleForm.is_core" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveRole">儲存</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.drawer-header {
  margin-bottom: 12px;
}
</style>
