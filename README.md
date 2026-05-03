# Flexible Street Platform

> 面向城市规划者的"灵活街道"决策辅助平台。在费城地图上为每条街道实时计算 0-100 的 **Flexibility Score Index (FSI)**，结合 POI 密度、AI 街景视觉评分、实时天气 / 交通 / 节日 / 活动等多源数据，并叠加紧急通道一票否决与簇群协调约束，回答"何时、何处可以临时把街道让渡给行人/活动/商业"。
>
> **代码仓库：** https://github.com/FANYANG0304/flexible-street-platform
> **试点城市：** 美国费城（Philadelphia, PA）
> **当前状态：** 项目结项，已交付完整 MVP

---

## 目录

1. [项目简介](#1-项目简介)
2. [快速开始](#2-快速开始) — 给新接手的人
3. [配置环境变量](#3-配置环境变量)
4. [Supabase 后端](#4-supabase-后端)
5. [启动与健康检查](#5-启动开发服务器与健康检查)
6. [项目结构](#6-项目结构)
7. [构建与部署](#7-构建与部署)
8. [常见问题排查](#8-常见问题排查)
9. [后续开发常用模式](#9-后续开发常用模式)
10. [项目报告与延伸阅读](#10-项目报告与延伸阅读)
11. [交接确认 Checklist](#11-交接确认-checklist)

---

## 1. 项目简介

### 1.1 是什么

平台核心是一套 **FSI (Flexibility Score Index)** 算法：基于沿街 POI 密度，按"垂直走廊衰减模型"算出每条街的商业活力 (commercial) 和社区机构密度 (community) 两个评分维度，sigmoid 归一化到 0-100。在此基础上叠加 4 类乘性修正（实时交通、天气、季节性活动、节日加成）和 1 类 AI 加权（LLaVA 街景视觉感知）。

之外还有 3 个**独立约束层**（不污染分数、单独呈现）：
- **所有权与可关闭性** — 14 类 agency 分级（CITY 直接可关 / SEPTA 等需协调 / STATE 不可关）
- **紧急通道一票否决** — 医院 150m / 消防站 90m / 警察局 70m 缓冲区内禁止关闭
- **簇群协调检测** — union-find 算法找出 ≥3 条相连且都可关闭的高分街，提示决策者"集团动作要协调"

### 1.2 技术栈

| 层 | 选型 |
|---|---|
| 前端框架 | React 18 + TypeScript 5.6 + Vite 5.4 |
| 地图引擎 | Mapbox GL JS 3.7（自定义矢量瓦片） |
| 后端 | Supabase（PostgreSQL + RPC 函数） |
| 样式 | Tailwind CSS 3.3 |
| 图标 | Lucide React |
| AI 模块 | LLaVA 7B（离线预跑，结果存 Supabase） |
| 部署 | GitHub Actions → GitHub Pages（也支持 Vercel/Netlify） |

**运行形态：** 纯静态站点。所有评分在浏览器端实时计算，后端只通过 4 个 RPC 函数提供数据。**无独立服务端进程。**

### 1.3 项目当前完成度

| 功能 | 状态 |
|---|---|
| 多维 FSI 评分（commercial + community） | ✅ |
| Mobility 信息标签（不参与综合分） | ✅ |
| 实时调节因子（traffic / weather / events / holiday） | ✅ |
| LLaVA AI 街景视觉感知 | ✅ |
| 所有权 / 可关闭性分级 | ✅ |
| 紧急通道一票否决 | ✅ |
| 簇群协调检测 | ✅ |
| 试点区域可视化（Center City / West Philadelphia） | ✅ |
| Playstreets 验证集校准 | ✅ |
| 详情面板与因子解释 | ✅ |
| 用户反馈机制 | 🔮 未来工作 |
| 路网拓扑 / 绕行成本分析 | 🔮 未来工作 |
| 单行道识别 | 🔮 未来工作 |

详细的设计反思和未来规划，见 [reports/final-report.pdf](reports/final-report.pdf)。

---

## 2. 快速开始

> 本节面向**新接手项目的开发者**，从零开始 5 分钟跑起来。

### 2.1 前置工具

| 工具 | 最低版本 | 验证 |
|---|---|---|
| Git | 2.30+ | `git --version` |
| Node.js | **18.x 或更高** | `node --version` |
| npm | 9+ | `npm --version` |

> Node 18 是必需的——React 18 / Vite 5 / Mapbox GL 3 都依赖它，GitHub Actions 上跑的也是 Node 18。

### 2.2 克隆 + 装依赖

```bash
git clone https://github.com/FANYANG0304/flexible-street-platform.git
cd flexible-street-platform
npm install
```

国内网络慢可先切镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

### 2.3 配环境变量（关键步骤，详见 §3）

```bash
cp .env.example .env
# 然后用编辑器打开 .env，填入真实的 5 个 key
```

### 2.4 启动

```bash
npm run dev
```

打开 http://localhost:5173 看效果。

---

## 3. 配置环境变量

### 3.1 为什么 clone 下来运行不起来？

**关键原因：** 仓库里**没有任何 API key**。所有敏感信息（Mapbox token、Supabase 密钥、Google API key 等）都通过 `.env` 文件管理，而 `.env` 被 [`.gitignore`](.gitignore) 显式排除。

这是**故意的、也是必须的**——把 API key 提交到公开仓库等于把家门钥匙挂在街上，会被扫描盗用，付费 API 还会刷你账单。

仓库里你能看到的相关文件只有：
- [`.env.example`](.env.example) — **模板文件**，列出需要哪些 key，但所有值都是占位符
- [`.gitignore`](.gitignore) — 配置 `.env` 不被提交

### 3.2 5 个环境变量详解

| 变量名 | 必需？ | 用途 | 申请地址 | 大致费用 |
|---|---|---|---|---|
| `VITE_MAPBOX_TOKEN` | ✅ 必需 | Mapbox 地图渲染、矢量瓦片访问 | https://account.mapbox.com/access-tokens/ | 免费层 50,000 次/月 |
| `VITE_SUPABASE_URL` | ✅ 必需 | Supabase 后端 URL | https://supabase.com/dashboard → Project Settings → API | 免费 |
| `VITE_SUPABASE_ANON_KEY` | ✅ 必需 | Supabase 公共匿名访问密钥 | 同上 | 免费 |
| `VITE_GOOGLE_SV_KEY` | ⚠ 可选 | Google Street View 街景图 | https://console.cloud.google.com/ → 启用 "Street View Static API" | 28,000 次/月免费 |
| `VITE_TICKETMASTER_KEY` | ⚠ 可选 | 季节性活动数据（评分加成） | https://developer.ticketmaster.com/ | 5,000 次/天免费 |

**可选变量缺失会怎样？**
- 没 `VITE_GOOGLE_SV_KEY` → 详情面板的街景图区域消失，其它正常
- 没 `VITE_TICKETMASTER_KEY` → events 修正因子永远 = 1.0（不加成），其它正常

### 3.3 安全提醒（重要）

⚠ **所有 `VITE_*` 前缀的变量都会被打包进前端 JS，最终在浏览器中可见。** 这是 Vite 的设计——凡是要在浏览器里用的变量，都必须带 `VITE_` 前缀。

这意味着这些 key 本质上是**公开的**。保护方式靠的不是隐藏，而是**在 API 服务商一侧加访问限制**：

- **Mapbox**：在 token 设置页加 URL referrer 限制，只允许你的域名访问
- **Google Cloud**：在 API key 设置页加 HTTP referrer 限制
- **Ticketmaster**：免费层有限速，问题不大
- **Supabase Anon Key**：靠 Supabase 的 Row Level Security (RLS)；anon key 本身就是设计成可公开的

**永远不要**把私钥（如 Supabase service_role key、Anthropic API key 等服务端密钥）放到 `VITE_*` 变量里。

### 3.4 GitHub Secrets（部署 GitHub Pages 时用）

如果用 GitHub Actions 自动部署到 Pages（[deploy.yml](.github/workflows/deploy.yml)），需要在仓库后台配 4 个 secret：

```
GitHub repo → Settings → Secrets and variables → Actions → New repository secret
```

需要建：`VITE_MAPBOX_TOKEN`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_GOOGLE_SV_KEY`

> 当前 workflow 没配 `VITE_TICKETMASTER_KEY`。要在线上启用活动加成，需在 deploy.yml 加一行 `VITE_TICKETMASTER_KEY: ${{ secrets.VITE_TICKETMASTER_KEY }}` 并在 Secrets 里建对应条目。

---

## 4. Supabase 后端

平台所有持久化数据（POI、街道 AI 分数、Playstreets、Open Streets 活动）都在 Supabase。前端**只通过 4 个 RPC 函数**访问后端，没有任何直接的 `.from(table)` 表操作——所有数据访问都已封装为存储过程。

### 4.1 RPC 函数清单

| RPC 名 | 参数 | 用途 | 调用位置 |
|---|---|---|---|
| `get_anchors_in_bounds` | `min/max_lat/lng, scenario_ids[]` | 取边界内的 POI 锚点（按场景过滤） | [MapComponent.tsx:299](src/components/MapComponent.tsx) |
| `get_poi_in_bounds` | `min/max_lat/lng` | 取边界内所有 POI（FSI 评分核心数据） | [MapPage.tsx:194](src/pages/MapPage.tsx)、[MapComponent.tsx:315](src/components/MapComponent.tsx) |
| `get_playstreets_lines_in_bounds` | `min/max_lat/lng` | 取边界内 Playstreets 线（验证集） | [MapPage.tsx:207](src/pages/MapPage.tsx)、[MapComponent.tsx:330](src/components/MapComponent.tsx) |
| `get_street_events_in_bounds` | `min/max_lat/lng` | 取边界内的 Open Streets 活动 | [MapPage.tsx:210](src/pages/MapPage.tsx)、[MapComponent.tsx:346](src/components/MapComponent.tsx) |

另有一个表是分页加载的：
- `street_ai_scores` — LLaVA 离线分析结果，初始化一次性加载（每批 1000 行）。详见 [streetScores.ts](src/lib/streetScores.ts)

### 4.2 接管 Supabase 项目的两种方式

**方式 A：沿用现有 Supabase 项目（推荐）**

让前任开发者把你加到 Supabase 项目：
```
Supabase Dashboard → 项目 → Settings → Team → Add member
```
加入后能直接拿到 URL 和 anon key，填进 `.env` 就能跑。所有 RPC、表、数据已就位。

**方式 B：自己起新 Supabase 项目（仅当原项目无法转移时）**

工作量很大，预计 1-2 周。需要：
1. 重建数据库表：`poi`、`street_ai_scores`、`playstreets`、`street_events` 等
2. 实现 4 个 RPC 函数（PL/pgSQL，本质是带空间过滤的 SELECT）
3. 数据导入：POI 从 OpenStreetMap、AI 分数需重新跑 LLaVA 流程

> 强烈建议方式 A。如果必须方式 B，请联系前任开发者拿 schema 导出文件。

---

## 5. 启动开发服务器与健康检查

```bash
npm run dev
```

正常输出：

```
  VITE v5.4.21  ready in 800 ms
  ➜  Local:   http://localhost:5173/
```

打开 http://localhost:5173/ 应看到：
1. 首页（Landing page）
2. 进入 `/map` 后费城地图加载
3. 打开侧边栏的 "Flexibility Score" 开关后，街道开始上色

### 5.1 健康检查清单

| 现象 | 含义 | 排查 |
|---|---|---|
| 地图完全空白 | Mapbox token 错误或缺失 | 检查 `.env` 里 `VITE_MAPBOX_TOKEN`，重启 `npm run dev` |
| 地图有底图但 POI 不出现 | Supabase URL/key 错误，或 RPC 函数未部署 | F12 看 Network → 找 supabase.co 的请求是 401 还是 404 |
| Flexibility Score 全是灰色 | POI 加载完了但 AI/POI 还没开始算 | 等 1-2 秒，或拉到 zoom ≥14 |
| 详情面板缺街景图 | Google SV key 缺失或错误 | 检查 `VITE_GOOGLE_SV_KEY`（可选） |
| 控制台报 `Missing Supabase env vars` | `.env` 没生效 | 确认文件名是 `.env` 不是 `env.txt`，重启 dev server |

---

## 6. 项目结构

```
flexible-street-platform/
├── .github/workflows/deploy.yml    # GitHub Actions 自动部署到 Pages
├── public/                          # 静态资源（不经构建直接拷贝到 dist）
├── src/                             # 所有源码
│   ├── components/                  # React 组件
│   ├── pages/                       # 页面级组件（路由入口）
│   ├── lib/                         # 业务逻辑、算法、API 封装
│   ├── data/                        # 静态配置数据
│   ├── types/                       # 共享 TS 类型
│   ├── App.tsx                      # 根组件 + 路由
│   ├── main.tsx                     # React 入口
│   └── index.css                    # Tailwind 引入 + 全局样式
├── reports/                         # 项目结项报告（PDF/HTML）
├── .env.example                     # 环境变量模板（仓库内）
├── .env                             # 真实环境变量（git 忽略，本地手建）
├── .gitignore
├── index.html                       # Vite 入口 HTML
├── package.json
├── tsconfig*.json
├── tailwind.config.js
├── vite.config.ts
├── DEPLOYMENT.md                    # 多平台部署细节（Vercel/Netlify/Docker）
└── README.md                        # 本文档
```

### 6.1 `src/components/` — UI 组件

| 文件 | 作用 |
|---|---|
| `MapComponent.tsx` | **核心组件**。Mapbox 地图初始化、所有图层管理（街道分数、POI、活动、簇群、紧急 veto）、RPC 数据加载、点击/悬浮交互。约 1300 行，最复杂 |
| `Sidebar.tsx` | 左侧栏：时段选择、场景过滤、各类图层 toggle |
| `MapLegend.tsx` | 右下图例：分数色阶、所有权颜色、紧急约束等 |
| `StreetScorePanel.tsx` | 点击街道弹出的详情面板：分数、子分数、AI 视觉、修正因子、紧急 veto 横幅、簇群徽章。可拖拽 |
| `StreetEventPanel.tsx` | Open Streets 事件详情面板（含街景图） |
| `AnchorDetailPanel.tsx` | POI 锚点详情面板 |

### 6.2 `src/pages/` — 路由页面

| 文件 | 作用 |
|---|---|
| `LandingPage.tsx` | 首页 `/` |
| `MapPage.tsx` | 主地图页 `/map`。负责调用 Supabase 加载 POI、AI 分数、Playstreets、活动；天气/节日数据获取；把 props 传给 MapComponent |
| `Dashboard.tsx` | 数据看板 `/dashboard` |

### 6.3 `src/lib/` — 业务逻辑（纯函数为主）

| 文件 | 作用 |
|---|---|
| **`fsiScores.ts`** | **算法核心**。POI 走廊距离衰减、sigmoid 饱和评分、综合分计算、所有权分级、交通修正、紧急通道 veto、簇群检测（union-find）。约 700 行 |
| `fsiCalibrate.ts` | 用 Playstreets 验证集反向拟合饱和参数的工具，浏览器控制台可调用 |
| `streetScores.ts` | LLaVA AI 分数从 Supabase 分页加载并构建查找索引 |
| `events.ts` | Ticketmaster API + 费城本地节日日历 + 计算事件邻近修正 |
| `weather.ts` | Open-Meteo API 拉取实时/预报天气，映射到 0.2-1.0 修正系数 |
| `supabase.ts` | Supabase 客户端单例（检查 env、初始化） |

### 6.4 `src/data/` 与 `src/types/`

- `data/mockData.ts` — 场景定义（school dismissal、weekend market 等 6 个）、试点区域 bbox、时段 bin
- `types/index.ts` — 跨文件共享 interface（Anchor、Scenario、StreetScore 等）

### 6.5 关键数据流图

```
用户打开 /map
  ↓
MapPage 加载初始数据：
  ├─ Supabase RPC: get_poi_in_bounds (整个费城)
  ├─ Supabase 分页: street_ai_scores
  ├─ Supabase RPC: get_playstreets_lines_in_bounds
  ├─ Supabase RPC: get_street_events_in_bounds
  ├─ Open-Meteo API: 当下天气
  └─ Ticketmaster API: 季节性活动
  ↓
传 props 给 MapComponent
  ↓
Mapbox 渲染：街道矢量瓦片 + POI 圆点 + 事件层
  ↓
用户开启 "Flexibility Score" 开关
  ↓
MapComponent.applyScores() 触发：
  对视口内每条街道：
    ├─ computePoiFSI(coords, pois) → commercial / community / mobility 子分
    ├─ getEmergencyVeto(coords, pois) → 紧急通道判断
    ├─ getTrafficModifier / getEventModifier / weather / holiday → 修正因子
    └─ computeCompositeTotal(...) → 最终 0-100 综合分
  写入 Mapbox feature-state 触发图层重绘
  ↓
applyClusters() 后处理：
  对所有 ≥75 分 + 可关闭 + 未否决的街道：
    findClusters(...) → 共享路口的并查集
    ≥3 条相连 → 写入 clusterSize feature-state
  触发青色簇群光晕图层
```

---

## 7. 构建与部署

### 7.1 本地构建

```bash
npm run build
```

执行 `tsc -b && vite build`，先做 TypeScript 类型检查，再用 Vite 打包到 `dist/`。

构建产物 ~2.2MB JS（gzip 后 ~620KB），单文件 bundle。可直接静态托管，**不需要 Node 服务**。

### 7.2 自动部署（推荐）

仓库已配 GitHub Actions ([deploy.yml](.github/workflows/deploy.yml))：

```
push 到 main 分支
  ↓
GitHub Actions 触发
  ↓
checkout → 装 Node 18 → npm install
  ↓
npm run build （注入 4 个 secret 作为环境变量）
  ↓
上传 dist/ 到 GitHub Pages 制品 → deploy
```

**前提：** 仓库 Settings → Pages 已启用 GitHub Pages（source 选 GitHub Actions），并配好 §3.4 的 4 个 secret。

### 7.3 其它部署平台

[DEPLOYMENT.md](DEPLOYMENT.md) 涵盖 Vercel / Netlify / Docker / 自托管 Nginx。

唯一要注意：**所有平台都要在控制台单独配 5 个 `VITE_*` 环境变量**，不能依赖 `.env` 文件（构建时才读）。

---

## 8. 常见问题排查

### 8.1 `npm install` 卡住

通常是网络问题：
```bash
npm config set registry https://registry.npmmirror.com
rm -rf node_modules package-lock.json
npm install
```

### 8.2 TypeScript 报 `Cannot find module ...`

VS Code 右下角语言指示器 → "Use Workspace Version"，让 IDE 用项目自带的 TS。

### 8.3 地图加载几秒后页面崩溃

多半是 Mapbox token 过期或被吊销。去 https://account.mapbox.com/access-tokens/ 检查。

### 8.4 街道分数图层始终是灰的

按顺序排查：
1. 控制台是否有 `Missing Supabase env vars` 警告？→ 检查 `.env`
2. Network 面板里 supabase.co 的 RPC 请求返回什么？401 = key 错；404 = RPC 函数不存在；500 = SQL 报错
3. 拉到 zoom ≥ 14（街道图层在低 zoom 不显示）

### 8.5 GitHub Actions 部署失败

最常见是缺 secret。日志里会看到 `VITE_MAPBOX_TOKEN is not defined`。补全后 re-run workflow。

### 8.6 部署后线上加载慢

GitHub Pages 在国内不稳定。考虑迁移到 Vercel（全球 CDN，对国内更友好）。

---

## 9. 后续开发常用模式

### 9.1 加一个新的实时调节因子

例如要加"空气质量"修正：

1. 在 [src/lib/](src/lib/) 新建 `airquality.ts`，写 `fetchAirQuality()` 和 `getAirQualityModifier()`
2. 在 [MapPage.tsx](src/pages/MapPage.tsx) 加载后传给 MapComponent
3. 在 [fsiScores.ts](src/lib/fsiScores.ts) 的 `computeCompositeTotal()` 函数签名加 `airMod` 参数
4. 在 [MapComponent.tsx](src/components/MapComponent.tsx) `applyScores()` 调用处传入
5. 在 [StreetScorePanel.tsx](src/components/StreetScorePanel.tsx) 的因子列表加一项

### 9.2 加一个新的地图叠加层

参考现有 `street-veto-blocked` 或 `street-cluster-outline` 层：
1. 在 MapComponent 的图层初始化区添加 `map.current.addLayer({...})`
2. 在 visibility toggle 区把新 id 加入 layer ID 数组
3. 在 closeable-only 过滤区也加 setFilter 调用
4. 如需用 feature-state 驱动样式，定义对应的 `['feature-state', 'xxx']` 表达式常量

### 9.3 修改评分参数

直接编辑 [src/lib/fsiScores.ts](src/lib/fsiScores.ts) 顶部的常量：
- `CORRIDOR_WIDTH_M` — 各维度走廊宽度
- `DECAY_PERP_M` — 距离衰减系数
- `SATURATION` — sigmoid 饱和参数
- `PROMINENCE_BONUS` — 邻域突出度奖励上限

修改后建议在浏览器控制台跑 `logCalibration()` 验证 Playstreets 正例是否仍能落在 ≥75 分区间。

### 9.4 修改 Supabase RPC

不要改 RPC 函数签名——前端代码硬编码了参数名。如要改：
1. 先在 Supabase SQL Editor 重写 RPC
2. 同步更新 [MapComponent.tsx](src/components/MapComponent.tsx)、[MapPage.tsx](src/pages/MapPage.tsx) 对应的 `supabase.rpc(...)` 调用

---

## 10. 项目报告与延伸阅读

| 资源 | 说明 |
|---|---|
| [reports/final-report.pdf](reports/final-report.pdf) | **项目结项详细报告（中文）**——背景、目的、方法、结论、未来工作。新接手者必读 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 多平台部署细节（Vercel/Netlify/Docker） |
| [Mapbox GL JS 文档](https://docs.mapbox.com/mapbox-gl-js/api/) | 地图引擎 API |
| [Supabase 文档](https://supabase.com/docs) | 后端 |
| [Vite 文档](https://vitejs.dev/) | 构建工具 |

---

## 11. 交接确认 Checklist

新接手者按以下清单确认所有交接事项已到位：

- [ ] 已被加入 GitHub 仓库（拥有 push 权限）
- [ ] 已被加入 Supabase 项目（能看到 dashboard 和 keys）
- [ ] 已拿到 Mapbox account 访问（或申请新 token）
- [ ] 已拿到 Google Cloud project 访问（或申请新 SV key）
- [ ] 已拿到 Ticketmaster developer 账号（或申请新 key）
- [ ] 本地 `npm run dev` 能正常启动
- [ ] 能在 localhost:5173 看到地图加载
- [ ] 能看到街道分数色块、点击街道弹出详情面板
- [ ] 能看到紧急通道 veto（粉红色）
- [ ] 能看到簇群光晕（青色）
- [ ] `npm run build` 成功，dist/ 目录正常生成
- [ ] 已读完 [reports/final-report.pdf](reports/final-report.pdf) 了解项目背景与设计决策
- [ ] 已读完 [src/lib/fsiScores.ts](src/lib/fsiScores.ts) 头部注释了解算法
- [ ] GitHub repo Settings → Secrets 里 4 个 secret 都已配好（如果继续用 GitHub Pages）

完成以上所有项后，你就完整掌握这个项目了。祝顺利！

---

## License

MIT License
