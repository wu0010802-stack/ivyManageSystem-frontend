import { getGovKindergartens } from '@/api/recruitment'

// ---------------------------------------------------------------------------
// 後端教育部資料快取（competitor_school 表）
// ---------------------------------------------------------------------------

let _govDbCache = null        // 已載入的全量資料（陣列）
let _govDbPromise = null      // in-flight 請求
let _govDbCacheTime = 0       // cache 建立時間（ms）
const GOV_DB_CACHE_TTL = 15 * 60 * 1000 // 15 分鐘

/** 清除快取，下次呼叫 loadGovDbData() 會重新載入。 */
export const invalidateGovDbCache = () => {
  _govDbCache = null
  _govDbPromise = null
  _govDbCacheTime = 0
}

/**
 * 從後端 API 載入教育部高雄市幼兒園快取資料。
 */
export const loadGovDbData = () => {
  if (_govDbCache !== null && Date.now() - _govDbCacheTime < GOV_DB_CACHE_TTL) {
    return Promise.resolve(_govDbCache)
  }
  if (_govDbPromise) return _govDbPromise
  _govDbPromise = getGovKindergartens({ page_size: 500 })
    .then((res) => {
      const schools = res.data?.schools ?? []
      _govDbCache = schools
      _govDbCacheTime = Date.now()
      return schools
    })
    .catch((err) => {
      _govDbPromise = null
      console.warn('[usePreschoolGovData] 後端 gov-kindergartens 載入失敗', err)
      return []
    })
  return _govDbPromise
}

// ---------------------------------------------------------------------------
// 名稱比對工具（供 DB 查詢使用）
// ---------------------------------------------------------------------------

// 正規化：去空白、全形空格、轉小寫、統一臺→台、統一幼稚園→幼兒園
const norm = (s) =>
  String(s ?? '')
    .replace(/[\s　]/g, '')
    .replace(/臺/g, '台')
    .replace(/幼稚園/g, '幼兒園')
    .replace(/國民小學/g, '國小')
    .toLowerCase()

// 移除縣市、區鄉鎮、設立別前綴，取得純校名
const stripGeoType = (name) =>
  name
    .replace(/^[\u4e00-\u9fa5]{2,5}[市縣]([\u4e00-\u9fa5]{1,4}[區鄉鎮])?/, '')
    .replace(/^(公立|私立|非營利|準公共)+/, '')
    .trim()

// 移除行銷關鍵字（｜或 | 後面的部分）
const stripMarketingTags = (name) =>
  String(name ?? '').split(/[｜|]/)[0].trim()

// 從 Google Places 名稱萃取多個候選名稱
export const extractCandidates = (name) => {
  const clean = stripMarketingTags(name)
  const withoutParens = clean.replace(/[（(][^）)]*[）)]/g, '').trim()
  const parts = clean
    .split(/[-－—]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
  return [...new Set([clean, withoutParens, ...parts].filter((s) => s.length >= 3))]
}

// 從地址字串萃取行政區（區/鄉/鎮）
const extractDistrict = (address) => {
  if (!address) return ''
  const m = address.match(/([\u4e00-\u9fa5]{1,4}[區鄉鎮市])/)
  return m ? norm(m[1]) : ''
}

// 精確名稱比對
const namesExactMatch = (a, b) => {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const ca = norm(stripGeoType(a))
  const cb = norm(stripGeoType(b))
  return !!(ca && cb && ca === cb)
}

// 嚴格名稱比對：包含關係
const namesStrongMatch = (a, b) => {
  if (namesExactMatch(a, b)) return true
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  if (na.includes(nb) || nb.includes(na)) return true
  const ca = norm(stripGeoType(a))
  const cb = norm(stripGeoType(b))
  if (ca && cb && (ca.includes(cb) || cb.includes(ca))) return true
  return false
}

// 寬鬆名稱比對：3 字元子字串
const namesWeakMatch = (a, b) => {
  if (namesStrongMatch(a, b)) return true
  const SUFFIX = /幼[兒儿]園|幼稚園/g
  const ca = norm(stripGeoType(a)).replace(SUFFIX, '')
  const cb = norm(stripGeoType(b)).replace(SUFFIX, '')
  if (ca.length < 3 || cb.length < 3) return false
  const shorter = ca.length <= cb.length ? ca : cb
  const longer = ca.length <= cb.length ? cb : ca
  for (let i = 0; i <= shorter.length - 3; i++) {
    if (longer.includes(shorter.slice(i, i + 3))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// DB 查詢
// ---------------------------------------------------------------------------

const _matchFromDb = (schools, candidates, hintDistrict) => {
  const pools = hintDistrict
    ? [schools.filter((s) => (s.district ?? '').includes(hintDistrict)), schools]
    : [schools]
  for (const matchFn of [namesExactMatch, namesStrongMatch, namesWeakMatch]) {
    for (const pool of pools) {
      for (const candidate of candidates) {
        const found = pool.find((s) => matchFn(s.school_name, candidate))
        if (found) return found
      }
    }
  }
  return null
}

const _dbSchoolToResult = (found) => ({
  name:          found.school_name,
  principal:     found.owner_name ?? null,
  phone:         found.phone ?? null,
  address:       found.address ?? null,
  city:          found.city ?? null,
  district:      found.district ?? null,
  kind:          found.school_type ?? null,
  capacity:      found.approved_capacity ?? null,
  monthlyFee:    found.monthly_fee ?? null,
  hasPenalty:    found.has_penalty ?? false,
  approvedDate:  found.approved_date ?? null,
  totalAreaSqm:  found.total_area_sqm ?? null,
  prePublicType: found.pre_public_type ?? null,
  website:       found.website ?? null,
  status:        found.is_active ? '營業中' : '已停業',
  penalties:     [],
})

export const findPreschoolFromDb = async (searchName, addressHint = '') => {
  const schools = await loadGovDbData()
  if (!schools.length) return null
  const hintDistrict = extractDistrict(addressHint)
  const found = _matchFromDb(schools, extractCandidates(searchName), hintDistrict)
  return found ? _dbSchoolToResult(found) : null
}

export const findPreschoolFromDbByNames = async (candidates, addressHint = '') => {
  const schools = await loadGovDbData()
  if (!schools.length) return null
  const hintDistrict = extractDistrict(addressHint)
  const found = _matchFromDb(schools, candidates, hintDistrict)
  return found ? _dbSchoolToResult(found) : null
}
