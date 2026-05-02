<script setup>
import { ref, reactive, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login } from '@/api/auth'
import { setUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'

const router = useRouter()
const loading = ref(false)
const loginForm = ref(null)
const usernameInput = ref(null)
const passwordInput = ref(null)

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

const focusFirstInvalid = async () => {
  await nextTick()
  if (!form.username) usernameInput.value?.focus?.()
  else if (!form.password) passwordInput.value?.focus?.()
}

const handleLogin = async () => {
  try {
    await loginForm.value.validate()
  } catch {
    focusFirstInvalid()
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
    ElMessage.error(apiError(error, '登入失敗'))
    usernameInput.value?.focus?.()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <main class="login-shell" aria-label="常春藤義華幼兒園教職員登入">
      <section class="login-brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <h1>常春藤義華幼兒園</h1>
        <p>快速進入考勤、請假與班級作業，讓教職員每日紀錄更順手。</p>
      </section>

      <section class="login-panel" aria-label="教職員考勤登入表單">
        <div class="login-card">
          <div class="login-header">
            <h2>教職員考勤登入</h2>
          </div>

          <el-form
            ref="loginForm"
            :model="form"
            :rules="rules"
            label-position="top"
            @submit.prevent="handleLogin"
          >
            <el-form-item prop="username" label="帳號">
              <el-input
                ref="usernameInput"
                v-model="form.username"
                placeholder="請輸入帳號"
                size="large"
                autocomplete="username"
                aria-label="帳號"
                :prefix-icon="User"
              />
            </el-form-item>
            <el-form-item prop="password" label="密碼">
              <el-input
                ref="passwordInput"
                v-model="form.password"
                type="password"
                placeholder="請輸入密碼"
                size="large"
                autocomplete="current-password"
                aria-label="密碼"
                :prefix-icon="Lock"
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
          <router-link class="alternate-entry" to="/login">前往管理後台</router-link>
        </div>
        <p class="login-note">請使用學校配發的教職員帳號登入。</p>
      </section>
    </main>

    <footer class="login-footer">
      <p class="footer-tagline">常春藤義華幼兒園 ・ 教職員入口</p>
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
  background: #fdf6ea;
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
  width: 240px;
  height: 240px;
  margin-bottom: 16px;
  background: url('/images/login-bg.png') center / contain no-repeat;
}

.login-brand h1 {
  margin: 0 0 16px;
  color: #2e8b1c;
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

.login-card :deep(.el-form-item__label) {
  padding: 0 0 4px;
  color: #1c1e21;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
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
    0 0 0 1px #42b72a inset,
    0 0 0 2px rgba(66, 183, 42, 0.18);
}

.login-card :deep(.el-input__inner) {
  color: #1c1e21;
  font-size: 17px;
}

.login-card :deep(.el-input__inner::placeholder) {
  color: #8a8d91;
}

.login-card :deep(.login-button.el-button--primary) {
  --el-button-bg-color: #42b72a;
  --el-button-border-color: #42b72a;
  --el-button-hover-bg-color: #36a420;
  --el-button-hover-border-color: #36a420;
  --el-button-active-bg-color: #2e8b1c;
  --el-button-active-border-color: #2e8b1c;

  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 6px;
  background-color: #42b72a !important;
  border-color: #42b72a !important;
  color: #ffffff !important;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 0;
}

.login-card :deep(.login-button.el-button--primary:hover),
.login-card :deep(.login-button.el-button--primary:focus) {
  background-color: #36a420 !important;
  border-color: #36a420 !important;
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
  background: #1877f2;
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
  background: #166fe5;
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
    width: 160px;
    height: 160px;
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
