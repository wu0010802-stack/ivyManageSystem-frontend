<template>
  <div class="analytics-view">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane label="招生漏斗" name="funnel" />
      <el-tab-pane label="流失預警" name="churn" />
    </el-tabs>
    <RouterView />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter, RouterView } from 'vue-router'

const route = useRoute()
const router = useRouter()
const activeTab = ref(route.path.endsWith('/churn') ? 'churn' : 'funnel')

const onTabChange = (name) => {
  router.push(`/analytics/${name}`)
}

watch(() => route.path, (p) => {
  activeTab.value = p.endsWith('/churn') ? 'churn' : 'funnel'
})
</script>

<style scoped>
.analytics-view { padding: 12px 0; }
</style>
