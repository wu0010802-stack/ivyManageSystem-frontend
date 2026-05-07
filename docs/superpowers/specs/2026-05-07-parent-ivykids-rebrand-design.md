# 家長端 IvyKids 品牌回歸設計（2026-05-07）

> 把家長端視覺系統從 coral / sky 全面切換回 IvyKids 官網品牌（深綠 + 藍綠 + 童彩 6 色 + kawaii 資產），全 22 view 一次到位，分 6 個 stacked PR 漸進交付。

---

## 1. 背景與動機

### 1.1 目前狀態（baseline）

家長端 (`src/parent`) 已歷經三輪迭代：
- 2026-04-29 v2.0 全交付（訊息/簽名/用藥單/LINE 雙向/Rich Menu/通知偏好）
- 2026-05-01 15 項 UX polish
- 2026-05-02 Soft UI Evolution token 化（pt-elev/hairline/tint tokens）
- 2026-05-03 6-phase ACD 拆解（5 views 3136 → 1287 行，22 子元件，PR #1-#6）

當前 token 設計（`src/parent/styles/globals.css` 555 行）為：
- `--brand-primary: #FF8B8B` coral（曾從深綠 #3f7d48 切換而來）
- `--brand-accent:  #FFD93D` sun yellow
- `--pt-surface-app: #F2F9FC` sky-50
- `--pt-text-strong: #1B4459` sky-900
- 10 個 `--pt-tint-*` 混用 sky/grape/coral/sun

### 1.2 問題

業主於 2026-05-07 提出三項痛點：
- **A** 視覺氣質：太溫吞、不夠特別、難從同類 app 區辨
- **B** 資訊密度：某些頁掃不到重點
- **E** 商務考量：給 demo / 給家長看時需要驚艷感

更重要的觀察：家長端的視覺系統與官網（https://www.ivykids.tw/）**完全不對齊**。官網主色為深綠 + 藍綠雙系統，家長端卻是 coral，造成品牌斷層。

### 1.3 IvyKids 官網品牌語言（從 assets/css/style.css 與 logo 直接擷取）

#### 色票
- **主色雙系統**：`#0d9053` 深綠（CTA） / `#33aaaa` 藍綠（primary button）
- **輔助綠**：`#0caf76` 亮綠 / `#5aa842` 黃綠 / `#41a074` 中綠
- **童彩 6 色**（about-b 教學理念 tile）：`#ffde51` 黃 / `#f3c630` 金黃 / `#f3958c` 珊瑚 / `#f65265` 粉紅紅 / `#9f89bd` 紫 / `#5aa842` 綠
- **暖中性**：`#392a1c` 主文字（暖深咖啡，非純黑）/ `#5B5B5B` 次文字 / `#fffce8` 奶油黃底 / `#f5fbe6` 嫩綠底

#### 字型
**Noto Sans TC**（300/400/500/700/900 共 5 重） — 純無襯線。

#### 視覺 motif（品牌資產）
- **Kawaii 黃星星**（手繪表情、有臉、金邊）
- **金色皇冠**（紅寶石點綴）
- **綠色月桂葉花環**（兩側對稱）
- **綠色緞帶**（IVY KIDS 字樣容器）
- **手繪線條兩個小朋友**（藍短褲男孩 + 粉紅蝴蝶結女孩）

#### DNA
24 年口碑老店、歐式城堡、愛與關懷、自信探索、快樂健康。**不是極簡 boutique、不是 hi-tech**。

### 1.4 設計方向

**Hybrid · 極簡骨架 + 童趣 moments**：
- 骨架沿用 C（Modern Minimal）的留白、hairline、字級對比
- 「溫度標記點」用品牌資產（kawaii 星 / 皇冠 / 月桂葉）每畫面 1-2 處
- 童彩 6 色當 category icon tile 系統，提升資訊掃描速度
- 主色雙系統（綠 + 藍綠）取代單 coral

---

## 2. 目標與非目標

### 目標
1. 家長端視覺與官網對齊，識別度立刻可辨
2. 全 22 view、22 子元件、6 個現有基礎元件全部套用新 token
3. Bundle 增量 ≤ +12 KB gzip（目前 46.33 KB → 上限 58 KB）
4. 既有 116 + 581 單元測試全綠不允許 regression
5. 6 個 stacked PR 漸進交付，可獨立 review、可 phase rollback

### 非目標
- 不引入襯線中文字（官網本身是 Sans）
- 不重做 IA / 路由 / 業務功能（純視覺重塑）
- 不引入新 npm 字型套件（Noto Sans TC 已從 Google Fonts 載入）
- 不重做後端 / API / store 邏輯
- 不改 dark mode 切換機制（沿用 prefers-color-scheme + data-theme）

---

## 3. Token 系統重構

### 3.1 替換對照表（globals.css 改動）

| Token | 現值 | 新值 | 說明 |
|---|---|---|---|
| `--brand-primary` | `#FF8B8B` coral | `#0d9053` | 官網深綠主色 |
| `--brand-primary-hover` | `#E96B6B` | `#0caf76` | hover 亮綠 |
| `--brand-primary-soft` | `#FFE3E0` | `#d4ffe7` | soft tint（官網既有） |
| `--brand-primary-tint` | `#FFF4F2` | `#f5fbe6` | 嫩綠 tint |
| `--brand-secondary` (新) | — | `#33aaaa` | 藍綠次色（官網 primary button） |
| `--brand-secondary-soft` (新) | — | `#d3ecec` | 藍綠 tint |
| `--brand-accent` | `#FFD93D` | `#ffde51` | 對齊 kawaii 星黃 |
| `--pt-surface-app` | `#F2F9FC` | `#fffce8` | 奶油黃底 |
| `--pt-surface-card` | `#ffffff` | `#ffffff` | 不變 |
| `--pt-surface-mute` | `#ECF5F9` | `#f5fbe6` | 嫩綠 mute |
| `--pt-surface-mute-warm` | `#FFFCF2` | `#fffce8` | 對齊 app 底 |
| `--pt-text-strong` | `#1B4459` | `#392a1c` | 暖深咖啡 |
| `--pt-text-body` | `#1F2937` | `#392a1c` | 同上 |
| `--pt-text-muted` | `#2D6F8E` | `#5B5B5B` | 次文字 |

### 3.2 新增 token

**IvyKids 品牌色（10 個）**：
```css
--ivy-green-deep:    #0d9053;  /* primary CTA */
--ivy-green-bright:  #0caf76;  /* hover */
--ivy-green-laurel:  #5aa842;  /* 月桂葉 */
--ivy-green-mid:     #41a074;
--ivy-teal-primary:  #33aaaa;  /* secondary */
--ivy-teal-soft:     #d3ecec;
--ivy-star-yellow:   #ffde51;  /* kawaii 星 */
--ivy-crown-gold:    #f3c630;  /* 皇冠 + 邊線 */
--ivy-cream-bg:      #fffce8;
--ivy-leaf-bg:       #f5fbe6;
```

**童彩 6 色 tile（12 個 — bg + fg 配對）**：
```css
--ivy-tile-yellow-bg:  #fff8d8;  --ivy-tile-yellow-fg:  #b07700;
--ivy-tile-coral-bg:   #ffe8e4;  --ivy-tile-coral-fg:   #b14545;
--ivy-tile-pink-bg:    #ffd8de;  --ivy-tile-pink-fg:    #a33340;
--ivy-tile-purple-bg:  #efe5f5;  --ivy-tile-purple-fg:  #6e3f94;
--ivy-tile-green-bg:   #e8f5e3;  --ivy-tile-green-fg:   #1B5E20;
--ivy-tile-teal-bg:    #d3ecec;  --ivy-tile-teal-fg:    #145555;
```

### 3.3 Tint 重新分配（10 個 `--pt-tint-*`）

| Tint | 目前色族 | 新色族 | 對應 ivy-tile |
|---|---|---|---|
| money | leaf 綠 | 金黃 | yellow |
| message | sky | 藍綠 | teal |
| event | grape | 紫 | purple |
| announcement | sun | 珊瑚 | coral |
| leave | coral | 藍綠 | teal |
| activity | grape | 紫 | purple |
| medication | grape | 紫 | purple |
| pickup | sky | 藍綠 | teal |
| calendar | (新) | 綠 | green |
| contact | (新) | 粉紅 | pink |

**設計原則**：相近概念用同色族（messages/leaves/pickup 都偏溝通類 → teal；event/activity/medication 偏行程記錄 → purple；money/announcement 偏資訊提示 → 暖色）。

### 3.4 漸層重做

```css
--pt-gradient-hero: linear-gradient(135deg, #fffce8 0%, #f5fbe6 100%);
--pt-gradient-warm: linear-gradient(135deg, #fff8d8 0%, #ffde51 100%);
--pt-gradient-info: linear-gradient(135deg, #d3ecec 0%, #33aaaa 100%);
--pt-gradient-brand: linear-gradient(135deg, #0d9053 0%, #0caf76 100%);
--pt-gradient-brand-soft: linear-gradient(135deg, #f5fbe6 0%, #d4ffe7 100%);
```

### 3.5 Dark mode

`@media (prefers-color-scheme: dark)` 與 `:root[data-theme='dark']` 兩段同步補上對應深色版本（現有 globals.css 已有兩段 dark 區，照樣維護）。深色模式 IvyKids 色保持品牌辨識：
- `--ivy-green-deep`: `#0d9053` → `#5aa842`（深底襯不夠亮，往黃綠靠）
- `--ivy-cream-bg`: `#fffce8` → `#1f1c14`（深咖啡）
- `--ivy-leaf-bg`: `#f5fbe6` → `#1a2418`
- 童彩 6 色 bg：用 `rgba(色, 0.18)` rule 套，fg 改為對應淺色版

---

## 4. SVG 品牌資產庫

### 4.1 位置
`src/parent/components/brand/` — 純 SVG inline，無外部圖檔。

### 4.2 元件清單

| 元件 | Props | 用途 |
|---|---|---|
| `<KawaiiStar>` | `size: number = 24`, `expression: 'smile' \| 'wink' \| 'sleep' = 'smile'` | 今日明星、reward badge、empty state、入校徽章 |
| `<CrownIcon>` | `size: number = 20`, `variant: 'gold' \| 'silver' = 'gold'` | 生日當天 avatar 上方、班級頂端、首次到校 |
| `<LaurelWreath>` | `side: 'left' \| 'right' \| 'full'`, `opacity: number = 0.18` | Hero 水印、成就頁背景、空白頁裝飾 |
| `<IvyRibbon>` | default slot, `color: 'green' \| 'teal' = 'green'` | 區塊標題、節慶通知、版頭裝飾 |
| `<BrandMark>` | `variant: 'mini' \| 'full' \| 'mark-only'`, `size: number = 32` | AppHeader 角落、Login 頁、Bind 頁 |
| `<BalloonGroup>` | `count: number = 3`, `colors?: string[]` | 慶祝動畫（生日、繳費完成、活動報名成功） |

### 4.3 a11y 要求
所有 SVG 加 `role="img"` 與 `aria-label`（如 KawaiiStar `aria-label="星星徽章"`）；裝飾性使用（如 hero 水印）改 `aria-hidden="true"`。

### 4.4 reduced-motion
BalloonGroup 預設帶緩慢漂浮動畫；`@media (prefers-reduced-motion: reduce)` 內必須禁止位移，僅保留靜態顯示。

### 4.5 Bundle 預算
6 個 SVG 元件預估 ≤ 5 KB gzip（單檔皆 inline、無 base64 圖檔）。

---

## 5. 元件改動 map

### 5.1 變更分級

| 層級 | 變更內容 | 範例 |
|---|---|---|
| **Token-only** | 純 CSS 變數重綁，無 markup 改動 | SkeletonBlock, ConnectionBanner, AppModal, AppHeader (基本部分) |
| **Layout 微調** | 套新 token + 加 1 處 SVG 資產 | AppHeader (mini logo), TabBar, ParentBottomSheet |
| **Hero 重做** | 套用月桂葉水印 + kawaii 星 + 雙色字 + 暖底 | HomeHero, LeaveHero, FeeHero, ActivityHero, UserHeroCard |
| **Tile / icon 重配色** | 10 種 tint 重新分配為童彩 6 色 | TodoCenter, QuickActions, MoreMenuGroup, FeeListGroup |
| **新元件** | SVG 品牌資產庫 | brand/ 6 個 |

### 5.2 各 view 觸碰範圍（22 views）

| View | Hero 重做 | Tile 重配色 | Token-only |
|---|---|---|---|
| HomeView | ✓ HomeHero | ✓ TodoCenter / QuickActions | — |
| MoreView | ✓ UserHeroCard | ✓ MoreMenuGroup | — |
| LeavesView | ✓ LeaveHero | ✓ LeaveListCard chip | — |
| FeesView | ✓ FeeHero | ✓ FeeListGroup tile | — |
| ActivityView | ✓ ActivityHero | ✓ ActivityCardList tag | — |
| MessagesView | — | ✓ unread badge / chip | ✓ |
| MessageThreadView | — | ✓ MessageBubble | ✓ |
| AnnouncementsView | — | ✓ list item / category chip | ✓ |
| AttendanceView | — | ✓ status pill | ✓ |
| CalendarView | — | ✓ event chip / 6 色 | ✓ |
| ContactBookView / Detail | — | ✓ list item / chip | ✓ |
| EventsView / EventAck | — | ✓ ack chip | ✓ |
| MedicationListView / Form / Detail | — | ✓ status / dose tile | ✓ |
| NotificationPrefsView | — | ✓ toggle / category | ✓ |
| ChildProfileView | ✓ child hero | ✓ info tile | — |
| LoginView / BindView / BindAdditional | ✓ welcome hero（BrandMark full） | — | — |

---

## 6. Phasing（6 個 stacked PR）

跟隨 ACD 階段慣例（feedback_branch_workflow），每 phase 一條 `feat/parent-ivykids-rebrand-v1-phase{N}-{topic}` 分支，merge 順序 P1 → P6 嚴格依序。

### P1 — Foundation：品牌資產 + Token
**Base：main**

- 新建 `src/parent/components/brand/` 6 SVG 元件 + 各自 vitest 測試（~12 測試）
- `globals.css` token 全替換（Section 3）+ dark mode 補齊
- 新增 22 個 IvyKids 專屬 token（Section 3.2）
- 各 SVG 元件 a11y 屬性與 reduced-motion 覆寫

**驗收**：6 SVG 元件單獨可用，新 token 在 light + dark 兩模可見；既有測試全綠；bundle +3-4 KB gzip。

**估時**：~2 天

### P2 — Containers：AppHeader / TabBar / Modal / Sheet
**Base：P1**

- AppHeader 加 `<BrandMark variant="mini">` 在左上角
- TabBar active pill 顏色改深綠 #0d9053（保留現有 pill 動畫）
- AppModal / ParentBottomSheet 套新 elev / hairline / surface
- ConnectionBanner 圖示色改 IvyKids tint
- SkeletonBlock shimmer 對齊新底色

**驗收**：全站 chrome 視覺一致；`AppHeader.test.js` 加 BrandMark 渲染斷言。

**估時**：~1 天

### P3 — Hero 主場：HomeView / MoreView
**Base：P2**

- HomeHero 套 cream→leaf 漸層 + LaurelWreath 左側 + KawaiiStar 右上 + 雙色字
- 加「今日小明是 X 之星」moment（如後端 ChildSummary 有 `daily_star` 欄位則啟用，否則隱藏）
- 子女 avatar 加 CrownIcon overlay（生日當天 / 連續到校 N 天）
- TodoCenter / QuickActions tile 改童彩 6 色配色
- UserHeroCard（MoreView）相同處理 — BrandMark + 月桂葉
- MoreMenuGroup 10 類別 icon 重新分配 6 色

**驗收**：HomeView / MoreView 在 375px / 414px / 768px 三斷點視覺穩定；light + dark 雙模 playwright snapshot 與 baseline diff < 5%。

**估時**：~2 天

### P4 — Hero 次場：Leaves / Fees / Activity
**Base：P3**

- LeaveHero / FeeHero / ActivityHero 套 P3 同樣的水印 + kawaii 點綴 pattern
- LeaveListCard chip 顏色改童彩
- FeeListGroup tile + 受益項目 chip 改童彩
- ActivityCardList tag / RegistrationStatusList badge 改童彩

**驗收**：四個 hero view 視覺風格一致；既有 Vitest mount 測試全綠。

**估時**：~2 天

### P5 — List-heavy：Messages / Announcements / Calendar / ContactBook
**Base：P4**

- Messages 列表 + MessageBubble + MessageComposer 套新 token
- AnnouncementsView 列表 + category chip 改童彩
- CalendarView 6 色事件分類（活動/請假/節日/會議/到校/其他）
- ContactBookView / Detail timeline 改童彩 + KawaiiStar empty state

**驗收**：列表類 view 掃描識別度提升（同類項目色一致）；MessageBubble 對比度過 AA。

**估時**：~2 天

### P6 — 收尾 + 視覺驗收
**Base：P5**

- 剩餘 view：AttendanceView / EventsView / EventAckView / MedicationListView / Form / Detail / NotificationPrefsView / LoginView / BindView / BindAdditionalView / ChildProfileView
- LoginView / BindView 加 `<BrandMark variant="full">` welcome hero
- 全站 light + dark + 三斷點 playwright snapshot 比對
- bundle 大小驗證（gzip ≤ 58 KB）
- `feedback_branch_workflow` 上的 commit 風格檢查

**驗收**：全 22 view 視覺通過業主驗收；bundle 預算達標；既有 116 + 581 測試全綠 + 新 12 SVG 測試通過；無 a11y regression。

**估時**：~2 天

**總計**：~10-11 天工

---

## 7. 品質保護與測試策略

### 7.1 Bundle 預算
- 目前：parent-app gzip 46.33 KB
- 預算：+12 KB（上限 58 KB）
- 預估：SVG inline +5 KB；token 0 增量；總計約 +5-6 KB

### 7.2 視覺對比
- 每 phase 跑 light + dark 兩模 playwright snapshot
- baseline 從 P0（main HEAD）建立
- 三斷點：375px (iPhone SE) / 414px (iPhone Plus) / 768px (iPad)

### 7.3 單元測試
- 新增 ~12 SVG 元件測試（mount + slot + a11y attr 斷言）
- 既有 116（ACD）+ 581（baseline）必須全綠
- 不允許因 token 改動產生 jsdom snapshot regression

### 7.4 無障礙
- KawaiiStar 黃色 + 文字必須過 WCAG AA（4.5:1）
- 童彩 6 色 fg/bg 對比皆過 AA
- prefers-reduced-motion 覆蓋所有新動效（BalloonGroup 漂浮、KawaiiStar wink 等）
- SVG 加 `role="img"` + `aria-label`；裝飾性用 `aria-hidden`

### 7.5 業主驗收節點
- **Phase 3 完成**：HomeView / MoreView 業主預覽，確認方向與微調
- **Phase 6 完成**：全站最終驗收

### 7.6 Rollback
- globals.css 改動最大，保留 P0 commit 為復原點
- stacked PR 可獨立 revert 不影響下層
- 任一 phase 業主否決，僅 revert 該 phase 的 PR 即可

---

## 8. 已知風險

| 風險 | 影響 | 緩解 |
|---|---|---|
| 業主對 cream 底色不適應 | 視覺基調全變，最大風險 | Phase 3 預覽時可調整為純白 + leaf hover；token 切換僅 1 處 |
| 童彩 6 色在 dark mode 不夠柔和 | 夜間使用刺眼 | Dark mode 統一改 `rgba(色, 0.18)` 軟化；對比文字用淺色版 |
| Noto Sans TC 5 字重 bundle 太大 | gzip 預算超支 | 已從 Google Fonts CDN 載入，bundle 不含字型；font-display: swap |
| SVG inline 拖累首屏 | LCP 變差 | 6 元件總計 ≤ 5 KB；非首屏資產（BalloonGroup）改 lazy import |
| 業主後續想調 IvyKids 色票 | token 散落各 view 難改 | 所有色值 100% 走 token 不允許 hex 直寫；改 1 處全站生效 |

---

## 9. Out of scope

- 後端 API / schema 變更（純前端）
- 國際化（仍只支援繁中）
- 教師端 / 管理端視覺（之後另案處理）
- 客製插畫 / 全新動物角色（沿用現有官網資產即可）
- 動畫 framework 升級（仍用 CSS keyframes）

---

## 10. 接續工作

設計確認後進入 `superpowers:writing-plans` 階段，將 Phase P1-P6 拆成可執行的 implementation plan，每 phase 帶任務清單、檔案改動清單、測試清單、驗收條件。

實作階段建議使用 `subagent-driven-development`（沿用上一輪 ACD 慣例），每 phase 派 fresh subagent 執行，兩階段 review。

---

## 附錄 A：品牌資產原始來源

- 官網：https://www.ivykids.tw/
- CSS：https://www.ivykids.tw/assets/css/style.css
- Logo（512×512）：https://www.ivykids.tw/assets/favicons/favicon.png
- Meta image（1200×630）：https://www.ivykids.tw/assets/images/meta.jpg
- Memory：`reference_ivykids_brand.md`
