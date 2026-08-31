<template>
  <section class="fee-settings-workspace" aria-label="費用設定">
    <div class="workspace-bar">
      <el-segmented
        :model-value="view"
        :options="viewOptions"
        aria-label="費用設定分頁切換"
        data-test="settings-view-switch"
        @change="onViewChange"
      />
      <p class="settings-hint">
        {{
          view === 'billingCodes'
            ? '銷帳末四碼為低頻學期設定；產生建議碼後請優先處理衝突與無法產碼名單。'
            : '範本異動只影響之後產生的費用單；系統將於每日依啟用範本自動產生費用單。'
        }}
      </p>
    </div>

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
import { FEE_WORKSPACE_VIEWS } from './feesNavigation'

const props = withDefaults(defineProps<{ view?: string }>(), { view: 'templates' })

const emit = defineEmits<{
  'change-view': [view: string]
}>()

const viewOptions = FEE_WORKSPACE_VIEWS.settings.map((v) => ({
  label: v.label,
  value: v.key,
}))

function onViewChange(val: string | number) {
  const next = String(val)
  if (next !== props.view) emit('change-view', next)
}
</script>

<style scoped>
.workspace-bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.settings-hint {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
</style>
