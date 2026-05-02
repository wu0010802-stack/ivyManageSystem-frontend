<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { login } from '@/api/auth'
import { setUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'

const router = useRouter()
const loading = ref(false)
const loginForm = ref(null)
const usernameInput = ref(null)

onMounted(() => {
  requestAnimationFrame(() => {
    usernameInput.value?.focus?.()
  })
})

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

    if (res.data.user.role !== 'admin') {
      ElMessage.error('權限不足，僅管理員可登入後台')
      return
    }

    // Token 已由後端透過 httpOnly Cookie 設定，前端只需儲存 userInfo
    setUserInfo({ ...res.data.user, must_change_password: !!res.data.must_change_password })
    ElMessage.success(`歡迎回來，${res.data.user.name}`)
    router.push(res.data.must_change_password ? '/change-password' : '/')
  } catch (error) {
    ElMessage.error(apiError(error, '登入失敗'))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <main class="login-shell" aria-label="常春藤義華幼兒園管理系統登入">
      <section class="login-brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <h1>常春藤義華幼兒園</h1>
        <p>園務、考勤與薪資管理集中在同一個入口，讓每日作業更清楚。</p>
      </section>

      <section class="login-panel" aria-label="管理系統登入表單">
        <div class="login-card">
          <div class="login-header">
            <h2>管理系統登入</h2>
          </div>

          <el-form ref="loginForm" :model="form" :rules="rules" @submit.prevent="handleLogin">
            <el-form-item prop="username">
              <el-input
                ref="usernameInput"
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
                class="login-button"
                @click="handleLogin"
              >
                登入
              </el-button>
            </el-form-item>
          </el-form>

          <div class="login-divider" role="separator"><span>或</span></div>
          <router-link class="alternate-entry" to="/portal/login">前往教職員入口</router-link>
        </div>
        <p class="login-note">請使用學校配發的管理帳號登入。</p>
      </section>
    </main>

    <footer class="login-footer">
      <p class="footer-tagline">常春藤義華幼兒園 ・ 管理系統</p>
      <p class="footer-copy">© {{ new Date().getFullYear() }} 常春藤義華幼兒園 版權所有</p>
    </footer>
  </div>
</template>

<style scoped>
.login-page {
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(32px, 6vw, 72px) 24px;
  background: #f0f2f5;
  color: #1c1e21;
}

.login-shell {
  box-sizing: border-box;
  width: min(100%, 980px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 396px;
  gap: clamp(40px, 8vw, 96px);
  align-items: center;
}

.login-brand {
  padding-bottom: 56px;
}

.brand-mark {
  width: 152px;
  height: 152px;
  margin-bottom: 16px;
  background: #ffffff url('/images/login-bg.png') center / 84% no-repeat;
  border-radius: 28px;
  box-shadow:
    0 1px 2px rgba(28, 30, 33, 0.06),
    0 12px 28px rgba(28, 30, 33, 0.1);
}

.login-brand h1 {
  margin: 0 0 16px;
  color: #1877f2;
  font-size: clamp(40px, 5vw, 56px);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: 0;
}

.login-brand p {
  max-width: 520px;
  margin: 0;
  color: #1c1e21;
  font-size: clamp(19px, 2vw, 24px);
  line-height: 1.45;
  letter-spacing: 0;
}

.login-panel {
  width: 100%;
}

.login-card {
  box-sizing: border-box;
  width: 100%;
  padding: 20px 16px 24px;
  background: #ffffff;
  border-radius: 8px;
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.1),
    0 8px 16px rgba(0, 0, 0, 0.1);
}

.login-header {
  text-align: center;
  margin-bottom: 16px;
}

.login-header h2 {
  margin: 0;
  color: #1c1e21;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0;
}

.login-card :deep(.el-form-item) {
  margin-bottom: 12px;
}

.login-card :deep(.el-input__wrapper) {
  min-height: 52px;
  padding: 0 16px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px #dddfe2 inset;
  transition: box-shadow var(--transition-fast);
}

.login-card :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px #1877f2 inset,
    0 0 0 2px rgba(24, 119, 242, 0.12);
}

.login-card :deep(.el-input__inner) {
  color: #1c1e21;
  font-size: 17px;
}

.login-card :deep(.el-input__inner::placeholder) {
  color: #8a8d91;
}

.login-card :deep(.login-button.el-button--primary) {
  --el-button-bg-color: #1877f2;
  --el-button-border-color: #1877f2;
  --el-button-hover-bg-color: #166fe5;
  --el-button-hover-border-color: #166fe5;
  --el-button-active-bg-color: #1464cc;
  --el-button-active-border-color: #1464cc;

  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 6px;
  background-color: #1877f2 !important;
  border-color: #1877f2 !important;
  color: #ffffff !important;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0;
}

.login-card :deep(.login-button.el-button--primary:hover),
.login-card :deep(.login-button.el-button--primary:focus) {
  background-color: #166fe5 !important;
  border-color: #166fe5 !important;
}

.login-divider {
  display: flex;
  align-items: center;
  margin: 20px 0;
  color: #65676b;
  font-size: 13px;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #dadde1;
}

.login-divider span {
  padding: 0 12px;
}

.alternate-entry {
  box-sizing: border-box;
  width: fit-content;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: 0 24px;
  border-radius: 6px;
  background: #42b72a;
  color: #ffffff;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0;
  text-decoration: none;
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);
}

.alternate-entry:hover,
.alternate-entry:focus {
  background: #36a420;
  transform: translateY(-1px);
}

.login-note {
  margin: 24px 0 0;
  color: #1c1e21;
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
  letter-spacing: 0;
}

.login-footer {
  width: min(100%, 980px);
  margin-top: clamp(40px, 6vw, 64px);
  padding-top: 20px;
  border-top: 1px solid #dadde1;
  color: #65676b;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.login-footer p {
  margin: 0;
}

.login-footer .footer-tagline {
  margin-bottom: 4px;
  color: #1c1e21;
  font-weight: 600;
}

@media (max-width: 900px) {
  .login-page {
    align-items: start;
    padding: 32px 16px;
  }

  .login-shell {
    max-width: 432px;
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .login-brand {
    padding-bottom: 0;
    text-align: center;
  }

  .brand-mark {
    width: 112px;
    height: 112px;
    margin: 0 auto 12px;
  }

  .login-brand h1 {
    font-size: 34px;
  }

  .login-brand p {
    font-size: 18px;
  }
}

@media (max-width: 420px) {
  .login-page {
    padding-right: 12px;
    padding-left: 12px;
  }

  .login-card {
    padding: 16px 12px 20px;
  }

  .alternate-entry {
    width: 100%;
    padding: 0 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .alternate-entry {
    transition: none;
  }

  .alternate-entry:hover,
  .alternate-entry:focus {
    transform: none;
  }
}
</style>
