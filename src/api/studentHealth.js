import api from './index'

// ============ Allergies ============
export const listAllergies = (studentId, params = {}) =>
  api.get(`/students/${studentId}/allergies`, { params })

export const createAllergy = (studentId, data) =>
  api.post(`/students/${studentId}/allergies`, data)

export const updateAllergy = (studentId, algId, data) =>
  api.patch(`/students/${studentId}/allergies/${algId}`, data)

export const deleteAllergy = (studentId, algId) =>
  api.delete(`/students/${studentId}/allergies/${algId}`)

// ============ Medication orders ============
export const listMedicationOrders = (studentId, params = {}) =>
  api.get(`/students/${studentId}/medication-orders`, { params })

export const getMedicationOrder = (studentId, orderId) =>
  api.get(`/students/${studentId}/medication-orders/${orderId}`)

export const createMedicationOrder = (studentId, data) =>
  api.post(`/students/${studentId}/medication-orders`, data)

// ============ Medication logs ============
export const administerMedication = (logId, data = {}) =>
  api.post(`/medication-logs/${logId}/administer`, data)

export const skipMedication = (logId, data) =>
  api.post(`/medication-logs/${logId}/skip`, data)

export const correctMedicationLog = (logId, data) =>
  api.post(`/medication-logs/${logId}/correct`, data)

// ============ Today-medication dashboard ============
export const getTodayMedication = () =>
  api.get('/portfolio/today-medication')
