<template>
  <section class="fee-settings-workspace" aria-label="費用設定">
    <FeeWorkspaceToolbar
      :views="views"
      :view="view"
      tabs-label="費用設定分頁切換"
      tabs-test-id="settings-view"
      help-label="顯示費用設定說明"
      @change-view="onViewChange"
    >
      <template #help>
        <template v-if="view === 'billingCodes'">
          <p><strong>銷帳末四碼</strong></p>
          <p>
            低頻的學期設定：每學期產生一次建議碼，啟用前請優先處理衝突與
            無法產碼名單，否則該生的代收明細無法自動媒合。
          </p>
        </template>
        <template v-else>
          <p><strong>費用範本</strong></p>
          <p>
            範本異動只影響之後產生的費用單；系統每日依啟用範本自動產生。
            新學年（上＋下學期）的金額與收費日期請於 7 月底前設定完成，
            缺格的年級×費別不會產單。
          </p>
        </template>
      </template>
    </FeeWorkspaceToolbar>

    <KeepAlive>
      <FeeTemplateTab v-if="view === 'templates'" />
      <BillingCodesTab v-else />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
/**
 * 費用設定：費用範本＋銷帳碼。由 PageHeader 右上角進入（ws=settings），
 * 是完整設定畫面而非 dropdown/modal；不佔主導航。
 */
import FeeTemplateTab from '@/components/fees/FeeTemplateTab.vue'
import BillingCodesTab from '@/components/fees/BillingCodesTab.vue'
import FeeWorkspaceToolbar from './FeeWorkspaceToolbar.vue'
import { FEE_WORKSPACE_VIEWS } from './feesNavigation'

const props = withDefaults(defineProps<{ view?: string }>(), { view: 'templates' })

const emit = defineEmits<{
  'change-view': [view: string]
}>()

const views = FEE_WORKSPACE_VIEWS.settings

function onViewChange(next: string) {
  if (next !== props.view) emit('change-view', next)
}
</script>
