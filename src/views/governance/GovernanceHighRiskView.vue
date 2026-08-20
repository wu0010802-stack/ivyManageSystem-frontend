<script setup lang="ts">
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

import { getHighRiskAudits, ackAudit, ackAllAudits } from "@/api/audit";
import type { Schema } from "@/api/_generated/typed";

type Item = Schema<"AuditLogHighRiskItem">;

const items = ref<Item[]>([]);
const loading = ref(false);
const unackOnly = ref(true);

const RISK_TAG_LABEL: Record<Item["risk_kind"], string> = {
  hard_delete: "真刪",
  blocked: "被擋",
  permission_change: "權限變更",
};

const RISK_TAG_TYPE: Record<Item["risk_kind"], "danger" | "warning" | "info"> = {
  hard_delete: "danger",
  blocked: "warning",
  permission_change: "info",
};

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await getHighRiskAudits({
      days: 7,
      unack_only: unackOnly.value,
      limit: 100,
    });
    items.value = res.data.items ?? [];
  } catch (e) {
    ElMessage.error("讀取高風險事件失敗");
  } finally {
    loading.value = false;
  }
}

async function onAck(id: number): Promise<void> {
  await ackAudit(id);
  ElMessage.success("已標為已讀");
  await load();
}

async function onAckAll(): Promise<void> {
  try {
    await ElMessageBox.confirm("確定把所有 7 天內高風險事件標為已讀？", "確認", { type: "warning" });
    const res = await ackAllAudits({ days: 7 });
    const count = res.data.acknowledged_count ?? 0;
    ElMessage.success(`已標 ${count} 筆為已讀`);
    await load();
  } catch (e) {
    // user cancelled — ignore
  }
}

onMounted(load);
</script>

<template>
  <div class="high-risk-view">
    <div class="header">
      <p class="hint">近 7 天內的真刪、被擋與權限變更事件</p>
      <div class="actions">
        <el-checkbox v-model="unackOnly" @change="load">只看未讀</el-checkbox>
        <el-button type="primary" data-test="ack-all-btn" @click="onAckAll">全部標已讀</el-button>
      </div>
    </div>

    <el-empty v-if="!loading && items.length === 0" description="目前沒有高風險事件" />

    <el-table v-else :data="items" v-loading="loading" stripe>
      <el-table-column label="類型" width="120">
        <template #default="{ row }: { row: Item }">
          <el-tag :type="RISK_TAG_TYPE[row.risk_kind]" class="risk-tag">
            {{ RISK_TAG_LABEL[row.risk_kind] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="summary" label="摘要" min-width="300" />
      <el-table-column prop="username" label="操作者" width="120" />
      <el-table-column prop="created_at" label="時間" width="180" />
      <el-table-column label="動作" width="120">
        <template #default="{ row }: { row: Item }">
          <el-button
            v-if="!row.acknowledged_at"
            size="small"
            data-test="ack-btn"
            @click="onAck(row.id)"
          >
            標已讀
          </el-button>
          <span v-else class="acked-label">已讀</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.high-risk-view {
  padding: 16px;
}
.hint {
  margin: 0;
  color: var(--el-text-color-regular);
  font-size: 14px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.acked-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
