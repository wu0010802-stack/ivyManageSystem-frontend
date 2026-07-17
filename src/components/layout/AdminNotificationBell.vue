<template>
  <template v-if="!isMobile">
    <el-popover
      v-model:visible="popoverVisible"
      placement="bottom-end"
      trigger="click"
      :width="400"
      popper-class="notification-popover"
    >
      <template #reference>
        <el-badge :value="badgeCount" :hidden="badgeCount <= 0" :max="99">
          <button class="nf-trigger" type="button" aria-label="通知中心">
            <el-icon><Bell /></el-icon>
          </button>
        </el-badge>
      </template>
      <NotificationPanel
        :badge-count="badgeCount"
        :action-items="actionItems"
        :reminders="reminders"
        @navigate="handleNavigate"
      />
    </el-popover>
  </template>

  <template v-else>
    <el-badge :value="badgeCount" :hidden="badgeCount <= 0" :max="99">
      <button
        class="nf-trigger"
        type="button"
        aria-label="通知中心"
        @click="drawerVisible = true"
      >
        <el-icon><Bell /></el-icon>
      </button>
    </el-badge>
    <el-drawer
      v-model="drawerVisible"
      title="通知中心"
      direction="rtl"
      size="92%"
    >
      <NotificationPanel
        :badge-count="badgeCount"
        :action-items="actionItems"
        :reminders="reminders"
        @navigate="handleNavigate"
      />
    </el-drawer>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { Bell } from '@element-plus/icons-vue'
import { useNotificationStore } from '@/stores/notification'
import NotificationPanel from '@/components/layout/NotificationPanel.vue'
import type { NotificationItem, ReminderGroup } from '@/components/layout/NotificationPanel.vue'

withDefaults(defineProps<{
  isMobile?: boolean
}>(), {
  isMobile: false,
})

const router = useRouter()
const notificationStore = useNotificationStore()
const popoverVisible = ref<boolean>(false)
const drawerVisible = ref<boolean>(false)

const { badgeCount } = storeToRefs(notificationStore)
const actionItems = computed(() => notificationStore.actionItems as NotificationItem[])
const reminders = computed(() => notificationStore.reminders as ReminderGroup[])

const handleNavigate = (route: string | null | undefined) => {
  popoverVisible.value = false
  drawerVisible.value = false
  if (route) router.push(route)
}

onMounted(() => {
  notificationStore.fetchSummary()
})
</script>

<style scoped>
/* ── Trigger Button ─────────────────────────────── */
.nf-trigger {
  width: var(--touch-target-min);
  height: var(--touch-target-min);
  border: 1px solid var(--border-color-light);
  border-radius: 999px;
  background: var(--surface-color);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color var(--transition-base), border-color var(--transition-base), background-color var(--transition-base);
}
.nf-trigger:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-lighter);
  background: var(--color-primary-lighter);
}
</style>
