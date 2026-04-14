const PRESCHOOLS_URL = 'https://kiang.github.io/ap.ece.moe.edu.tw/preschools.json'
const PUNISH_URL = 'https://kiang.github.io/ap.ece.moe.edu.tw/punish_all.json'

let featuresCache = null
let punishCache = null
let featuresPromise = null
let punishPromise = null

const loadFeatures = () => {
  if (featuresCache) return Promise.resolve(featuresCache)
  if (!featuresPromise) {
    featuresPromise = fetch(PRESCHOOLS_URL)
      .then((r) => r.json())
      .then((json) => {
        featuresCache = Array.isArray(json?.features) ? json.features : []
        return featuresCache
      })
      .catch((err) => {
        featuresPromise = null
        console.warn('[usePreschoolGovData] 無法載入政府幼兒園資料', err)
        return []
      })
  }
  return featuresPromise
}

const loadPunish = () => {
  if (punishCache) return Promise.resolve(punishCache)
  if (!punishPromise) {
    punishPromise = fetch(PUNISH_URL)
      .then((r) => r.json())
      .then((json) => {
        punishCache = json && typeof json === 'object' ? json : {}
        return punishCache
      })
      .catch(() => {
        punishPromise = null
        return {}
      })
  }
  return punishPromise
}

// 正規化：去空白、全形空格、轉小寫、統一臺→台
const norm = (s) =>
  String(s ?? '')
    .replace(/[\s　]/g, '')
    .replace(/臺/g, '台')
    .toLowerCase()

// 移除縣市、區鄉鎮、設立別前綴，取得純校名
const stripGeoType = (name) =>
  name
    .replace(/^[\u4e00-\u9fa5]{2,5}[市縣]([\u4e00-\u9fa5]{1,4}[區鄉鎮])?/, '')
    .replace(/^(公立|私立|非營利|準公共)+/, '')
    .trim()

// 移除 Google Places 名稱中的行銷關鍵字（｜或 | 後面的部分）
const stripMarketingTags = (name) =>
  String(name ?? '').split(/[｜|]/)[0].trim()

// 從 Google Places 名稱萃取多個候選名稱（完整名稱 + 以 - 切割的各段）
const extractCandidates = (name) => {
  const clean = stripMarketingTags(name)
  const parts = clean
    .split(/[-－—]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
  return [...new Set([clean, ...parts])]
}

// 從地址字串萃取縣市（取前 3 個中文字）
const extractCity = (address) => {
  if (!address) return ''
  const m = address.match(/^([^\u4e00-\u9fa5]*)([\u4e00-\u9fa5]{2,3}[市縣])/)
  return m ? norm(m[2]) : ''
}

// 縣市是否一致（允許空值 → 視為不確定，不強制排除）
const citiesMatch = (govCity, hintCity) => {
  if (!hintCity) return true       // 沒有 hint，無法判斷，保留
  if (!govCity) return true        // 政府資料缺城市欄位，保留
  return norm(govCity).startsWith(hintCity) || hintCity.startsWith(norm(govCity))
}

// 嚴格名稱比對：完整相等、包含關係、去前綴後比對（無寬鬆子字串）
const namesStrongMatch = (a, b) => {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb) return false
  // 1. 完整相等
  if (na === nb) return true
  // 2. 其中一方包含另一方
  if (na.includes(nb) || nb.includes(na)) return true
  // 3. 去掉地理/設立別前綴後比對
  const ca = norm(stripGeoType(a))
  const cb = norm(stripGeoType(b))
  if (ca && cb && (ca === cb || ca.includes(cb) || cb.includes(ca))) return true
  return false
}

// 寬鬆名稱比對：嚴格規則 + 去除「幼兒園/幼稚園」後的 4 字元子字串
const namesWeakMatch = (a, b) => {
  if (namesStrongMatch(a, b)) return true
  // 去掉地理/設立別前綴，再去掉「幼兒園/幼稚園」通用後綴，再比較子字串
  const SUFFIX = /幼[兒儿]園|幼稚園/g
  const ca = norm(stripGeoType(a)).replace(SUFFIX, '')
  const cb = norm(stripGeoType(b)).replace(SUFFIX, '')
  // 去掉通用後綴後至少要剩 4 字，避免「幼兒園」本身觸發假匹配
  if (ca.length < 4 || cb.length < 4) return false
  const shorter = ca.length <= cb.length ? ca : cb
  const longer  = ca.length <= cb.length ? cb : ca
  for (let i = 0; i <= shorter.length - 4; i++) {
    if (longer.includes(shorter.slice(i, i + 4))) return true
  }
  return false
}

/**
 * 依名稱（+ 可選地址 hint）查詢政府幼兒園資料
 * @param {string} searchName    - 幼兒園名稱（來自 Google Places）
 * @param {string} [addressHint] - 幼兒園地址（用於縣市過濾，減少誤配）
 */
export const findPreschoolByName = async (searchName, addressHint = '') => {
  const [features, punish] = await Promise.all([loadFeatures(), loadPunish()])
  if (!features.length) return null

  const hintCity = extractCity(addressHint)
  // 從 Google Places 名稱萃取所有候選（去行銷標籤、以 - 切分）
  const candidates = extractCandidates(searchName)

  let feature = null

  // Pass 1：縣市一致 + 寬鬆名稱比對（每個候選都試）
  for (const candidate of candidates) {
    feature = features.find(
      (f) =>
        citiesMatch(f.properties?.city ?? '', hintCity) &&
        namesWeakMatch(f.properties?.title ?? '', candidate),
    )
    if (feature) break
  }

  // Pass 2：僅當沒有縣市 hint 時，才允許跨縣市，但改用嚴格比對（防止誤配）
  if (!feature && !hintCity) {
    for (const candidate of candidates) {
      feature = features.find((f) => namesStrongMatch(f.properties?.title ?? '', candidate))
      if (feature) break
    }
  }

  if (!feature) return null

  const p = feature.properties
  const owner = p.owner ?? null

  const penalties = owner
    ? [
        ...(Array.isArray(punish[`負責人：${owner}`]) ? punish[`負責人：${owner}`] : []),
        ...(Array.isArray(punish[`行為人：${owner}`]) ? punish[`行為人：${owner}`] : []),
      ]
    : []

  return {
    name:       p.title ?? null,
    principal:  owner,
    phone:      p.tel ?? null,
    address:    p.address ? p.address.replace(/^\[\d+\]/, '').trim() : null,
    city:       p.city ?? null,
    kind:       p.type ?? null,
    capacity:   p.count_approved != null ? Number(p.count_approved) : null,
    monthlyFee: p.monthly != null ? Number(p.monthly) : null,
    status:     p.is_active === 1 || p.is_active === true ? '營業中' : '已停業',
    penalties,
  }
}
