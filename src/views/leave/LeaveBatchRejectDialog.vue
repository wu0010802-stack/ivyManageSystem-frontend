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
  reason: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:visible', 'update:reason', 'confirm'])

const updateVisible = (value) => emit('update:visible', value)
const updateReason = (value) => emit('update:reason', value)
</script>

<template>
  <el-dialog
    :model-value="props.visible"
    title="批次駁回"
    width="420px"
    @update:model-value="updateVisible"
  >
    <el-form label-width="80px">
      <el-form-item label="駁回原因" required>
        <el-input
          :model-value="props.reason"
          type="textarea"
          :rows="3"
          placeholder="必填：請輸入駁回原因（將套用至所有選取假單）"
          @update:model-value="updateReason"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="updateVisible(false)">取消</el-button>
      <el-button type="danger" :loading="props.loading" @click="emit('confirm')">確認駁回</el-button>
    </template>
  </el-dialog>
</template>
