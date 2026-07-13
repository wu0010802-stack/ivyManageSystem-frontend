<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateRole, type RoleUpdate } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import { isSuperAdmin } from '@/utils/auth'
import PermissionPicker from '@/components/settings/PermissionPicker.vue'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, FLAG_PORTAL_ONLY, type RoleDef, type RolesDefinition } from './types'

const props = defineProps<{
  code: string
  role: RoleDef
  definition: RolesDefinition
  accountCount: number | null // null = 無 USER_MANAGEMENT_READ，帳號數功能降級
}>()
const emit = defineEmits<{ saved: []; 'delete-role': [] }>()

const form = reactive<{ label: string; description: string; permissions: string[]; flagSuperAdmin: boolean; flagParent: boolean }>({
  label: '', description: '', permissions: [], flagSuperAdmin: false, flagParent: false,
})

watch(
  () => props.code,
  () => {
    const flags = props.role.flags ?? []
    form.label = props.role.label
    form.description = props.role.description || ''
    form.permissions = [...props.role.permissions]
    form.flagSuperAdmin = flags.includes(FLAG_SUPER_ADMIN)
    form.flagParent = flags.includes(FLAG_PARENT)
  },
  { immediate: true },
)

// ── flag checkbox disabled 規則（後端 apply_role_flags 為權威，此處只是預檢 UX）──
const superAdminDisabled = computed(() => !isSuperAdmin() || props.code === 'admin')
const superAdminTooltip = computed(() => {
  if (!isSuperAdmin()) return '僅超級管理員可變更此身份'
  if (props.code === 'admin') return '核心 admin 角色的超級管理員身份不可移除'
  return ''
})

const parentDisabled = computed(() => {
  if (props.code === 'parent') return true
  // 帳號數 > 0 不可「加上」家長 flag（spec §5.3 M9）；已勾者（理論上帳號數必為 0）可取消
  if (!form.flagParent && props.accountCount !== null && props.accountCount > 0) return true
  return false
})
const parentTooltip = computed(() => {
  if (props.code === 'parent') return '核心家長角色的家長身份不可移除'
  if (!form.flagParent && props.accountCount !== null && props.accountCount > 0) return '已有帳號的角色不可標記為家長身份'
  return ''
})

// ── 儲存 ──
const saving = ref(false)

// portal_only 由 seed 管理不可經 UI 增減；payload 必須原樣保留，否則後端視為「移除」而 409
const buildFlags = (): string[] => {
  const flags: string[] = []
  if (form.flagSuperAdmin) flags.push(FLAG_SUPER_ADMIN)
  if (form.flagParent) flags.push(FLAG_PARENT)
  if ((props.role.flags ?? []).includes(FLAG_PORTAL_ONLY)) flags.push(FLAG_PORTAL_ONLY)
  return flags
}

const handleSave = async () => {
  const n = props.accountCount
  const msg = n === null
    ? '權限或身份變更後，該角色帳號需重新登入生效。確定儲存？'
    : `此角色下有 ${n} 個帳號，權限或身份變更後將重新登入生效。確定儲存？`
  try {
    await ElMessageBox.confirm(msg, '儲存角色', { type: 'warning', confirmButtonText: '儲存', cancelButtonText: '取消' })
  } catch {
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    const payload: RoleUpdate = { label: form.label, description: form.description, flags: buildFlags() }
    if (!props.role.is_core) payload.permissions = [...form.permissions]
    await updateRole(props.code, payload)
    ElMessage.success('角色已更新')
    emit('saved')
  } catch (e) {
    // 409：防鎖死 / parent flag 帳號數限制 / 鏈殘留等，後端 detail 為完整中文說明
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

// ── 刪除保護（後端已有；此處預檢 + disabled 態，spec §6.1）──
const deleteDisabled = computed(() => props.role.is_core || (props.accountCount !== null && props.accountCount > 0))
const deleteTooltip = computed(() => {
  if (props.role.is_core) return '核心角色不可刪除'
  if (props.accountCount !== null && props.accountCount > 0) return '仍有帳號使用此角色，不可刪除'
  return ''
})
const requestDelete = () => emit('delete-role')

defineExpose({ form, superAdminDisabled, superAdminTooltip, parentDisabled, parentTooltip, deleteDisabled, deleteTooltip, handleSave, requestDelete, buildFlags, saving })
</script>

<template>
  <el-card shadow="never" class="role-detail">
    <template #header>
      <div class="detail-header">
        <span class="detail-title">{{ role.label }} <code class="detail-code">{{ code }}</code></span>
        <div class="detail-actions">
          <el-tooltip :content="deleteTooltip" :disabled="!deleteDisabled" placement="top">
            <span>
              <el-button type="danger" plain size="small" :disabled="deleteDisabled" data-testid="delete-role" @click="requestDelete">刪除角色</el-button>
            </span>
          </el-tooltip>
          <el-button type="primary" size="small" :loading="saving" data-testid="save-role" @click="handleSave">儲存</el-button>
        </div>
      </div>
    </template>

    <!-- 1. 身份 flag（最上方，spec §6.1） -->
    <section class="detail-section">
      <h4>身份</h4>
      <div class="flag-row">
        <el-tooltip :content="superAdminTooltip" :disabled="!superAdminDisabled" placement="top">
          <span>
            <el-checkbox v-model="form.flagSuperAdmin" :disabled="superAdminDisabled" data-testid="flag-super-admin">
              超級管理員（任何關卡可代簽，並可終核整張）
            </el-checkbox>
          </span>
        </el-tooltip>
      </div>
      <div class="flag-row">
        <el-tooltip :content="parentTooltip" :disabled="!parentDisabled" placement="top">
          <span>
            <el-checkbox v-model="form.flagParent" :disabled="parentDisabled" data-testid="flag-parent">
              家長（分流到家長帳號區塊，不可指派給員工、不可進審核鏈）
            </el-checkbox>
          </span>
        </el-tooltip>
      </div>
    </section>

    <!-- 2. 基本資料 -->
    <section class="detail-section">
      <h4>基本資料</h4>
      <el-form label-width="80px">
        <el-form-item label="code">
          <el-input :model-value="code" disabled />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="form.label" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </section>

    <!-- 3. 權限（核心角色由 PermissionPicker 自帶唯讀提示） -->
    <section class="detail-section">
      <h4>權限</h4>
      <PermissionPicker v-model="form.permissions" :definition="definition" :disabled="role.is_core" />
    </section>
  </el-card>
</template>

<style scoped>
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.detail-title {
  font-weight: 600;
}

.detail-code {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.detail-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section h4 {
  margin: 0 0 8px;
}

.flag-row {
  margin-bottom: 4px;
}
</style>
