/**
 * 模糊搜尋 FAQ 項目。
 *
 * 評分規則：
 *   - question.includes(token)  +3
 *   - keyword.includes(token)   +2
 *   - answer.includes(token)    +1
 * Tokens：query 用空白拆 + 中文逐字（聯集，去重）。
 */
export function score(item, query) {
  const q = (query || '').toLowerCase().trim()
  if (!q) return 0
  const tokens = [
    ...new Set([
      ...q.split(/\s+/).filter(Boolean),
      ...[...q].filter(c => /[一-鿿]/.test(c)),
    ]),
  ]
  if (tokens.length === 0) return 0

  const question = (item.question || '').toLowerCase()
  const answer = (item.answer || '').toLowerCase()
  const keywords = (item.keywords || []).map(k => (k || '').toLowerCase())

  let s = 0
  for (const t of tokens) {
    if (question.includes(t)) s += 3
    for (const k of keywords) {
      if (k.includes(t)) s += 2
    }
    if (answer.includes(t)) s += 1
  }
  return s
}

export function searchFaq(items, query, limit = 8) {
  return (items || [])
    .map(item => ({ item, s: score(item, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => x.item)
}
