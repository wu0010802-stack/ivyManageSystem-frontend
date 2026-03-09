<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getProfile, updateProfile } from '@/api/portal'

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
    ElMessage.error(error.response?.data?.detail || '載入個人資料失敗')
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
    ElMessage.error(error.response?.data?.detail || '更新失敗')
  } finally {
    saving.value = false
  }
}

onMounted(fetchProfile)
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

@media (max-width: 768px) {
  :deep(.el-descriptions) {
    --el-descriptions-item-bordered-label-background: var(--bg-color);
  }
}
</style>
