<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import M3List from '../components/m3/M3List.vue'
import M3ListItem from '../components/m3/M3ListItem.vue'

const router = useRouter()
const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const children = computed(() =>
  (childrenStore.items || []) as { student_id: number; name?: string }[],
)

/** 目前操作對象子女：優先用選中 id，無選中時 fallback 第一位。 */
const targetId = computed(() => selectedId.value || children.value[0]?.student_id || null)

const childSupporting = computed(() => {
  const list = children.value
  if (list.length === 0) return '尚未綁定子女'
  if (list.length === 1) return `${list[0].name || ''} · 基本資料 / 健康 / 照片 / 報告`
  return `${list.length} 位 · 基本資料 / 健康 / 照片 / 報告`
})

interface HubItem {
  key: string
  headline: string
  supportingText: string
  leadingIcon: string
  path: string | null
}

const items = computed<HubItem[]>(() => {
  const id = targetId.value
  return [
    {
      // path 依 id 而非固定字串：無子女時本項也要 disabled（聯絡簿依所選子女顯示，
      // 沒有子女就沒有聯絡簿可看），維持五項一致的 disabled 語意。
      key: 'contact-book',
      headline: '今日聯絡簿',
      supportingText: '出席、餐點、午睡、老師留言',
      leadingIcon: 'auto_stories',
      path: id ? '/contact-book' : null,
    },
    {
      key: 'photos',
      headline: '照片牆',
      supportingText: '在園日常隨手拍',
      leadingIcon: 'photo_library',
      path: id ? `/children/${id}/photos` : null,
    },
    {
      key: 'reports',
      headline: '成長報告',
      supportingText: '歷次評量與發展紀錄',
      leadingIcon: 'insights',
      path: id ? `/children/${id}/reports` : null,
    },
    {
      key: 'measurements',
      headline: '健康紀錄',
      supportingText: '身高體重、疫苗、過敏資訊',
      leadingIcon: 'monitor_heart',
      path: id ? `/children/${id}/measurements` : null,
    },
    {
      key: 'profile',
      headline: '孩子檔案',
      supportingText: childSupporting.value,
      leadingIcon: 'folder_shared',
      path: id ? `/children/${id}` : null,
    },
  ]
})

function go(item: HubItem) {
  if (item.path) router.push(item.path)
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(children.value)
})
</script>

<template>
  <div class="child-hub-view">
    <M3List>
      <M3ListItem
        v-for="item in items"
        :key="item.key"
        :headline="item.headline"
        :supporting-text="item.supportingText"
        :leading-icon="item.leadingIcon"
        trailing-icon="chevron_right"
        :clickable="!!item.path"
        :disabled="!item.path"
        @click="go(item)"
      />
    </M3List>
  </div>
</template>

<style scoped>
.child-hub-view {
  padding: 8px 0 16px;
  background: var(--m3-surface, #f7fbf3);
  min-height: 100%;
}
</style>
