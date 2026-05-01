import { ref, computed } from 'vue'

const isEqualLoose = (a, b) => {
    if (a === b) return true
    if (a == null && b == null) return true
    if (typeof a !== typeof b) return String(a) === String(b)
    return false
}

/**
 * 比對 reactive form 與 originalForm 快照，回傳兩個 tab 各自的 dirty diff。
 * 新增模式（reset 未呼叫）→ originalForm = null，所有 dirty 為空（直接 POST 整包）。
 */
export function useEmployeeFormDirty(form, basicFields, salaryFields) {
    const originalForm = ref(null)

    const reset = (snapshot) => {
        originalForm.value = JSON.parse(JSON.stringify(snapshot))
    }

    const diffFor = (fields) => {
        if (!originalForm.value) return {}
        const out = {}
        for (const k of fields) {
            const before = originalForm.value[k]
            const after = form[k]
            if (!isEqualLoose(before, after)) {
                out[k] = { before, after }
            }
        }
        return out
    }

    const basicDirty = computed(() => diffFor(basicFields))
    const salaryDirty = computed(() => diffFor(salaryFields))

    return { originalForm, reset, basicDirty, salaryDirty }
}
