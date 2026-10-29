<script setup lang="ts">
/**
 * 把某個位置（placement）的 system_configs 區塊包成 dialog，供「頁首設定入口」使用：
 * 出勤核對頁首「打卡設定」（attendance）、政府申報頁籤列「申報單位設定」（gov）。
 *
 * 內容就是 `SettingsTenantConfigTab`（逐 key 讀寫、寫入權限與後端一致），本元件只負責外框。
 * 呼叫端自行決定入口何時顯示（需 SETTINGS_READ，否則內容的 GET 會 403）。
 */
import SettingsTenantConfigTab from '@/components/settings/SettingsTenantConfigTab.vue'
import { FORM_DIALOG_WIDTH } from '@/constants/formDialog'
import type { SystemConfigPlacement } from '@/constants/onboardingSystemConfigs'

defineProps<{
  modelValue: boolean
  title: string
  placement: SystemConfigPlacement
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    :width="FORM_DIALOG_WIDTH.standardNarrow"
    top="6vh"
    append-to-body
    destroy-on-close
    data-test="system-config-dialog"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <SettingsTenantConfigTab :placement="placement" />
  </el-dialog>
</template>
