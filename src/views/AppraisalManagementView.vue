<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const TABS = [
  { name: 'current', label: '當期總覽' },
  { name: 'history', label: '歷史週期與簽核' },
  { name: 'institution-events', label: '活動出席' },
  { name: 'disciplinary', label: '懲處記錄' },
]

const route = useRoute()
const router = useRouter()
const activeTab = computed(() => route.path.split('/')[3] ?? 'current')
const onTabChange = (name: string | number) => {
  if (String(name) !== activeTab.value) router.push(`/appraisal-year-end/appraisal/${name}`)
}
</script>

<template>
  <el-tabs :model-value="activeTab" type="card" @tab-change="onTabChange">
    <el-tab-pane v-for="t in TABS" :key="t.name" :label="t.label" :name="t.name" />
  </el-tabs>
  <router-view />
</template>
