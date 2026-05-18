import api from './index'

export const getRecruitmentRecords = (params: unknown) => api.get('/recruitment/records', { params })
export const createRecruitmentRecord = (data: unknown) => api.post('/recruitment/records', data)
export const updateRecruitmentRecord = (id: number, data: unknown) => api.put(`/recruitment/records/${id}`, data)
export const deleteRecruitmentRecord = (id: number) => api.delete(`/recruitment/records/${id}`)
// 招生訪視轉化為正式學生
// body: { student_id_code, classroom_id?, enrollment_date?, gender?, initial_lifecycle_status? }
export const convertRecruitmentRecord = (id: number, data: unknown) =>
  api.post(`/recruitment/records/${id}/convert`, data)
export const getRecruitmentStats = (params: unknown) => api.get('/recruitment/stats', { params })
export const getRecruitmentOptions = (params: unknown) => api.get('/recruitment/options', { params })
export const importRecruitmentRecords = (records: unknown) => api.post('/recruitment/import', records)
export const getNoDepositAnalysis = (params: unknown) => api.get('/recruitment/no-deposit-analysis', { params })
export const getRecruitmentAddressHotspots = (params: unknown) => api.get('/recruitment/address-hotspots', { params })
export const syncRecruitmentAddressHotspots = (params: unknown) => api.post('/recruitment/address-hotspots/sync', null, { params })
export const getRecruitmentCampusSetting = () => api.get('/recruitment/campus-setting')
export const updateRecruitmentCampusSetting = (data: unknown) => api.put('/recruitment/campus-setting', data)
export const getRecruitmentNearbyKindergartens = () => api.get('/recruitment/nearby-kindergartens')
export const getRecruitmentMarketIntelligence = (params: unknown) => api.get('/recruitment/market-intelligence', { params })
export const syncRecruitmentMarketIntelligence = (params: unknown) => api.post('/recruitment/market-intelligence/sync', null, { params })
export const getPeriods = () => api.get('/recruitment/periods')
export const getPeriodsSummary = (params: unknown) => api.get('/recruitment/periods/summary', { params })
export const createPeriod = (data: unknown) => api.post('/recruitment/periods', data)
export const updatePeriod = (id: number, data: unknown) => api.put(`/recruitment/periods/${id}`, data)
export const deletePeriod = (id: number) => api.delete(`/recruitment/periods/${id}`)
export const syncPeriod = (id: number) => api.post(`/recruitment/periods/${id}/sync`)
export const exportRecruitmentStats = (params: unknown) => api.get('/recruitment/stats/export', { params, responseType: 'blob' })
export const getMonths   = ()             => api.get('/recruitment/months')
export const addMonth    = (month: string) => api.post('/recruitment/months', { month })
export const deleteMonth = (month: string) => api.delete(`/recruitment/months/${encodeURIComponent(month)}`)

// 競爭者學校地理編碼
export const getGeocodePendingCount = () =>
  api.get('/recruitment/competitor-schools/geocode-pending')
export const geocodeCompetitorSchools = (limit = 826) =>
  api.post('/recruitment/competitor-schools/geocode', null, { params: { limit } })
export const syncKiangData = () =>
  api.post('/recruitment/competitor-schools/sync-kiang')
export const getCampusCompetition = () =>
  api.get('/recruitment/campus-competition')

// 教育部幼兒園公開資料（高雄市）
export const getGovKindergartens = (params: unknown) => api.get('/recruitment/gov-kindergartens', { params })
export const syncGovKindergartens = (background = true) =>
  api.post('/recruitment/gov-kindergartens/sync', null, { params: { background } })
export const getGovKindergartensSyncStatus = () => api.get('/recruitment/gov-kindergartens/sync-status')
