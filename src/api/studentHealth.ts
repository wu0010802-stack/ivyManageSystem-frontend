import api from './index'

// ============ Allergies ============
export const listAllergies = (studentId: number, params: unknown = {}) =>
  api.get(`/students/${studentId}/allergies`, { params })

export const createAllergy = (studentId: number, data: unknown) =>
  api.post(`/students/${studentId}/allergies`, data)

export const updateAllergy = (studentId: number, algId: number, data: unknown) =>
  api.patch(`/students/${studentId}/allergies/${algId}`, data)

export const deleteAllergy = (studentId: number, algId: number) =>
  api.delete(`/students/${studentId}/allergies/${algId}`)

// ============ Medication orders ============
export const listMedicationOrders = (studentId: number, params: unknown = {}) =>
  api.get(`/students/${studentId}/medication-orders`, { params })

export const getMedicationOrder = (studentId: number, orderId: number) =>
  api.get(`/students/${studentId}/medication-orders/${orderId}`)

export const createMedicationOrder = (studentId: number, data: unknown) =>
  api.post(`/students/${studentId}/medication-orders`, data)

// ============ Medication logs ============
export const administerMedication = (logId: number, data: unknown = {}) =>
  api.post(`/medication-logs/${logId}/administer`, data)

export const skipMedication = (logId: number, data: unknown) =>
  api.post(`/medication-logs/${logId}/skip`, data)

export const correctMedicationLog = (logId: number, data: unknown) =>
  api.post(`/medication-logs/${logId}/correct`, data)

// ============ Today-medication dashboard ============
export const getTodayMedication = () =>
  api.get('/portfolio/today-medication')
