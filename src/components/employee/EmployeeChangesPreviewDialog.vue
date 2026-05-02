<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: '即將儲存的變更' },
    changes: { type: Object, required: true },  // { field: { before, after } }
    requireConfirm: { type: Boolean, default: false },
    fieldLabels: { type: Object, default: () => ({}) },
    // 後端 finance_guards 對 base_salary / hourly_rate / insurance_salary_level
    // 變動要求 adjustment_reason（≥5 字）；前端在儲存薪資時開啟此旗標讓使用者填原因。
    requireReason: { type: Boolean, default: false },
    reasonMinLength: { type: Number, default: 5 },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
})

const reason = ref('')

// 每次開啟時清空，避免上次殘留
watch(visible, (v) => {
    if (v) reason.value = ''
})

const reasonInvalid = computed(() => {
    if (!props.requireReason) return false
    return reason.value.trim().length < props.reasonMinLength
})

const fmt = (v) => {
    if (v == null || v === '') return '（空）'
    if (typeof v === 'number') return v.toLocaleString()
    return String(v)
}

const rows = computed(() =>
    Object.entries(props.changes).map(([field, { before, after }]) => ({
        field,
        label: props.fieldLabels[field] || field,
        before: fmt(before),
        after: fmt(after),
    }))
)

const onConfirm = () => {
    if (props.requireReason && reasonInvalid.value) return
    emit('confirm', props.requireReason ? reason.value.trim() : null)
    visible.value = false
}
</script>

<template>
    <el-dialog v-model="visible" :title="title" width="540px" append-to-body>
        <p v-if="rows.length === 0" class="empty">尚無變動。</p>
        <el-table v-else :data="rows" size="small" border>
            <el-table-column prop="label" label="欄位" width="140" />
            <el-table-column prop="before" label="原值" />
            <el-table-column prop="after" label="新值" />
        </el-table>
        <div v-if="requireReason" class="reason-block">
            <label class="reason-label">調整原因（必填，至少 {{ reasonMinLength }} 字）</label>
            <el-input
                v-model="reason"
                type="textarea"
                :rows="2"
                placeholder="例：年度調薪 2026、誤算修正補差、主管核可一次性獎勵"
                maxlength="200"
                show-word-limit
            />
        </div>
        <template #footer>
            <el-button @click="visible = false">取消</el-button>
            <el-button v-if="requireConfirm" type="primary" :disabled="rows.length === 0 || reasonInvalid"
                @click="onConfirm">
                確認儲存
            </el-button>
        </template>
    </el-dialog>
</template>

<style scoped>
.empty {
    color: var(--el-text-color-secondary);
    text-align: center;
    margin: 20px 0;
}

.reason-block {
    margin-top: 16px;
}

.reason-label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: var(--el-text-color-regular);
}
</style>
