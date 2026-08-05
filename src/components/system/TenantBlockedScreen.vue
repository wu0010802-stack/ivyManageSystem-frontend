<script setup lang="ts">
/**
 * 租戶三態全屏遮罩（frontend-core §2.1 / §2.2、contracts CT-A-03 + CT-F-01）。
 *
 * 三種狀態共用同一款畫面，避免使用者在不同路徑上看到三種長相不同的錯誤頁：
 *   - `TENANT_NOT_FOUND`    404：hostname 認不出園所（誤配 DNS / 直連 IP / 未開通）
 *   - `TENANT_SUSPENDED`    403：園所已停用
 *   - `TENANT_PROVISIONING` 503：園所開通中
 *
 * 為什麼一定要擋而不是「顯示預設品牌繼續跑」：靜默顯示 default 品牌會讓使用者
 * 以為自己在 A 校、實際在打 B 校（或 default 校）的 API——那是最危險的錯誤（fb B5）。
 *
 * 刻意**不依賴 element-plus / router / pinia**：家長端與公開頁 entry 沒有這些，
 * 而本元件必須能在「還沒掛 router」的 boot 期單獨 mount。
 */
import { computed } from 'vue'
import type { TenantErrorCode } from '@/utils/tenant'

const props = defineProps<{ code: TenantErrorCode }>()

const COPY: Record<TenantErrorCode, { title: string; body: string }> = {
  TENANT_NOT_FOUND: {
    title: '無法識別園所',
    body: '這個網址沒有對應到任何園所。請確認網址是否正確，或聯絡園所管理人員取得正確的登入網址。',
  },
  TENANT_SUSPENDED: {
    title: '本園所已停用',
    body: '此園所的服務目前已停用。若您認為這是誤判，請聯絡系統管理人員。',
  },
  TENANT_PROVISIONING: {
    title: '園所開通中',
    body: '此園所正在開通設定中，請稍後再試。',
  },
}

const copy = computed(() => COPY[props.code] ?? COPY.TENANT_NOT_FOUND)
</script>

<template>
  <div class="tenant-blocked" role="alert" aria-live="assertive" data-testid="tenant-blocked-screen">
    <div class="tenant-blocked__card">
      <h1 class="tenant-blocked__title">{{ copy.title }}</h1>
      <p class="tenant-blocked__body">{{ copy.body }}</p>
      <p class="tenant-blocked__code">{{ props.code }}</p>
    </div>
  </div>
</template>

<style scoped>
.tenant-blocked {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #f5f6f8;
  color: #303133;
  font-family: system-ui, -apple-system, 'Noto Sans TC', sans-serif;
}

.tenant-blocked__card {
  max-width: 420px;
  padding: 32px 28px;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(0 0 0 / 8%);
  text-align: center;
}

.tenant-blocked__title {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
}

.tenant-blocked__body {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: #606266;
}

.tenant-blocked__code {
  margin: 20px 0 0;
  font-size: 12px;
  letter-spacing: 0.05em;
  color: #a8abb2;
}
</style>
