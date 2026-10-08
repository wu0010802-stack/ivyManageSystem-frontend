/**
 * 擋整類守衛（F124／MT-30）：地圖 overlay 的字串內容一律要先跳脫。
 *
 * Leaflet 1.9.4 的 `DivOverlay._updateContent` 遇到字串 content 直接
 * `node.innerHTML = content`；Google Maps `InfoWindow.setContent(string)` 同理。
 * 這些 DOM 是地圖庫自己寫的，Vue 模板的自動跳脫管不到，型別檢查也看不出來
 * （參數型別本來就是 string）。娃娃車預覽地圖曾把學生姓名原樣塞進 tooltip，
 * 招生熱點圖同類 sink 卻都有 escapeHtml——只有掃原始碼才擋得住「下一個漏掉的」。
 *
 * ## 規則（對 `bindTooltip`／`bindPopup`／`setContent`／`setTooltipContent`／
 * `setPopupContent` 的第一個參數）
 *
 * 1. 靜態字面（`'…'`、無插值的 `` `…` ``）→ 放行。
 * 2. 模板字串的每個 `${…}` 都必須是 `escapeHtml(…)`；`+` 串接的每一段、
 *    `a ? b : c` 的兩個分支都遞迴套同一條規則。
 * 3. 其餘（變數、成員存取、函式呼叫）只放行兩種**命名約定**：
 *    - 名稱以 `html`／`Html` 結尾＝「內容已跳脫的 HTML 字串」（例：`nearbySchoolPopupHtml(…)`）；
 *    - 名稱以 `El`／`Element`／`Node` 結尾＝DOM 節點（Leaflet 走 appendChild，不經 innerHTML；
 *      含 `document.createTextNode(…)`）。
 *    `s.label` 這類裸字串一律擋下——要嘛包 `escapeHtml`，要嘛改名表明它是已跳脫的 HTML。
 *
 * 只掃 `.ts` 與 `.vue` 的 `<script>` 區塊；測試檔與 `_generated` 不掃。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

const SINK_METHODS = new Set([
  'bindTooltip',
  'bindPopup',
  'setContent',
  'setTooltipContent',
  'setPopupContent',
])

const ESCAPE_HELPERS = new Set(['escapeHtml'])
/** 已跳脫 HTML 字串的命名約定 */
const TRUSTED_HTML_NAME = /(?:^html|Html|HTML)$/
/** DOM 節點的命名約定（Leaflet 對 HTMLElement 走 appendChild） */
const DOM_NODE_NAME = /(?:El|Element|Node)$/

function unwrap(node: ts.Expression): ts.Expression {
  let n = node
  while (
    ts.isParenthesizedExpression(n)
    || ts.isAsExpression(n)
    || ts.isNonNullExpression(n)
    || ts.isTypeAssertionExpression(n)
    || ts.isSatisfiesExpression(n)
  ) {
    n = n.expression
  }
  return n
}

/** 識別字／成員存取／呼叫的「名稱」：`foo`、`a.b.foo`、`foo(…)`、`a.foo(…)` → `foo`。 */
function trailingName(node: ts.Expression): string | null {
  const n = unwrap(node)
  if (ts.isIdentifier(n)) return n.text
  if (ts.isPropertyAccessExpression(n)) return n.name.text
  if (ts.isCallExpression(n)) return trailingName(n.expression)
  return null
}

function isEscapeCall(node: ts.Expression): boolean {
  const n = unwrap(node)
  return ts.isCallExpression(n) && ESCAPE_HELPERS.has(trailingName(n.expression) ?? '')
}

/** 判斷 overlay 內容是否安全；回傳 null＝安全，否則回傳違規片段。 */
function unsafeContentReason(node: ts.Expression, sf: ts.SourceFile): string | null {
  const n = unwrap(node)
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isNumericLiteral(n)) {
    return null
  }
  if (ts.isTemplateExpression(n)) {
    const bad = n.templateSpans.find((span) => !isEscapeCall(span.expression))
    return bad ? `模板插值 \${${bad.expression.getText(sf)}} 未經 escapeHtml` : null
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return unsafeContentReason(n.left, sf) ?? unsafeContentReason(n.right, sf)
  }
  if (ts.isConditionalExpression(n)) {
    return unsafeContentReason(n.whenTrue, sf) ?? unsafeContentReason(n.whenFalse, sf)
  }
  if (isEscapeCall(n)) return null
  const name = trailingName(n)
  if (name && (TRUSTED_HTML_NAME.test(name) || DOM_NODE_NAME.test(name))) return null
  return `未跳脫的內容 ${n.getText(sf)}`
}

interface SinkCall {
  file: string
  line: number
  method: string
  reason: string | null
}

function scanSource(file: string, code: string): SinkCall[] {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const calls: SinkCall[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && SINK_METHODS.has(node.expression.name.text)
      && node.arguments.length > 0
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
      calls.push({
        file,
        line: line + 1,
        method: node.expression.name.text,
        reason: unsafeContentReason(node.arguments[0], sf),
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return calls
}

const SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/g

const blankOut = (text: string): string => text.replace(/[^\n]/g, ' ')

/**
 * `.vue` 只取 `<script>` 區塊；區塊外的內容換成等長空白（保留換行），
 * 讓報錯行號就是原檔行號。
 */
function scriptOf(path: string, raw: string): string {
  if (!path.endsWith('.vue')) return raw
  let out = ''
  let last = 0
  for (const m of raw.matchAll(SCRIPT_BLOCK)) {
    const bodyStart = (m.index ?? 0) + m[0].indexOf('>') + 1
    out += blankOut(raw.slice(last, bodyStart)) + m[1]
    last = bodyStart + m[1].length
  }
  return out + blankOut(raw.slice(last))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === '_generated' || name === 'node_modules') continue
      walk(full, out)
    } else if (/\.(ts|vue)$/.test(name) && !/\.(spec|test)\.ts$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

const files = walk(SRC)
const allCalls = files.flatMap((full) =>
  scanSource(relative(SRC, full), scriptOf(full, readFileSync(full, 'utf8'))),
)

describe('地圖 overlay 的字串內容必須先 escapeHtml（F124）', () => {
  it('守衛沒有空轉：掃得到 .vue 與 .ts，且確實抓到地圖 sink 呼叫點', () => {
    expect(files.some((f) => f.endsWith('.vue'))).toBe(true)
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true)
    expect(allCalls.length).toBeGreaterThanOrEqual(1)
    // 已知 sink：娃娃車預覽地圖的學生名 tooltip（F124 原始漏洞點）
    expect(
      allCalls.some((c) => c.file.endsWith('BusRoutePreviewMap.vue') && c.method === 'bindTooltip'),
    ).toBe(true)
  })

  it('src/ 內沒有未跳脫的 bindTooltip／bindPopup／setContent 字串內容', () => {
    const offenders = allCalls
      .filter((c) => c.reason)
      .map((c) => `${c.file}:${c.line} ${c.method}()：${c.reason}`)
    expect(offenders).toEqual([])
  })
})

describe('規則自測（避免守衛本身寫壞而恆綠）', () => {
  const reasons = (code: string) => scanSource('fixture.ts', code).map((c) => c.reason)

  it('擋下：模板插值未跳脫、裸成員存取、串接中混入裸值', () => {
    expect(reasons('m.bindTooltip(`${s.seq}. ${s.label}`)')[0]).toMatch(/未經 escapeHtml/)
    expect(reasons('m.bindPopup(s.label)')[0]).toMatch(/未跳脫/)
    expect(reasons("m.bindPopup('<b>' + name + '</b>')")[0]).toMatch(/未跳脫/)
    expect(reasons('w.setContent(ok ? `${escapeHtml(a)}` : `${b}`)')[0]).toMatch(/未經 escapeHtml/)
    expect(reasons('p.setPopupContent(`<b>${escapeHtml(a)}</b>${raw}`)')[0]).toMatch(/未經 escapeHtml/)
  })

  it('放行：靜態字面、escapeHtml、已跳脫 HTML 命名、DOM 節點', () => {
    expect(reasons("m.bindTooltip('園所（起點／終點）')")).toEqual([null])
    expect(reasons('m.bindTooltip(escapeHtml(`${s.seq}. ${s.label}`))')).toEqual([null])
    expect(reasons('m.bindPopup(`<strong>${escapeHtml(name)}</strong>`)')).toEqual([null])
    expect(reasons('m.bindPopup(nearbySchoolPopupHtml(school))')).toEqual([null])
    expect(reasons('w.setContent(html)')).toEqual([null])
    expect(reasons('m.bindTooltip(tooltipEl)')).toEqual([null])
    expect(reasons('m.setTooltipContent(document.createTextNode(s.label))')).toEqual([null])
  })
})
