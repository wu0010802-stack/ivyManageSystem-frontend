<template>
  <div class="portal-activity">
    <PortalPageHeader title="才藝報名" />

    <div v-if="loading" v-loading="true" style="min-height: 200px"></div>
    <template v-else-if="data">
      <ActivityRegistrationPanel
        :data="data"
        :loading="loading"
        v-model:active-class="activeClass"
      />
    </template>
    <EmptyState v-else-if="!loading" variant="mobile" title="無班級資料" />
  </div>
</template>

<script setup lang="ts">
// 課程點名已於 2026-09-14 拆為獨立頁 /portal/activity/attendance（側欄獨立入口），
// 本頁只剩課程報名。舊網址 /portal/activity?tab=attendance 由 router 的 beforeEnter
// 轉址過去，存量書籤與推播 deep link 不受影響。
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getPortalActivityRegistrations } from '@/api/activity'
import type { Schema } from '@/api/_generated/typed'
import PortalPageHeader from '@/components/portal/PortalPageHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ActivityRegistrationPanel from './components/activity/ActivityRegistrationPanel.vue'

// 後端已補 response_model（PortalRegistrationsOut）→ 直接用 codegen 型別
type RegistrationData = Schema<'PortalRegistrationsOut'>
const loading = ref(false)
const data = ref<RegistrationData | null>(null)
const activeClass = ref('')

async function loadRegistrations() {
  loading.value = true
  try {
    const res = await getPortalActivityRegistrations()
    const d = res.data
    data.value = d
    if (d.classrooms.length > 0) {
      activeClass.value = d.classrooms[0]
    }
  } catch {
    ElMessage.error('載入才藝報名資料失敗')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadRegistrations()
})
</script>

<style scoped>
.portal-activity { padding: 16px; }
</style>
