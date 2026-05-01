<script setup>
import { computed } from 'vue'

const props = defineProps({
    modelValue: { type: Boolean, required: true },
    title: { type: String, default: '即將儲存的變更' },
    changes: { type: Object, required: true },  // { field: { before, after } }
    requireConfirm: { type: Boolean, default: false },
    fieldLabels: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
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
    emit('confirm')
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
        <template #footer>
            <el-button @click="visible = false">取消</el-button>
            <el-button v-if="requireConfirm" type="primary" :disabled="rows.length === 0" @click="onConfirm">
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
</style>
