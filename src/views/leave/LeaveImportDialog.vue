<script setup>
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  result: {
    type: Object,
    default: null,
  },
  onFileChange: {
    type: Function,
    required: true,
  },
})

const emit = defineEmits(['update:visible'])

const updateVisible = (value) => emit('update:visible', value)
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="批次匯入請假"
    width="500px"
    @update:model-value="updateVisible"
  >
    <div style="margin-bottom: 12px;">
      <el-alert type="info" :closable="false" show-icon>
        <template #title>上傳 Excel 檔案（.xlsx），系統將批次建立草稿假單，需後續人工審核。</template>
      </el-alert>
    </div>
    <el-upload
      drag
      :auto-upload="false"
      :on-change="props.onFileChange"
      accept=".xlsx"
      :limit="1"
      :show-file-list="false"
    >
      <el-icon class="el-icon--upload" style="font-size: 48px; color: var(--el-color-primary);"><UploadFilled /></el-icon>
      <div class="el-upload__text">拖曳 Excel 至此，或 <em>點擊選取</em></div>
      <template #tip><div class="el-upload__tip">僅支援 .xlsx 格式</div></template>
    </el-upload>
    <div v-if="props.loading" style="text-align:center; margin-top: 16px;">
      <el-icon class="is-loading" style="font-size: 24px;"><Loading /></el-icon> 匯入中…
    </div>
    <el-card v-if="props.result" style="margin-top: 16px;" shadow="never">
      <div style="display: flex; gap: 16px; align-items: center;">
        <span>共 <strong>{{ props.result.total }}</strong> 筆</span>
        <el-tag type="success">成功 {{ props.result.created }}</el-tag>
        <el-tag v-if="props.result.failed > 0" type="danger">失敗 {{ props.result.failed }}</el-tag>
      </div>
      <div v-if="props.result.errors?.length" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">
        <p
          v-for="error in props.result.errors"
          :key="error"
          style="font-size:12px; color:var(--el-color-danger); margin: 2px 0;"
        >
          {{ error }}
        </p>
      </div>
    </el-card>
    <template #footer>
      <el-button @click="updateVisible(false)">關閉</el-button>
    </template>
  </el-dialog>
</template>
