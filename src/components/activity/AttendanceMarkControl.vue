<script setup lang="ts">
/**
 * 才藝點名的出缺席控制項：出席 / 缺席 / 未點名（null）三態。
 *
 * ⚠⚠ 這裡刻意**不用** `el-switch`。Element Plus 的 switch 在 setup 階段會把不在
 * `[active-value, inactive-value]` 內的 modelValue 立刻 emit 成 inactive-value
 * （`element-plus/es/components/switch/src/switch.vue2.mjs`：
 * `if (![activeValue, inactiveValue].includes(actualValue)) emit(...)`）。
 * 名冊上「未點名」是 `null`，所以整張表一渲染就被改寫成「缺席」——老師打開場次、
 * 什麼都不碰按下儲存，全班就被記成缺席，而缺席會進退費堂數（2026-09-14 實跑確認，
 * 教師端 drawer 與後台 ActivityAttendanceView 皆中招）。三態語意的欄位一律不得綁 switch。
 *
 * 已標記後不能點回「未點名」：兩顆按鈕都只會送出明確的 true/false，避免誤觸把已完成的
 * 點名清成未點。要整場重來走後端的重新點名流程，不是在這顆控制項上。
 */
withDefaults(
  defineProps<{
    /** true=出席、false=缺席、null=未點名 */
    modelValue: boolean | null
    disabled?: boolean
    /** 無障礙標籤前綴，通常帶學生姓名 */
    ariaLabel?: string
  }>(),
  { disabled: false, ariaLabel: '' },
)

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

function pick(value: boolean) {
  emit('update:modelValue', value)
}
</script>

<template>
  <el-button-group class="attendance-mark" role="group" :aria-label="ariaLabel || '出缺席'">
    <el-button
      class="attendance-mark__btn"
      :type="modelValue === true ? 'success' : ''"
      :disabled="disabled"
      :aria-pressed="modelValue === true"
      :aria-label="ariaLabel ? `${ariaLabel}：出席` : '出席'"
      data-test="mark-present"
      @click="pick(true)"
    >
      出席
    </el-button>
    <el-button
      class="attendance-mark__btn"
      :type="modelValue === false ? 'danger' : ''"
      :disabled="disabled"
      :aria-pressed="modelValue === false"
      :aria-label="ariaLabel ? `${ariaLabel}：缺席` : '缺席'"
      data-test="mark-absent"
      @click="pick(false)"
    >
      缺席
    </el-button>
  </el-button-group>
</template>

<style scoped>
.attendance-mark {
  display: inline-flex;
  white-space: nowrap;
}
.attendance-mark__btn {
  min-width: 60px;
}
/* 行動端放大到 44px 觸控目標（PRODUCT.md 無障礙基準）。桌機表格維持緊湊。 */
@media (max-width: 767.98px) {
  .attendance-mark__btn {
    min-height: var(--touch-target-min, 44px);
    min-width: 68px;
    font-size: var(--text-base, 14px);
  }
}
</style>
