# Flexible Street Platform

**🌐 语言 / Language:** **简体中文** · [English](README.md)

---

> 面向城市规划者的"灵活街道"决策辅助平台。在费城地图上为每条街道实时计算 0-100 的 **Flexibility Score Index (FSI)**，结合 POI 密度、AI 街景视觉评分、实时天气 / 交通 / 节日 / 活动等多源数据，并叠加紧急通道一票否决与簇群协调约束，回答"何时、何处可以临时把街道让渡给行人/活动/商业"。
>
> **代码仓库：** https://github.com/FANYANG0304/flexible-street-platform
> **试点城市：** 美国费城（Philadelphia, PA）
> **本文档目的：** 让任何拿到代码的人都能从零部署一份自己的实例，并理解项目的架构与设计思路。

---

## 目录

1. [项目简介](#1-项目简介)
2. [快速开始](#2-快速开始)
3. [配置环境变量](#3-配置环境变量)
4. [Supabase 后端](#4-supabase-后端)
5. [启动与健康检查](#5-启动开发服务器与健康检查)
6. [项目结构](#6-项目结构)
7. [构建与部署](#7-构建与部署)
8. [常见问题排查](#8-常见问题排查)
9. [后续开发常用模式](#9-后续开发常用模式)
10. [延伸阅读](#10-延伸阅读)
11. [部署后自检清单](#11-部署后自检清单)

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

---

## 2. 快速开始

> 5 分钟从零本地跑起来。

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

### 2.3 配环境变量（详见 §3）

复制一份模板，再把自己的 key 填进去：

```bash
cp .env.example .env
```

用任意编辑器打开 `.env`——每行格式是 `KEY=value`，不需要加引号。填好之后大概长这样：

```env
VITE_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci11c2VyIiwiYSI6...
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
VITE_GOOGLE_SV_KEY=AIzaSy...
VITE_TICKETMASTER_KEY=AbCd1234...
```

每个 key 去哪里申请——见 §3.1。

### 2.4 启动

```bash
npm run dev
```

打开 http://localhost:5173 看效果。

---

## 3. 配置环境变量

仓库本身不带任何 API key，所有 key 都放在本地 `.env` 文件里（git 忽略）。把 [`.env.example`](.env.example) 复制成 `.env` 后填入下面的 5 个值。

### 3.1 5 个变量

| 变量名 | 用途 | 申请地址 |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | 地图渲染与矢量瓦片 | https://account.mapbox.com/access-tokens/ |
| `VITE_SUPABASE_URL` | Supabase 后端 URL | Supabase 控制台 → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase 公共匿名密钥 | 同上 |
| `VITE_GOOGLE_SV_KEY` | 详情面板里的街景图 | https://console.cloud.google.com/ → 启用 "Street View Static API" |
| `VITE_TICKETMASTER_KEY` | 季节性活动数据（驱动 events 修正因子） | https://developer.ticketmaster.com/ |

5 个变量都需要。Mapbox、Google、Ticketmaster 的免费额度足够日常使用。

### 3.2 安全

所有 `VITE_*` 变量都会被打包进前端 JS，浏览器里可见。在服务商一侧用 HTTP referrer 限制（Mapbox / Google Cloud）或速率限制保护它们。永远不要把服务端密钥（例如 Supabase 的 `service_role` key）放到 `VITE_*` 变量里——只有 `anon` key 适合公开。

### 3.3 GitHub Secrets（部署到 GitHub Pages 时）

用 GitHub Actions 自动部署（[deploy.yml](.github/workflows/deploy.yml)）时，把同样的 5 个 key 配成仓库 secret：

```
Settings → Secrets and variables → Actions → New repository secret
```

当前 workflow 注入 4 个（`VITE_MAPBOX_TOKEN`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_GOOGLE_SV_KEY`）。要把 Ticketmaster 也带进去，在 build step 的 `env` 块里加一行 `VITE_TICKETMASTER_KEY: ${{ secrets.VITE_TICKETMASTER_KEY }}`。

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

### 4.2 部署自己的 Supabase 实例

需要一个 Supabase 项目存数据。项目结项时导出的费城快照已经包含表结构、全部 POI 数据、AI 分数、Playstreets、Open Streets 活动、4 个 RPC 函数和 RLS policies——直接还原大约 10 分钟搞定。

1. 在 https://supabase.com/dashboard 免费注册账号。
2. 创建新项目。Region 选 **East US 2** 或 **N. Virginia**。设一个数据库密码，记下来 import 要用。
3. 等项目初始化完成（约 2 分钟）。
4. 进新项目的 **SQL Editor**，先开 PostGIS。项目用到空间查询，这一步必须先做：
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
5. 下载快照：https://drive.google.com/file/d/1n17KISskPiTSJghWa26Kc7CqiWpn-LG5/view?usp=sharing （`flexible-street-backup.sql`）。
6. 把文件 import 进去。推荐用 `psql`：
   ```bash
   psql "postgresql://postgres:你的密码@db.你的项目.supabase.co:5432/postgres" \
        -f flexible-street-backup.sql
   ```
   连接串去 **Settings → Database → Connection string → URI（Direct connection，端口 5432）** 复制。不要用端口 6543 的 Pooler，`psql` 走不通。

   小文件也可以直接把 SQL 内容粘到 SQL Editor 里执行。
7. 在 **Project Settings → API** 把 `Project URL` 填到 `.env` 的 `VITE_SUPABASE_URL`，把 `anon` `public` key 填到 `VITE_SUPABASE_ANON_KEY`。

#### 部署到其他城市

费城的 POI、AI 分数、Playstreets 数据不适用其他城市，需要替换：

- `poi` 表 → 你的城市的 OSM POI 抽取
- `street_ai_scores` 表 → 用你城市的 Street View 重新跑 LLaVA 流程
- [src/data/mockData.ts](src/data/mockData.ts) 里的试点 bbox 与节日日历
- [MapComponent.tsx](src/components/MapComponent.tsx) 里硬编码的 Mapbox 矢量瓦片 URL `mapbox://yangf0304.az4ve7hc`

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
| 详情面板缺街景图 | Google SV key 缺失或错误 | 检查 `VITE_GOOGLE_SV_KEY` |
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
├── .env.example                     # 环境变量模板（仓库内）
├── .env                             # 真实环境变量（git 忽略，本地手建）
├── .gitignore
├── index.html                       # Vite 入口 HTML
├── package.json
├── tsconfig*.json
├── tailwind.config.js
├── vite.config.ts
├── DEPLOYMENT.md                    # 多平台部署细节（Vercel/Netlify/Docker）
├── README.md                        # 英文版（GitHub 仓库主页默认渲染）
└── README.zh.md                     # 中文版（本文档）
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

通常是网络问题——可以重试，换一个 npm registry 镜像，或检查代理设置。清掉重装常常能解决：
```bash
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

GitHub Pages 的 CDN 在不同地区表现差别较大。如果对延迟敏感，可以迁到 Vercel 或 Netlify，全球 CDN 更稳。

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

## 10. 延伸阅读

| 资源 | 说明 |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | 多平台部署细节（Vercel/Netlify/Docker） |
| [Mapbox GL JS 文档](https://docs.mapbox.com/mapbox-gl-js/api/) | 地图引擎 API |
| [Supabase 文档](https://supabase.com/docs) | 后端 |
| [Vite 文档](https://vitejs.dev/) | 构建工具 |

---

## 11. 部署后自检清单

跟着前面的章节走完后，按以下清单确认所有部署步骤都到位：

**API key 准备**
- [ ] Mapbox token 已在 https://account.mapbox.com 申请
- [ ] Google Street View Static API 已启用并拿到 key
- [ ] Ticketmaster developer 账号已注册并拿到 key

**Supabase 后端**
- [ ] 自己的 Supabase 项目已创建
- [ ] `CREATE EXTENSION postgis` 已执行
- [ ] `flexible-street-backup.sql` 已 import，无报错
- [ ] Project URL 与 anon key 已复制出来

**本地配置**
- [ ] `.env` 文件已建好，5 个变量都已填入
- [ ] `npm install` 成功
- [ ] `npm run dev` 能正常启动 dev server

**功能验证**
- [ ] 浏览器打开 http://localhost:5173 能看到首页
- [ ] 进入 `/map` 后费城地图正常加载
- [ ] 打开侧栏 "Flexibility Score" 后街道开始上色
- [ ] 点击街道能弹出详情面板
- [ ] 详情面板能看到 commercial / community 子分数
- [ ] 部分街道能看到紧急通道 veto（粉红色）
- [ ] 部分街道能看到簇群光晕（青色）

**生产构建**
- [ ] `npm run build` 成功，`dist/` 目录正常生成

**GitHub Pages 自动部署（用到才配）**
- [ ] GitHub repo Settings → Pages 已启用 "GitHub Actions" 作为 source
- [ ] Settings → Secrets 里所需的 key 都已配好

**理解项目**
- [ ] 已读 [src/lib/fsiScores.ts](src/lib/fsiScores.ts) 头部注释理解 FSI 算法

---

## License

MIT License
