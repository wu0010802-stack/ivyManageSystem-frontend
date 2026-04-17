<template>
  <el-select
    :model-value="termKey"
    size="default"
    style="width: 150px"
    @change="handleChange"
  >
    <el-option
      v-for="opt in options"
      :key="opt.value"
      :label="opt.label"
      :value="opt.value"
    />
  </el-select>
</template>

<script setup>
import { computed } from 'vue'

import { useAcademicTermStore } from '@/stores/academicTerm'

const termStore = useAcademicTermStore()

const termKey = computed(() => `${termStore.school_year}-${termStore.semester}`)

const options = computed(() => {
  const cy = termStore.school_year
  const cs = termStore.semester
  const prev = cs === 1
    ? { school_year: cy - 1, semester: 2 }
    : { school_year: cy, semester: 1 }
  const next = cs === 1
    ? { school_year: cy, semester: 2 }
    : { school_year: cy + 1, semester: 1 }
  return [prev, { school_year: cy, semester: cs }, next].map((t) => ({
    value: `${t.school_year}-${t.semester}`,
    label: `${t.school_year} 學年度 ${t.semester === 1 ? '上' : '下'}學期`,
    school_year: t.school_year,
    semester: t.semester,
  }))
})

function handleChange(val) {
  const opt = options.value.find((o) => o.value === val)
  if (opt) termStore.setTerm(opt.school_year, opt.semester)
}
</script>
