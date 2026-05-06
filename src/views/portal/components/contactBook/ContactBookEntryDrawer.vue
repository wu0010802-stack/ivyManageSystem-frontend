<script setup>
import { computed, ref, watch } from 'vue'
import { Bell, Camera, Delete } from '@element-plus/icons-vue'
import ContactBookPhotoGrid from './ContactBookPhotoGrid.vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  entry: { type: Object, default: null },
  studentName: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  publishing: { type: Boolean, default: false },
  photoUploading: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue',
  'save-draft',    // (formPayload, version)
  'publish',       // ()
  'upload-photo',  // (opts) — el-upload style { file }
  'delete-photo',  // (photo)
  'close',
])

const MOOD_OPTIONS = [
  { value: 'happy', label: '😄 開心' },
  { value: 'normal', label: '🙂 普通' },
  { value: 'tired', label: '😴 疲倦' },
  { value: 'sad', label: '😢 難過' },
  { value: 'sick', label: '🤒 不適' },
]

const MEAL_OPTIONS = [
  { value: 0, label: '未進食' },
  { value: 1, label: '少' },
  { value: 2, label: '適中' },
  { value: 3, label: '多' },
]

const BOWEL_OPTIONS = [
  { value: 'normal', label: '正常' },
  { value: 'soft', label: '稀軟' },
  { value: 'hard', label: '硬' },
  { value: 'none', label: '未排便' },
]

const form = ref({
  mood: null,
  meal_lunch: null,
  meal_snack: null,
  nap_minutes: null,
  bowel: null,
  temperature_c: null,
  teacher_note: '',
  learning_highlight: '',
})

watch(
  () => props.entry,
  (e) => {
    if (e) {
      form.value = {
        mood: e.mood ?? null,
        meal_lunch: e.meal_lunch ?? null,
        meal_snack: e.meal_snack ?? null,
        nap_minutes: e.nap_minutes ?? null,
        bowel: e.bowel ?? null,
        temperature_c: e.temperature_c ?? null,
        teacher_note: e.teacher_note ?? '',
        learning_highlight: e.learning_highlight ?? '',
      }
    } else {
      form.value = {
        mood: null,
        meal_lunch: null,
        meal_snack: null,
        nap_minutes: null,
        bowel: null,
        temperature_c: null,
        teacher_note: '',
        learning_highlight: '',
      }
    }
  },
  { immediate: true },
)

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isPublished = computed(() => !!props.entry?.published_at)
const photos = computed(() => props.entry?.photos || [])

function buildPayload() {
  const f = form.value
  const norm = (v) => (v === '' || v === undefined ? null : v)
  return {
    mood: norm(f.mood),
    meal_lunch: norm(f.meal_lunch),
    meal_snack: norm(f.meal_snack),
    nap_minutes: norm(f.nap_minutes),
    bowel: norm(f.bowel),
    temperature_c: norm(f.temperature_c),
    teacher_note: norm(f.teacher_note),
    learning_highlight: norm(f.learning_highlight),
  }
}

function handleSaveDraft() {
  emit('save-draft', buildPayload(), props.entry?.version ?? 0)
}

function handlePublish() {
  emit('publish', buildPayload(), props.entry?.version ?? 0)
}

function handleClose() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :title="studentName ? `${studentName} 的聯絡簿` : '聯絡簿'"
    direction="rtl"
    size="520px"
    :close-on-click-modal="!saving && !publishing"
    @close="handleClose"
  >
    <el-form v-if="entry !== undefined" label-position="top" class="drawer-form">
      <el-alert
        v-if="entry?.published_at"
        type="success"
        :closable="false"
        show-icon
      >
        <template #title>
          此聯絡簿已於 {{ entry.published_at?.replace('T', ' ').slice(0, 16) }} 發布；修改後請點「再次發布」才會通知家長。
        </template>
      </el-alert>

      <el-form-item label="心情">
        <el-select v-model="form.mood" placeholder="選擇心情" clearable style="width: 220px">
          <el-option v-for="o in MOOD_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>

      <div class="form-row">
        <el-form-item label="午餐">
          <el-select v-model="form.meal_lunch" placeholder="選擇" clearable>
            <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="點心">
          <el-select v-model="form.meal_snack" placeholder="選擇" clearable>
            <el-option v-for="o in MEAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
      </div>

      <div class="form-row">
        <el-form-item label="午睡（分鐘）">
          <el-input-number v-model="form.nap_minutes" :min="0" :max="600" :step="15" />
        </el-form-item>
        <el-form-item label="體溫（°C）">
          <el-input-number
            v-model="form.temperature_c"
            :min="30"
            :max="45"
            :step="0.1"
            :precision="1"
          />
        </el-form-item>
      </div>

      <el-form-item label="排便">
        <el-select v-model="form.bowel" placeholder="選擇排便狀況" clearable style="width: 220px">
          <el-option v-for="o in BOWEL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>

      <el-form-item label="今日學習亮點">
        <el-input
          v-model="form.learning_highlight"
          type="textarea"
          :rows="2"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="老師留言">
        <el-input
          v-model="form.teacher_note"
          type="textarea"
          :rows="3"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="照片">
        <div v-if="!entry?.id" class="hint muted">儲存草稿後即可上傳照片</div>
        <div v-else class="photo-block">
          <div v-if="photos.length" class="photo-list">
            <div v-for="p in photos" :key="p.id" class="photo-item">
              <el-image
                :src="p.thumb_url || p.display_url"
                :preview-src-list="[p.display_url]"
                preview-teleported
                fit="cover"
                hide-on-click-modal
              />
              <el-button
                :icon="Delete"
                size="small"
                type="danger"
                text
                @click="$emit('delete-photo', p)"
              >
                刪除
              </el-button>
            </div>
          </div>
          <el-upload
            :auto-upload="true"
            :show-file-list="false"
            :http-request="(opts) => $emit('upload-photo', opts)"
            accept=".jpg,.jpeg,.png,.heic,.heif"
          >
            <el-button :icon="Camera" :loading="photoUploading">
              上傳照片
            </el-button>
            <template #tip>
              <div class="upload-tip muted">支援 JPG / PNG / HEIC，一次一張</div>
            </template>
          </el-upload>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="handleClose">關閉</el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="publishing"
          @click="handleSaveDraft"
        >
          儲存草稿
        </el-button>
        <el-button
          type="success"
          :icon="Bell"
          :loading="publishing"
          :disabled="!entry?.id || saving"
          @click="handlePublish"
        >
          {{ isPublished ? '再次發布' : '發布給家長' }}
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.drawer-form {
  padding: 0 var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.photo-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

.photo-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}

.photo-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.photo-item :deep(.el-image) {
  width: 100%;
  height: 100px;
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.upload-tip {
  font-size: var(--text-xs);
  margin-top: 4px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.muted {
  color: var(--text-tertiary);
}

.hint {
  font-size: var(--text-sm);
}

@media (max-width: 767px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
</style>
