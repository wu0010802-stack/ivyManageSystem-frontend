<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import M3List from '../components/m3/M3List.vue'
import M3ListItem from '../components/m3/M3ListItem.vue'
import M3Divider from '../components/m3/M3Divider.vue'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const ITEMS = [
  { headline: '請假', supportingText: '送出請假申請、查詢假單狀態', leadingIcon: 'event_busy', path: '/leaves' },
  { headline: '繳費', supportingText: '查詢應繳/已繳費用', leadingIcon: 'payments', path: '/fees' },
  { headline: '用藥委託', supportingText: '新增/查詢委託用藥單', leadingIcon: 'medication', path: '/medications' },
  { headline: '課後才藝', supportingText: '才藝課程報名與紀錄', leadingIcon: 'palette', path: '/activity' },
  { headline: '待簽紀錄', supportingText: '需家長簽收的通知事項', leadingIcon: 'mark_email_read', path: '/events' },
] as const

const children = computed(() =>
  (childrenStore.items || []) as { student_id: number; name?: string }[],
)

const childProfileTarget = computed(() => {
  const sid = selectedId.value || children.value[0]?.student_id || null
  return sid ? `/children/${sid}` : null
})

const childProfileSupporting = computed(() => {
  const list = children.value
  if (list.length === 0) return '尚未綁定子女'
  if (list.length === 1) return `${list[0].name || ''} · 基本資料 / 健康 / 照片 / 報告 / 出勤`
  return `${list.length} 位 · 基本資料 / 健康 / 照片 / 報告 / 出勤`
})

function go(path: string) {
  router.push(path)
}

function goChildProfile() {
  if (childProfileTarget.value) router.push(childProfileTarget.value)
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(children.value)
})
</script>

<template>
  <div class="admin-list-view">
    <M3List>
      <M3ListItem
        v-for="item in ITEMS"
        :key="item.path"
        :headline="item.headline"
        :supporting-text="item.supportingText"
        :leading-icon="item.leadingIcon"
        trailing-icon="chevron_right"
        clickable
        @click="go(item.path)"
      />

      <M3Divider class="admin-divider" />

      <M3ListItem
        headline="孩子檔案"
        :supporting-text="childProfileSupporting"
        leading-icon="folder_shared"
        trailing-icon="chevron_right"
        :clickable="!!childProfileTarget"
        :disabled="!childProfileTarget"
        @click="goChildProfile"
      />
    </M3List>
  </div>
</template>

<style scoped>
.admin-list-view {
  padding: 8px 0 16px;
  background: var(--m3-surface, #f7fbf3);
  min-height: 100%;
}
.admin-divider {
  margin: 8px 0;
}
</style>
