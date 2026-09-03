<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Bell, Camera, Collection, Delete } from '@element-plus/icons-vue'
import type { UploadRequestOptions } from 'element-plus'
import { useIsMobile } from '@/composables/useIsMobile'
import { MOOD_OPTIONS } from './moods'

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
  'save-as-template',  // (fields) — 形狀同後端 TemplateFields
  'publish',       // ()
  'upload-photo',  // (opts) — el-upload style { file }
  'delete-photo',  // (photo)
  'close',
])

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

const { isMobile } = useIsMobile()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const isPublished = computed(() => !!props.entry?.published_at)
const photos = computed(() => props.entry?.photos || [])

// 家長端回流（2026-09-02 對齊稽核前教師端完全看不到已讀／回覆）
interface ParentAck { guardian_user_id: number; guardian_name?: string | null; read_at?: string | null }
interface ParentReply { id: number; guardian_name?: string | null; body: string; created_at?: string | null }
const parentAcks = computed<ParentAck[]>(() => (props.entry?.parent_acks as ParentAck[] | undefined) || [])
const parentReplies = computed<ParentReply[]>(() => (props.entry?.parent_replies as ParentReply[] | undefined) || [])
/** ISO naive 台北時間 → 'MM-DD HH:mm'；與上方發布時間同樣不走 new Date()（避免時區位移）。 */
function fmtTs(iso?: string | null): string {
  if (!iso) return ''
  return iso.replace('T', ' ').slice(5, 16)
}

function buildPayload() {
  const f = form.value
  const norm = (v: unknown) => (v === '' || v === undefined ? null : v)
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

// 存為範本：buildPayload() 產出的形狀與後端 TemplateFields 完全同構，
// 且只讀 form 不依賴 entry.id，因此尚未存成草稿時也能用。
function handleSaveAsTemplate() {
  emit('save-as-template', buildPayload())
}

function handlePublish() {
  emit('publish', buildPayload(), props.entry?.version ?? 0)
}

function handleUploadPhoto(opts: UploadRequestOptions): Promise<unknown> {
  emit('upload-photo', opts)
  return Promise.resolve()
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
    :size="isMobile ? '100%' : '520px'"
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

      <section v-if="isPublished" class="parent-signals" data-testid="cb-parent-signals" aria-label="家長回應">
        <h4 class="parent-signals__title">家長回應</h4>
        <p v-if="parentAcks.length" class="parent-signals__acks">
          已讀：<span v-for="(a, i) in parentAcks" :key="a.guardian_user_id">{{ i ? '、' : '' }}{{ a.guardian_name || '家長' }}<span class="muted">（{{ fmtTs(a.read_at) }}）</span></span>
        </p>
        <p v-else class="parent-signals__acks muted">家長尚未讀取</p>
        <ul v-if="parentReplies.length" class="parent-signals__replies">
          <li v-for="r in parentReplies" :key="r.id" class="parent-signals__reply">
            <div class="parent-signals__meta">
              <strong>{{ r.guardian_name || '家長' }}</strong>
              <span class="muted">{{ fmtTs(r.created_at) }}</span>
            </div>
            <p class="parent-signals__body">{{ r.body }}</p>
          </li>
        </ul>
      </section>

      <el-form-item label="心情">
        <el-select v-model="form.mood" placeholder="選擇心情" clearable style="width: 220px; max-width: 100%">
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
        <el-select v-model="form.bowel" placeholder="選擇排便狀況" clearable style="width: 220px; max-width: 100%">
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
            :http-request="handleUploadPhoto"
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
        <el-button :icon="Collection" @click="handleSaveAsTemplate">
          存為範本
        </el-button>
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

@media (--to-sm) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

/* 家長回應（唯讀；只在已發布時出現） */
.parent-signals {
  margin: var(--space-3) 0;
  padding: var(--space-3);
  border: 1px solid var(--border-color-light);
  border-radius: var(--radius-md, 10px);
  background: var(--bg-color-page);
}
.parent-signals__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}
.parent-signals__acks {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.parent-signals__replies {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.parent-signals__reply {
  padding: var(--space-2) var(--space-3);
  border-radius: 8px;
  background: var(--surface-color, #fff);
}
.parent-signals__meta {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  font-size: var(--text-xs);
}
.parent-signals__body {
  margin: 4px 0 0;
  font-size: var(--text-sm);
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
