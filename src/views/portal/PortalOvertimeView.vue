<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getMyOvertimes, createMyOvertime, deleteMyOvertime } from '@/api/portal'
import type { ApiBody } from '@/api/_generated/typed'
import { apiError } from '@/utils/error'
import { OVERTIME_TYPES as overtimeTypes } from '@/constants/approvalEnums'
import { useIsMobile } from '@/composables/useIsMobile'
import TeacherBottomSheet from '@/components/portal/TeacherBottomSheet.vue'
import PortalOvertimeForm from '@/components/portal/PortalOvertimeForm.vue'

const { isMobile } = useIsMobile()

const loading = ref(false)
const submitLoading = ref(false)
const overtimes = ref<Record<string, unknown>[]>([])

const now = new Date()
const query = reactive({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
})
// 動態年份（避免硬編 [2024..2027] 於 2028 斷頭）
const yearOptions = computed(() => {
    const y = now.getFullYear()
    return [y - 2, y - 1, y, y + 1]
})

const showForm = ref(false)

const fetchOvertimes = async () => {
    loading.value = true
    try {
        const res = await getMyOvertimes({ year: query.year, month: query.month })
        // 後端缺 response_model，res.data 為 unknown，narrow 成清單。
        overtimes.value = res.data as Record<string, unknown>[]
    } catch (error) {
        ElMessage.error('載入失敗')
    } finally {
        loading.value = false
    }
}

const openForm = () => {
    showForm.value = true
}

const submitOvertime = async (payload: Record<string, unknown>) => {
    submitLoading.value = true
    try {
        // 表單以 Record 形式 emit，依後端 OvertimeCreatePortal 契約送出。
        const res = await createMyOvertime(payload as ApiBody<'/portal/my-overtimes', 'post'>)
        // 後端缺 response_model，res.data 為 unknown，narrow 取預估加班費。
        const overtimePay = (res.data as { overtime_pay?: number }).overtime_pay
        const msg = payload.use_comp_leave
            ? `補休申請已送出（${payload.hours}h），核准後計入當年度補休配額`
            : `加班申請已送出，預估加班費: NT$ ${overtimePay}`
        ElMessage.success(msg)
        showForm.value = false
        fetchOvertimes()
    } catch (error) {
        ElMessage.error(apiError(error, '提交失敗'))
    } finally {
        submitLoading.value = false
    }
}

const withdrawOvertime = async (id: number) => {
    try {
        await deleteMyOvertime(id)
        ElMessage.success('加班申請已撤回')
        fetchOvertimes()
    } catch (error) {
        ElMessage.error(apiError(error, '撤回失敗'))
    }
}

const totalHours = () => overtimes.value.reduce((sum, o) => sum + ((o.hours as number) || 0), 0)
const totalPay = () => overtimes.value.reduce((sum, o) => sum + ((o.overtime_pay as number) || 0), 0)

onMounted(fetchOvertimes)
</script>

<template>
    <div class="portal-overtime">
        <div class="page-header">
            <h2>加班申請</h2>
            <el-button type="primary" @click="openForm">新增加班</el-button>
        </div>

        <!-- Pay rules -->
        <el-card class="rules-card">
            <h4 style="margin: 0 0 8px 0;">加班費計算方式</h4>
            <div class="rules-grid">
                <div v-for="ot in overtimeTypes" :key="ot.value" class="rule-item">
                    <el-tag size="small">{{ ot.label }}</el-tag>
                    <span>{{ ot.desc }}</span>
                </div>
            </div>
        </el-card>

        <!-- Records -->
        <el-card v-loading="loading">
            <div class="query-row">
                <el-select v-model="query.year" style="width: 100px;" @change="fetchOvertimes">
                    <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="y" />
                </el-select>
                <el-select v-model="query.month" style="width: 100px;" @change="fetchOvertimes">
                    <el-option v-for="m in 12" :key="m" :label="`${m}月`" :value="m" />
                </el-select>
                <div class="month-total" v-if="overtimes.length">
                    本月合計: {{ totalHours() }} 小時 / NT$ {{ totalPay() }}
                </div>
            </div>

            <div style="overflow-x: auto">
                <el-table :data="overtimes" border stripe style="margin-top: 12px;">
                    <el-table-column prop="overtime_date" label="日期" width="120" />
                    <el-table-column prop="overtime_type_label" label="類型" width="100" />
                    <el-table-column prop="start_time" label="開始" width="80" />
                    <el-table-column prop="end_time" label="結束" width="80" />
                    <el-table-column prop="hours" label="時數" width="80" />
                    <el-table-column label="方式" width="80">
                        <template #default="{ row }">
                            <el-tag v-if="row.use_comp_leave" type="success" size="small">補休</el-tag>
                            <el-tag v-else size="small">加班費</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="加班費" width="110">
                        <template #default="{ row }">
                            <span v-if="row.use_comp_leave" style="color: var(--el-text-color-secondary);">-- (補休)</span>
                            <span v-else>NT$ {{ row.overtime_pay }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column prop="reason" label="原因" />
                    <el-table-column label="狀態" width="100">
                        <template #default="{ row }">
                            <el-tag v-if="row.status === 'approved'" type="success" size="small">已核准</el-tag>
                            <el-tag v-else-if="row.status === 'rejected'" type="danger" size="small">已駁回</el-tag>
                            <el-tag v-else type="warning" size="small">待核准</el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="操作" width="90">
                        <template #default="{ row }">
                            <el-popconfirm
                                v-if="row.status === 'pending'"
                                title="確定撤回此加班申請？"
                                confirm-button-text="撤回"
                                cancel-button-text="取消"
                                @confirm="withdrawOvertime(row.id)"
                            >
                                <template #reference>
                                    <el-button type="danger" size="small" plain>撤回</el-button>
                                </template>
                            </el-popconfirm>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
            <el-empty v-if="!loading && overtimes.length === 0" description="本月無加班記錄" />
        </el-card>

        <!-- Mobile: BottomSheet -->
        <TeacherBottomSheet
            v-if="isMobile"
            v-model="showForm"
            title="新增加班申請"
            default-snap="full"
            :snap-points="['full']"
        >
            <PortalOvertimeForm
                v-if="showForm"
                :loading="submitLoading"
                @submit="submitOvertime"
                @cancel="showForm = false"
            />
        </TeacherBottomSheet>

        <!-- Desktop: el-dialog -->
        <el-dialog
            v-else
            v-model="showForm"
            title="新增加班申請"
            width="500px"
        >
            <PortalOvertimeForm
                v-if="showForm"
                :loading="submitLoading"
                @submit="submitOvertime"
                @cancel="showForm = false"
            />
        </el-dialog>
    </div>
</template>

<style scoped>
.rules-card { margin-bottom: var(--space-4); }

.rules-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.rule-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-sm);
    color: var(--text-secondary);
}

.query-row {
    display: flex;
    gap: 8px;
    align-items: center;
}

.month-total {
    margin-left: auto;
    font-weight: 600;
    color: var(--color-primary);
}

@media (--to-sm) {
    .query-row {
        flex-wrap: wrap;
    }

    .month-total {
        margin-left: 0;
        width: 100%;
        font-size: var(--text-sm);
    }

    .rules-grid {
        flex-direction: column;
        gap: 8px;
    }
}
</style>
