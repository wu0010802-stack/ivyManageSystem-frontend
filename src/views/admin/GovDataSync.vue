<template>
  <div class="gov-data-sync">
    <header class="page-header">
      <h2>政府開放資料同步</h2>
      <button class="sync-now-btn" :disabled="loadingSync" @click="onSyncNow">
        {{ loadingSync ? '抓取中…' : '立即重抓' }}
      </button>
    </header>

    <section class="sources">
      <h3>資料源狀態</h3>
      <div class="source-grid">
        <SourceStatusCard
          v-for="src in staging.sources"
          :key="src.source"
          :source="src.source"
          :last-fetched-at="src.last_fetched_at"
          :http-status="src.http_status"
          :error="src.error"
        />
      </div>
    </section>

    <section class="brackets">
      <h3>勞健保級距 — 待審核（{{ staging.brackets_pending.length }}）</h3>
      <div v-for="b in staging.brackets_pending" :key="b.id" class="staging-card">
        <p>適用年度：{{ b.effective_year }} ／ 合成於：{{ b.composed_at }}</p>
        <BracketDiffTable :diff-summary="b.diff_summary" />
        <div class="actions">
          <button class="promote-btn" @click="onPromoteBrackets(b.id)">確認套用</button>
          <button class="dismiss-btn" @click="onDismissBrackets(b.id)">忽略此版</button>
        </div>
      </div>
      <p v-if="!staging.brackets_pending.length" class="empty">無待審核級距版本</p>
    </section>

    <section class="minimum-wage">
      <h3>基本工資 — 待審核（{{ staging.minimum_wage_pending.length }}）</h3>
      <table v-if="staging.minimum_wage_pending.length" class="mw-table">
        <thead>
          <tr><th>實施日期</th><th>月薪</th><th>時薪</th><th>動作</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in staging.minimum_wage_pending" :key="m.id">
            <td>{{ m.effective_date }}</td>
            <td>{{ m.monthly }}</td>
            <td>{{ m.hourly }}</td>
            <td>
              <button class="promote-btn" @click="onPromoteMW(m.id)">確認</button>
              <button class="dismiss-btn" @click="onDismissMW(m.id)">忽略</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">無待審核基本工資版本</p>
    </section>

    <PromoteDialog
      v-model="dialogOpen"
      :title="dialogTitle"
      @submit="onDialogSubmit"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import * as govData from '@/api/govData'
import SourceStatusCard from '@/components/admin/govdata/SourceStatusCard.vue'
import BracketDiffTable from '@/components/admin/govdata/BracketDiffTable.vue'
import PromoteDialog from '@/components/admin/govdata/PromoteDialog.vue'

const staging = ref({ sources: [], brackets_pending: [], minimum_wage_pending: [] })
const loadingSync = ref(false)
const dialogOpen = ref(false)
const dialogTitle = ref('')
const dialogAction = ref(null)
const dialogTargetId = ref(null)

async function refresh() {
  staging.value = await govData.listStaging()
}

async function onSyncNow() {
  loadingSync.value = true
  try {
    await govData.syncNow()
    await refresh()
  } finally {
    loadingSync.value = false
  }
}

function openDialog(title, action, id) {
  dialogTitle.value = title
  dialogAction.value = action
  dialogTargetId.value = id
  dialogOpen.value = true
}

async function onDialogSubmit(reason) {
  if (!dialogAction.value || !dialogTargetId.value) return
  await dialogAction.value(dialogTargetId.value, reason)
  await refresh()
}

const onPromoteBrackets = id => openDialog('確認套用級距', govData.promoteBrackets, id)
const onDismissBrackets = id => openDialog('忽略級距版本', govData.dismissBrackets, id)
const onPromoteMW = id => openDialog('確認套用基本工資', govData.promoteMinimumWage, id)
const onDismissMW = id => openDialog('忽略基本工資版本', govData.dismissMinimumWage, id)

onMounted(refresh)
</script>

<style scoped>
.gov-data-sync { padding: 16px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sync-now-btn {
  padding: 8px 16px; border-radius: 4px; border: 1px solid #4caf50;
  background: #4caf50; color: #fff; cursor: pointer;
}
.sync-now-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.staging-card { border: 1px solid #ddd; padding: 16px; margin: 12px 0; border-radius: 6px; background: #fff; }
.actions { display: flex; gap: 8px; margin-top: 12px; }
.actions button { padding: 6px 16px; border-radius: 4px; cursor: pointer; }
.promote-btn { background: #4caf50; color: #fff; border: 1px solid #4caf50; }
.dismiss-btn { background: #fff; color: var(--neutral-600); border: 1px solid #ddd; }
.empty { color: var(--text-tertiary); font-style: italic; }
.mw-table { border-collapse: collapse; width: 100%; }
.mw-table th, .mw-table td { border: 1px solid #ddd; padding: 6px 10px; }
section { margin-bottom: 24px; }
</style>
