<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import QRCode from 'qrcode'
import { getProfile, updateProfile } from '@/api/portal'
import { getMyLineBinding, updateMyLineBinding, deleteMyLineBinding } from '@/api/lineBinding'
import { apiError } from '@/utils/error'

const lineBotFriendUrl = import.meta.env.VITE_LINE_BOT_FRIEND_URL || ''

const loading = ref(false)
const saving = ref(false)
const isEditing = ref(false)

const isMobile = ref(window.innerWidth < 768)
const checkMobile = () => { isMobile.value = window.innerWidth < 768 }
onMounted(() => window.addEventListener('resize', checkMobile))
onUnmounted(() => window.removeEventListener('resize', checkMobile))

const profile = ref({})

const form = reactive({
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  bank_code: '',
  bank_account: '',
  bank_account_name: '',
})

const fetchProfile = async () => {
  loading.value = true
  try {
    const res = await getProfile()
    profile.value = res.data
    syncForm(res.data)
  } catch (error) {
    ElMessage.error(apiError(error, '載入個人資料失敗'))
  } finally {
    loading.value = false
  }
}

const syncForm = (data) => {
  form.phone = data.phone || ''
  form.address = data.address || ''
  form.emergency_contact_name = data.emergency_contact_name || ''
  form.emergency_contact_phone = data.emergency_contact_phone || ''
  form.bank_code = data.bank_code || ''
  form.bank_account = data.bank_account || ''
  form.bank_account_name = data.bank_account_name || ''
}

const startEdit = () => {
  syncForm(profile.value)
  isEditing.value = true
}

const cancelEdit = () => {
  syncForm(profile.value)
  isEditing.value = false
}

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
    ElMessage.error(apiError(error, '更新失敗'))
  } finally {
    saving.value = false
  }
}

// ---- LINE 綁定 ----
const lineUserId = ref(null)
const lineBindInput = ref('')
const loadingLine = ref(false)
const savingLine = ref(false)
const lineBotQrDataUrl = ref('')
const LINE_ID_RE = /^U[0-9a-f]{32}$/

const generateLineBotQr = async () => {
  if (!lineBotFriendUrl) return
  try {
    lineBotQrDataUrl.value = await QRCode.toDataURL(lineBotFriendUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1f2937', light: '#ffffff' },
    })
  } catch {
    lineBotQrDataUrl.value = ''
  }
}

const copyLineBotUrl = async () => {
  if (!lineBotFriendUrl) return
  try {
    await navigator.clipboard.writeText(lineBotFriendUrl)
    ElMessage.success('連結已複製')
  } catch {
    ElMessage.error('複製失敗，請手動長按連結')
  }
}

const fetchLineBinding = async () => {
  loadingLine.value = true
  try {
    const res = await getMyLineBinding()
    lineUserId.value = res.data.line_user_id || null
  } catch {
    // 靜默失敗
  } finally {
    loadingLine.value = false
  }
}

const maskLineId = (id) => {
  if (!id) return ''
  return id.slice(0, 4) + '****' + id.slice(-4)
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
    ElMessage.error(apiError(error, 'LINE 綁定失敗'))
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
    lineBindInput.value = ''
  } catch (error) {
    ElMessage.error(apiError(error, '解除失敗'))
  } finally {
    savingLine.value = false
  }
}

onMounted(() => {
  fetchProfile()
  fetchLineBinding()
  generateLineBotQr()
})
</script>

<template>
  <div class="portal-profile" v-loading="loading">
    <h3 style="margin: 0 0 16px;">個人資料</h3>

    <!-- Read-only: Basic Info -->
    <el-card class="profile-card" shadow="hover">
      <template #header>
        <span class="card-title">基本資料</span>
      </template>
      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="工號">{{ profile.employee_id }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ profile.name }}</el-descriptions-item>
        <el-descriptions-item label="職稱">{{ profile.job_title || '-' }}</el-descriptions-item>
        <el-descriptions-item label="職務">{{ profile.position || '-' }}</el-descriptions-item>
        <el-descriptions-item label="所屬班級">{{ profile.classroom || '-' }}</el-descriptions-item>
        <el-descriptions-item label="到職日期">{{ profile.hire_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="上班時間">{{ profile.work_start_time || '-' }}</el-descriptions-item>
        <el-descriptions-item label="下班時間">{{ profile.work_end_time || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- Editable: Personal Info -->
    <el-card class="profile-card" shadow="hover">
      <template #header>
        <div class="card-header">
          <span class="card-title">聯絡與帳戶資料</span>
          <el-button v-if="!isEditing" type="primary" size="small" @click="startEdit">編輯</el-button>
        </div>
      </template>

      <!-- View Mode -->
      <el-descriptions v-if="!isEditing" :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="聯絡電話">{{ profile.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="通訊地址" :span="2">{{ profile.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="緊急聯絡人">{{ profile.emergency_contact_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="緊急聯絡人電話">{{ profile.emergency_contact_phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="銀行代碼">{{ profile.bank_code || '-' }}</el-descriptions-item>
        <el-descriptions-item label="銀行帳號">{{ profile.bank_account || '-' }}</el-descriptions-item>
        <el-descriptions-item label="帳戶戶名">{{ profile.bank_account_name || '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- Edit Mode -->
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
          <el-input v-model="form.emergency_contact_name" placeholder="請輸入緊急聯絡人姓名" maxlength="50" />
        </el-form-item>
        <el-form-item label="聯絡人電話">
          <el-input v-model="form.emergency_contact_phone" placeholder="請輸入緊急聯絡人電話" maxlength="20" />
        </el-form-item>

        <el-divider content-position="left">薪轉帳戶</el-divider>
        <el-form-item label="銀行代碼">
          <el-input v-model="form.bank_code" placeholder="例: 700" maxlength="10" />
        </el-form-item>
        <el-form-item label="銀行帳號">
          <el-input v-model="form.bank_account" placeholder="請輸入帳號" maxlength="30" />
        </el-form-item>
        <el-form-item label="帳戶戶名">
          <el-input v-model="form.bank_account_name" placeholder="請輸入戶名" maxlength="50" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="saveProfile" :loading="saving">儲存</el-button>
          <el-button @click="cancelEdit">取消</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- LINE Bot 綁定 -->
    <el-card class="profile-card" shadow="hover" v-loading="loadingLine">
      <template #header>
        <div class="card-header">
          <span class="card-title">LINE Bot 綁定</span>
          <el-tag type="warning" size="small">Beta</el-tag>
        </div>
      </template>

      <!-- 已綁定 -->
      <template v-if="lineUserId">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="LINE User ID">{{ maskLineId(lineUserId) }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 12px;">
          <el-button type="danger" size="small" @click="removeLineBinding" :loading="savingLine">解除綁定</el-button>
        </div>
      </template>

      <!-- 未綁定 -->
      <template v-else>
        <p style="color: #606266; font-size: 13px; margin: 0 0 12px;">
          綁定個人 LINE 帳號後，可透過 LINE Bot 查詢薪資、假單、打卡，<br>
          且審核結果將直接推播至您的 LINE。
        </p>

        <!-- 步驟說明 + QR code -->
        <div class="line-bind-guide">
          <div class="line-bind-steps">
            <div class="step-title">綁定步驟</div>
            <ol class="step-list">
              <li>用手機 LINE 掃描右側 QR code（或點下方按鈕）加本校 Bot 為好友</li>
              <li>加好友後 Bot 會自動回覆一串 <code>U</code> 開頭的 User ID</li>
              <li>長按複製該 ID，貼入下方欄位儲存</li>
            </ol>
            <div v-if="lineBotFriendUrl" class="line-bind-actions">
              <el-button
                type="success"
                tag="a"
                :href="lineBotFriendUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                <el-icon style="margin-right: 4px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/></svg></el-icon>
                在手機上開啟 LINE 加好友
              </el-button>
              <el-button @click="copyLineBotUrl">複製連結</el-button>
            </div>
            <p v-else class="line-bot-url-missing">
              ⚠ 尚未設定 Bot 加好友連結，請聯絡系統管理員於前端 <code>.env</code> 設定 <code>VITE_LINE_BOT_FRIEND_URL</code>
            </p>
          </div>

          <div v-if="lineBotQrDataUrl" class="line-bind-qr">
            <img :src="lineBotQrDataUrl" alt="LINE Bot QR code" />
            <div class="qr-caption">手機掃我加好友</div>
          </div>
        </div>

        <el-form label-width="0" style="max-width: 420px; margin-top: 16px;">
          <el-form-item>
            <el-input
              v-model="lineBindInput"
              placeholder="請輸入 LINE User ID（如 Uabcd1234...）"
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
.portal-profile {
  padding: 10px;
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

.line-bind-guide {
  display: flex;
  gap: 20px;
  align-items: flex-start;
  padding: 14px;
  background: var(--bg-color, #fafafa);
  border-radius: 8px;
  border: 1px solid var(--border-color-lighter, #ebeef5);
}

.line-bind-steps {
  flex: 1;
  min-width: 0;
}

.step-title {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.step-list {
  margin: 0 0 10px;
  padding-left: 20px;
  font-size: 13px;
  color: var(--text-regular, #606266);
  line-height: 1.7;
}

.step-list code {
  background: rgba(0, 0, 0, 0.05);
  padding: 0 4px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
}

.line-bind-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.line-bind-qr {
  flex-shrink: 0;
  text-align: center;
}

.line-bind-qr img {
  display: block;
  width: 160px;
  height: 160px;
  border-radius: 6px;
  border: 1px solid var(--border-color-lighter, #ebeef5);
  background: #fff;
}

.qr-caption {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary, #909399);
}

.line-bot-url-missing {
  margin: 8px 0 0;
  padding: 8px 10px;
  background: #fff7e6;
  border: 1px solid #ffe1a8;
  border-radius: 4px;
  font-size: 12px;
  color: #b88230;
}

.line-bot-url-missing code {
  background: rgba(0, 0, 0, 0.06);
  padding: 0 4px;
  border-radius: 3px;
  font-family: ui-monospace, monospace;
}

@media (max-width: 768px) {
  :deep(.el-descriptions) {
    --el-descriptions-item-bordered-label-background: var(--bg-color);
  }

  .line-bind-guide {
    flex-direction: column-reverse;
    align-items: center;
  }

  .line-bind-steps {
    width: 100%;
  }
}
</style>
