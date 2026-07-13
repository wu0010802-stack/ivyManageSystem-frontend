<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateRole, type RoleUpdate } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import { isSuperAdmin } from '@/utils/auth'
import PermissionPicker from '@/components/settings/PermissionPicker.vue'
import ApprovalChainEditor from './ApprovalChainEditor.vue'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, FLAG_PORTAL_ONLY, type RoleDef, type RolesDefinition } from './types'

const props = defineProps<{
  code: string
  role: RoleDef
  definition: RolesDefinition
  accountCount: number | null // null = 無 USER_MANAGEMENT_READ，帳號數功能降級
  accountCounts: Record<string, number> | null // 全角色帳號數 map，轉給 ApprovalChainEditor 做死鎖偵測
}>()

const activeTab = ref<'permissions' | 'basic' | 'chain'>('permissions')
const emit = defineEmits<{ saved: []; 'delete-role': [] }>()

const form = reactive<{ label: string; description: string; permissions: string[]; flagSuperAdmin: boolean; flagParent: boolean }>({
  label: '', description: '', permissions: [], flagSuperAdmin: false, flagParent: false,
})

// ── 未儲存變更偵測：original 是最近一次「載入/儲存成功」當下的快照，供 isDirty 比對 ──
const original = reactive<{ label: string; description: string; permissions: string[]; flagSuperAdmin: boolean; flagParent: boolean }>({
  label: '', description: '', permissions: [], flagSuperAdmin: false, flagParent: false,
})

const syncOriginalToForm = () => {
  original.label = form.label
  original.description = form.description
  original.permissions = [...form.permissions]
  original.flagSuperAdmin = form.flagSuperAdmin
  original.flagParent = form.flagParent
}

const permsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

const isDirty = computed(
  () =>
    form.label !== original.label ||
    form.description !== original.description ||
    form.flagSuperAdmin !== original.flagSuperAdmin ||
    form.flagParent !== original.flagParent ||
    !permsEqual(form.permissions, original.permissions),
)

watch(
  () => props.code,
  () => {
    const flags = props.role.flags ?? []
    form.label = props.role.label
    form.description = props.role.description || ''
    form.permissions = [...props.role.permissions]
    form.flagSuperAdmin = flags.includes(FLAG_SUPER_ADMIN)
    form.flagParent = flags.includes(FLAG_PARENT)
    syncOriginalToForm()
  },
  { immediate: true },
)

// ── flag checkbox disabled 規則（後端 apply_role_flags 為權威，此處只是預檢 UX）──
const superAdminDisabled = computed(() => !isSuperAdmin() || props.code === 'admin')
const superAdminTooltip = computed(() => {
  if (!isSuperAdmin()) return '僅超級管理員可變更此身份'
  if (props.code === 'admin') return '系統預設 admin 角色的超級管理員身份不可移除'
  return ''
})

const parentDisabled = computed(() => {
  if (props.code === 'parent') return true
  // 帳號數 > 0 不可「加上」家長 flag（spec §5.3 M9）；已勾者（理論上帳號數必為 0）可取消
  if (!form.flagParent && props.accountCount !== null && props.accountCount > 0) return true
  return false
})
const parentTooltip = computed(() => {
  if (props.code === 'parent') return '系統預設家長角色的家長身份不可移除'
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
    const payload: RoleUpdate = { label: form.label, description: form.description, flags: buildFlags(), permissions: [...form.permissions] }
    await updateRole(props.code, payload)
    syncOriginalToForm()
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
const deleteDisabled = computed(() => props.accountCount !== null && props.accountCount > 0)
const deleteTooltip = computed(() => {
  if (props.accountCount !== null && props.accountCount > 0) return '仍有帳號使用此角色，不可刪除'
  return ''
})
const requestDelete = () => emit('delete-role')

defineExpose({ form, isDirty, superAdminDisabled, superAdminTooltip, parentDisabled, parentTooltip, deleteDisabled, deleteTooltip, handleSave, requestDelete, buildFlags, saving })
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

    <el-tabs v-model="activeTab">
      <!-- 1. 權限 -->
      <el-tab-pane label="權限" name="permissions">
        <PermissionPicker v-model="form.permissions" :definition="definition" />
      </el-tab-pane>

      <!-- 2. 基本資料（身份 flag + 基本資料表單） -->
      <el-tab-pane label="基本資料" name="basic">
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
      </el-tab-pane>

      <!-- 3. 簽呈審核關卡鏈（spec §6.1 右欄 4） -->
      <el-tab-pane label="簽呈關卡" name="chain">
        <ApprovalChainEditor
          :submitter-role="code"
          :definition="definition"
          :account-counts="accountCounts"
        />
      </el-tab-pane>
    </el-tabs>
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
