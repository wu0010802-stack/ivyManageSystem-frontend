<script setup>
/**
 * 請假附件區塊（presentational + emits）。
 *
 * Props:
 *  - attachments: Array — 附件清單（含 id / original_filename）
 *  - editable: Boolean — 是否可上傳/刪除（呼叫端決定，例如「approved 且尚未開始」）
 *  - uploading: Boolean — 上傳進行中（鎖按鈕）
 *  - urlResolver: Function — 接 attachment 物件回傳 URL
 *
 * Emits:
 *  - upload(file: File) — 使用者選了檔案
 *  - remove(attachment) — 刪除按鈕點擊
 */
import ParentIcon from '@/parent/components/ParentIcon.vue'

defineProps({
  attachments: { type: Array, default: () => [] },
  editable: { type: Boolean, default: false },
  uploading: { type: Boolean, default: false },
  urlResolver: { type: Function, required: true },
})

const emit = defineEmits(['upload', 'remove'])

function onFileChange(e) {
  const file = e.target.files?.[0]
  // 先清空 value 確保使用者可再次選同一檔案
  e.target.value = ''
  if (!file) return
  emit('upload', file)
}
</script>

<template>
  <div class="leave-att">
    <p v-if="!editable" class="detail-hint">
      請假已成立或已開始，無法新增/刪除附件。
    </p>
    <div v-if="attachments.length" class="att-list">
      <div v-for="a in attachments" :key="a.id" class="att-row">
        <a :href="urlResolver(a)" target="_blank" rel="noopener" class="att-link">
          <ParentIcon name="attachment" size="xs" />
          {{ a.original_filename || `附件 #${a.id}` }}
        </a>
        <button
          v-if="editable"
          type="button"
          class="att-del"
          :aria-label="`刪除附件 ${a.original_filename || `附件 ${a.id}`}`"
          @click="emit('remove', a)"
        >刪除</button>
      </div>
    </div>
    <div v-else class="att-empty">尚未上傳任何附件</div>
    <label v-if="editable" class="upload-btn">
      <input
        type="file"
        accept="image/*,.pdf,.heic,.heif"
        :disabled="uploading"
        @change="onFileChange"
      />
      <span class="upload-label">
        <template v-if="uploading">上傳中...</template>
        <template v-else>
          <ParentIcon name="plus" size="sm" />
          上傳附件
        </template>
      </span>
    </label>
  </div>
</template>

<style scoped>
.detail-hint {
  font-size: 12px;
  color: var(--pt-text-placeholder);
  margin: 0 0 6px;
}

/* 附件清單 */
.att-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.att-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--pt-surface-mute-soft);
  border-radius: 6px;
}
.att-link {
  flex: 1;
  font-size: 13px;
  color: var(--pt-info-link);
  text-decoration: none;
  word-break: break-all;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.att-del {
  background: transparent;
  border: 1px solid #e0c4c0;
  color: var(--color-danger);
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
.att-empty {
  font-size: 13px;
  color: var(--pt-text-placeholder);
  padding: 8px 0;
}
.upload-btn {
  display: block;
  margin-top: 10px;
  padding: 10px;
  text-align: center;
  background: var(--neutral-0);
  border: 1px dashed var(--pt-text-disabled);
  border-radius: 8px;
  color: var(--pt-text-muted);
  font-size: 14px;
  cursor: pointer;
}
.upload-btn input {
  display: none;
}
.upload-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
}
</style>
