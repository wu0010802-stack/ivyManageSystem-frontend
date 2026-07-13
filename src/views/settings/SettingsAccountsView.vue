<script setup lang="ts">
// 帳號設定獨立頁（spec §2.1 路由拆分）。內容整檔沿用 SettingsAccountsTab：
// uiux 改版（受眾分流/統計/loadError/?view= 同步）全部住在該元件內，僅換宿主。
// §2.2 的「帳號列表/dialog/重設密碼/憑證框各自成檔」拆分：本 plan 只拆出
// RoleCardsGrid（Task 4，兩個 dialog 共用、且是行為變更點）；列表/重設密碼/
// 憑證框與 users/fetchUsers 狀態交叉引用深，維持單檔可維護性優於硬拆。
import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'
</script>

<template>
  <div class="settings-page">
    <h2>帳號設定</h2>
    <SettingsAccountsTab />
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}
</style>
