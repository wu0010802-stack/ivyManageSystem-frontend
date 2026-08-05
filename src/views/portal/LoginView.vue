<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import type { FormInstance } from 'element-plus'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { login } from '@/api/auth'
import { setUserInfo } from '@/utils/auth'
import { apiError } from '@/utils/error'
import { IDLE_LOGOUT_FLAG_KEY } from '@/composables/useIdleTimeout'
import { useTenantBranding } from '@/composables/useTenantBranding'

const { branding } = useTenantBranding()

const router = useRouter()
const loading = ref(false)
const loginForm = ref<FormInstance | null>(null)
const usernameInput = ref<HTMLInputElement | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)

onMounted(() => {
  requestAnimationFrame(() => {
    if (sessionStorage.getItem(IDLE_LOGOUT_FLAG_KEY)) {
      sessionStorage.removeItem(IDLE_LOGOUT_FLAG_KEY)
      ElMessage.info('因閒置過久，已自動登出')
    }
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
    await loginForm.value?.validate()
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
    router.push(res.data.must_change_password ? '/portal/change-password' : '/portal/home')
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
    <main class="login-shell" :aria-label="`${branding.org_name}教職員登入`">
      <section class="login-brand">
        <div class="brand-mark" aria-hidden="true"></div>
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
      </section>
    </main>

    <footer class="login-footer">
      <p class="footer-tagline">{{ branding.org_name }} ・ 教職員入口</p>
      <p class="footer-copy">© {{ new Date().getFullYear() }} {{ branding.org_name }} 版權所有</p>
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
  /* 教師端走暖奶油黃 + 極淡 IvyKids 綠 halo，呼應 brand 桂冠綠葉與奶油緞帶，
   * 與管理端（冷色 slate）視覺拉開差距，傳達親切感。 */
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
  color: var(--text-primary);
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
  justify-content: center;
}

.brand-mark {
  width: min(100%, 440px);
  aspect-ratio: 1 / 1;
  /* 去背 logo：外圍白底已移除為透明，圖案直接貼合頁面背景、不再有白方框。
   * 輕微降飽和與對比、微提亮讓童趣配色更溫潤；柔和暖色投影呼應教師端奶油黃背景。 */
  background: url('/images/login-logo.png') center / contain no-repeat;
  filter: saturate(0.92) contrast(0.96) brightness(1.03)
    drop-shadow(0 6px 18px rgba(120, 104, 52, 0.14));
}

.login-panel {
  width: 100%;
}

.login-card {
  box-sizing: border-box;
  width: 100%;
  padding: var(--space-5) var(--space-4) var(--space-6);
  background: var(--surface-color);
  border-radius: var(--auth-card-radius);
  box-shadow: var(--auth-card-shadow);
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-4);
}

.login-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.login-card :deep(.el-form-item) {
  margin-bottom: var(--space-3);
}

.login-card :deep(.el-form-item__label) {
  padding: 0 0 var(--space-1);
  color: var(--text-primary);
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
  line-height: 1.4;
}

.login-card :deep(.el-input__wrapper) {
  min-height: 52px;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 1px var(--border-color) inset;
  transition: box-shadow var(--transition-fast);
}

.login-card :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--brand-primary) inset,
    0 0 0 2px var(--brand-primary-soft);
}

.login-card :deep(.el-input__inner) {
  color: var(--text-primary);
  font-size: var(--text-lg);
}

.login-card :deep(.el-input__inner::placeholder) {
  color: var(--text-tertiary);
}

.login-card :deep(.login-button.el-button--primary) {
  --el-button-bg-color: var(--brand-primary);
  --el-button-border-color: var(--brand-primary);
  --el-button-hover-bg-color: var(--brand-primary-hover);
  --el-button-hover-border-color: var(--brand-primary-hover);
  --el-button-active-bg-color: var(--brand-primary-hover);
  --el-button-active-border-color: var(--brand-primary-hover);

  width: 100%;
  min-height: var(--btn-height-lg);
  border: 0;
  border-radius: var(--radius-md);
  color: var(--neutral-0);
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
}

.login-divider {
  display: flex;
  align-items: center;
  margin: var(--space-5) 0;
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.login-divider span {
  padding: 0 var(--space-3);
}

.alternate-entry {
  box-sizing: border-box;
  width: fit-content;
  min-height: var(--btn-height-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  padding: 0 var(--space-6);
  border-radius: var(--radius-md);
  background: var(--color-info);
  color: var(--neutral-0);
  font-size: var(--text-base);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);
}

.alternate-entry:hover,
.alternate-entry:focus {
  background: var(--color-info-hover);
  transform: translateY(-1px);
}

.login-footer {
  width: min(100%, 980px);
  margin-top: clamp(40px, 6vw, 64px);
  padding-top: var(--space-5);
  border-top: 1px solid var(--border-color);
  color: var(--text-tertiary);
  font-size: var(--text-xs);
  line-height: var(--line-height-base);
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

  .brand-mark {
    width: min(100%, 280px);
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
