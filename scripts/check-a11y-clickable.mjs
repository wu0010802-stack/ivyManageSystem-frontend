#!/usr/bin/env node
/**
 * scripts/check-a11y-clickable.mjs — 「可點擊但鍵盤到不了」的存量棘輪。
 *
 * 抓什麼：`<div @click="doThing()">` 這類把互動掛在非語意元素上、又沒有給
 * 鍵盤語意的寫法。滑鼠使用者沒事，但：
 *   - 鍵盤使用者 Tab 不到，功能等於不存在
 *   - 螢幕閱讀器唸成一段純文字，不會宣告成可操作元件
 *   - 沒有 :focus-visible 焦點框
 *
 * 正解優先序：
 *   1. 直接用 <button type="button">（拿掉預設樣式即可，不需要 ARIA）
 *   2. 真的必須是 div/li 時，補齊三件套：
 *        role="button" tabindex="0" @keydown.enter.space.prevent="同一個 handler"
 *
 * 刻意**不**算違規的情況（都是誤報來源，逐一排除過）：
 *   - `@click.self`：遮罩層點空白處關閉。鍵盤路徑是 Esc，給 overlay 補 tabindex
 *     反而多出一個無意義的 Tab 停點，是 a11y 反模式。
 *   - 只寫 `@click.stop` 沒有 handler：純粹阻止冒泡的容器，本身不是互動元素。
 *   - 已有 role= / tabindex / @keydown / @keyup 的。
 *   - 帶 `v-bind="..."` 的：屬性是動態算出來的（例如 M3ListItem 的 rootAttrs
 *     會在 clickable 時回 role/tabindex），靜態掃描無法判定，保守放行。
 *
 * 用法：
 *   npm run check:a11y             # 檢查（CI 用）
 *   npm run check:a11y -- --list   # 列出所有出現位置
 *   npm run check:a11y -- --update # 收斂後把 BASELINE 更新成現況
 *
 * 退出碼：0=未超標；1=超出 baseline 或低於 baseline 但未更新數字。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const SELF_PATH = 'scripts/check-a11y-clickable.mjs';

/**
 * 修掉幾處之後**必須**同步調降這個數字（`--update` 會幫你改），否則棘輪會鬆掉。
 *
 * 存量 14 處**不是同一種修法**，別無腦套三件套 —— 分三類，各有正解：
 *
 *   A. 單純卡片／列表項（RecruitmentAreaTab、RecruitmentNearbySchoolList、
 *      PlanIssuesSummary、IepView、FeeListGroup、KioskPunchView、PortalAlbums…）
 *      → 三件套或直接換 <button>。低風險，可逐一收。
 *
 *   B. listbox / combobox（GlobalSearch 的 .gs-item ×2）
 *      → **不要**加 tabindex。父層 .gs-modal 已經接管 ArrowDown/Enter，
 *        正解是父 role="listbox" + 項目 role="option" + aria-selected +
 *        aria-activedescendant。加 tabindex 會破壞既有的方向鍵導航。
 *
 *   C. grid（LeaveCalendar 的日曆格、POSSearchPanel 的 .pos-cal__cell）
 *      → roving tabindex（整個 grid 只有一個 tabindex="0"，方向鍵移動焦點），
 *        不是每一格都 tabindex="0" —— 否則一個月要按 30 次 Tab 才能走完。
 *
 *   另有一處刻意保留：PortalAlbumDetailView 的 <img @click> 只是滑鼠捷徑，
 *   旁邊的 el-checkbox 已提供等價的鍵盤路徑，加 tabindex 只會製造重複停點。
 */
const BASELINE = 14;

/** 非語意元素：本身不帶互動語意，掛 @click 就需要自己補鍵盤可及性。 */
const NON_SEMANTIC = new Set([
  'div', 'span', 'li', 'td', 'tr', 'section', 'article', 'p', 'img', 'label', 'ul', 'ol',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.vue')) out.push(full);
  }
  return out;
}

function scan() {
  const hits = [];
  for (const file of walk('src')) {
    const src = readFileSync(file, 'utf-8');
    const tplStart = src.indexOf('<template');
    if (tplStart < 0) continue;
    // 只掃 template 區；<script> 裡的字串不算。
    const tpl = src.slice(tplStart);
    const before = src.slice(0, tplStart).split('\n').length - 1;

    // 開標籤（屬性可跨行，字串內的 > 以引號吃掉避免提早結束）
    const tagRe = /<([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)\/?>/g;
    let m;
    while ((m = tagRe.exec(tpl))) {
      const [full, tag, attrs] = m;
      if (!NON_SEMANTIC.has(tag)) continue;

      const clickMatch = attrs.match(/(?:@|v-on:)click([.\w]*)\s*(=)?/);
      if (!clickMatch) continue;
      const modifiers = clickMatch[1] || '';
      const hasHandler = Boolean(clickMatch[2]);

      // 遮罩層「點空白處關閉」——鍵盤走 Esc，不該有 Tab 停點
      if (modifiers.includes('.self')) continue;
      // 同上，但遮罩本身沒有子元素所以沒寫 .self（overlay / backdrop / mask）。
      // 用 class 名稱判斷確實是啟發式，但這批的替代方案（把遮罩變成可 focus 元素）
      // 是明確的反模式，寧可放行也不要引導人加錯東西。
      // ⚠ 放行不等於免責：這類元件的鍵盤關閉路徑（Esc）要另外顧，掃描器管不到。
      if (/class="[^"]*\b(overlay|backdrop|mask)\b/.test(attrs)) continue;
      // 純阻止冒泡的容器，本身不是互動元素
      if (modifiers.includes('.stop') && !hasHandler) continue;
      // 已有鍵盤語意
      if (/\brole\s*=/.test(attrs) || /\btabindex\b/.test(attrs)) continue;
      if (/(?:@|v-on:)key(?:down|up|press)/.test(attrs)) continue;
      // 屬性動態展開，靜態判不了（可能已含 role/tabindex）
      if (/v-bind\s*=/.test(attrs)) continue;

      const line = before + tpl.slice(0, m.index).split('\n').length;
      hits.push({ file, line, tag, snippet: full.replace(/\s+/g, ' ').slice(0, 110) });
    }
  }
  return hits;
}

const hits = scan();
const total = hits.length;

if (process.argv.includes('--list')) {
  for (const h of hits) console.log(`${h.file}:${h.line}  <${h.tag}>  ${h.snippet}`);
  console.log(`\n合計 ${total} 處，分佈於 ${new Set(hits.map((h) => h.file)).size} 個檔案`);
  process.exit(0);
}

if (process.argv.includes('--update')) {
  const src = readFileSync(SELF_PATH, 'utf-8');
  writeFileSync(SELF_PATH, src.replace(/const BASELINE = \d+;/, `const BASELINE = ${total};`));
  console.log(`✓ BASELINE 已更新為 ${total}。記得把 ${SELF_PATH} 一起 commit。`);
  process.exit(0);
}

if (total > BASELINE) {
  console.error(
    `✗ 可點擊但鍵盤到不了的元素增加了：${total} > baseline ${BASELINE}\n\n` +
      `新的可點擊元素請優先用 <button type="button">；\n` +
      `真的必須是 div/li 時補齊三件套：\n` +
      `  role="button" tabindex="0" @keydown.enter.space.prevent="handler"\n\n` +
      `跑 \`npm run check:a11y -- --list\` 看完整清單。`,
  );
  process.exit(1);
}

if (total < BASELINE) {
  console.error(
    `✗ 存量已降到 ${total}（baseline 仍寫 ${BASELINE}）。\n` +
      `跑 \`npm run check:a11y -- --update\` 把成果鎖進版控 —— 否則棘輪會鬆掉。`,
  );
  process.exit(1);
}

console.log(`✓ 可點擊但無鍵盤語意的元素維持 ${total} 處（baseline ${BASELINE}）`);
