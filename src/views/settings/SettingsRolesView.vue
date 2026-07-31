<script setup lang="ts">
import { ref, computed, reactive, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPermissions, getUsers } from '@/api/auth'
import { createRole, deleteRole } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import RoleDetailPanel from '@/components/settings/roles/RoleDetailPanel.vue'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, type RolesDefinition } from '@/components/settings/roles/types'

const definition = ref<RolesDefinition>({ permissions: {}, groups: [], roles: {} })
const loadingDef = ref(false)

// 帳號數：getUsers 需 USER_MANAGEMENT_READ；僅持 ROLES_MANAGE 者拿不到 → null，
// UI 顯示「—」並停用帳號數預檢（parent flag / 刪除保護交後端 409 兜底）。
const accountCounts = ref<Record<string, number> | null>(null)

const selectedCode = ref<string>('')

// 選中角色寫進 query（?role=hr）：重整不會彈回第一個角色，也能把「請看這個角色的設定」
// 直接貼給同事。用 replace 不推歷史——切角色不是「上一頁」該回去的動作。
// 無 router 環境（元件單元測試直接 mount）下兩者為 undefined，深連結靜默降級。
const route = useRoute()
const router = useRouter()
const roleFromQuery = (): string =>
  typeof route?.query?.role === 'string' ? route.query.role : ''

watch(selectedCode, (code) => {
  if (!router || !route) return
  if (code && roleFromQuery() !== code) {
    router.replace({ query: { ...route.query, role: code } })
  }
})

const fetchDefinition = async () => {
  loadingDef.value = true
  try {
    const res = await getPermissions()
    definition.value = res.data
    if (!selectedCode.value || !definition.value.roles[selectedCode.value]) {
      const fromQuery = roleFromQuery()
      selectedCode.value = definition.value.roles[fromQuery]
        ? fromQuery
        : (Object.keys(definition.value.roles)[0] ?? '')
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入角色定義失敗'))
  } finally {
    loadingDef.value = false
  }
}

const fetchAccountCounts = async () => {
  try {
    const res = await getUsers()
    const counts: Record<string, number> = {}
    for (const u of res.data as { role: string }[]) {
      counts[u.role] = (counts[u.role] ?? 0) + 1
    }
    accountCounts.value = counts
  } catch {
    accountCounts.value = null
  }
}

const roleRows = computed(() =>
  Object.entries(definition.value.roles).map(([code, r]) => ({
    code,
    label: r.label || code,
    flags: r.flags ?? [],
    accountCount: accountCounts.value ? (accountCounts.value[code] ?? 0) : null,
  })),
)

const selectedRole = computed(() => definition.value.roles[selectedCode.value] ?? null)
const selectedAccountCount = computed(() =>
  accountCounts.value ? (accountCounts.value[selectedCode.value] ?? 0) : null,
)

// ── 未儲存變更保護：切換角色 / 離開路由 / 關分頁前，若右欄有未儲存變更則詢問 ──
const panelRef = ref<InstanceType<typeof RoleDetailPanel> | null>(null)
const { confirmDiscard } = useUnsavedChangesGuard(() => panelRef.value?.isDirty ?? false)

const selectRole = async (code: string) => {
  if (code === selectedCode.value) return
  if (!(await confirmDiscard())) return
  selectedCode.value = code
}

// ── 新增角色（先建 code/label，權限於右欄補設）──
const createDialogVisible = ref(false)
const createForm = reactive<{ code: string; label: string; description: string }>({ code: '', label: '', description: '' })
const creating = ref(false)

const openCreateDialog = () => {
  createForm.code = ''
  createForm.label = ''
  createForm.description = ''
  createDialogVisible.value = true
}

// 後端 RoleIn 的 code pattern（api/permissions_admin.py）；前端同步驗證，免得填錯要等
// 422 才知道，而 422 的訊息是給開發者看的。
const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const codeError = computed(() => {
  const code = createForm.code.trim()
  if (!code) return ''
  if (!ROLE_CODE_PATTERN.test(code)) return '需以小寫英文字母開頭，只能包含小寫英文、數字與底線'
  if (code.length > 40) return 'code 長度上限 40 字元'
  if (definition.value.roles[code]) return '此 code 已存在'
  return ''
})

const handleCreateRole = async () => {
  const code = createForm.code.trim()
  const label = createForm.label.trim()
  if (!code || !label) {
    ElMessage.warning('請填寫 code 與名稱')
    return
  }
  if (codeError.value) {
    ElMessage.warning(codeError.value)
    return
  }
  if (creating.value) return
  creating.value = true
  try {
    await createRole({ code, label, description: createForm.description.trim() || undefined, permissions: [] })
    ElMessage.success('角色已新增，請於右側設定權限與審核鏈')
    createDialogVisible.value = false
    // 先重新載入定義，再指定選中新角色——避免 fetchDefinition 的「角色不存在於回傳
    // 定義中則重置為第一個角色」防呆邏輯把剛建立的 code 蓋掉。
    await fetchDefinition()
    selectedCode.value = code
  } catch (e) {
    ElMessage.error(apiError(e, '新增失敗'))
  } finally {
    creating.value = false
  }
}

// ── 刪除（RoleDetailPanel 預檢 disabled；此處 confirm + 409 顯示後端 detail）──
const handleDeleteRole = async () => {
  const code = selectedCode.value
  const label = selectedRole.value?.label ?? code
  try {
    await ElMessageBox.confirm(`確定刪除角色「${label}」（code: ${code}）？`, '刪除角色', { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await deleteRole(code)
    ElMessage.success('角色已刪除')
    selectedCode.value = ''
    await fetchDefinition()
  } catch (e) {
    // 409：角色仍在審核鏈中（後端 detail 說明先移除鏈）
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

onMounted(() => {
  fetchDefinition()
  fetchAccountCounts()
})

defineExpose({ roleRows, selectedCode, selectedRole, accountCounts, panelRef, createDialogVisible, createForm, codeError, openCreateDialog, handleCreateRole, handleDeleteRole, fetchDefinition, selectRole })
</script>

<template>
  <div class="settings-page">
    <h2>角色設定</h2>
    <div v-loading="loadingDef" class="roles-layout">
      <!-- 左欄：角色清單 -->
      <aside class="roles-list">
        <el-button type="primary" class="add-role-btn" data-testid="add-role" @click="openCreateDialog">新增角色</el-button>
        <button
          v-for="row in roleRows"
          :key="row.code"
          type="button"
          class="role-item"
          :class="{ 'role-item--active': row.code === selectedCode }"
          :data-role-item="row.code"
          :aria-current="row.code === selectedCode ? 'true' : undefined"
          :aria-label="`${row.label}（${row.code}）${row.accountCount === null ? '' : `，帳號數 ${row.accountCount}`}`"
          @click="selectRole(row.code)"
        >
          <div class="role-item__main">
            <span class="role-item__label">{{ row.label }}</span>
            <code class="role-item__code">{{ row.code }}</code>
          </div>
          <div class="role-item__meta">
            <el-tag v-if="row.flags.includes(FLAG_SUPER_ADMIN)" size="small" type="danger">超級管理員</el-tag>
            <el-tag v-if="row.flags.includes(FLAG_PARENT)" size="small">家長</el-tag>
            <el-tooltip
              v-if="row.accountCount === null"
              content="需要帳號管理的檢視權限才能顯示帳號數"
              placement="top"
            >
              <span class="role-item__count">帳號數 —</span>
            </el-tooltip>
            <span v-else class="role-item__count">帳號數 {{ row.accountCount }}</span>
          </div>
        </button>
      </aside>

      <!-- 右欄：選中角色詳情 -->
      <section class="roles-detail">
        <template v-if="selectedRole">
          <RoleDetailPanel
            ref="panelRef"
            :code="selectedCode"
            :role="selectedRole"
            :definition="definition"
            :account-count="selectedAccountCount"
            :account-counts="accountCounts"
            @saved="fetchDefinition"
            @delete-role="handleDeleteRole"
          />
        </template>
        <el-empty v-else description="請選擇左側角色" />
      </section>
    </div>

    <!-- 新增角色 dialog -->
    <el-dialog v-model="createDialogVisible" title="新增角色" width="480px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="code" :error="codeError">
          <el-input v-model="createForm.code" placeholder="例：custom_principal（建立後不可改）" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="createForm.label" placeholder="例：兼會計園長" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="一句話描述適用對象" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!!codeError" @click="handleCreateRole">建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}

.roles-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.roles-list {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.add-role-btn {
  align-self: flex-start;
  margin-bottom: 4px;
}

.role-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.role-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.role-item--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

/* dark mode：html.ivy-admin（main.css）把 --el-color-primary-light-9 釘死成 light hex
   （#e6f3f9），不隨 html.dark 翻轉，導致選中卡片背景幾乎融入白底、卡片內文字對比不足。
   窄覆寫成 dark 下已翻好的 brand primary alpha tint（--brand-primary-soft，見
   a11y.css 的 html.dark），與 MonthlyPnLPanel.vue 同一 pattern。 */
html.dark .role-item--active {
  background: var(--brand-primary-soft);
}

.role-item__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.role-item__label {
  font-weight: 600;
  color: var(--text-primary);
}

.role-item__code {
  font-size: 12px;
  color: var(--text-tertiary);
}

.role-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.role-item__count {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.roles-detail {
  flex: 1;
  min-width: 0;
}

/* 手機：上下堆疊 */
@media (max-width: 768px) {
  .roles-layout {
    flex-direction: column;
  }

  .roles-list {
    flex: none;
    width: 100%;
  }
}
</style>
