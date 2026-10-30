<script setup lang="ts">
const props = withDefaults(defineProps<{
  visible?: boolean
  loading?: boolean
  reason?: string
}>(), {
  visible: false,
  loading: false,
  reason: '',
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'update:reason', value: string): void
  (e: 'confirm'): void
}>()

const updateVisible = (value: boolean) => emit('update:visible', value)
const updateReason = (value: string) => emit('update:reason', value)
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
