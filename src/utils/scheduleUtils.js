/**
 * 取得指定月份中每個「週一」的日期字串陣列（YYYY-MM-DD）
 * 規則：週一所在月份 === 目標月份才納入
 *
 * @param {number} year  - 西元年
 * @param {number} month - 月份（1-based）
 * @returns {string[]}   - YYYY-MM-DD 字串陣列
 */
export const getMonthWeeks = (year, month) => {
  const result = []
  let d = new Date(year, month - 1, 1)
  // 找到第一個週一
  while (d.getDay() !== 1) d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  // 收集所有週一，直到超出該月
  while (d.getMonth() === month - 1) {
    result.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7)
  }
  return result
}
