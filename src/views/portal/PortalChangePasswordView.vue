<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance } from 'element-plus'
import { Lock } from '@element-plus/icons-vue'
import { changePassword } from '@/api/auth'
import { clearMustChangePassword, getUserInfo } from '@/utils/auth'
import { PASSWORD_RULES, validatePasswordStrength } from '@/utils/passwordRules'
import { apiError } from '@/utils/error'

const router = useRouter()
const loading = ref(false)
const formRef = ref<FormInstance | null>(null)
const userInfo = getUserInfo()

const form = reactive({
  old_password: '',
  new_password: '',
  confirm_password: '',
})

const validateConfirm = (_: unknown, value: string, callback: (err?: Error) => void) => {
  if (value !== form.new_password) {
    callback(new Error('兩次輸入的密碼不一致'))
  } else {
    callback()
  }
}

const rules = {
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

const handleSubmit = async () => {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    await changePassword({
      old_password: form.old_password,
      new_password: form.new_password,
    })
    clearMustChangePassword()
    ElMessage.success('密碼修改成功')
    router.push('/portal/home')
  } catch (error) {
    ElMessage.error(apiError(error, '修改失敗，請確認目前密碼是否正確'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="change-password-page">
    <div class="change-password-card">
      <div class="header">
        <el-icon class="lock-icon" aria-hidden="true"><Lock /></el-icon>
        <h2>請修改初始密碼</h2>
        <p>為確保帳號安全，請立即設定您的新密碼</p>
      </div>

      <el-alert
        title="安全提醒"
        type="warning"
        description="您的帳號正在使用初始密碼，必須修改後才能繼續使用系統。"
        show-icon
        :closable="false"
        style="margin-bottom: 24px"
      />

      <div class="password-rules">
        <div class="password-rules__title">密碼規則</div>
        <ul class="password-rules__list">
          <li v-for="rule in PASSWORD_RULES" :key="rule">{{ rule }}</li>
        </ul>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="目前密碼" prop="old_password">
          <el-input
            v-model="form.old_password"
            type="password"
            placeholder="請輸入目前密碼"
            size="large"
            show-password
          />
        </el-form-item>

        <el-form-item label="新密碼" prop="new_password">
          <el-input
            v-model="form.new_password"
            type="password"
            placeholder="請輸入符合規則的新密碼"
            size="large"
            show-password
          />
        </el-form-item>

        <el-form-item label="確認新密碼" prop="confirm_password">
          <el-input
            v-model="form.confirm_password"
            type="password"
            placeholder="再次輸入新密碼"
            size="large"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          style="width: 100%; margin-top: 8px"
          @click="handleSubmit"
        >
          確認修改
        </el-button>
      </el-form>

      <div class="user-hint" v-if="userInfo?.name">
        目前登入帳號：{{ userInfo.name }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.change-password-page {
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(24px, 6vw, 56px) 20px;
  /* 對齊 LoginView 的教師端 brand 背景：暖奶油黃 + 極淡 IvyKids 綠 halo，
   * 取代原本與品牌脫鉤的預設紫漸層。 */
  background:
    radial-gradient(
      ellipse 75% 55% at 18% 12%,
      rgba(90, 168, 66, 0.12) 0%,
      transparent 60%
    ),
    radial-gradient(
      ellipse 60% 50% at 88% 90%,
      rgba(255, 222, 81, 0.18) 0%,
      transparent 60%
    ),
    #fff9e8;
}

.change-password-card {
  box-sizing: border-box;
  width: min(440px, 100%);
  padding: clamp(24px, 5vw, 40px);
  background: var(--surface-color);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18);
}

.header {
  text-align: center;
  margin-bottom: 28px;
}

.lock-icon {
  font-size: 40px;
  color: var(--color-primary);
  margin-bottom: 12px;
}

.header h2 {
  font-size: 22px;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.header p {
  color: var(--text-tertiary);
  font-size: 14px;
  margin: 0;
}

.user-hint {
  margin-top: 20px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

.password-rules {
  margin-bottom: 24px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--bg-color-soft);
  border: 1px solid var(--border-color);
}

.password-rules__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.password-rules__list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}
</style>
