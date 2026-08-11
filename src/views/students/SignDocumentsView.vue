<template>
  <div class="sign-documents-view">
    <PageHeader title="入學文件簽署" subtitle="範本管理 · 發送追蹤 · 家長 LIFF 線上簽署">
      <template #icon>
        <div class="page-header-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </div>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="sign-documents-tabs" @tab-change="onTabChange">
      <el-tab-pane label="範本管理" name="templates">
        <TemplateManagementPanel :can-write="canWrite" />
      </el-tab-pane>
      <el-tab-pane label="發送追蹤" name="tracking" lazy>
        <TrackingPanel :can-write="canWrite" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { hasPermission } from '@/utils/auth'
import PageHeader from '@/components/common/PageHeader.vue'
import TemplateManagementPanel from '@/components/signDocuments/TemplateManagementPanel.vue'
import TrackingPanel from '@/components/signDocuments/TrackingPanel.vue'

const VALID_TABS = ['templates', 'tracking'] as const
type SignDocumentsTab = (typeof VALID_TABS)[number]

const route = useRoute()
const router = useRouter()
const initialTab = ((): SignDocumentsTab => {
  const t = typeof route.query.tab === 'string' ? route.query.tab : ''
  return (VALID_TABS as readonly string[]).includes(t) ? (t as SignDocumentsTab) : 'templates'
})()
const activeTab = ref<SignDocumentsTab>(initialTab)

const canWrite = computed(() => hasPermission('STUDENTS_WRITE'))

function onTabChange(name: string | number) {
  router.replace({ query: { ...route.query, tab: String(name) } })
}
</script>

<style scoped>
.page-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md, 8px);
  background: var(--color-primary-light, #ecf5ff);
  color: var(--color-primary, #4eb87a);
}

.sign-documents-tabs {
  margin-top: var(--space-4, 16px);
}
</style>
