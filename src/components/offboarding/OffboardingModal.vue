<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import OffboardingPreviewPanel from './OffboardingPreviewPanel.vue'
import OffboardingStepsResult from './OffboardingStepsResult.vue'
import { useOffboardingStore } from '@/stores/offboarding'
import type { ApiResponse } from '@/api/_generated/typed'

type PreviewType = ApiResponse<'/offboarding/{employee_id}/preview', 'post'>
type ProcessType = ApiResponse<'/offboarding/{employee_id}/process', 'post'>

type Stage = 'input' | 'preview' | 'result'

const props = defineProps<{
    modelValue: boolean
    employeeId: number
    employeeName: string
    /** 既有離職日（待離職者重開時預填，避免前後填不一致） */
    initialResignDate?: string | null
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    success: [result: ProcessType]
}>()

const store = useOffboardingStore()

const stage = ref<Stage>('input')
const loading = ref(false)
const preview = ref<PreviewType | null>(null)
const processResult = ref<ProcessType | null>(null)

const form = ref({
    resign_date: '',
    resign_reason: '',
})

watch(
    () => props.modelValue,
    (val) => {
        if (val) {
            // 開啟時重置 state；resign_date 預填既有離職日（若有）
            stage.value = 'input'
            loading.value = false
            preview.value = null
            processResult.value = null
            form.value = { resign_date: props.initialResignDate ?? '', resign_reason: '' }
        }
    },
    // immediate：掛載當下已是開啟狀態（v-if + modelValue=true 同時成立）也要吃到預填
    { immediate: true },
)

/** 使用者已填了與初始值不同的資料（關閉時要攔） */
const isDirty = computed(
    () =>
        form.value.resign_date !== (props.initialResignDate ?? '') ||
        !!form.value.resign_reason,
)

/** 合理離職日範圍：過去 2 年 ~ 未來 1 年，擋「誤選十年前」類 typo */
function disabledResignDate(d: Date): boolean {
    const now = new Date()
    const min = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
    const max = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
    return d.getTime() < min.getTime() || d.getTime() > max.getTime()
}

async function handlePreview() {
    if (!form.value.resign_date) {
        ElMessage.error('請填寫離職日期')
        return
    }
    loading.value = true
    try {
        const result = await store.preview(props.employeeId, {
            resign_date: form.value.resign_date,
            resign_reason: form.value.resign_reason || null,
        })
        preview.value = result
        stage.value = 'preview'
    } catch {
        ElMessage.error('預覽失敗，請稍後再試')
    } finally {
        loading.value = false
    }
}

async function handleProcess() {
    loading.value = true
    try {
        const result = await store.process(props.employeeId, {
            resign_date: form.value.resign_date,
            resign_reason: form.value.resign_reason || null,
        })
        processResult.value = result
        stage.value = 'result'
        emit('success', result)
    } catch {
        ElMessage.error('辦理失敗，請稍後再試')
    } finally {
        loading.value = false
    }
}

/** 重試失敗步驟：直接重呼 process（後端 steps 具冪等/skipped 語意，已完成步驟自動跳過），
 *  停留在結果頁原地更新，不跳回預覽（跳回會讓失敗資訊消失、逼使用者記住哪步失敗）。 */
async function retry() {
    await handleProcess()
}

/** 統一關閉守衛：process 進行中不可關；input/preview 已填資料先確認；result 直接關 */
async function guardClose(): Promise<boolean> {
    if (loading.value) return false
    if (stage.value !== 'result' && isDirty.value) {
        try {
            await ElMessageBox.confirm(
                '尚未完成離職辦理，關閉將遺失已填的資料。確定關閉？',
                '關閉確認',
                { type: 'warning', confirmButtonText: '確定關閉', cancelButtonText: '繼續填寫' },
            )
        } catch {
            return false
        }
    }
    return true
}

/** el-dialog before-close（X / Esc 走這裡）；通過守衛後自行 emit，
 *  不依賴 EP done() 之後的內部 emit（transition 環境下不可靠） */
async function handleBeforeClose(done: () => void): Promise<void> {
    if (await guardClose()) {
        done()
        emit('update:modelValue', false)
    }
}

function handleClose() {
    void handleBeforeClose(() => {})
}

const stageTitles: Record<Stage, string> = {
    input: '員工離職辦理',
    preview: '離職辦理預覽',
    result: '離職辦理結果',
}
</script>

<template>
    <el-dialog
        :model-value="modelValue"
        :title="`${stageTitles[stage]} — ${employeeName}`"
        width="560px"
        :close-on-click-modal="false"
        :before-close="handleBeforeClose"
        @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    >
        <!-- input stage -->
        <div v-if="stage === 'input'" class="offboarding-input-stage">
            <el-form label-width="80px" :model="form">
                <el-form-item label="離職日期" required>
                    <el-date-picker
                        v-model="form.resign_date"
                        type="date"
                        placeholder="請選擇離職日期"
                        format="YYYY-MM-DD"
                        value-format="YYYY-MM-DD"
                        :disabled-date="disabledResignDate"
                        style="width: 100%"
                    />
                </el-form-item>
                <el-form-item label="離職原因">
                    <el-input
                        v-model="form.resign_reason"
                        type="textarea"
                        :rows="3"
                        placeholder="選填"
                    />
                </el-form-item>
            </el-form>
        </div>

        <!-- preview stage -->
        <div v-else-if="stage === 'preview'" class="offboarding-preview-stage">
            <OffboardingPreviewPanel v-if="preview" :preview="preview" />
        </div>

        <!-- result stage -->
        <div v-else-if="stage === 'result'" class="offboarding-result-stage">
            <OffboardingStepsResult
                v-if="processResult"
                :steps="processResult.steps"
                :retrying="loading"
                @retry="retry"
            />
        </div>

        <template #footer>
            <div class="dialog-footer">
                <el-button @click="handleClose">關閉</el-button>

                <el-button
                    v-if="stage === 'preview'"
                    class="back-button"
                    :disabled="loading"
                    @click="stage = 'input'"
                >
                    上一步
                </el-button>

                <el-button
                    v-if="stage === 'input'"
                    class="preview-button"
                    type="primary"
                    :loading="loading"
                    @click="handlePreview"
                >
                    預覽
                </el-button>

                <el-button
                    v-if="stage === 'preview'"
                    class="confirm-button"
                    type="danger"
                    :loading="loading"
                    @click="handleProcess"
                >
                    確認辦理
                </el-button>
            </div>
        </template>
    </el-dialog>
</template>

<style scoped>
.dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.offboarding-input-stage,
.offboarding-preview-stage,
.offboarding-result-stage {
    min-height: 120px;
}
</style>
