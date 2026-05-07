import api from './index'

export async function listStaging() {
  const { data } = await api.get('/gov-data/staging')
  return data
}

export async function getBracketsDiff(stagingId) {
  const { data } = await api.get(`/gov-data/staging/brackets/${stagingId}/diff`)
  return data
}

export async function promoteBrackets(stagingId, reason) {
  const { data } = await api.post(
    `/gov-data/staging/brackets/${stagingId}/promote`,
    { reason }
  )
  return data
}

export async function dismissBrackets(stagingId, reason) {
  const { data } = await api.post(
    `/gov-data/staging/brackets/${stagingId}/dismiss`,
    { reason }
  )
  return data
}

export async function promoteMinimumWage(stagingId, reason) {
  const { data } = await api.post(
    `/gov-data/staging/minimum-wage/${stagingId}/promote`,
    { reason }
  )
  return data
}

export async function dismissMinimumWage(stagingId, reason) {
  const { data } = await api.post(
    `/gov-data/staging/minimum-wage/${stagingId}/dismiss`,
    { reason }
  )
  return data
}

export async function syncNow() {
  const { data } = await api.post('/gov-data/sync-now')
  return data
}

export async function listSnapshots({ source, limit = 50 } = {}) {
  const { data } = await api.get('/gov-data/snapshots', {
    params: { source, limit },
  })
  return data
}
