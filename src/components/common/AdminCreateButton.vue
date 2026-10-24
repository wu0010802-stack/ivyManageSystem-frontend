<!-- src/components/common/AdminCreateButton.vue
     頁面層級「新增／建立」主動作的統一按鈕（2026-08-18 admin 新增表單重整）：
     primary + Plus icon + 「新增{資料類型}」文案。
     - 權限判斷留在 caller（v-if="canWrite"），不藏進視覺元件。
     - contextual 子資源新增（drawer/tab 內）不強制使用本元件，維持 default/plain
       以免與頁面主動作競爭。
     - hover/active/focus-visible/disabled/loading 全部沿用 Element Plus 原生狀態
       與 main.css 的 primary 覆寫，不另造樣式。 -->
<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  disabled?: boolean
  loading?: boolean
}>(), {
  disabled: false,
  loading: false,
})

const emit = defineEmits<{ click: [] }>()
</script>

<template>
  <el-button
    type="primary"
    :icon="Plus"
    :disabled="disabled"
    :loading="loading"
    data-test="admin-create-button"
    @click="emit('click')"
  >
    <slot>新增</slot>
  </el-button>
</template>
