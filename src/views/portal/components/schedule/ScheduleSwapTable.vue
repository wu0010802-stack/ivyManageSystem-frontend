<script setup lang="ts">
/**
 * ScheduleSwapTable — 換班申請雙 tab 表格
 *
 * Props:
 *  - receivedRequests: 收到的換班申請 (r.is_mine === false)
 *  - sentRequests:     我發起的換班申請 (r.is_mine === true)
 *  - loading:          表格 loading 狀態
 *
 * Emits:
 *  - respond(id, action)  action: 'accept' | 'reject'
 *  - cancel(id)
 */
defineProps<{
  receivedRequests: Record<string, unknown>[]
  sentRequests: Record<string, unknown>[]
  loading?: boolean
}>()

defineEmits<{
  respond: [id: number, action: 'accept' | 'reject']
  cancel: [id: number]
}>()

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const statusTagType = (status: string): TagType =>
  (({ pending: 'warning', accepted: 'success', rejected: 'danger', cancelled: 'info' } as Record<string, TagType>)[status] || 'info') as TagType

const statusLabel = (status: string) =>
  ({ pending: '待回覆', accepted: '已接受', rejected: '已拒絕', cancelled: '已撤銷' } as Record<string, string>)[status] || status
</script>

<template>
  <el-tabs>
    <el-tab-pane :label="`收到的申請 (${receivedRequests.length})`" name="received">
      <div style="overflow-x: auto">
        <el-table
          :data="receivedRequests"
          v-loading="loading ?? false"
          empty-text="目前沒有收到的換班申請"
        >
          <el-table-column prop="swap_date" label="換班日期" width="120" />
          <el-table-column prop="requester_name" label="申請人" width="100" />
          <el-table-column label="對方班別" width="100">
            <template #default="{ row }">{{ row.requester_shift }}</template>
          </el-table-column>
          <el-table-column label="我的班別" width="100">
            <template #default="{ row }">{{ row.target_shift }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
          <el-table-column label="狀態" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
            <template #default="{ row }">
              <template v-if="row.status === 'pending'">
                <el-button size="small" type="success" @click="$emit('respond', row.id, 'accept')">接受</el-button>
                <el-button size="small" type="danger" @click="$emit('respond', row.id, 'reject')">拒絕</el-button>
              </template>
              <span v-else class="text-muted">--</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-tab-pane>

    <el-tab-pane :label="`我發起的 (${sentRequests.length})`" name="sent">
      <div style="overflow-x: auto">
        <el-table
          :data="sentRequests"
          v-loading="loading ?? false"
          empty-text="目前沒有發起的換班申請"
        >
          <el-table-column prop="swap_date" label="換班日期" width="120" />
          <el-table-column prop="target_name" label="對象" width="100" />
          <el-table-column label="我的班別" width="100">
            <template #default="{ row }">{{ row.requester_shift }}</template>
          </el-table-column>
          <el-table-column label="對方班別" width="100">
            <template #default="{ row }">{{ row.target_shift }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
          <el-table-column label="狀態" width="90">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'pending'"
                size="small"
                type="warning"
                @click="$emit('cancel', row.id)"
              >撤銷</el-button>
              <span v-else class="text-muted">--</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-tab-pane>
  </el-tabs>
</template>
