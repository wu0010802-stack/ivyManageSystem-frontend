<template>
  <el-dialog
    v-model="visible"
    title="廠商簽收"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
    @close="reset"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="畫簽名" name="drawn">
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
          <div class="signature-hint">請廠商於上方框內簽名</div>
        </div>
        <div class="dialog-tools">
          <el-button @click="clearCanvas">清除</el-button>
        </div>
      </el-tab-pane>

      <el-tab-pane label="上傳照片" name="photo">
        <el-upload
          class="photo-upload"
          :auto-upload="false"
          :limit="1"
          :show-file-list="true"
          accept="image/png,image/jpeg,image/webp"
          :on-change="handleUploadChange"
          :on-remove="handleUploadRemove"
        >
          <el-button type="primary">選擇照片</el-button>
          <template #tip>
            <div class="upload-tip">PNG / JPG / WEBP，最大 1 MB</div>
          </template>
        </el-upload>
        <div v-if="photoPreview" class="photo-preview">
          <img :src="photoPreview" alt="預覽" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">
        確認簽收
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { signVendorPayment } from '@/api/vendorPayment'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  paymentId: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue', 'signed'])

const visible = ref(props.modelValue)
watch(
  () => props.modelValue,
  (v) => {
    visible.value = v
    if (v) nextTick(() => resetCanvas())
  }
)
watch(visible, (v) => emit('update:modelValue', v))

const activeTab = ref('drawn')
const submitting = ref(false)

// ── 畫板 ──
const canvasRef = ref(null)
const drawing = ref(false)
let lastX = 0
let lastY = 0
let drawn = false

function pointer(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const t = e.touches?.[0]
  const x = (t ? t.clientX : e.clientX) - rect.left
  const y = (t ? t.clientY : e.clientY) - rect.top
  return [x, y]
}

function startDraw(e) {
  if (!canvasRef.value) return
  drawing.value = true
  ;[lastX, lastY] = pointer(e)
}

function draw(e) {
  if (!drawing.value) return
  const ctx = canvasRef.value.getContext('2d')
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
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)
  drawn = false
}

function clearCanvas() {
  resetCanvas()
}

// ── 照片上傳 ──
const photoPreview = ref('')
const photoFile = ref(null)

function handleUploadChange(file) {
  if (!file?.raw) return
  if (file.raw.size > 1024 * 1024) {
    ElMessage.warning('圖檔超過 1 MB，請壓縮後再試')
    photoFile.value = null
    photoPreview.value = ''
    return
  }
  photoFile.value = file.raw
  const reader = new FileReader()
  reader.onload = (e) => {
    photoPreview.value = e.target.result
  }
  reader.readAsDataURL(file.raw)
}

function handleUploadRemove() {
  photoFile.value = null
  photoPreview.value = ''
}

function reset() {
  activeTab.value = 'drawn'
  photoFile.value = null
  photoPreview.value = ''
  drawn = false
}

async function submit() {
  if (!props.paymentId) return
  let dataUrl = ''
  let kind = activeTab.value
  if (kind === 'drawn') {
    if (!drawn) {
      ElMessage.warning('請先簽名')
      return
    }
    dataUrl = canvasRef.value.toDataURL('image/png')
  } else {
    if (!photoPreview.value) {
      ElMessage.warning('請選擇照片')
      return
    }
    dataUrl = photoPreview.value
  }

  submitting.value = true
  try {
    await signVendorPayment(props.paymentId, {
      signature_kind: kind,
      signature_data: dataUrl,
    })
    ElMessage.success('簽收成功')
    emit('signed')
    visible.value = false
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '簽收失敗')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.signature-pad {
  border: 1px dashed #c0c4cc;
  border-radius: 6px;
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
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.dialog-tools {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.upload-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.photo-preview {
  margin-top: 12px;
  text-align: center;
}
.photo-preview img {
  max-width: 100%;
  max-height: 200px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}
</style>
