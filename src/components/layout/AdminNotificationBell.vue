<template>
  <template v-if="!isMobile">
    <el-popover
      v-model:visible="popoverVisible"
      placement="bottom-end"
      trigger="click"
      :width="380"
      popper-class="notification-popover"
    >
      <template #reference>
        <el-badge :value="badgeCount" :hidden="badgeCount <= 0" :max="99">
          <button class="notification-trigger" type="button" aria-label="通知中心">
            <el-icon><Bell /></el-icon>
          </button>
        </el-badge>
      </template>
      <div class="notification-panel">
        <NotificationSections @navigate="handleNavigate" />
      </div>
    </el-popover>
  </template>
  <template v-else>
    <el-badge :value="badgeCount" :hidden="badgeCount <= 0" :max="99">
      <button
        class="notification-trigger"
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
      size="88%"
    >
      <div class="notification-panel notification-panel--drawer">
        <NotificationSections @navigate="handleNavigate" />
      </div>
    </el-drawer>
  </template>
</template>

<script setup>
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Bell } from '@element-plus/icons-vue'
import { useNotificationStore } from '@/stores/notification'

defineProps({
  isMobile: { type: Boolean, default: false },
})

const router = useRouter()
const notificationStore = useNotificationStore()
const popoverVisible = ref(false)
const drawerVisible = ref(false)

const badgeCount = computed(() => notificationStore.badgeCount)
const actionItems = computed(() => notificationStore.actionItems)
const reminders = computed(() => notificationStore.reminders)

const handleNavigate = (route) => {
  popoverVisible.value = false
  drawerVisible.value = false
  if (route) router.push(route)
}

onMounted(() => {
  notificationStore.fetchSummary()
})

const NotificationSections = defineComponent({
  name: 'NotificationSections',
  emits: ['navigate'],
  setup(_, { emit }) {
    const onNavigate = (route) => emit('navigate', route)

    const renderItemMeta = (item) => {
      if (!item.meta && !item.date) return null
      const parts = [item.meta, item.date].filter(Boolean)
      return h('div', { class: 'notification-subtitle' }, parts.join(' ・ '))
    }

    const renderSection = (title, items, sectionClass, itemRenderer) =>
      h('section', { class: ['notification-section', sectionClass] }, [
        h('div', { class: 'notification-section__header' }, title),
        ...items.map(itemRenderer),
      ])

    return () => {
      if (!actionItems.value.length && !reminders.value.length) {
        return h('div', { class: 'notification-empty' }, '目前沒有待處理通知')
      }

      const sections = []

      if (actionItems.value.length) {
        sections.push(renderSection('待處理', actionItems.value, 'notification-section--action', (item) =>
          h(
            'button',
            {
              type: 'button',
              class: 'notification-item',
              'data-test': `notification-item-${item.type}`,
              onClick: () => onNavigate(item.route),
            },
            [
              h('div', { class: 'notification-item__body' }, [
                h('div', { class: 'notification-title' }, item.title),
                h('div', { class: 'notification-subtitle' }, `共 ${item.count} 筆待處理`),
              ]),
              h('div', { class: 'notification-item__count' }, String(item.count)),
              h('span', { class: 'notification-item__arrow' }, [h(ArrowRight)]),
            ]
          )
        ))
      }

      if (reminders.value.length) {
        sections.push(renderSection('提醒', reminders.value, 'notification-section--reminder', (group) =>
          h('div', { class: 'notification-reminder-group', 'data-test': `notification-item-${group.type}` }, [
            h(
              'button',
              {
                type: 'button',
                class: 'notification-reminder-group__link',
                onClick: () => onNavigate(group.route),
              },
              [
                h('div', { class: 'notification-title' }, group.title),
                h('span', { class: 'notification-item__arrow' }, [h(ArrowRight)]),
              ]
            ),
            ...(group.items || []).slice(0, 3).map((item) =>
              h('div', { class: 'notification-reminder-item' }, [
                h('div', { class: 'notification-title notification-title--small' }, item.label),
                renderItemMeta(item),
              ])
            ),
          ])
        ))
      }

      return h('div', { class: 'notification-scroll' }, sections)
    }
  },
})
</script>

<style scoped>
.notification-trigger {
  width: 40px;
  height: 40px;
  border: 1px solid var(--border-color-light);
  border-radius: 999px;
  background: var(--surface-color);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--transition-base);
}

.notification-trigger:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-lighter);
  background: var(--color-primary-lighter);
}

.notification-panel {
  padding: 4px 0;
}

.notification-scroll {
  max-height: 420px;
  overflow-y: auto;
  padding-right: 2px;
}

.notification-panel--drawer {
  height: 100%;
}

.notification-section + .notification-section {
  margin-top: 16px;
}

.notification-section__header {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 8px;
  padding: 0 4px;
}

.notification-item,
.notification-reminder-group__link {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  border-radius: var(--radius-md);
  padding: 12px;
  text-align: left;
  transition: background-color var(--transition-base);
}

.notification-item:hover,
.notification-reminder-group__link:hover {
  background: var(--bg-color);
}

.notification-item__body {
  flex: 1;
  min-width: 0;
}

.notification-item__count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-danger);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 700;
  margin-left: 12px;
}

.notification-item__arrow {
  color: var(--text-quaternary);
  margin-left: 10px;
}

.notification-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.notification-title--small {
  font-weight: 500;
}

.notification-subtitle {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  margin-top: 4px;
}

.notification-reminder-group {
  padding: 6px 0;
}

.notification-reminder-item {
  padding: 0 12px 10px;
}

.notification-empty {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
  text-align: center;
  padding: 24px 12px;
}
</style>
