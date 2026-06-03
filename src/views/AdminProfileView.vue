<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getProfile, updateProfile } from '@/api/portal'
import { changePassword } from '@/api/auth'
import { getMyLineBinding, updateMyLineBinding, deleteMyLineBinding } from '@/api/lineBinding'
import { getUserInfo, clearAuth } from '@/utils/auth'
import { PASSWORD_RULES, validatePasswordStrength } from '@/utils/passwordRules'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { apiError } from '@/utils/error'

interface ProfileData {
  employee_id?: string | number
  name?: string
  phone?: string
  address?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  bank_code?: string
  bank_account?: string
  bank_account_name?: string
  classroom?: string
  hire_date?: string
  work_start_time?: string
  work_end_time?: string
  [key: string]: unknown
}

const router = useRouter()
const { notify } = useErrorNotify()

const userInfo = computed(() => getUserInfo() || {})
const hasEmployee = computed(() => (userInfo.value as { employee_id?: unknown }).employee_id != null)

const roleLabel = computed(() => {
  // 優先用 API 回傳的 role_label（後端 7 角色全含）；此 map 僅 role_label 缺失時 fallback，
  // 對齊後端 utils/permissions.py ROLE_LABELS 補齊 principal/accountant/parent。
  const map: Record<string, string> = {
    admin: '系統管理員', principal: '園長', supervisor: '主管',
    hr: '人事', accountant: '會計', teacher: '教師', parent: '家長',
  }
  const u = userInfo.value as { role_label?: string; role?: string }
  return u.role_label || (u.role ? map[u.role] : undefined) || u.role || '-'
})

// ────────────── 員工詳細資料（reuse portal /profile） ──────────────
const loading = ref(false)
const saving = ref(false)
const isEditing = ref(false)
const profile = ref<ProfileData>({})

const form = reactive({
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  bank_code: '',
  bank_account: '',
  bank_account_name: '',
})

const syncForm = (data: ProfileData) => {
  form.phone = data.phone || ''
  form.address = data.address || ''
  form.emergency_contact_name = data.emergency_contact_name || ''
  form.emergency_contact_phone = data.emergency_contact_phone || ''
  form.bank_code = data.bank_code || ''
  form.bank_account = data.bank_account || ''
  form.bank_account_name = data.bank_account_name || ''
}

const fetchProfile = async () => {
  if (!hasEmployee.value) return
  loading.value = true
  try {
    const res = await getProfile()
    profile.value = res.data as ProfileData
    syncForm(res.data as ProfileData)
  } catch (error) {
    notify(error, 'AdminProfile:load', '載入個人資料失敗')
  } finally {
    loading.value = false
  }
}

const startEdit = () => { syncForm(profile.value); isEditing.value = true }
const cancelEdit = () => { syncForm(profile.value); isEditing.value = false }

const saveProfile = async () => {
  saving.value = true
  try {
    await updateProfile({
      phone: form.phone || null,
      address: form.address || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      bank_code: form.bank_code || null,
      bank_account: form.bank_account || null,
      bank_account_name: form.bank_account_name || null,
    })
    ElMessage.success('個人資料已更新')
    isEditing.value = false
    fetchProfile()
  } catch (error) {
    notify(error, 'AdminProfile:update', '更新失敗')
  } finally {
    saving.value = false
  }
}

// ────────────── 修改密碼 ──────────────
const pwdFormRef = ref<{ validate: () => Promise<void> } | null>(null)
const pwdSaving = ref(false)
const pwdForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const validateConfirm = (_: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== pwdForm.new_password) callback(new Error('兩次輸入的密碼不一致'))
  else callback()
}

const pwdRules = {
  old_password: [{ required: true, message: '請輸入目前密碼', trigger: 'blur' }],
  new_password: [
    { required: true, message: '請輸入新密碼', trigger: 'blur' },
    { validator: validatePasswordStrength, trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '請再次輸入新密碼', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' },
  ],
}

const submitPassword = async () => {
  try {
    await pwdFormRef.value?.validate()
  } catch {
    return
  }
  pwdSaving.value = true
  try {
    await changePassword({
      old_password: pwdForm.old_password,
      new_password: pwdForm.new_password,
    })
    ElMessage.success('密碼已更新，請使用新密碼重新登入')
    pwdForm.old_password = ''
    pwdForm.new_password = ''
    pwdForm.confirm_password = ''
    // 後端會發新 token，但為確保安全請使用者重新登入
    setTimeout(() => {
      clearAuth()
      router.push('/login')
    }, 1200)
  } catch (error) {
    ElMessage.error(apiError(error, '修改失敗，請確認目前密碼是否正確'))
  } finally {
    pwdSaving.value = false
  }
}

// ────────────── LINE Bot 綁定 ──────────────
const lineUserId = ref<string | null>(null)
const lineBindInput = ref('')
const loadingLine = ref(false)
const savingLine = ref(false)
const LINE_ID_RE = /^U[0-9a-f]{32}$/

const maskLineId = (id: string) => id ? id.slice(0, 4) + '****' + id.slice(-4) : ''

const fetchLineBinding = async () => {
  if (!hasEmployee.value) return
  loadingLine.value = true
  try {
    const res = await getMyLineBinding()
    lineUserId.value = res.data.line_user_id || null
  } catch {
    // silent
  } finally {
    loadingLine.value = false
  }
}

const saveLineBinding = async () => {
  if (!LINE_ID_RE.test(lineBindInput.value)) {
    ElMessage.error('LINE User ID 格式不正確（應為 U 開頭後接 32 個小寫十六進位字元）')
    return
  }
  savingLine.value = true
  try {
    await updateMyLineBinding({ line_user_id: lineBindInput.value })
    ElMessage.success('LINE 綁定成功')
    lineUserId.value = lineBindInput.value
    lineBindInput.value = ''
  } catch (error) {
    notify(error, 'AdminProfile:lineBindUpdate', 'LINE 綁定失敗')
  } finally {
    savingLine.value = false
  }
}

const removeLineBinding = async () => {
  try {
    await ElMessageBox.confirm('確定要解除 LINE 綁定？', '確認解除', { type: 'warning' })
  } catch {
    return
  }
  savingLine.value = true
  try {
    await deleteMyLineBinding()
    ElMessage.success('LINE 綁定已解除')
    lineUserId.value = null
  } catch (error) {
    notify(error, 'AdminProfile:lineBindDelete', '解除失敗')
  } finally {
    savingLine.value = false
  }
}

onMounted(() => {
  fetchProfile()
  fetchLineBinding()
})
</script>

<template>
  <div class="admin-profile">
    <h2 class="page-title">個人資料</h2>

    <!-- 帳號摘要 -->
    <el-card class="profile-card" shadow="hover">
      <template #header>
        <span class="card-title">帳號資訊</span>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="登入帳號">{{ userInfo.username || '-' }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ userInfo.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="角色">{{ roleLabel }}</el-descriptions-item>
        <el-descriptions-item label="職稱">{{ userInfo.title || '-' }}</el-descriptions-item>
        <el-descriptions-item label="員工編號" :span="2">
          <template v-if="hasEmployee">{{ profile.employee_id || userInfo.employee_id }}</template>
          <el-tag v-else type="info" size="small">未綁定員工資料</el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 員工詳細資料（有 employee_id 才顯示） -->
    <template v-if="hasEmployee">
      <el-card class="profile-card" shadow="hover" v-loading="loading">
        <template #header>
          <span class="card-title">在職資訊</span>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="所屬班級">{{ profile.classroom || '-' }}</el-descriptions-item>
          <el-descriptions-item label="到職日期">{{ profile.hire_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="上班時間">{{ profile.work_start_time || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下班時間">{{ profile.work_end_time || '-' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card class="profile-card" shadow="hover" v-loading="loading">
        <template #header>
          <div class="card-header">
            <span class="card-title">聯絡與帳戶資料</span>
            <el-button v-if="!isEditing" type="primary" size="small" @click="startEdit">編輯</el-button>
          </div>
        </template>

        <el-descriptions v-if="!isEditing" :column="2" border>
          <el-descriptions-item label="聯絡電話">{{ profile.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="通訊地址" :span="2">{{ profile.address || '-' }}</el-descriptions-item>
          <el-descriptions-item label="緊急聯絡人">{{ profile.emergency_contact_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="緊急聯絡人電話">{{ profile.emergency_contact_phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="銀行代碼">{{ profile.bank_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="銀行帳號">{{ profile.bank_account || '-' }}</el-descriptions-item>
          <el-descriptions-item label="帳戶戶名" :span="2">{{ profile.bank_account_name || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-form v-else label-width="120px" class="edit-form">
          <el-divider content-position="left">聯絡資訊</el-divider>
          <el-form-item label="聯絡電話">
            <el-input v-model="form.phone" placeholder="請輸入電話號碼" maxlength="20" />
          </el-form-item>
          <el-form-item label="通訊地址">
            <el-input v-model="form.address" placeholder="請輸入通訊地址" maxlength="200" />
          </el-form-item>

          <el-divider content-position="left">緊急聯絡人</el-divider>
          <el-form-item label="聯絡人姓名">
            <el-input v-model="form.emergency_contact_name" maxlength="50" />
          </el-form-item>
          <el-form-item label="聯絡人電話">
            <el-input v-model="form.emergency_contact_phone" maxlength="20" />
          </el-form-item>

          <el-divider content-position="left">薪轉帳戶</el-divider>
          <el-form-item label="銀行代碼">
            <el-input v-model="form.bank_code" placeholder="例: 700" maxlength="10" />
          </el-form-item>
          <el-form-item label="銀行帳號">
            <el-input v-model="form.bank_account" maxlength="30" />
          </el-form-item>
          <el-form-item label="帳戶戶名">
            <el-input v-model="form.bank_account_name" maxlength="50" />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" @click="saveProfile" :loading="saving">儲存</el-button>
            <el-button @click="cancelEdit">取消</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </template>

    <el-alert
      v-else
      title="此帳號未綁定員工資料"
      type="info"
      description="僅最高管理員或系統帳號會出現此狀況；如需聯絡資訊與薪轉帳戶設定，請使用「進入前台」並切換身份。"
      show-icon
      :closable="false"
      style="margin-bottom: var(--space-4);"
    />

    <!-- 修改密碼 -->
    <el-card class="profile-card" shadow="hover">
      <template #header>
        <span class="card-title">修改密碼</span>
      </template>

      <div class="password-rules">
        <div class="password-rules__title">密碼規則</div>
        <ul class="password-rules__list">
          <li v-for="rule in PASSWORD_RULES" :key="rule">{{ rule }}</li>
        </ul>
      </div>

      <el-form
        ref="pwdFormRef"
        :model="pwdForm"
        :rules="pwdRules"
        label-width="120px"
        class="edit-form"
      >
        <el-form-item label="目前密碼" prop="old_password">
          <el-input v-model="pwdForm.old_password" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item label="新密碼" prop="new_password">
          <el-input v-model="pwdForm.new_password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item label="確認新密碼" prop="confirm_password">
          <el-input v-model="pwdForm.confirm_password" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="pwdSaving" @click="submitPassword">更新密碼</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- LINE Bot 綁定（有員工資料才能綁） -->
    <el-card v-if="hasEmployee" class="profile-card" shadow="hover" v-loading="loadingLine">
      <template #header>
        <div class="card-header">
          <span class="card-title">LINE Bot 綁定</span>
          <el-tag type="warning" size="small">Beta</el-tag>
        </div>
      </template>

      <template v-if="lineUserId">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="LINE User ID">{{ maskLineId(lineUserId) }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 12px;">
          <el-button type="danger" size="small" @click="removeLineBinding" :loading="savingLine">解除綁定</el-button>
        </div>
      </template>

      <template v-else>
        <p style="color: var(--text-secondary); font-size: 13px; margin: 0 0 12px;">
          綁定個人 LINE 帳號後，審核結果與重要通知會直接推播至您的 LINE。
          詳細加好友/取得 User ID 步驟，請前往「進入前台 → 個人資料」。
        </p>
        <el-form label-width="0" style="max-width: 420px;">
          <el-form-item>
            <el-input
              v-model="lineBindInput"
              placeholder="LINE User ID（U 開頭 + 32 個小寫十六進位字元）"
              maxlength="33"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveLineBinding" :loading="savingLine">儲存綁定</el-button>
          </el-form-item>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.admin-profile {
  padding: var(--space-6);
  max-width: 900px;
}

.page-title {
  margin: 0 0 var(--space-4);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
}

.profile-card {
  margin-bottom: var(--space-4);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.edit-form {
  max-width: min(600px, 100%);
}

.password-rules {
  margin-bottom: var(--space-4);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: var(--bg-color-soft, var(--bg-color));
  border: 1px solid var(--border-color-lighter, var(--border-color));
}

.password-rules__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.password-rules__list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

@media (max-width: 768px) {
  .admin-profile {
    padding: var(--space-3);
  }

  :deep(.el-descriptions) {
    --el-descriptions-item-bordered-label-background: var(--bg-color);
  }

  :deep(.el-descriptions__body .el-descriptions__table) {
    table-layout: auto;
  }
}
</style>
