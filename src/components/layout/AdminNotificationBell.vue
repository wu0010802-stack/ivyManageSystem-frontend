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
      <div class="nf-panel">
        <div v-if="isEmpty" class="nf-empty">
          <el-icon class="nf-empty__icon"><Bell /></el-icon>
          <div class="nf-empty__title">目前沒有待處理通知</div>
          <div class="nf-empty__sub">新的審核或提醒出現後，會集中顯示在這裡。</div>
        </div>
        <div v-else class="nf-scroll">
          <div class="nf-hero">
            <div class="nf-hero__eyebrow">通知中心</div>
            <div class="nf-hero__headline">
              <span class="nf-hero__num">{{ badgeCount }}</span>
              <span class="nf-hero__unit">項待處理</span>
            </div>
            <div class="nf-hero__hint">審核、家長提問與提醒都會集中在這裡。</div>
          </div>

          <div v-if="actionItems.length" class="nf-section">
            <div class="nf-section__hd">
              <span class="nf-section__title">待處理</span>
              <span class="nf-section__pill">{{ actionItems.length }} 項</span>
            </div>
            <button
              v-for="item in actionItems"
              :key="item.type"
              class="nf-item"
              :data-test="`notification-item-${item.type}`"
              @click="handleNavigate(item.route)"
            >
              <span class="nf-icon" :class="`nf-icon--${itemMeta[item.type]?.tone || 'primary'}`">
                <el-icon><component :is="itemMeta[item.type]?.icon" /></el-icon>
              </span>
              <div class="nf-item__body">
                <div class="nf-item__title">{{ item.title }}</div>
                <div class="nf-item__sub">共 {{ item.count }} 筆待處理</div>
                <div class="nf-item__priority">{{ priorityLabel[item.priority] || '待查看' }}</div>
              </div>
              <div class="nf-item__end">
                <span class="nf-count-badge">{{ item.count }}</span>
                <el-icon class="nf-chevron"><ArrowRight /></el-icon>
              </div>
            </button>
          </div>

          <div v-if="reminders.length" class="nf-section">
            <div class="nf-section__hd">
              <span class="nf-section__title">提醒</span>
              <span class="nf-section__pill">{{ reminders.length }} 項</span>
            </div>
            <div
              v-for="group in reminders"
              :key="group.type"
              class="nf-reminder"
              :data-test="`notification-item-${group.type}`"
            >
              <button class="nf-reminder__hd" @click="handleNavigate(group.route)">
                <span class="nf-icon" :class="`nf-icon--${itemMeta[group.type]?.tone || 'primary'}`">
                  <el-icon><component :is="itemMeta[group.type]?.icon" /></el-icon>
                </span>
                <span class="nf-item__title">{{ group.title }}</span>
                <el-icon class="nf-chevron nf-chevron--ml"><ArrowRight /></el-icon>
              </button>
              <div
                v-for="(subItem, idx) in (group.items || []).slice(0, 3)"
                :key="idx"
                class="nf-reminder__row"
              >
                <div class="nf-reminder__label">{{ subItem.label }}</div>
                <div v-if="subItem.meta || subItem.date" class="nf-reminder__meta">
                  {{ [subItem.meta, subItem.date].filter(Boolean).join(' ・ ') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
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
      <div class="nf-panel">
        <div v-if="isEmpty" class="nf-empty">
          <el-icon class="nf-empty__icon"><Bell /></el-icon>
          <div class="nf-empty__title">目前沒有待處理通知</div>
          <div class="nf-empty__sub">新的審核或提醒出現後，會集中顯示在這裡。</div>
        </div>
        <div v-else class="nf-scroll">
          <div class="nf-hero">
            <div class="nf-hero__eyebrow">通知中心</div>
            <div class="nf-hero__headline">
              <span class="nf-hero__num">{{ badgeCount }}</span>
              <span class="nf-hero__unit">項待處理</span>
            </div>
            <div class="nf-hero__hint">審核、家長提問與提醒都會集中在這裡。</div>
          </div>

          <div v-if="actionItems.length" class="nf-section">
            <div class="nf-section__hd">
              <span class="nf-section__title">待處理</span>
              <span class="nf-section__pill">{{ actionItems.length }} 項</span>
            </div>
            <button
              v-for="item in actionItems"
              :key="item.type"
              class="nf-item"
              :data-test="`notification-item-${item.type}`"
              @click="handleNavigate(item.route)"
            >
              <span class="nf-icon" :class="`nf-icon--${itemMeta[item.type]?.tone || 'primary'}`">
                <el-icon><component :is="itemMeta[item.type]?.icon" /></el-icon>
              </span>
              <div class="nf-item__body">
                <div class="nf-item__title">{{ item.title }}</div>
                <div class="nf-item__sub">共 {{ item.count }} 筆待處理</div>
                <div class="nf-item__priority">{{ priorityLabel[item.priority] || '待查看' }}</div>
              </div>
              <div class="nf-item__end">
                <span class="nf-count-badge">{{ item.count }}</span>
                <el-icon class="nf-chevron"><ArrowRight /></el-icon>
              </div>
            </button>
          </div>

          <div v-if="reminders.length" class="nf-section">
            <div class="nf-section__hd">
              <span class="nf-section__title">提醒</span>
              <span class="nf-section__pill">{{ reminders.length }} 項</span>
            </div>
            <div
              v-for="group in reminders"
              :key="group.type"
              class="nf-reminder"
              :data-test="`notification-item-${group.type}`"
            >
              <button class="nf-reminder__hd" @click="handleNavigate(group.route)">
                <span class="nf-icon" :class="`nf-icon--${itemMeta[group.type]?.tone || 'primary'}`">
                  <el-icon><component :is="itemMeta[group.type]?.icon" /></el-icon>
                </span>
                <span class="nf-item__title">{{ group.title }}</span>
                <el-icon class="nf-chevron nf-chevron--ml"><ArrowRight /></el-icon>
              </button>
              <div
                v-for="(subItem, idx) in (group.items || []).slice(0, 3)"
                :key="idx"
                class="nf-reminder__row"
              >
                <div class="nf-reminder__label">{{ subItem.label }}</div>
                <div v-if="subItem.meta || subItem.date" class="nf-reminder__meta">
                  {{ [subItem.meta, subItem.date].filter(Boolean).join(' ・ ') }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </template>
</template>

<script setup>
import { computed, markRaw, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowRight, Bell,
  Document, Message, Calendar, User,
} from '@element-plus/icons-vue'
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
const isEmpty = computed(() => !actionItems.value.length && !reminders.value.length)

const itemMeta = {
  approval: { icon: markRaw(Document), tone: 'danger' },
  activity_inquiry: { icon: markRaw(Message), tone: 'warning' },
  calendar: { icon: markRaw(Calendar), tone: 'primary' },
  probation: { icon: markRaw(User), tone: 'success' },
}

const priorityLabel = {
  high: '立即處理',
  medium: '建議今日處理',
  low: '可稍後查看',
}

const handleNavigate = (route) => {
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
.nf-trigger:hover {
  color: var(--color-primary);
  border-color: var(--color-primary-lighter);
  background: var(--color-primary-lighter);
}

/* ── Panel wrapper ──────────────────────────────── */
.nf-panel {
  padding: 0;
}

.nf-scroll {
  max-height: 460px;
  overflow-y: auto;
  padding: 2px 1px;
}

/* ── Hero ───────────────────────────────────────── */
.nf-hero {
  padding: 16px 18px;
  border-radius: 14px;
  background: linear-gradient(135deg, #eef5ff 0%, #e8f0fd 100%);
  border: 1px solid rgba(59, 130, 246, 0.14);
  margin-bottom: 18px;
}
.nf-hero__eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
  margin-bottom: 4px;
}
.nf-hero__headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
}
.nf-hero__num {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  color: #2563eb;
}
.nf-hero__unit {
  font-size: 15px;
  font-weight: 600;
  color: #1e3a5f;
}
.nf-hero__hint {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

/* ── Section ────────────────────────────────────── */
.nf-section {
  margin-bottom: 16px;
}
.nf-section__hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 8px;
}
.nf-section__title {
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.nf-section__pill {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 1px 8px;
}

/* ── Notification Item ──────────────────────────── */
.nf-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}
.nf-item:hover {
  background: #f5f9ff;
  border-color: #bfdbfe;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.08);
}
.nf-item + .nf-item {
  margin-top: 8px;
}

.nf-item__body {
  flex: 1;
  min-width: 0;
}
.nf-item__title {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.35;
}
.nf-item__sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 3px;
}
.nf-item__priority {
  margin-top: 5px;
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
}

.nf-item__end {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ── Icon Badge ─────────────────────────────────── */
.nf-icon {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}
.nf-icon--danger  { background: #fef2f2; color: #dc2626; }
.nf-icon--warning { background: #fff7ed; color: #ea580c; }
.nf-icon--primary { background: #eff6ff; color: #2563eb; }
.nf-icon--success { background: #ecfdf5; color: #059669; }

/* ── Count Badge ────────────────────────────────── */
.nf-count-badge {
  min-width: 26px;
  height: 26px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  padding: 0 6px;
}

/* ── Chevron ────────────────────────────────────── */
.nf-chevron {
  color: #94a3b8;
  font-size: 14px;
  flex-shrink: 0;
}
.nf-chevron--ml {
  margin-left: auto;
}

/* ── Reminder Group ─────────────────────────────── */
.nf-reminder {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  background: #fcfdff;
}
.nf-reminder + .nf-reminder {
  margin-top: 8px;
}
.nf-reminder__hd {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}
.nf-reminder__hd:hover {
  background: #f0f7ff;
}
.nf-reminder__row {
  padding: 9px 14px;
  border-top: 1px solid #f0f4f8;
}
.nf-reminder__label {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
}
.nf-reminder__meta {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

/* ── Empty State ────────────────────────────────── */
.nf-empty {
  text-align: center;
  padding: 40px 16px;
}
.nf-empty__icon {
  width: 52px;
  height: 52px;
  font-size: 22px;
  color: #2563eb;
  background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}
.nf-empty__title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}
.nf-empty__sub {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
</style>
