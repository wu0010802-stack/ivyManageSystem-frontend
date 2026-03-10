<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth'
import { setUserInfo } from '@/utils/auth'

const router = useRouter()
const loading = ref(false)
const loginForm = ref(null)

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '請輸入帳號', trigger: 'blur' }],
  password: [{ required: true, message: '請輸入密碼', trigger: 'blur' }],
}

const handleLogin = async () => {
  try {
    await loginForm.value.validate()
  } catch {
    return
  }

  loading.value = true
  try {
    const res = await login(form.username, form.password)
    // Token 已由後端透過 httpOnly Cookie 設定，前端只需儲存 userInfo
    setUserInfo({ ...res.data.user, must_change_password: !!res.data.must_change_password })
    ElMessage.success(`歡迎回來，${res.data.user.name}`)
    router.push(res.data.must_change_password ? '/portal/change-password' : '/portal/attendance')
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '登入失敗')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>義華幼兒園</h1>
        <p>教職員考勤系統</p>
      </div>

      <el-form ref="loginForm" :model="form" :rules="rules" @submit.prevent="handleLogin">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="帳號"
            size="large"
            :prefix-icon="'User'"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密碼"
            size="large"
            :prefix-icon="'Lock'"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            style="width: 100%"
            @click="handleLogin"
          >
            登入
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
  padding: 40px;
  background: var(--surface-color);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  font-size: 28px;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.login-header p {
  color: var(--text-tertiary);
  font-size: var(--text-base);
  margin: 0;
}
</style>
