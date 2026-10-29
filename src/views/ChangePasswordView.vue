<script setup lang="ts">
/**
 * 強制改密頁（must_change_password）。
 *
 * 路由守衛會把「帳號仍是初始密碼」的使用者擋在這裡，改完才能進其他頁（守衛在 router/index.ts，
 * 本頁不改變任何授權判斷）。表單本身是與「個人資料 → 修改密碼」共用的 PasswordChangeForm；
 * 本頁只負責：版面、說明、成功後清旗標並進系統，以及一個「登出」出口，避免使用者被困住。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { SwitchButton } from '@element-plus/icons-vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PasswordChangeForm from '@/components/auth/PasswordChangeForm.vue'
import { clearAuth, clearMustChangePassword, getUserInfo } from '@/utils/auth'

const router = useRouter()
const submitting = ref(false)

const accountLabel = computed(() => {
  const info = getUserInfo() as { name?: string; username?: string } | null
  return info?.name || info?.username || ''
})

const handleSuccess = () => {
  clearMustChangePassword()
  ElMessage.success('密碼已更新')
  router.push('/')
}

// 與右上角帳號選單的「登出」同一條流程（AdminHeader.handleCommand）：
// clearAuth 會同步清本地身分並通知後端清 Cookie，再回登入頁。
const handleLogout = () => {
  if (submitting.value) return
  Promise.resolve(clearAuth()).catch(() => undefined)
  router.push('/login')
  ElMessage.success('已登出')
}
</script>

<template>
  <div class="change-password-page">
    <PageHeader title="請修改初始密碼" subtitle="為確保帳號安全，請先設定新密碼才能使用系統">
      <template #actions>
        <el-button
          data-test="forced-logout"
          :icon="SwitchButton"
          :disabled="submitting"
          @click="handleLogout"
        >
          登出
        </el-button>
      </template>
    </PageHeader>

    <el-card class="change-password-card" shadow="never">
      <el-alert
        class="change-password-notice"
        type="warning"
        title="完成修改後，才能使用系統其他功能"
        description="這是為了保護您的帳號。若現在不方便修改，可先按頁面上方的「登出」，下次登入仍會回到這一頁。"
        show-icon
        :closable="false"
      />

      <PasswordChangeForm
        v-model:submitting="submitting"
        size="large"
        autofocus
        submit-text="設定新密碼並繼續"
        @success="handleSuccess"
      />

      <p v-if="accountLabel" class="account-hint" data-test="account-hint">
        目前登入帳號：{{ accountLabel }}
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.change-password-page {
  max-width: 560px;
}

.change-password-notice {
  margin-bottom: var(--space-5);
}

.account-hint {
  margin: var(--space-5) 0 0;
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
</style>
