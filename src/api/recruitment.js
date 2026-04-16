import api from './index'

export const getRecruitmentRecords = (params) => api.get('/recruitment/records', { params })
export const createRecruitmentRecord = (data) => api.post('/recruitment/records', data)
export const updateRecruitmentRecord = (id, data) => api.put(`/recruitment/records/${id}`, data)
export const deleteRecruitmentRecord = (id) => api.delete(`/recruitment/records/${id}`)
export const getRecruitmentStats = (params) => api.get('/recruitment/stats', { params })
export const getRecruitmentOptions = (params) => api.get('/recruitment/options', { params })
export const importRecruitmentRecords = (records) => api.post('/recruitment/import', records)
export const getNoDepositAnalysis = (params) => api.get('/recruitment/no-deposit-analysis', { params })
export const getRecruitmentAddressHotspots = (params) => api.get('/recruitment/address-hotspots', { params })
export const syncRecruitmentAddressHotspots = (params) => api.post('/recruitment/address-hotspots/sync', null, { params })
export const getRecruitmentCampusSetting = () => api.get('/recruitment/campus-setting')
export const updateRecruitmentCampusSetting = (data) => api.put('/recruitment/campus-setting', data)
export const getRecruitmentNearbyKindergartens = () => api.get('/recruitment/nearby-kindergartens')
export const getRecruitmentMarketIntelligence = (params) => api.get('/recruitment/market-intelligence', { params })
export const syncRecruitmentMarketIntelligence = (params) => api.post('/recruitment/market-intelligence/sync', null, { params })
export const getPeriods = () => api.get('/recruitment/periods')
export const getPeriodsSummary = (params) => api.get('/recruitment/periods/summary', { params })
export const createPeriod = (data) => api.post('/recruitment/periods', data)
export const updatePeriod = (id, data) => api.put(`/recruitment/periods/${id}`, data)
export const deletePeriod = (id) => api.delete(`/recruitment/periods/${id}`)
export const syncPeriod = (id) => api.post(`/recruitment/periods/${id}/sync`)
export const exportRecruitmentStats = (params) => api.get('/recruitment/stats/export', { params, responseType: 'blob' })
export const getMonths   = ()      => api.get('/recruitment/months')
export const addMonth    = (month) => api.post('/recruitment/months', { month })
export const deleteMonth = (month) => api.delete(`/recruitment/months/${encodeURIComponent(month)}`)

// 競爭者學校地理編碼
export const getGeocodePendingCount = () =>
  api.get('/recruitment/competitor-schools/geocode-pending')
export const geocodeCompetitorSchools = (limit = 826) =>
  api.post('/recruitment/competitor-schools/geocode', null, { params: { limit } })

// 教育部幼兒園公開資料（高雄市）
export const getGovKindergartens = (params) => api.get('/recruitment/gov-kindergartens', { params })
export const syncGovKindergartens = (background = true) =>
  api.post('/recruitment/gov-kindergartens/sync', null, { params: { background } })
export const getGovKindergartensSyncStatus = () => api.get('/recruitment/gov-kindergartens/sync-status')
