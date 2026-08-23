<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="540px"
    :close-on-click-modal="false"
    destroy-on-close
    @close="reset"
  >
    <!-- 批次模式：列出勾選單據的對象／金額與合計，簽名板/照片與單筆模式共用同一套邏輯 -->
    <div v-if="isBatch" class="so-batch-list">
      <div class="so-batch-list__header">
        已選取 {{ records!.length }} 筆待簽收
        <span class="so-batch-list__total">合計 {{ formatMoney(batchTotal) }}</span>
      </div>
      <ul class="so-batch-list__items">
        <li v-for="r in records" :key="r.id">
          <span class="so-batch-list__party">{{ r.partyName }}</span>
          <span class="so-batch-list__amount">{{ formatMoney(r.amount) }}</span>
        </li>
      </ul>
    </div>

    <el-tabs v-model="activeTab" class="so-sign-tabs">
      <!-- 主要路徑：上傳簽好的紙本照片 -->
      <el-tab-pane label="上傳紙本照片" name="photo">
        <el-upload
          v-if="!photoPreview"
          drag
          class="so-sign-upload"
          :auto-upload="false"
          :limit="1"
          :show-file-list="false"
          accept="image/png,image/jpeg,image/webp"
          :on-change="handleUploadChange"
        >
          <div class="so-sign-upload__inner">
            <el-icon class="so-sign-upload__icon"><UploadFilled /></el-icon>
            <div class="so-sign-upload__text">拖曳照片到這裡，或<em>點擊選擇</em></div>
            <div class="so-sign-upload__hint">{{ config.texts.signUploadHint }}</div>
          </div>
        </el-upload>

        <div v-else class="so-sign-preview">
          <img :src="photoPreview" alt="簽收照片預覽" />
          <div class="so-sign-preview__bar">
            <span class="so-sign-preview__name">{{ photoName }}</span>
            <el-button size="small" text @click="handleUploadRemove">重新選擇</el-button>
          </div>
        </div>
        <p class="so-sign-note">上傳前會自動壓縮，手機拍的大圖也沒問題</p>
      </el-tab-pane>

      <!-- 次要路徑：當場於螢幕手寫 -->
      <el-tab-pane label="當場手寫" name="drawn">
        <div class="signature-pad">
          <canvas
            ref="canvasRef"
            width="480"
            height="200"
            class="signature-canvas"
            @mousedown="startDraw"
            @mousemove="draw"
            @mouseup="endDraw"
            @mouseleave="endDraw"
            @touchstart.prevent="startDraw"
            @touchmove.prevent="draw"
            @touchend.prevent="endDraw"
          />
          <div class="signature-hint">{{ config.texts.signPadHint }}</div>
        </div>
        <div class="dialog-tools">
          <el-button @click="clearCanvas">清除重簽</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        {{ isBatch ? `確認批次簽收（${records!.length}）` : '確認簽收' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { SignoffModuleConfig } from '@/config/signoffModules'
import { compressImageToDataUrl } from '@/utils/imageCompress'
import { formatCurrency } from '@/utils/currency'

/** 批次模式下要簽收的單一筆紀錄摘要（供對象／金額清單顯示）。 */
interface BatchSignRecord {
  id: number
  partyName: string
  amount: number
}

/** 批次簽收回傳（沿用後端 SignoffBatchSignResultOut shape）。 */
interface BatchSignResult {
  results: Array<{ id: number | null; ok: boolean; error?: string | null }>
  succeeded: number
  failed: number
}

const props = withDefaults(defineProps<{
  modelValue?: boolean
  recordId?: number | null
  /** 非空陣列時進入批次模式：忽略 recordId，改對這批 id 送同一次簽名。 */
  records?: BatchSignRecord[] | null
  config: SignoffModuleConfig
}>(), {
  modelValue: false,
  recordId: null,
  records: null,
})
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /** 單筆模式：無 payload；批次模式：帶完整 {results, succeeded, failed} 供上層做逐筆回饋。 */
  'signed': [result?: BatchSignResult]
}>()

const isBatch = computed(() => Array.isArray(props.records) && props.records.length > 0)
const batchTotal = computed(() => (props.records ?? []).reduce((sum, r) => sum + r.amount, 0))
const dialogTitle = computed(() =>
  isBatch.value ? `批次簽收（${props.records!.length} 筆）` : props.config.texts.signTitle,
)
const formatMoney = (value: number) => formatCurrency(value)

const visible = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) nextTick(() => resetCanvas())
  },
)
watch(visible, (v) => emit('update:modelValue', v))

// 預設走主要路徑：上傳紙本照片
const activeTab = ref<'drawn' | 'photo'>('photo')
const submitting = ref<boolean>(false)

// ── 畫板 ──
const canvasRef = ref<HTMLCanvasElement | null>(null)
const drawing = ref<boolean>(false)
let lastX = 0
let lastY = 0
let drawn = false

function pointer(e: MouseEvent | TouchEvent): [number, number] {
  const rect = canvasRef.value!.getBoundingClientRect()
  const touch = (e as TouchEvent).touches?.[0]
  const clientX = touch ? touch.clientX : (e as MouseEvent).clientX
  const clientY = touch ? touch.clientY : (e as MouseEvent).clientY
  return [clientX - rect.left, clientY - rect.top]
}

function startDraw(e: MouseEvent | TouchEvent) {
  if (!canvasRef.value) return
  drawing.value = true
  ;[lastX, lastY] = pointer(e)
}

function draw(e: MouseEvent | TouchEvent) {
  if (!drawing.value || !canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return
  const [x, y] = pointer(e)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 2.5
  ctx.strokeStyle = '#222'
  ctx.beginPath()
  ctx.moveTo(lastX, lastY)
  ctx.lineTo(x, y)
  ctx.stroke()
  lastX = x
  lastY = y
  drawn = true
}

function endDraw() {
  drawing.value = false
}

function resetCanvas() {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  drawn = false
}

function clearCanvas() {
  resetCanvas()
}

// ── 照片上傳 ──
const photoPreview = ref<string>('')
const photoName = ref<string>('')
const photoFile = ref<File | null>(null)

function handleUploadChange(file: { raw?: File; size?: number; name?: string }) {
  if (!file?.raw) return
  // 壓縮在 submit 處理，這裡只擋極端大檔避免瀏覽器卡頓
  if (file.raw.size > 25 * 1024 * 1024) {
    ElMessage.warning('圖檔過大（超過 25 MB），請改用較小的照片')
    return
  }
  releasePreview()
  photoFile.value = file.raw
  photoName.value = file.name || file.raw.name
  photoPreview.value = URL.createObjectURL(file.raw)
}

function handleUploadRemove() {
  releasePreview()
  photoFile.value = null
  photoName.value = ''
  photoPreview.value = ''
}

function releasePreview() {
  if (photoPreview.value.startsWith('blob:')) URL.revokeObjectURL(photoPreview.value)
}

function reset() {
  activeTab.value = 'photo'
  handleUploadRemove()
  drawn = false
}

async function submit() {
  if (isBatch.value ? !props.records?.length : !props.recordId) return
  const kind = activeTab.value

  // 先驗證輸入，再開 loading（單筆／批次共用同一套簽名擷取邏輯，僅送出目標不同）
  if (kind === 'drawn' && !drawn) {
    ElMessage.warning('請先簽名')
    return
  }
  if (kind === 'photo' && !photoFile.value) {
    ElMessage.warning('請選擇照片')
    return
  }

  submitting.value = true
  try {
    let dataUrl = ''
    if (kind === 'drawn') {
      dataUrl = canvasRef.value!.toDataURL('image/png')
    } else {
      dataUrl = await compressImageToDataUrl(photoFile.value!)
    }
    if (isBatch.value) {
      const res = await props.config.api.batchSign({
        ids: props.records!.map((r) => r.id),
        signature_kind: kind,
        signature_data: dataUrl,
      })
      // per-筆成功/失敗回饋交由上層（Panel）處理：toast、失敗原因列表、保留失敗筆勾選重試
      emit('signed', res.data as BatchSignResult)
    } else {
      await props.config.api.sign(props.recordId!, {
        signature_kind: kind,
        signature_data: dataUrl,
      })
      ElMessage.success('簽收成功')
      emit('signed')
    }
    visible.value = false
  } catch (e) {
    const axiosErr = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(axiosErr?.response?.data?.detail || '簽收失敗')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.so-sign-tabs {
  min-height: 240px;
}

/* 批次模式：勾選清單 */
.so-batch-list {
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-3, 12px);
  margin-bottom: var(--space-3, 12px);
  background: var(--neutral-50, #f8fafc);
}
.so-batch-list__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: var(--text-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-secondary, #64748b);
  margin-bottom: var(--space-2, 8px);
}
.so-batch-list__total {
  font-variant-numeric: tabular-nums;
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, #1e293b);
}
.so-batch-list__items {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 160px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.so-batch-list__items li {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm, 13px);
}
.so-batch-list__party {
  color: var(--text-primary, #1e293b);
}
.so-batch-list__amount {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary, #64748b);
}

/* 上傳區 */
.so-sign-upload :deep(.el-upload),
.so-sign-upload :deep(.el-upload-dragger) {
  width: 100%;
}
.so-sign-upload__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: var(--space-4, 16px);
}
.so-sign-upload__icon {
  font-size: 40px;
  color: var(--neutral-400, #94a3b8);
}
.so-sign-upload__text {
  font-size: var(--text-base, 14px);
  color: var(--text-secondary, #64748b);
}
.so-sign-upload__text em {
  font-style: normal;
  color: var(--brand-primary, #4f46e5);
  font-weight: var(--font-weight-medium, 500);
}
.so-sign-upload__hint {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

.so-sign-preview {
  border: 1px solid var(--neutral-200, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  background: var(--neutral-50, #f8fafc);
}
.so-sign-preview img {
  display: block;
  width: 100%;
  max-height: 280px;
  object-fit: contain;
  background: #fff;
}
.so-sign-preview__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
}
.so-sign-preview__name {
  font-size: var(--text-sm, 13px);
  color: var(--text-secondary, #64748b);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.so-sign-note {
  margin: var(--space-3, 12px) 0 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
}

/* 手寫畫板 */
.signature-pad {
  border: 1px dashed var(--neutral-300, #cbd5e1);
  border-radius: var(--radius-md, 8px);
  padding: 8px;
  background: #fff;
}
.signature-canvas {
  width: 100%;
  height: 200px;
  background: #fff;
  cursor: crosshair;
  touch-action: none;
}
.signature-hint {
  text-align: center;
  color: var(--text-tertiary, #94a3b8);
  font-size: var(--text-xs, 12px);
  margin-top: 4px;
}
.dialog-tools {
  margin-top: var(--space-3, 12px);
  display: flex;
  justify-content: flex-end;
}
</style>
