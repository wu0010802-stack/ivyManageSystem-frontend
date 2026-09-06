<!-- src/components/common/FormDialog.vue
     表單型 dialog 標準殼（spec 2026-09-06-admin-form-dialog-defaults §3.2）。
     只管殼層行為：尺寸 token、footer 樣板、關閉保護、開啟聚焦、Enter 送出、錯誤捲動。
     **不擁有 el-form**：表單 ref／rules／送出 API 全留在使用端，避免大遷移耦合。
     與 EP 預設不同的預設值：destroy-on-close=true、close-on-click-modal=false。
     label 位置由 main.css 全域預設層（dialog 內表單堆疊標籤）處理，使用端仍建議明寫
     label-position="top"；刻意要左右排的短表單在 el-form 加 class="form-labels-inline"。 -->
<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import { FORM_DIALOG_WIDTH, type FormDialogSize } from '@/constants/formDialog'
import { confirmDiscardChanges } from '@/composables/useUnsavedChangesGuard'
import { useIsMobile } from '@/composables/useIsMobile'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  size?: FormDialogSize
  /** 為 true（或 getter 回 true）時，關閉前經 confirmDiscardChanges() 確認 */
  dirty?: boolean | (() => boolean)
  loading?: boolean
  disabled?: boolean
  submitText?: string
  cancelText?: string
  /** 單行輸入框按 Enter 送出（textarea、picker 內、IME 選字中不觸發） */
  enterSubmit?: boolean
  /** 開啟後聚焦第一個可輸入欄 */
  autofocus?: boolean
  /** 手機滿版；未指定時 wide 分型預設滿版 */
  fullscreenOnMobile?: boolean
  /** 字串時於 body 頂端顯示必填圖例（沿用 DESIGN.md 的 .required-legend） */
  requiredLegend?: string | false
}>(), {
  size: 'compact',
  dirty: false,
  loading: false,
  disabled: false,
  submitText: '儲存',
  cancelText: '取消',
  enterSubmit: true,
  autofocus: true,
  fullscreenOnMobile: undefined,
  requiredLegend: false,
})

/**
 * cancel＝使用者主動關閉（取消鈕／X／Esc／遮罩）且未被 dirty 攔下；
 * 程式端設 v-model=false 關閉不發 cancel，只發 closed。
 */
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  submit: []
  cancel: []
  opened: []
  closed: []
}>()

const attrs = useAttrs()
const { isMobile } = useIsMobile()
const bodyRef = ref<HTMLElement | null>(null)

const width = computed(() => FORM_DIALOG_WIDTH[props.size])
const fullscreen = computed(() => isMobile.value && (props.fullscreenOnMobile ?? props.size === 'wide'))
// 透傳給 el-dialog 的其餘屬性；使用端可覆寫 destroy-on-close / close-on-click-modal 等預設
const dialogAttrs = computed(() => ({
  destroyOnClose: true,
  closeOnClickModal: false,
  ...attrs,
}))

const isDirty = (): boolean => (typeof props.dirty === 'function' ? props.dirty() : props.dirty)

/** requiredLegend 去掉開頭的 `*`／`＊` 與其後空白；使用端傳「* 為必填」或「為必填」渲染結果相同（星號另由 .required-legend__star 補上） */
const legendText = computed(() => (props.requiredLegend ? props.requiredLegend.replace(/^[*＊]\s*/, '') : ''))

/** el-dialog before-close：X／Esc／遮罩三條路徑，皆視為使用者主動關閉，一致發 cancel */
async function handleBeforeClose(done: () => void): Promise<void> {
  if (isDirty() && !(await confirmDiscardChanges())) return
  emit('cancel')
  done()
}

/** footer 取消鈕與使用端自訂 footer 共用：dirty 檢查後關閉 */
async function requestClose(): Promise<void> {
  if (isDirty() && !(await confirmDiscardChanges())) return
  emit('cancel')
  emit('update:modelValue', false)
}

function handleSubmit(): void {
  if (props.loading || props.disabled) return
  emit('submit')
}

const PICKER_WRAPPER = '.el-select, .el-date-editor, .el-time-picker, .el-cascader, .el-autocomplete'
/** 可送出的文字類 input type；''＝未設 type（瀏覽器預設視為文字） */
const TEXT_INPUT_TYPES = ['text', 'number', 'email', 'tel', 'url', 'password', 'search', '']

function onBodyKeydown(event: KeyboardEvent): void {
  if (!props.enterSubmit || event.key !== 'Enter' || event.isComposing) return
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  const target = event.target as HTMLInputElement | null
  if (!target || target.tagName !== 'INPUT') return
  if (!TEXT_INPUT_TYPES.includes(target.type)) return
  if (target.closest(PICKER_WRAPPER)) return
  // loading／disabled 判斷放在 preventDefault 之前：送出中按 Enter 既不吞事件也不送出。
  if (props.loading || props.disabled) return
  event.preventDefault()
  handleSubmit()
}

const FOCUSABLE = 'input:not([readonly]):not([disabled]):not([type="hidden"]), textarea:not([readonly]):not([disabled])'

function focusFirstField(): void {
  const body = bodyRef.value
  if (!body) return
  const candidates = Array.from(body.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => !el.closest(PICKER_WRAPPER))
  ;(candidates[0] ?? body).focus()
}

function onOpened(): void {
  if (props.autofocus) focusFirstField()
  emit('opened')
}

/** 使用端在 validate 失敗的 callback 呼叫；回傳是否找到錯誤欄 */
function scrollToFirstError(): boolean {
  const item = bodyRef.value?.querySelector<HTMLElement>('.el-form-item.is-error')
  if (!item) return false
  item.scrollIntoView({ block: 'center', behavior: 'smooth' })
  // 優先聚焦真正可輸入的欄位；找不到才退而求其次聚焦帶 tabindex 的元素。
  const focusTarget = item.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')
    ?? item.querySelector<HTMLElement>('[tabindex]')
  focusTarget?.focus()
  return true
}

defineExpose({ requestClose, scrollToFirstError })
</script>

<template>
  <el-dialog
    v-bind="dialogAttrs"
    :model-value="modelValue"
    :title="title"
    :width="width"
    :fullscreen="fullscreen"
    :before-close="handleBeforeClose"
    :class="['ivy-form-dialog', `ivy-form-dialog--${size}`]"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @opened="onOpened"
    @closed="emit('closed')"
  >
    <template v-if="$slots['title-extra']" #header="{ titleId, titleClass }">
      <span :id="titleId" :class="titleClass">{{ title }}</span>
      <slot name="title-extra" />
    </template>

    <div
      ref="bodyRef"
      class="ivy-form-dialog__body"
      data-test="form-dialog-body"
      tabindex="-1"
      @keydown="onBodyKeydown"
    >
      <p v-if="requiredLegend" class="required-legend"><span class="required-legend__star" aria-hidden="true">*</span>{{ legendText }}</p>
      <slot />
    </div>

    <template #footer>
      <slot name="footer">
        <div class="ivy-form-dialog__footer">
          <el-button data-test="form-dialog-cancel" @click="requestClose">{{ cancelText }}</el-button>
          <slot name="footer-extra" />
          <el-button
            type="primary"
            :loading="loading"
            :disabled="loading || disabled"
            data-test="form-dialog-submit"
            @click="handleSubmit"
          >{{ submitText }}</el-button>
        </div>
      </slot>
    </template>
  </el-dialog>
</template>

<!--
  `.ivy-form-dialog--{size}` 落在 EP 渲染的 `.el-dialog` 節點上，不帶 scoped 屬性；
  分型專屬樣式要寫在全域層（main.css）。
-->
<style scoped>
.ivy-form-dialog__body { outline: none; }
.ivy-form-dialog__footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.required-legend {
  margin: 0 0 var(--space-3);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.required-legend__star {
  color: var(--el-color-danger);
  margin-right: 4px;
}
</style>
