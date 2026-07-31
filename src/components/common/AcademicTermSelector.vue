<template>
  <el-select
    :model-value="termKey"
    :size="size"
    class="term-select"
    @change="handleChange"
  >
    <template #prefix>學期</template>
    <el-option
      v-for="opt in options"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </el-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { useAcademicTermStore } from '@/stores/academicTerm'
import { getCurrentAcademicTerm } from '@/utils/academic'

withDefaults(defineProps<{
  size?: 'small' | 'default' | 'large'
}>(), {
  size: 'default',
})

const termStore = useAcademicTermStore()

const termKey = computed(() => `${termStore.school_year}-${termStore.semester}`)

// 選項錨定「系統日期算出的真實本學期」，永遠只有本學期與前後各一學期。
// 不能以選取值為錨（會變成滑動視窗：連選「下一學期」即可漂移到任意學年）。
const options = computed(() => {
  const { school_year: cy, semester: cs } = getCurrentAcademicTerm()
  const prev = cs === 1
    ? { school_year: cy - 1, semester: 2 }
    : { school_year: cy, semester: 1 }
  const next = cs === 1
    ? { school_year: cy, semester: 2 }
    : { school_year: cy + 1, semester: 1 }
  const list = [prev, { school_year: cy, semester: cs }, next]
  // store 裡若殘留視窗外的學期（例如舊版滑動視窗留下的值），仍需列出才不會顯示成空白
  const sel = { school_year: termStore.school_year, semester: termStore.semester }
  if (!list.some((t) => t.school_year === sel.school_year && t.semester === sel.semester)) {
    list.unshift(sel)
  }
  return list.map((t) => {
    const isCurrent = t.school_year === cy && t.semester === cs
    return {
      value: `${t.school_year}-${t.semester}`,
      label: `${t.school_year} 學年度 ${t.semester === 1 ? '上' : '下'}學期${isCurrent ? '（本學期）' : ''}`,
      school_year: t.school_year,
      semester: t.semester,
    }
  })
})

function handleChange(val: string) {
  const opt = options.value.find((o) => o.value === val)
  if (opt) termStore.setTerm(opt.school_year, opt.semester)
}
</script>

<style scoped>
.term-select {
  width: 268px;
}
.term-select.el-select--small {
  width: 236px;
}
.term-select :deep(.el-select__prefix) {
  color: var(--el-text-color-secondary);
}
/* 選中值預設的 regular 灰看起來像 placeholder，加深到 primary 明示「已選定」 */
.term-select :deep(.el-select__placeholder:not(.is-transparent)) {
  color: var(--el-text-color-primary);
}
</style>
