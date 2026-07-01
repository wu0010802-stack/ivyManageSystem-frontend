<template>
  <div class="numpad">
    <!-- 數字鍵 1–9，再接 0 -->
    <div class="numpad__grid">
      <button
        v-for="digit in digits"
        :key="digit"
        class="numpad__btn numpad__btn--digit"
        type="button"
        @click="handleDigit(digit)"
      >
        {{ digit }}
      </button>
      <!-- 刪除鍵（佔 grid 第三列第一格）-->
      <button
        class="numpad__btn numpad__btn--delete"
        type="button"
        @click="handleDelete"
      >
        ← 刪除
      </button>
      <!-- 0 -->
      <button
        class="numpad__btn numpad__btn--digit"
        type="button"
        @click="handleDigit('0')"
      >
        0
      </button>
      <!-- 確認鍵 -->
      <button
        class="numpad__btn numpad__btn--submit"
        type="button"
        @click="handleSubmit"
      >
        確認
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * NumPad — 電子打卡 kiosk 數字鍵盤
 *
 * v-model 綁 PIN 字串；達 maxlength 後不再 append。
 * emit submit 讓父元件觸發打卡。
 */

const props = withDefaults(
  defineProps<{
    modelValue: string
    maxlength?: number
  }>(),
  { maxlength: 6 },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

/** 1–9 的數字鍵（0 另外排版置底中央）*/
const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

function handleDigit(d: string): void {
  if (props.modelValue.length >= props.maxlength) return
  emit('update:modelValue', props.modelValue + d)
}

function handleDelete(): void {
  emit('update:modelValue', props.modelValue.slice(0, -1))
}

function handleSubmit(): void {
  emit('submit')
}
</script>

<style scoped>
.numpad {
  display: inline-block;
  user-select: none;
}

.numpad__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.numpad__btn {
  padding: 1rem;
  font-size: 1.25rem;
  font-weight: 600;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 0.5rem;
  background: var(--el-fill-color-blank, #fff);
  cursor: pointer;
  transition: background 0.1s;
}

.numpad__btn:active {
  background: var(--el-fill-color, #f0f2f5);
}

.numpad__btn--delete {
  font-size: 0.9rem;
  color: var(--el-color-danger, #f56c6c);
}

.numpad__btn--submit {
  background: var(--el-color-primary, #409eff);
  color: #fff;
  border-color: var(--el-color-primary, #409eff);
}

.numpad__btn--submit:active {
  background: var(--el-color-primary-dark-2, #337ecc);
}
</style>
