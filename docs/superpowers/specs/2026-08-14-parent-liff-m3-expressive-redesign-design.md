# 家長端 LIFF 全面改版：M3 Expressive・童趣深化 — 設計 spec

- 日期：2026-08-14
- 狀態：待使用者核可
- 方向裁定：使用者於 2026-08-14 自兩方向 mockup 中選定**方向 A（M3 Expressive）**
- Mockup：`docs/mockups/2026-08-14-parent-liff-direction-a-m3-expressive.html`（首頁＋聯絡簿詳情 × Light/Dark）
- 相關既有 spec：`2026-05-13-parent-material3-redesign-design.md`（M3 體系原始設計，本 spec 為其視覺層演進）

---

## 1. 背景與目標

家長端已有 Material 3 底子（auto-gen color tokens、15 個自建 m3 元件、M3 字階、自架 Material Symbols），但視覺層疊了三代系統殘層：claymorphism 暖陰影 legacy 色階（sky/sun/coral/leaf/grape/cream）→ 2026-06-24「Bento 冷調石板灰」對 `--m3-*`/`--pt-*` 的二次覆寫 → M3 tokens。使用者確認的四大痛點：

1. 視覺風格雜亂不一致（根因＝三代疊層 cascade 互蓋）
2. 元件粗糙像預設樣式
3. 缺乏動效與回饋
4. 資訊架構與導航難用（3 tab＋「我的」藏抽屜、孩子相關功能埋三層）

目標：升級到 **M3 Expressive 語彙**（大圓角、tonal 色彩容器、彈性動效、加粗字階）＋**中量插畫系統**（hero／空狀態／成功頁），同時把 token 收斂為單一真源、IA 重整為 5 tab。品牌個性依 `PRODUCT.md`：親切、篤定、輕快；童趣不干擾資訊閱讀。

## 2. 範圍與非目標

**範圍**（純前端，`src/parent/` 為主）：

- Token 架構收斂（§4）、m3 元件 Expressive 化（§5）、插畫系統（§6）、IA 重整（§7）、動效系統（§8）
- 34 個 parent views 分四批對齊新語彙（§9）

**非目標（YAGNI，明確不做）**：

- 吉祥物、貼紙動效、背景紋理（重量級童趣，已裁定不採）
- per-tenant 插畫或 per-tenant 童彩（插畫與童彩 accent 為全租戶共用中性資產）
- 後端 API／schema 異動（零後端變更；IA 重整只動前端路由與 tab 結構）
- Admin／Portal／Public 三端（各自體系不動；本案不新增跨端共用樣式）
- PWA／offline 行為、LIFF 登入流程

## 3. 視覺語彙（方向 A 快照）

以 mockup 為視覺權威，關鍵決策：

| 面向 | 決策 |
|------|------|
| 基底 | 米白暖底（light 約 `#f7f6ef` 級），取代現行偏冷的 `#fbfdf8`；dark 維持 M3 near-black 綠灰 |
| 主色 | 品牌綠不變（gen-m3-tokens source color，per-tenant 可換） |
| 童彩 | sun／coral／sky／leaf／grape 五組 **tonal container 配對**（container＋on-container，light/dark 成對），用於 Bento tile、timeline dot、狀態 chip |
| 圓角 | hero 30px、卡片 26px、tile 26px、控制項 14px、頭像方塊 squircle 感（24px on 64px） |
| 字階 | 問候語／頁面大標 30px/900；卡片標題 15.5–16.5px/900；內文 14–15px 維持 |
| 陰影 | 單一柔和綠灰陰影對（card／float 兩階），移除 claymorphism inset highlight 與 Bento slate 覆寫 |
| Hero | 暖黃→綠→天藍斜向漸層＋有機 blob 裝飾，三態（full/awaiting/offday）維持同位同形（沿用現行 variant 機制） |

## 4. Token 架構收斂（治「雜亂」的根基）

**現況問題**：`globals.css`（604 行）內 legacy 色階、`--pt-*` alias、`--ivy-*`、Bento 對 `--m3-*` 的載入序覆寫並存；`m3-tokens.css` 的初始值實際被蓋掉。

**目標層級（import 順序＝cascade 順序）**：

1. `m3-tokens.css` — 唯一 M3 color role 真源（auto-gen 不動，仍由 `gen-m3-tokens.mjs` 產生；Expressive 調性靠 §3 的暖底與童彩，不改 generator 演算法——若暖底需要微調 neutral tone，優先以 `--pt-*` alias 層映射處理，不 fork generator）
2. `globals.css`（瘦身重寫）— 只剩三類內容：
   - `--pt-*` 語意 alias → 一律映射到 `--m3-*` 或本檔童彩配對（view 層繼續消費 `--pt-*`，34 頁不必一次全改）
   - 童彩五組 tonal 配對：`--pt-accent-{sun|coral|sky|leaf|grape}-container` ＋ `--pt-accent-{…}-on`，light 於 `:root`、dark 於 `:root[data-theme='dark']` 成對定義
   - 尺度 token：radius／elevation／spacing（`--pt-card-radius: 26px` 等新值）
3. `typography.css`、`icons.css`、`motion.css`（§8 擴充）、`patterns.css`（utility 隨元件改版同步瘦身）

**刪除**：Bento 冷調覆寫段（`globals.css:242-282` 一帶）、claymorphism 三階 elevation、legacy 原始色階（`--sky-*` 等數字階）——**先改 alias 指向、再分批刪 raw 定義**；每刪一批跑一次全域 grep 確認無殘餘消費者。

**守衛**：既有 8 條對比守衛測試（2026-08-13 parent-contrast 批）必須全綠並擴充涵蓋新童彩配對；token 檔內不允許出現無 dark 配對的 light-only 色（測試強制）。

## 5. 元件系統（治「粗糙」）

15 個 `src/parent/components/m3/` 元件全數 Expressive 化，**API（props/emits）不變、只動樣式與動效**，34 個 view 不需逐頁改 markup 即先受益：

- 共通：圓角放大、state layer（hover/pressed alpha 沿用 `--m3-state-*`）、按壓 spring scale
- `M3NavigationBar`：支援 5 destinations；active pill spring 滑移（§7、§8）
- `M3Button`／`M3FAB`：填色主鈕改 999px 膠囊、字重 700→900
- `M3TextField`／`M3Checkbox`／`M3Radio`／`M3Switch`：對齊新圓角與品牌綠 tint
- `M3Snackbar`／`M3TopAppBar`／`M3List*`／`M3Chip`／`M3SegmentedButton`／`M3Card`／`M3IconButton`／`M3Divider`：同語彙掃過

家長端專用共用元件同步升級：`StatTile`（→ 童彩 tonal tile，icon 置於半透明圓塊）、`SectionHeader`（字階 900）、`SkeletonBlock`（純灰塊 → shimmer 流光）、`ContactBookDayCard`（hero 漸層＋blob＋64px 心情方塊）、`StatusPill`、`TimelineItem`／`TodayTimeline`（童彩 dot 方塊）、`MessageBubble`、`ParentBottomSheet`（上緣 32px 圓角＋把手）。

## 6. 插畫系統（中量童趣）

- 形式：**inline SVG spot 插畫**，圓潤幾何風（mockup 內太陽／雲朵／星星／月亮為風格基準），統一元件 `ParentIllustration`（`name` prop）收斂管理
- 落點白名單（只出現在情感節點，不進資訊區）：首頁問候區、聯絡簿 hero、各頁空狀態（取代現行純文字）、操作成功回饋（請假送出、簽署完成、報名成功）、onboarding／綁定完成頁
- 資產約束：每張 SVG ≤ 2KB、總量首波 ≤ 10 張；**放 `src/parent/components/` 樹內會進 eager parent-app chunk**，須確認 `check-entry-chunks` 的 parent 首屏 gz 245KB 預算不破——若逼近，插畫元件改 lazy import
- 中性設計：不含品牌 logo／文字，全租戶共用；色彩取自童彩 token，dark 模式下自動配對

## 7. IA 與導航重整（治「難用」）

**3 tab＋抽屜 → 5 tab**：

| Tab | 內容 | 異動 |
|-----|------|------|
| 首頁 | 現行 TodayView（視覺升級，結構沿用：今日卡 → Bento → 今日動態 → 行事曆） | 樣式為主 |
| **孩子**（新） | 孩子 hub：聯絡簿、照片牆、成長報告、健康量測、孩子檔案聚合頁；多寶頂部切換 | 新 view＋新 tab route，聚合既有 lazy views |
| 訊息 | 現行 MessagesView | 不動 |
| 事務 | 現行 AdminListView 彙總；**孩子相關條目移除**（避免雙入口），其餘（請假、費用、簽署、接送、活動、行事曆…）保留 | 條目調整 |
| **我的**（新常駐） | 現行 MeView／MeDrawer 內容轉正：個人資料、子女綁定、通知偏好、外觀設定、個資五權 | MeDrawer 退場，top bar 頭像改導向此 tab |

- 路由：新增 `/child` hub route（`meta.tab='child'`）；孩子相關既有 routes 的 `meta.tab` 改掛 `child`；`/me` 系列改掛 `me` tab；深層頁返回行為不變
- Badge：沿用 `useHomeSummary` 單一來源；「孩子」tab badge＝未讀聯絡簿（summary 既有欄位有則用、無則不加，**不為此動後端**）
- 風險控制：`MeDrawer` 元件保留一個 release 週期再刪（feature 完成後由掃尾批清）

## 8. 動效系統（治「生硬」）

`motion.css` 定義動效 token，全部尊重 `prefers-reduced-motion`（既有全域降階慣例）：

- 曲線：`--motion-spring`（overshoot，如 cubic-bezier(0.34,1.56,0.64,1)）、`--motion-emphasized`（M3 emphasized-decelerate）
- 時長：`--motion-quick 160ms`／`--motion-base 260ms`／`--motion-page 350ms`
- 應用：router 頁面轉場（fade＋24px 上移）、卡片／tile 按壓 scale 0.96 spring、nav pill 滑移、skeleton shimmer、snackbar 進出
- 禁裝飾性動畫（`PRODUCT.md` 既有原則：動效僅用於回饋）

## 9. 分批上線計畫

全面改版不一發全上；四批各自走 staging 閘門 promotion，每批獨立可回滾：

| 批次 | 內容 | 效果 | 風險 |
|------|------|------|------|
| **P1 地基** | §4 token 收斂＋§5 元件 Expressive 化＋§8 motion token | 全 app 立即換質感，零結構變動 | 低（樣式層，守衛測試護航） |
| **P2 導航** | §7 五 tab＋孩子 hub＋我的轉正＋抽屜退場 | IA 痛點解決 | 中（路由與 tab 行為） |
| **P3 重點頁** | 首頁＋聯絡簿（列表/詳情）重排至 mockup 形；§6 插畫落位 | 核心體驗到位 | 中 |
| **P4 掃尾** | 其餘 views 逐頁對齊、legacy raw token 刪除、MeDrawer 移除、對比守衛全綠 | 一致性收口 | 低 |

## 10. 測試與驗證

- **Vitest**：對比守衛擴充（§4）；m3 元件行為測試維持綠（API 不變故既有測試應直接過，紅了視為回歸）；5-tab 導航與 badge 測試；`ParentIllustration` 渲染測試
- **Build gate**：每批必本地 `npm run build`＋`check-entry-chunks`（parent 首屏 gz 245KB 預算；vitest/vue-tsc 抓不到 chunk 回歸——既有教訓）；家長端 chunk 內禁 import Element Plus 共用元件的鐵律不變
- **typecheck**：`vue-tsc` CI blocking 照舊；新檔一律 `<script setup lang="ts">`
- **實機**：LINE WebView（iOS＋Android）真機驗證由使用者主導，每批 staging 後執行；重點驗 dark mode、動效流暢度、reduced-motion
- **e2e smoke**：P2 動到導航後跑 backend repo 副本的 critical-path smoke 確認登入／送假路徑不破

## 11. 多租戶與效能約束

- 品牌綠仍走 `gen-m3-tokens.mjs` per source color；童彩與插畫為中性共用資產，不寫死任一租戶品牌（灰度不變式 DEV-12 不受影響——本案不新增 tenant 相關注入點）
- `tenant-meta` 品牌管道不動；`parent.webmanifest` 的 `{{TB_THEME_PARENT}}` 注入機制不動（若暖底色值需同步 manifest theme color，走 per-tenant 設定，不硬編）
- 效能：動效只用 transform/opacity（不觸發 layout）；backdrop-filter 僅 nav bar 一處、Android WebView 卡頓即降級實色

## 12. 風險與緩解

| 風險 | 緩解 |
|------|------|
| Token 收斂改壞未盤到的消費者 | alias 指向先行、raw 刪除殿後＋每批全域 grep＋對比守衛 |
| 34 頁長尾改版拖久造成新舊混搭期 | P1 先讓全 app 換膚（元件層生效），混搭期只剩 layout 差異 |
| 插畫吃掉首屏預算 | 2KB/張上限＋check-entry-chunks gate＋必要時 lazy |
| 5 tab 在小螢幕擁擠 | label 11px＋icon 22px 已於 mockup 驗證 393px 寬可容納；最窄機型於 staging 實機驗 |
| MeDrawer 使用者慣性 | 頭像仍可點（導向我的 tab），一個週期後才刪元件 |
