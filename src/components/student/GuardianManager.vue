<template>
  <div class="guardian-manager">
    <div class="toolbar">
      <div class="toolbar-info">
        <el-tag v-if="primaryGuardian" type="success" size="small">
          主要聯絡人：{{ primaryGuardian.name }}
        </el-tag>
        <el-tag v-else type="warning" size="small">尚未設定主要聯絡人</el-tag>
      </div>
      <el-button
        v-if="canWrite"
        type="primary"
        size="small"
        @click="openCreateDialog"
      >
        ＋ 新增監護人
      </el-button>
    </div>

    <el-table
      :data="guardians"
      v-loading="loading"
      border
      stripe
      style="width: 100%; margin-top: 12px"
      empty-text="尚無監護人資料"
    >
      <el-table-column label="姓名" prop="name" width="110" />
      <el-table-column label="關係" prop="relation" width="90" align="center" />
      <el-table-column label="電話" prop="phone" width="140" />
      <el-table-column label="Email" prop="email" min-width="160" show-overflow-tooltip />
      <el-table-column label="旗標" width="210" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.is_primary" type="success" size="small" style="margin-right: 4px">主要</el-tag>
          <el-tag v-if="row.is_emergency" type="danger" size="small" style="margin-right: 4px">緊急</el-tag>
          <el-tag v-if="row.can_pickup" type="warning" size="small">可接送</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="備註" prop="custody_note" min-width="140" show-overflow-tooltip />
      <el-table-column v-if="canWrite" label="操作" width="360" align="center" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button size="small" @click="openEditDialog(row)">編輯</el-button>
            <el-button size="small" type="primary" plain @click="handleIssueBindingCode(row)">發碼</el-button>
            <el-button size="small" type="primary" plain @click="handleIssueDeviceSetupCode(row)">設定碼</el-button>
            <el-button size="small" type="warning" plain @click="handleRevokeDevices(row)">撤銷裝置</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">刪除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增 / 編輯 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增監護人' : '編輯監護人'"
      width="520px"
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="關係" prop="relation">
          <el-select v-model="form.relation" placeholder="請選擇" clearable style="width: 100%">
            <el-option v-for="r in relationOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="電話" prop="phone">
          <el-input v-model="form.phone" placeholder="0912-345-678" />
        </el-form-item>
        <el-form-item label="Email" prop="email">
          <el-input v-model="form.email" placeholder="選填" />
        </el-form-item>
        <el-form-item label="角色旗標">
          <div class="flags">
            <el-checkbox v-model="form.is_primary">主要聯絡人</el-checkbox>
            <el-checkbox v-model="form.is_emergency">緊急聯絡人</el-checkbox>
            <el-checkbox v-model="form.can_pickup">授權接送</el-checkbox>
          </div>
          <div class="flag-hint">主要聯絡人每位學生至多一位，設定時會自動取代舊的主要聯絡人。</div>
        </el-form-item>
        <el-form-item label="備註" prop="custody_note">
          <el-input
            v-model="form.custody_note"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="如：離婚探視、單方監護等"
          />
        </el-form-item>
        <el-form-item label="排序" prop="sort_order">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">儲存</el-button>
      </template>
    </el-dialog>

    <!-- 綁定碼簽發結果 Dialog（明碼僅顯示一次，DB 只存 sha256） -->
    <el-dialog
      v-model="bindingCodeVisible"
      title="家長 LINE 綁定碼"
      width="420px"
      :close-on-click-modal="false"
      @closed="bindingCode = ''"
    >
      <el-alert
        type="warning"
        :closable="false"
        title="請立即抄寫並交給家長：此碼僅顯示一次，關閉後無法再查看。"
        style="margin-bottom: 12px;"
      />
      <div class="binding-code-display">
        <span class="binding-code-text">{{ bindingCode }}</span>
        <el-button size="small" @click="copyBindingCode">複製</el-button>
      </div>
      <div class="binding-code-meta">
        過期時間：{{ bindingCodeExpiresAt || '—' }}（預設 24 小時，一次性使用）
      </div>
      <template #footer>
        <el-button type="primary" @click="bindingCodeVisible = false">我已抄寫</el-button>
      </template>
    </el-dialog>

    <!-- 裝置設定碼簽發結果 Dialog（明碼僅顯示一次，DB 只存 sha256）。
         跟上面的 LINE 綁定碼是兩支獨立端點/資料表，文案刻意強調差異，
         避免行政人員把兩種碼搞混發錯。 -->
    <el-dialog
      v-model="deviceSetupCodeVisible"
      title="家長裝置設定碼"
      width="420px"
      :close-on-click-modal="false"
      @closed="deviceSetupCode = ''"
    >
      <el-alert
        type="warning"
        :closable="false"
        title="請立即抄寫並交給家長：此碼僅顯示一次，關閉後無法再查看。"
        style="margin-bottom: 12px;"
      />
      <el-alert
        type="info"
        :closable="false"
        title="跟 LINE 綁定碼不同：這是給沒有 LINE 或換新手機的家長，在登入頁直接輸入即可登入，不需要先加 LINE 好友。"
        style="margin-bottom: 12px;"
      />
      <div class="binding-code-display">
        <span class="binding-code-text">{{ deviceSetupCode }}</span>
        <el-button size="small" @click="copyDeviceSetupCode">複製</el-button>
      </div>
      <div class="binding-code-meta">
        過期時間：{{ deviceSetupCodeExpiresAt || '—' }}（預設 24 小時，一次性使用）
      </div>

      <!--
        家長端網址。設定碼是「在登入頁輸入」才有用的東西，但這個彌窗原本只給碼，
        職員還得另外口頭告訴家長要去哪裡輸入。網址以目前後台的網域推導
        （window.location.origin），多租戶下自動對應正確的分校網域。
      -->
      <div class="parent-url-label">家長要開啟的網址</div>
      <div class="binding-code-display parent-url-display">
        <span class="parent-url-text">{{ parentAppUrl }}</span>
        <el-button size="small" @click="copyParentAppUrl">複製</el-button>
      </div>

      <template #footer>
        <el-button @click="copyDeviceSetupMessage">複製網址與設定碼</el-button>
        <el-button type="primary" @click="deviceSetupCodeVisible = false">我已抄寫</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import {
  createGuardian,
  createGuardianBindingCode,
  createGuardianDeviceSetupCode,
  deleteGuardian,
  listGuardians,
  revokeGuardianDevices,
  updateGuardian,
} from '@/api/students'
import { hasPermission } from '@/utils/auth'
import { apiError } from '@/utils/error'

const props = defineProps<{ studentId: number }>()
const emit = defineEmits<{ 'change': [] }>()

const relationOptions = ['父親', '母親', '祖父', '祖母', '外公', '外婆', '監護人', '其他']
const canWrite = computed(() => hasPermission('GUARDIANS_WRITE'))

interface Guardian {
  id?: number | null
  name: string
  phone?: string | null
  email?: string | null
  relation?: string | null
  is_primary: boolean
  is_emergency: boolean
  can_pickup: boolean
  custody_note?: string | null
  sort_order: number
  [key: string]: unknown
}
const guardians = ref<Guardian[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref('create')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): Guardian => ({
  id: null,
  name: '',
  phone: '',
  email: '',
  relation: null,
  is_primary: false,
  is_emergency: false,
  can_pickup: false,
  custody_note: '',
  sort_order: 0,
})
const form = reactive(emptyForm())

const formRules: FormRules = {
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  phone: [
    {
      pattern: /^[\d\-+() ]{7,20}$/,
      message: '電話格式不正確',
      trigger: 'blur',
    },
  ],
  email: [{ type: 'email', message: 'Email 格式不正確', trigger: 'blur' }],
}

const primaryGuardian = computed(() => guardians.value.find((g) => g.is_primary) || null)

async function fetchGuardians() {
  if (!props.studentId) return
  loading.value = true
  try {
    const { data } = await listGuardians(props.studentId)
    guardians.value = (data as { items?: Guardian[] }).items || []
  } catch (err) {
    ElMessage.error(apiError(err, '讀取監護人失敗'))
  } finally {
    loading.value = false
  }
}

function resetForm() {
  Object.assign(form, emptyForm())
  formRef.value?.clearValidate()
}

function openCreateDialog() {
  dialogMode.value = 'create'
  resetForm()
  // 若尚無主要聯絡人，預設勾選
  form.is_primary = !primaryGuardian.value
  dialogVisible.value = true
}

function openEditDialog(row: Guardian) {
  dialogMode.value = 'edit'
  Object.assign(form, { ...emptyForm(), ...row })
  dialogVisible.value = true
}

async function handleSave() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  saving.value = true
  try {
    const payload = { ...form }
    // 後端 PATCH 不接受 null phone 以外的空值，去除 null
    if (payload.phone === '') payload.phone = null
    if (payload.email === '') payload.email = null
    if (payload.custody_note === '') payload.custody_note = null

    if (dialogMode.value === 'create') {
      delete payload.id
      await createGuardian(props.studentId, payload)
      ElMessage.success('新增成功')
    } else {
      const id = payload.id as number
      delete payload.id
      await updateGuardian(id, payload)
      ElMessage.success('更新成功')
    }
    dialogVisible.value = false
    await fetchGuardians()
    emit('change')
  } catch (err) {
    ElMessage.error(apiError(err, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: Guardian) {
  try {
    await ElMessageBox.confirm(
      `確定要刪除監護人「${row.name}」嗎？`,
      '確認刪除',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteGuardian(row.id as number)
    ElMessage.success('已刪除')
    await fetchGuardians()
    emit('change')
  } catch (err) {
    ElMessage.error(apiError(err, '刪除失敗'))
  }
}

// 家長綁定碼簽發
const bindingCodeVisible = ref(false)
const bindingCode = ref('')
const bindingCodeExpiresAt = ref('')

async function handleIssueBindingCode(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要為「${row.name}」簽發 LINE 綁定碼嗎？\n明碼僅顯示一次，請務必當下抄寫並當面交給家長。`,
      '簽發綁定碼',
      { type: 'warning', confirmButtonText: '確定簽發' },
    )
  } catch {
    return
  }
  try {
    const { data } = await createGuardianBindingCode(row.id as number)
    bindingCode.value = data?.code || ''
    bindingCodeExpiresAt.value = data?.expires_at
      ? data.expires_at.replace('T', ' ').slice(0, 16)
      : ''
    bindingCodeVisible.value = true
  } catch (err) {
    ElMessage.error(apiError(err, '簽發失敗'))
  }
}

async function copyBindingCode() {
  if (!bindingCode.value) return
  try {
    await navigator.clipboard.writeText(bindingCode.value)
    ElMessage.success('已複製到剪貼簿')
  } catch {
    ElMessage.warning('瀏覽器不支援複製，請手動抄寫')
  }
}

// 裝置設定碼簽發（無 LINE / 換新手機的家長直接登入用；跟上面的 LINE 綁定碼
// 是兩支獨立端點，文案務必區隔避免行政人員發錯碼）
const deviceSetupCodeVisible = ref(false)
const deviceSetupCode = ref('')
const deviceSetupCodeExpiresAt = ref('')

async function handleIssueDeviceSetupCode(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要為「${row.name}」簽發裝置設定碼嗎？\n此碼可讓沒有 LINE 或換新手機的家長直接登入（跟 LINE 綁定碼不同，不需要先加 LINE 好友）。明碼僅顯示一次，請務必當下抄寫並當面交給家長。`,
      '簽發裝置設定碼',
      { type: 'warning', confirmButtonText: '確定簽發' },
    )
  } catch {
    return
  }
  try {
    const { data } = await createGuardianDeviceSetupCode(row.id as number)
    deviceSetupCode.value = data?.code || ''
    deviceSetupCodeExpiresAt.value = data?.expires_at
      ? data.expires_at.replace('T', ' ').slice(0, 16)
      : ''
    deviceSetupCodeVisible.value = true
  } catch (err) {
    ElMessage.error(apiError(err, '簽發失敗'))
  }
}

async function copyDeviceSetupCode() {
  if (!deviceSetupCode.value) return
  try {
    await navigator.clipboard.writeText(deviceSetupCode.value)
    ElMessage.success('已複製到剪貼簿')
  } catch {
    ElMessage.warning('瀏覽器不支援複製，請手動抄寫')
  }
}

/**
 * 家長端網址。
 *
 * 以目前後台的網域推導，多租戶下自動對應正確的分校（義華 / 仁武各自的
 * 子網域），不寫死任何品牌網址。家長端是獨立 entry（parent.html）+ hash router。
 */
const parentAppUrl = computed<string>(() => {
  if (typeof window === 'undefined') return '/parent.html'
  return `${window.location.origin}/parent.html`
})

async function copyParentAppUrl() {
  try {
    await navigator.clipboard.writeText(parentAppUrl.value)
    ElMessage.success('已複製家長端網址')
  } catch {
    ElMessage.warning('瀏覽器不支援複製，請手動抄寫')
  }
}

/** 職員實際要做的事就是把網址與碼一起傳給家長，這裡一次備好可直接貼上的訊息。 */
async function copyDeviceSetupMessage() {
  if (!deviceSetupCode.value) return
  const lines = [
    `請開啟：${parentAppUrl.value}`,
    `設定碼：${deviceSetupCode.value}`,
  ]
  if (deviceSetupCodeExpiresAt.value) {
    lines.push(`有效期限：${deviceSetupCodeExpiresAt.value}（一次性使用）`)
  }
  try {
    await navigator.clipboard.writeText(lines.join('\n'))
    ElMessage.success('已複製網址與設定碼')
  } catch {
    ElMessage.warning('瀏覽器不支援複製，請手動抄寫')
  }
}

// 撤銷此監護人對應家長帳號的所有裝置（危險操作，二次確認）
async function handleRevokeDevices(row: Record<string, unknown>) {
  try {
    await ElMessageBox.confirm(
      `確定要撤銷「${row.name}」的所有裝置嗎？\n該監護人目前已登入的所有裝置（含 LINE 裝置）都會立即登出，需要重新綁定或用新的設定碼登入。`,
      '撤銷所有裝置',
      { type: 'warning', confirmButtonText: '確定撤銷' },
    )
  } catch {
    return
  }
  try {
    const { data } = await revokeGuardianDevices(row.id as number)
    const count = (data as { revoked?: number })?.revoked ?? 0
    ElMessage.success(count > 0 ? `已撤銷 ${count} 個裝置` : '此監護人目前沒有已登入的裝置')
  } catch (err) {
    ElMessage.error(apiError(err, '撤銷失敗'))
  }
}

defineExpose({ refresh: fetchGuardians })

onMounted(fetchGuardians)
watch(() => props.studentId, fetchGuardians)
</script>

<style scoped>
.guardian-manager {
  width: 100%;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.toolbar-info {
  display: flex;
  gap: 8px;
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.row-actions .el-button {
  margin-left: 0;
}
.flags {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.flag-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.binding-code-display {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  margin-bottom: 8px;
}
.binding-code-text {
  font-family: ui-monospace, "Menlo", monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 4px;
  user-select: all;
}
.binding-code-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.parent-url-label {
  margin-top: 14px;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}
/* 網址不是要人唸出來的字串，字級與字距都收斂，別跟設定碼搶視覺重量 */
.parent-url-display {
  margin-bottom: 0;
}
.parent-url-text {
  flex: 1;
  min-width: 0;
  font-family: ui-monospace, "Menlo", monospace;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
  user-select: all;
}
</style>
