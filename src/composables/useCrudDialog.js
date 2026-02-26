import { ref } from 'vue'

/**
 * @param {Object} options
 * @param {Function} options.resetForm - function to reset form to defaults
 * @param {Function} options.populateForm - function(row) to populate form from row data
 */
export function useCrudDialog({ resetForm, populateForm } = {}) {
  const dialogVisible = ref(false)
  const isEdit = ref(false)

  const openCreate = () => {
    isEdit.value = false
    if (resetForm) resetForm()
    dialogVisible.value = true
  }

  const openEdit = (row) => {
    isEdit.value = true
    if (populateForm) populateForm(row)
    dialogVisible.value = true
  }

  const closeDialog = () => {
    dialogVisible.value = false
  }

  return { dialogVisible, isEdit, openCreate, openEdit, closeDialog }
}
