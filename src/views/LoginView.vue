<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login } from '@/api/auth'
import { setUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'
import BrandMark from '@/components/brand/BrandMark.vue'

const router = useRouter()
const loading = ref(false)
const loginForm = ref(null)
const usernameInput = ref(null)
const passwordInput = ref(null)

// BrandMark size 依視窗寬度動態調整。BrandMark 內部用 inline style 鎖死寬高，
// CSS media query 無法覆寫，因此改由 props 控制。
const computeBrandSize = () =>
  typeof window === 'undefined' ? 240 : window.innerWidth < 900 ? 168 : 240
const brandSize = ref(computeBrandSize())
const onResize = () => {
  brandSize.value = computeBrandSize()
}

onMounted(() => {
  window.addEventListener('resize', onResize, { passive: true })
  requestAnimationFrame(() => {
    usernameInput.value?.focus?.()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
})

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '請填寫帳號後再登入', trigger: 'blur' }],
  password: [{ required: true, message: '請填寫密碼後再登入', trigger: 'blur' }],
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

    if (res.data.user.role !== 'admin') {
      ElMessage.error('權限不足，僅管理員可登入後台')
      usernameInput.value?.focus?.()
      return
    }

    // Token 已由後端透過 httpOnly Cookie 設定，前端只需儲存 userInfo
    setUserInfo({ ...res.data.user, must_change_password: !!res.data.must_change_password })
    ElMessage.success(`歡迎回來，${res.data.user.name}`)
    router.push(res.data.must_change_password ? '/change-password' : '/')
  } catch (error) {
    ElMessage.error(apiError(error, '登入失敗，請確認帳號密碼'))
    passwordInput.value?.focus?.()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <main class="login-shell" aria-label="常春藤義華幼兒園管理系統登入">
      <section class="login-brand" aria-hidden="true">
        <BrandMark variant="full" :size="brandSize" class="login-brand-mark" />
        <p class="login-brand-name">常春藤義華幼兒園</p>
      </section>

      <section class="login-panel" aria-label="管理系統登入表單">
        <div class="login-card">
          <div class="login-header">
            <h2>管理系統登入</h2>
            <p class="login-subtitle">請使用管理員帳號登入</p>
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
                placeholder="例：admin"
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
                placeholder="請輸入您的密碼"
                size="large"
                autocomplete="current-password"
                aria-label="密碼"
                :prefix-icon="Lock"
                show-password
                @keyup.enter="handleLogin"
              />
            </el-form-item>
            <el-form-item class="login-submit-item">
              <el-button
                native-type="submit"
                type="primary"
                size="large"
                :loading="loading"
                class="login-button"
                @click="handleLogin"
              >
                {{ loading ? '登入中…' : '登入' }}
              </el-button>
            </el-form-item>
          </el-form>

          <p class="login-help">忘記密碼請聯絡系統管理員</p>

          <div class="login-divider" role="separator" aria-orientation="horizontal">
            <span>不是管理員？</span>
          </div>
          <router-link class="alternate-entry" to="/portal/login">
            前往教職員入口
          </router-link>
        </div>
      </section>
    </main>

    <footer class="login-footer">
      <p class="footer-tagline">常春藤義華幼兒園 ・ 管理系統</p>
      <p class="footer-copy">© {{ new Date().getFullYear() }} 常春藤義華幼兒園 版權所有</p>
    </footer>
  </div>
</template>

<style scoped>
/* IvyKids 品牌色（與 SVG brand 元件預設值一致）：
 *   --ivy-green-deep #0d9053  主 CTA / 焦點環
 *   --ivy-green-deep-hover #0a7843  hover/pressed
 *   --ivy-green-laurel #5aa842  輔助綠（次 CTA outline 文字 + border）
 * 字體：以 Noto Sans TC 為中文主體；西文回退 Inter / system。
 */
.login-page {
  box-sizing: border-box;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(32px, 6vw, 72px) 24px;
  background:
    radial-gradient(circle at 12% 18%, rgba(13, 144, 83, 0.06), transparent 55%),
    radial-gradient(circle at 90% 82%, rgba(255, 222, 81, 0.08), transparent 55%),
    #f5f8f5;
  color: #1c1e21;
  font-family: 'Noto Sans TC', 'PingFang TC', 'Heiti TC', 'Inter',
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.login-brand-mark {
  --mark-size: 240px;
}

.login-brand-name {
  margin: 0;
  color: #0d9053;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.login-panel {
  width: 100%;
}

.login-card {
  box-sizing: border-box;
  width: 100%;
  padding: 28px 24px 24px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow:
    0 2px 6px rgba(13, 144, 83, 0.08),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.login-header {
  text-align: center;
  margin-bottom: 20px;
}

.login-header h2 {
  margin: 0;
  color: #1c1e21;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0;
}

.login-subtitle {
  margin: 6px 0 0;
  color: #65676b;
  font-size: 13px;
  line-height: 1.5;
}

.login-card :deep(.el-form-item) {
  margin-bottom: 18px;
}

.login-card :deep(.el-form-item.is-error) {
  margin-bottom: 28px;
}

.login-card :deep(.el-form-item__label) {
  padding: 0 0 4px;
  color: #1c1e21;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.login-card :deep(.el-form-item__error) {
  padding-top: 4px;
  color: #c0392b;
  font-size: 13px;
}

/* 在 :deep 內塞 attr 雖然 element-plus 不支援，但對 a11y 我們以 form 整體 aria-live 為主：
 * el-form 預設 .el-form-item__error 是 inline display，我們改 absolute 預留高度 →
 * margin-bottom 在 is-error 補 28px，避免按鈕擋住 error 文字。 */

.login-card :deep(.el-input__wrapper) {
  min-height: 52px;
  padding: 0 16px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #d0d7d2 inset;
  transition: box-shadow var(--transition-fast, 160ms ease);
}

.login-card :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px #0d9053 inset,
    0 0 0 3px rgba(13, 144, 83, 0.18);
}

.login-card :deep(.el-input__wrapper:hover:not(.is-focus)) {
  box-shadow: 0 0 0 1px #0d9053 inset;
}

.login-card :deep(.el-input__inner) {
  color: #1c1e21;
  font-size: 17px;
}

.login-card :deep(.el-input__inner::placeholder) {
  color: #9aa19c;
}

.login-card :deep(.el-input__prefix-inner > .el-input__icon) {
  color: #5aa842;
  font-size: 18px;
}

.login-submit-item {
  margin-top: 4px;
}

.login-submit-item :deep(.el-form-item__content) {
  display: block;
}

.login-card :deep(.login-button.el-button--primary) {
  --el-button-bg-color: #0d9053;
  --el-button-border-color: #0d9053;
  --el-button-hover-bg-color: #0a7843;
  --el-button-hover-border-color: #0a7843;
  --el-button-active-bg-color: #086338;
  --el-button-active-border-color: #086338;

  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background-color: #0d9053 !important;
  border-color: #0d9053 !important;
  color: #ffffff !important;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 6px rgba(13, 144, 83, 0.32);
  transition:
    background-color var(--transition-fast, 160ms ease),
    box-shadow var(--transition-fast, 160ms ease),
    transform 80ms ease;
}

.login-card :deep(.login-button.el-button--primary:hover),
.login-card :deep(.login-button.el-button--primary:focus-visible) {
  background-color: #0a7843 !important;
  border-color: #0a7843 !important;
  box-shadow: 0 4px 10px rgba(13, 144, 83, 0.36);
}

.login-card :deep(.login-button.el-button--primary:active) {
  transform: translateY(1px);
  box-shadow: 0 1px 4px rgba(13, 144, 83, 0.32);
}

.login-card :deep(.login-button.el-button--primary:focus-visible) {
  outline: 3px solid rgba(13, 144, 83, 0.32);
  outline-offset: 2px;
}

.login-card :deep(.login-button.el-button--primary.is-loading) {
  opacity: 0.92;
}

.login-help {
  margin: 4px 0 0;
  color: #65676b;
  font-size: 13px;
  text-align: center;
  line-height: 1.5;
}

.login-divider {
  display: flex;
  align-items: center;
  margin: 24px 0 14px;
  color: #65676b;
  font-size: 13px;
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e3e7e4;
}

.login-divider span {
  padding: 0 12px;
}

.alternate-entry {
  box-sizing: border-box;
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: 0 24px;
  border-radius: 8px;
  background: transparent;
  border: 1.5px solid #5aa842;
  color: #0a7843;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0;
  text-decoration: none;
  transition:
    background var(--transition-fast, 160ms ease),
    border-color var(--transition-fast, 160ms ease),
    color var(--transition-fast, 160ms ease);
}

.alternate-entry:hover,
.alternate-entry:focus-visible {
  background: rgba(90, 168, 66, 0.08);
  border-color: #0d9053;
  color: #0a7843;
}

.alternate-entry:focus-visible {
  outline: 3px solid rgba(13, 144, 83, 0.28);
  outline-offset: 2px;
}

.login-footer {
  width: min(100%, 980px);
  margin-top: clamp(40px, 6vw, 64px);
  padding-top: 20px;
  border-top: 1px solid #e3e7e4;
  color: #65676b;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.login-footer p {
  margin: 0;
}

.login-footer .footer-tagline {
  margin-bottom: var(--space-1);
  color: var(--text-primary);
  font-weight: var(--font-weight-semibold);
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
    gap: 12px;
  }

  .login-brand-name {
    font-size: 16px;
  }
}

@media (max-width: 420px) {
  .login-page {
    padding: 24px 16px 16px;
  }

  .login-card {
    padding: 24px 20px 22px;
  }

  .login-header h2 {
    font-size: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-card :deep(.login-button.el-button--primary),
  .alternate-entry {
    transition: none;
  }

  .login-card :deep(.login-button.el-button--primary:active) {
    transform: none;
  }
}
</style>
