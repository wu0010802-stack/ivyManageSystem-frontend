/**
 * 將 name 從 arr 中切換（存在則移除，不存在則加入）。
 * @param {Array} arr - 要操作的陣列（直接 mutate）
 * @param {string} name - 要切換的值
 */
export function toggleArrayItem(arr, name) {
  const idx = arr.indexOf(name)
  if (idx >= 0) {
    arr.splice(idx, 1)
  } else {
    arr.push(name)
  }
}
