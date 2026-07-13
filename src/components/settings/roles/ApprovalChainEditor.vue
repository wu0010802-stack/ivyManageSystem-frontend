<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getApprovalPolicies, updateApprovalPolicies, type ApprovalPolicyRow } from '@/api/approvalSettings'
import { apiError } from '@/utils/error'
import { isSuperAdmin } from '@/utils/auth'
import { DOC_TYPES, DOC_TYPE_LABELS, FLAG_PARENT, type DocType, type RolesDefinition } from './types'

const props = defineProps<{
  submitterRole: string
  definition: RolesDefinition
  accountCounts: Record<string, number> | null
}>()

const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const stageNo = (i: number) => CIRCLED_DIGITS[i] || `${i + 1}.`
const roleLabel = (code: string) => props.definition.roles[code]?.label || code

// PUT 後端限 SETTINGS_WRITE + super_admin（DB 即時查）；前端只控 UI 可見性
const canEdit = isSuperAdmin()

const policies = ref<ApprovalPolicyRow[]>([])
const loading = ref(false)
const loadError = ref(false)

const fetchPolicies = async () => {
  loading.value = true
  loadError.value = false
  try {
    const res = await getApprovalPolicies()
    policies.value = res.data
  } catch {
    loadError.value = true // 無 SETTINGS_READ 或網路錯誤：整區降級
  } finally {
    loading.value = false
  }
}

const activeDocType = ref<DocType>('all')

const findActivePolicy = (docType: string): ApprovalPolicyRow | undefined =>
  policies.value.find((p) => p.submitter_role === props.submitterRole && p.doc_type === docType && p.is_active)

const parseChain = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean)

const currentPolicy = computed(() => findActivePolicy(activeDocType.value))
const fallbackAllPolicy = computed(() => findActivePolicy('all'))

// 草稿：uid 供 draggable item-key（同角色可重複入鏈）
interface StageItem { uid: number; role: string }
let uidSeq = 0
const chainDraft = ref<StageItem[]>([])
// 特定 doc_type 未覆寫時，按「建立專屬關卡鏈」才進入編輯
const overrideEditing = ref(false)

const syncDraft = () => {
  overrideEditing.value = false
  const p = currentPolicy.value
  chainDraft.value = p ? parseChain(p.approver_roles).map((role) => ({ uid: ++uidSeq, role })) : []
}
watch([activeDocType, () => props.submitterRole, policies], syncDraft, { immediate: true })

// 特定 doc_type：有覆寫或已按「建立覆寫」才顯示編輯區；all 恆為編輯區
const showChainArea = computed(() => activeDocType.value === 'all' || !!currentPolicy.value || overrideEditing.value)

const startOverride = () => {
  const base = fallbackAllPolicy.value ? parseChain(fallbackAllPolicy.value.approver_roles) : []
  chainDraft.value = base.map((role) => ({ uid: ++uidSeq, role }))
  overrideEditing.value = true
}

// 候選角色排除 parent flag（後端 400 兜底）；super_admin 角色可作一般關卡（spec §4.1）
const candidateRoles = computed(() =>
  Object.entries(props.definition.roles)
    .filter(([, r]) => !(r.flags ?? []).includes(FLAG_PARENT))
    .map(([code, r]) => ({ code, label: r.label || code })),
)

const stageToAdd = ref('')
const addStage = () => {
  if (!stageToAdd.value) return
  chainDraft.value.push({ uid: ++uidSeq, role: stageToAdd.value })
  stageToAdd.value = ''
}
const removeStage = (i: number) => {
  chainDraft.value.splice(i, 1)
}

// 死鎖偵測（spec §4.1 M10）：僅提示不阻擋——super_admin 終核可解套
const warnings = computed(() => {
  const counts = props.accountCounts
  if (!counts) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of chainDraft.value) {
    if (seen.has(s.role)) continue
    seen.add(s.role)
    const count = counts[s.role] ?? 0
    const label = roleLabel(s.role)
    if (count === 0) {
      out.push(`「${label}」目前沒有任何帳號，該關卡僅超級管理員可代簽`)
    }
    if (s.role === props.submitterRole && count <= 1) {
      out.push(`「${label}」與申請人同角色且僅 ${count} 個帳號：本人送單時無人可簽（自審死鎖），需超級管理員終核`)
    }
  }
  return out
})

const chainText = (roles: string[]) => roles.map((r, i) => `${stageNo(i)}${roleLabel(r)}`).join(' → ')

const saving = ref(false)
const saveChain = async () => {
  const roles = chainDraft.value.map((s) => s.role)
  if (roles.length === 0) {
    ElMessage.warning('關卡鏈至少需要 1 個角色')
    return
  }
  try {
    await ElMessageBox.confirm(
      `「${roleLabel(props.submitterRole)}」送出的「${DOC_TYPE_LABELS[activeDocType.value]}」簽呈將依以下順序逐級簽核：${chainText(roles)}。確定儲存？`,
      '儲存關卡鏈',
      { type: 'warning', confirmButtonText: '儲存', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    await updateApprovalPolicies([
      { submitter_role: props.submitterRole, doc_type: activeDocType.value, approver_roles: roles.join(','), is_active: true },
    ])
    ElMessage.success('審核鏈已更新')
    await fetchPolicies()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

const removeOverride = async () => {
  const p = currentPolicy.value
  if (!p) return
  try {
    await ElMessageBox.confirm(
      `移除「${DOC_TYPE_LABELS[activeDocType.value]}」的專屬關卡鏈，改為沿用共同設定（all）？`,
      '移除覆寫',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    // 政策無 DELETE 端點：is_active=false 即失效，引擎 fallback 到 all
    await updateApprovalPolicies([
      { submitter_role: p.submitter_role, doc_type: p.doc_type, approver_roles: p.approver_roles, is_active: false },
    ])
    ElMessage.success('已改為沿用共同設定')
    await fetchPolicies()
  } catch (e) {
    ElMessage.error(apiError(e, '移除失敗'))
  }
}

onMounted(fetchPolicies)

defineExpose({ policies, activeDocType, chainDraft, overrideEditing, startOverride, stageToAdd, addStage, removeStage, saveChain, removeOverride, warnings, candidateRoles, fetchPolicies })
</script>

<template>
  <el-card shadow="never" class="chain-editor" :body-style="{ paddingTop: '12px' }">
    <template #header>
      <div class="chain-header">
        <span class="chain-title">簽呈審核關卡鏈</span>
        <el-radio-group v-model="activeDocType" size="small">
          <el-radio-button v-for="dt in DOC_TYPES" :key="dt" :value="dt">{{ DOC_TYPE_LABELS[dt] }}</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-alert v-if="loadError" type="warning" :closable="false" title="無法載入審核政策（需要一般設定讀取權限）" />
    <div v-else v-loading="loading">
      <el-alert v-if="!canEdit" type="info" :closable="false" title="僅超級管理員可修改審核流程，以下為唯讀檢視" class="chain-alert" />
      <div class="superadmin-note">👑 超級管理員：任何關卡皆可代簽，並可終核整張（無需列入關卡鏈）</div>

      <!-- 未覆寫的特定 doc_type：沿用 all 預覽 -->
      <template v-if="!showChainArea">
        <div class="fallback-preview">
          <el-tag type="info" size="small">沿用共同設定（all）</el-tag>
          <span v-if="fallbackAllPolicy" class="chain-text">{{ chainText(parseChain(fallbackAllPolicy.approver_roles)) }}</span>
          <span v-else class="chain-text chain-text--failsafe">未設定審核鏈：此角色成員送出的簽呈僅超級管理員可核准（fail-safe）</span>
        </div>
        <el-button v-if="canEdit" size="small" data-testid="start-override" @click="startOverride">建立此類型的專屬關卡鏈</el-button>
      </template>

      <!-- 編輯區 -->
      <template v-else>
        <div v-if="chainDraft.length === 0" class="chain-empty">
          尚未設定關卡：此角色成員送出的簽呈僅超級管理員可核准（fail-safe）。
        </div>
        <draggable v-model="chainDraft" item-key="uid" handle=".stage-handle" :disabled="!canEdit" class="stage-list">
          <template #item="{ element, index }">
            <div class="stage-item" :data-stage-role="element.role">
              <span v-if="canEdit" class="stage-handle" aria-label="拖拉調整順序">⠿</span>
              <span class="stage-no">{{ stageNo(index) }}</span>
              <span class="stage-label">{{ roleLabel(element.role) }}</span>
              <el-button v-if="canEdit" link type="danger" class="stage-remove" @click="removeStage(index)">移除</el-button>
            </div>
          </template>
        </draggable>

        <div v-if="canEdit" class="stage-add">
          <el-select v-model="stageToAdd" placeholder="選擇要加入的關卡角色" size="small" style="width: 200px;">
            <el-option v-for="c in candidateRoles" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <el-button size="small" data-testid="add-stage" @click="addStage">加入關卡</el-button>
        </div>

        <el-alert v-for="(warning, i) in warnings" :key="i" type="warning" :closable="false" :title="warning" class="chain-alert" />

        <div v-if="canEdit" class="chain-actions">
          <el-button type="primary" size="small" :loading="saving" data-testid="save-chain" @click="saveChain">儲存關卡鏈</el-button>
          <el-button v-if="activeDocType !== 'all' && currentPolicy" size="small" data-testid="remove-override" @click="removeOverride">
            移除覆寫（沿用共同設定）
          </el-button>
        </div>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.chain-editor {
  margin-top: 16px;
}

.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chain-title {
  font-weight: 600;
}

.superadmin-note {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.fallback-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.chain-text {
  font-size: 14px;
  color: var(--text-primary);
}

.chain-text--failsafe {
  color: var(--text-tertiary);
}

.chain-empty {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}

.stage-handle {
  cursor: grab;
  color: var(--text-tertiary);
  user-select: none;
}

.stage-no {
  font-weight: 600;
  color: var(--el-color-primary);
}

.stage-label {
  flex: 1;
}

.stage-add {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.chain-alert {
  margin-bottom: 8px;
}

.chain-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
