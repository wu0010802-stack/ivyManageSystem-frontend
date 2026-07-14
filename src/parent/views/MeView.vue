<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { performParentLogout } from '../composables/useParentLogout'
import { getHomeSummary } from '../api/profile'
import { useParentAuthStore } from '../stores/parentAuth'
import { useChildrenStore } from '../stores/children'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { useDataExport } from '../composables/useDataExport'
import AppModal from '../components/AppModal.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import UserHeroCard from '../components/more/UserHeroCard.vue'
import AppearanceSettings from '../components/more/AppearanceSettings.vue'
import FeeSummaryCard from '../components/me/FeeSummaryCard.vue'
import ChildrenList from '../components/me/ChildrenList.vue'

const router = useRouter()
const authStore = useParentAuthStore()
const childrenStore = useChildrenStore()

const me = computed(() => authStore.user as Record<string, unknown> | null)
const showLogoutConfirm = ref(false)
const loggingOut = ref(false)

const showExportDialog = ref(false)
const exportError = ref<'rate_limited' | 'too_large' | null>(null)
const { downloading, downloadExport } = useDataExport()

async function handleExport(): Promise<void> {
  exportError.value = null
  try {
    const result = await downloadExport()
    if (result.ok) {
      showExportDialog.value = false
    } else {
      exportError.value = result.reason
    }
  } catch {
    // 其他錯誤已由 axios interceptor displayMessage 處理
  }
}

const { data: summaryData } = useCachedAsync(
  'parent/home/summary',
  async () => {
    const res = await getHomeSummary()
    return res.data
  },
  { ttl: 60_000 },
)

const fees = computed(() => summaryData.value?.summary?.fees || null)
const outstanding = computed(() => fees.value?.outstanding || 0)
const overdue = computed(() => fees.value?.overdue || 0)

const childrenTyped = computed(() => (childrenStore.items || []) as { student_id: number; name?: string; classroom_name?: string }[])

const childrenLabel = computed(() => {
  const names = childrenTyped.value.map(c => c.name || '')
  return names.length ? names.join('、') : '尚未綁定'
})
const avatarInitial = computed(() => (String(me.value?.name || '家')).charAt(0))
const userName = computed(() => String(me.value?.name || '家長'))

function askLogout() { showLogoutConfirm.value = true }

async function doLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  await performParentLogout()
  router.replace('/login')
}

onMounted(async () => {
  await childrenStore.load()
})

const PREFS = [
  { key: 'notifications', label: '通知偏好', icon: 'notifications', path: '/notifications/preferences', hint: '推播 / 訊息 / 公告' },
  { key: 'fees', label: '費用查詢', icon: 'payments', path: '/fees', hint: '繳費紀錄與證明' },
  // P0c-3 法規/個資權利 (個資法 §3 五權)
  { key: 'privacy_rights', label: '個人資料權利', icon: 'gpp_good', path: '/me/privacy-rights', hint: '同意紀錄 / 申請刪除 / 更正 / 停止處理' },
]
</script>

<template>
  <div class="me-view" data-testid="me-view">
    <UserHeroCard
      :user-name="userName"
      :avatar-initial="avatarInitial"
      :children-label="childrenLabel"
      :can-push="!!me?.can_push"
      :push-status-known="!!me"
    />

    <FeeSummaryCard :outstanding="outstanding" :overdue="overdue" />

    <ChildrenList :children="childrenTyped" />

    <div class="pt-eyebrow-row">
      <p class="pt-eyebrow">偏好設定</p>
    </div>

    <div class="pt-list-group">
      <router-link
        v-for="p in PREFS"
        :key="p.key"
        :to="p.path"
        class="pt-list-row pref-link"
      >
        <span class="pref-icon" aria-hidden="true">
          <span class="material-symbols-rounded">{{ p.icon }}</span>
        </span>
        <span class="pt-list-row-body">
          <span class="pref-label">{{ p.label }}</span>
          <span class="pref-hint">{{ p.hint }}</span>
        </span>
        <span class="material-symbols-rounded chev" aria-hidden="true">chevron_right</span>
      </router-link>

      <button
        class="pt-list-row export-row"
        type="button"
        data-testid="open-export-dialog"
        @click="showExportDialog = true"
      >
        <span class="pref-icon" aria-hidden="true">
          <span class="material-symbols-rounded">download</span>
        </span>
        <span class="pt-list-row-body">
          <span class="pref-label">下載我的個人資料</span>
          <span class="pref-hint">匯出個人及孩子的所有園所紀錄</span>
        </span>
        <span class="material-symbols-rounded chev" aria-hidden="true">chevron_right</span>
      </button>
    </div>

    <AppearanceSettings />

    <button class="logout" type="button" @click="askLogout">
      <span class="material-symbols-rounded" aria-hidden="true">logout</span>
      <span>登出</span>
    </button>

    <ConfirmDialog
      v-model:open="showLogoutConfirm"
      title="確定要登出？"
      message="登出後需重新從 LINE 進入家長 App。"
      confirm-label="登出"
      cancel-label="取消"
      destructive
      @confirm="doLogout"
    />

    <AppModal
      v-model:open="showExportDialog"
      labelled-by="export-dialog-title"
      described-by="export-dialog-desc"
    >
      <div class="export-dialog">
        <h2 id="export-dialog-title" class="export-dialog-title">下載個人資料</h2>
        <p id="export-dialog-desc" class="export-dialog-body">
          將下載您與孩子在園所的所有紀錄（JSON 格式）。
        </p>
        <ul class="export-dialog-list">
          <li>包含聯絡簿、出席、請假、繳費、投藥、相片連結、訊息、成長報告</li>
          <li>每小時限下載 1 次</li>
          <li>檔案上限 50MB</li>
        </ul>
        <p v-if="exportError === 'rate_limited'" class="export-dialog-error" role="alert">
          請於稍後再試（每小時限 1 次）
        </p>
        <p v-if="exportError === 'too_large'" class="export-dialog-error" role="alert">
          資料量超過 50MB，請聯絡園所協助匯出
        </p>
        <div class="export-dialog-actions">
          <button
            class="export-cancel"
            type="button"
            @click="showExportDialog = false"
          >
            取消
          </button>
          <button
            class="export-confirm"
            type="button"
            :disabled="downloading"
            data-testid="confirm-export"
            @click="handleExport"
          >
            {{ downloading ? '下載中…' : '確認下載' }}
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.me-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 16px;
}

.pref-link {
  text-decoration: none;
  color: inherit;
}
.pref-icon {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--leaf-100, #dcf4e6);
  border-radius: 12px;
  color: var(--brand-primary, #0d9053);
  flex-shrink: 0;
}
.pref-icon .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'FILL' 1, 'wght' 500;
}
.pref-label {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: var(--pt-text-strong);
  line-height: 1.3;
}
.pref-hint {
  display: block;
  font-size: 12px;
  color: var(--pt-text-muted);
  margin-top: 2px;
}
.chev {
  color: var(--pt-text-faint);
  font-size: 20px;
  flex-shrink: 0;
}

.logout {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  min-height: 48px;
  padding: 12px;
  background: var(--pt-surface-card, #fff);
  border: 1px solid var(--coral-300, #ffb5ad);
  border-radius: 14px;
  color: var(--coral-700, #b14545);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, transform 120ms ease;
}
.logout:active { background: var(--coral-100, #ffe3e0); transform: scale(0.99); }
.logout .material-symbols-rounded {
  font-size: 20px;
  font-variation-settings: 'wght' 500;
}

@media (prefers-reduced-motion: reduce) {
  .logout { transition: none; }
}

/* ===== 匯出 row ===== */
.export-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  padding: 12px 16px;
}
.export-row:active { background: var(--pt-surface-hover, rgba(0,0,0,.04)); }

/* ===== 匯出 dialog ===== */
.export-dialog {
  padding: 24px 20px 20px;
}
.export-dialog-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--pt-text-strong);
  margin: 0 0 10px;
}
.export-dialog-body {
  font-size: 14px;
  color: var(--pt-text-body, var(--pt-text-strong));
  margin: 0 0 8px;
}
.export-dialog-list {
  font-size: 13px;
  color: var(--pt-text-muted);
  padding-left: 18px;
  margin: 0 0 12px;
  line-height: 1.7;
}
.export-dialog-error {
  font-size: 13px;
  color: var(--coral-700, #b14545);
  background: var(--coral-50, #fff5f5);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 0 0 12px;
}
.export-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.export-cancel {
  padding: 10px 18px;
  border-radius: 10px;
  border: 1px solid var(--pt-hairline-color, #e5e7eb);
  background: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: var(--pt-text-muted);
}
.export-cancel:active { background: var(--pt-surface-hover, rgba(0,0,0,.04)); }
.export-confirm {
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  background: var(--brand-primary, #0d9053);
  color: var(--pt-on-accent, #fff);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 160ms ease;
}
.export-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.export-confirm:not(:disabled):active { opacity: 0.85; }
</style>
