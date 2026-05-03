<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listToday, administer, skipLog } from '@/api/portalMedications'
import { broadcastDashboardInvalidate } from '@/composables/usePortalDashboard'

const groups = ref([])
const date = ref(null)
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const { data } = await listToday()
    groups.value = data.groups || []
    date.value = data.date
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '讀取失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onAdminister(item) {
  try {
    await ElMessageBox.confirm(
      `確認執行：${item.student_name} ${item.medication_name} ${item.dose}`,
      '執行確認',
      { confirmButtonText: '確認執行', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await administer(item.log_id, {})
    ElMessage.success('已執行')
    broadcastDashboardInvalidate()
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '執行失敗')
  }
}

async function onSkip(item) {
  let reason
  try {
    const result = await ElMessageBox.prompt(
      `略過原因（${item.student_name} ${item.medication_name}）`,
      '略過確認',
      {
        confirmButtonText: '確認略過',
        cancelButtonText: '取消',
        inputValidator: (v) => !!(v && v.trim()) || '請輸入原因',
      },
    )
    reason = result.value
  } catch {
    return
  }
  try {
    await skipLog(item.log_id, { reason })
    ElMessage.success('已略過')
    broadcastDashboardInvalidate()
    await load()
  } catch (e) {
    ElMessage.error(e?.response?.data?.detail || '略過失敗')
  }
}

function statusLabel(s) {
  return { pending: '待執行', administered: '已執行', skipped: '已略過' }[s] || s
}
</script>

<template>
  <div class="med-view">
    <header class="page-header">
      <h2>今日用藥（{{ date || '—' }}）</h2>
      <el-button :loading="loading" @click="load">重新整理</el-button>
    </header>

    <div v-if="loading && !groups.length" class="loading">
      <div class="pt-shimmer skeleton-block"></div>
      <div class="pt-shimmer skeleton-block"></div>
    </div>

    <p v-else-if="!groups.length" class="empty">今日無用藥單</p>

    <div v-else class="groups">
      <section v-for="g in groups" :key="g.classroom_id" class="classroom-group">
        <div class="group-header">
          <h3>{{ g.classroom_name }}</h3>
          <div class="stats">
            <span class="stat pending">待 {{ g.stats.pending }}</span>
            <span class="stat done">已 {{ g.stats.administered }}</span>
            <span class="stat skip">略 {{ g.stats.skipped }}</span>
          </div>
        </div>

        <p v-if="!g.items.length" class="empty">本班今日無用藥</p>
        <div v-else class="cards">
          <div
            v-for="item in g.items"
            :key="item.log_id"
            class="med-card pt-card"
            :class="`status-${item.status}`"
          >
            <div class="time">{{ item.scheduled_time }}</div>
            <div class="body">
              <div class="row student">
                <strong>{{ item.student_name }}</strong>
                <span :class="['status-tag', item.status]">{{ statusLabel(item.status) }}</span>
                <span v-if="item.source === 'parent'" class="source-tag">家長申請</span>
              </div>
              <div class="row med">
                {{ item.medication_name }} · {{ item.dose }}
              </div>
              <div v-if="item.note" class="row note">{{ item.note }}</div>
              <div v-if="item.administered_at" class="row meta">
                執行：{{ item.administered_at.replace('T', ' ').slice(0, 16) }}
                <span v-if="item.administered_by_name">— {{ item.administered_by_name }}</span>
              </div>
              <div v-if="item.skipped_reason" class="row meta">
                略過原因：{{ item.skipped_reason }}
              </div>
            </div>
            <div class="actions" v-if="item.status === 'pending'">
              <el-button size="small" type="primary" @click="onAdminister(item)">執行</el-button>
              <el-button size="small" @click="onSkip(item)">略過</el-button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.med-view { max-width: 1000px; margin: 0 auto; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.loading { display: flex; flex-direction: column; gap: var(--space-3); }
.skeleton-block { height: 100px; border-radius: var(--radius-md); }

.empty {
  text-align: center;
  color: var(--pt-text-muted);
  padding: var(--space-6);
}

.groups { display: flex; flex-direction: column; gap: var(--space-4); }

.classroom-group { display: flex; flex-direction: column; gap: var(--space-2); }
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 var(--space-2);
}
.group-header h3 {
  font-size: var(--text-lg);
  margin: 0;
  color: var(--pt-text-strong);
}
.stats { display: flex; gap: var(--space-2); font-size: var(--text-sm); }
.stat.pending { color: var(--color-warning); }
.stat.done { color: var(--color-success); }
.stat.skip { color: var(--pt-text-muted); }

.cards { display: flex; flex-direction: column; gap: var(--space-2); }

.med-card {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  border-left: 4px solid var(--color-warning);
}
.med-card.status-administered { border-left-color: var(--color-success); }
.med-card.status-skipped { border-left-color: var(--pt-text-muted); opacity: 0.7; }

.time {
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--pt-text-strong);
  width: 64px;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row.student { display: flex; gap: var(--space-2); align-items: center; }
.row.med { color: var(--pt-text-strong); font-size: var(--text-base); }
.row.note { color: var(--pt-text-muted); font-size: var(--text-sm); }
.row.meta { color: var(--pt-text-faint); font-size: var(--text-xs); }

.status-tag, .source-tag {
  padding: 2px var(--space-2);
  border-radius: 999px;
  font-size: var(--text-xs);
}
.status-tag.pending { background: var(--color-warning-lighter); color: var(--color-warning); }
.status-tag.administered { background: var(--color-success-lighter); color: var(--color-success); }
.status-tag.skipped { background: var(--pt-surface-mute); color: var(--pt-text-muted); }
.source-tag { background: var(--pt-tint-message); color: var(--pt-tint-message-fg); }

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-self: center;
}
</style>
