# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"虎窝导航"（小鹏导航）— 个人网址导航站点，部署在 Cloudflare Pages，支持分类管理、搜索、密码保护的编辑模式、收藏夹导入等功能。

## Commands

```bash
npm install          # 安装依赖
npm run dev          # 启动 Vite 开发服务器 (http://localhost:5173)
npm run build        # 生产构建到 dist/
npm run lint         # ESLint 代码检查
npm run preview      # 本地预览生产构建
npm run deploy       # 通过 Wrangler 部署 dist/ 到 Cloudflare Pages
```

## Tech Stack

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React | 19.2 |
| 构建工具 | Vite | 7.3 |
| CSS 方案 | Tailwind CSS | 4.1 |
| 代码检查 | ESLint | 9.39 (flat config) |
| 后端 | Cloudflare Pages Functions | — |
| 存储 | Cloudflare KV | — |
| 部署 | Wrangler | — |

## Project Structure

```
├── index.html                  # HTML 入口，标题 "小鹏导航"，favicon.ico
├── vite.config.js              # Vite 配置，main + worker 双入口构建
├── wrangler.toml               # Cloudflare 配置，KV 绑定 NAV_SITES
├── tailwind.config.js          # Tailwind 内容扫描配置
├── postcss.config.js           # PostCSS: @tailwindcss/postcss + autoprefixer
├── eslint.config.js            # ESLint flat config，React hooks + refresh 插件
├── functions/                  # Cloudflare Pages Functions（生产后端）
│   └── api/
│       ├── sites.js            # 站点 CRUD API (GET/POST/PUT/DELETE)
│       ├── import.js           # 收藏夹导入 API (POST)
│       └── settings.js         # 应用设置 API (GET/PUT)，浏览器标题/首页标题
├── src/
│   ├── main.jsx                # React 入口，StrictMode + createRoot
│   ├── App.jsx                 # 主组件，所有状态和业务逻辑
│   ├── App.css                 # 全局 CSS reset
│   ├── index.css               # Tailwind 指令 (@tailwind base/components/utilities)
│   ├── storage.js              # API 优先 + localStorage 兜底的存储模块
│   ├── worker.js               # 备用 Cloudflare Worker 实现（service-worker 格式）
│   └── components/
│       ├── AddSiteForm.jsx     # 添加站点模态表单（名称/URL/分类下拉）
│       ├── EditSiteForm.jsx    # 编辑站点模态表单（名称/URL/分类下拉）
│       ├── EditTitleForm.jsx   # 编辑标题模态表单（浏览器标题/首页标题）
│       ├── ImportBookmarks.jsx # 导入收藏夹模态表单（文件上传）
│       └── SiteCard.jsx        # 站点卡片组件（目前未被使用）
└── public/
    └── vite.svg                # Vite 默认图标（未使用，实际使用 favicon.ico）
```

## Architecture

### 组件树与数据流

```
main.jsx → App.jsx (所有状态 + 所有业务逻辑)
  ├── 顶部导航栏（标题、编辑/退出编辑按钮、搜索栏）
  ├── 编辑模式工具栏（添加站点、导入收藏夹、添加分类、编辑标题、全选、批量删除）
  ├── 分类导航标签栏（动态渲染分类按钮）
  ├── 站点网格（inline 渲染，未使用 SiteCard 组件）
  ├── AddSiteForm（模态弹窗，由 showAddForm 控制）
  ├── ImportBookmarks（模态弹窗，由 showImportForm 控制）
  ├── EditSiteForm（模态弹窗，由 showEditForm 控制）
  ├── EditTitleForm（模态弹窗，由 showEditTitleForm 控制）
  ├── 密码表单（模态弹窗，由 showPasswordForm 控制）
  └── 添加分类表单（模态弹窗，由 showAddCategoryForm 控制）
```

App.jsx 是唯一的状态持有者，所有子组件通过 props 接收回调和数据，没有使用状态管理库或 Context。

所有数据操作通过 `src/storage.js` 模块进行：优先调用 API（生产环境 → KV），API 不可用时自动降级到 localStorage（本地开发），同时将 API 返回的数据缓存到 localStorage。

### 状态清单（App.jsx）

| 状态 | 类型 | 用途 |
|---|---|---|
| `sites` | `[]` | 所有站点数据，初始 `[]`，useEffect 中异步加载 |
| `wallpaper` | `string|null` | 壁纸 URL，null 时显示渐变背景 |
| `selectedSites` | `[]` | 编辑模式下选中的站点 ID 列表 |
| `categories` | `[]` (useMemo) | 从 sites 派生，无需 setState |
| `activeCategory` | `null\|string` | 当前选中的分类标签（null = 默认首个分类，'' = 显示全部） |
| `effectiveCategory` | `string` (派生) | 实际生效的分类：`activeCategory !== null ? activeCategory : categories[0]` |
| `editMode` | `boolean` | 是否处于编辑模式 |
| `showAddForm` / `showImportForm` / `showPasswordForm` / `showAddCategoryForm` / `showEditForm` | `boolean` | 各模态弹窗显隐 |
| `password` / `passwordError` | `string` | 密码输入和错误提示 |
| `newCategory` | `string` | 新分类名称输入值 |
| `editingSite` | `object|null` | 当前正在编辑的站点对象 |
| `searchTerm` | `string` | 搜索关键词 |
| `browserTitle` | `string` | 浏览器标签页标题，初始 `"小鹏导航"`，useEffect 同步到 `document.title` |
| `headerTitle` | `string` | 首页顶部标题，初始 `"我的个人网址导航"` |
| `showEditTitleForm` | `boolean` | 编辑标题模态弹窗显隐 |

### 后端：两份实现

1. **`functions/api/`**（Cloudflare Pages Functions，生产环境使用）：
   - `sites.js` 导出 `onRequest(context)`，处理 GET/POST/PUT/DELETE
   - `import.js` 导出 `onRequest(context)`，处理 POST，用正则解析书签 HTML
   - `settings.js` 导出 `onRequest(context)`，处理 GET/PUT，读写 KV 中 `app_settings` 键
   - 通过文件路径路由：`/api/sites` → `functions/api/sites.js`，`/api/import` → `functions/api/import.js`，`/api/settings` → `functions/api/settings.js`

2. **`src/worker.js`**（Cloudflare Worker，service-worker 格式）：
   - 单文件内通过 `fetch` 事件 + 手动路径匹配实现路由
   - 使用 `DOMParser` 解析书签 HTML（与 functions 版本的正则方式不同）
   - `wrangler.toml` 中 `main = "src/worker.js"`，但当前部署优先使用 Pages Functions

### API 路由详情

**`GET /api/sites`**
返回 KV 中 `all_sites` 键的完整 JSON 数组，若无数据返回 `[]`。

**`POST /api/sites`**
两种情况：
- 添加站点：body 含 `{ name, url, category? }`，自动生成 `id` 和 `createdAt`，追加到数组
- 添加分类：body 含 `{ category }` 但不含 `name`/`url`，创建占位站点 `{ isPlaceholder: true, name: "分类占位: xxx", url: "#" }` 以持久化分类

**`PUT /api/sites`**
body 含完整的更新后站点对象 `{ id, name, url, category }`，通过 id 查找并替换，返回完整站点数组。

**`DELETE /api/sites`**
body 含 `{ ids: [...] }`，按 id 列表批量删除。

**`POST /api/import`**
FormData 上传 `file` 字段（浏览器导出的 HTML 收藏夹文件），正则解析 `<a href>` 和 `<h3>` 标签，保留文件夹结构作为分类，与已有数据合并。

**`GET /api/settings`**
返回 KV 中 `app_settings` 键的 JSON 对象，若无数据返回默认值 `{ browserTitle: "小鹏导航", headerTitle: "我的个人网址导航" }`。

**`PUT /api/settings`**
body 含 `{ browserTitle, headerTitle }`，写入 KV `app_settings` 键并返回保存后的对象。

### 数据模型

所有站点以单个 JSON 数组存储在 KV 命名空间 `NAV_SITES` 的 `all_sites` 键下：

```json
{
  "id": "1712345678901",          // 基于时间戳的字符串 ID
  "name": "Google",               // 站点名称
  "url": "https://google.com",    // 站点 URL
  "category": "搜索",              // 分类名（可为空）
  "createdAt": "2024-01-01T...",  // ISO 时间戳
  "isPlaceholder": false          // 可选，分类占位站点为 true
}
```

分类并非独立存储，而是从前端 `sites` 数组中提取所有唯一的 `category` 值。创建分类时通过插入 `isPlaceholder: true` 的占位站点来持久化该分类。

应用设置以 JSON 对象存储在 KV 的 `app_settings` 键下（localStorage key `nav_settings`）：

```json
{
  "browserTitle": "小鹏导航",
  "headerTitle": "我的个人网址导航"
}
```创建分类时通过插入 `isPlaceholder: true` 的占位站点来持久化该分类。

### 本地开发模式

`src/storage.js` 中每个函数采用 **API 优先 + 降级** 模式：
1. 先尝试 `fetch('/api/...')`
2. 成功 → 返回 API 数据，同时缓存到 localStorage
3. 失败 → 静默降级，直接读写 localStorage

本地没有 KV 环境，所有 API 请求失败后自动走 localStorage，数据刷新不丢失。生产环境 API 正常时走 KV，localStorage 作为本地缓存。

编辑模式默认密码为 `admin123`（`import.meta.env.VITE_PASSWORD || 'admin123'`），密码校验完全在客户端进行。

## Key Behaviors

- **编辑模式开关**：点击右上角"编辑"按钮 → 弹出密码模态框 → 密码正确后 `editMode = true`，显示编辑工具栏和复选框
- **站点交互**：普通模式下点击站点卡片打开链接（`<a>` 标签 target="_blank"），编辑模式下点击站点卡片打开编辑表单
- **分类过滤**：点击分类标签设置 `activeCategory`，过滤 `sites.filter(site => site.category === activeCategory)`
- **搜索**：搜索词匹配 `site.name` 或 `site.url`（大小写不敏感），可与分类过滤叠加
- **全选逻辑**：点击"全选"选中当前 `filteredSites` 所有站点；已全选时变为"取消全选"
- **收藏夹导入**：上传浏览器导出的 Netscape HTML 格式文件，客户端正则解析（storage.js `parseBookmarkHtml`），API 可用时优先走 API 导入
- **Favicon 获取**：`FaviconImg` 三态组件（loading/loaded/fallback）— 加载中显示旋转动画 → `new Image()` 预加载 `favicon.im/zh/` → 失败则显示圆形地球 SVG
- **背景壁纸**：通过 `new Image()` 预加载 `api.xsot.cn/bing`，6 秒超时，失败/超时后每 10 秒自动重试，加载成功后停止。未加载时显示三色渐变背景
- **全屏背景层**：独立 `<div>` 使用 `position: fixed; inset: 0; z-index: -1`，内容层与背景分离
- **毛玻璃效果**：三个内容区块使用 `backdropFilter: blur(12px)` + `rgba(255,255,255,0.06)` + `borderRadius: 8px` + `overflow: hidden`（防止圆角锯齿）
- **响应式布局**：站点网格 `grid-template-columns: repeat(auto-fill, minmax(120px, 1fr))`
- **标题编辑**：编辑模式下点击"编辑标题"按钮，弹出 EditTitleForm 模态框，可修改浏览器标签页标题（同步到 `document.title`）和首页顶部标题，保存后写入 KV（或 localStorage）

## Configuration

### 环境变量

| 变量 | 用途 | 备注 |
|---|---|---|
| `VITE_PASSWORD` | 编辑模式密码 | 本地默认 `admin123`，生产环境在 Cloudflare Pages 设置 |

### KV 绑定

`wrangler.toml` 中定义 `NAV_SITES` 命名空间，需要在 Cloudflare 控制台创建并绑定到 Pages 项目。

### Vite 构建

双入口构建（`vite.config.js`）：
- `main`：`index.html` → 前端应用
- `worker`：`src/worker.js` → 独立的 Worker 脚本
- 输出格式 `es`，带 hash 的文件名

## Change Log (2026-05-25)

### 1. 新增本地数据持久化（`src/storage.js` + `src/App.jsx`）

**原因**：本地开发没有 Cloudflare KV，API 请求全部失败，数据只存在于 React 内存中，刷新页面即丢失。原有代码在各组件 catch 块中散乱处理降级，逻辑不统一且 localStorage 只有读取没有写入。

**修改文件**：

- **`src/storage.js`（新建）** — API 优先 + localStorage 兜底的统一存储模块，模拟 KV 数据结构（key: `nav_sites` → JSON 数组）
  - `getSites()`：GET /api/sites，失败读 localStorage
  - `addSite(site)`：POST /api/sites，失败写 localStorage（自动生成 id、createdAt、补全 https://）
  - `updateSite(site)`：PUT /api/sites，失败本地 map 替换
  - `deleteSites(ids)`：DELETE /api/sites → 重新 getSites() 获取最新列表，失败本地 filter
  - `addCategory(name)`：POST /api/sites（占位站点），失败本地创建，返回 `{ sites }` 或 `{ error }`
  - `importBookmarks(file)`：POST /api/import（FormData），失败客户端 FileReader + 正则解析书签 HTML
  - API 成功时将返回数据缓存到 localStorage，保证生产环境离线时也有数据

- **`src/App.jsx`** — 所有数据操作改为调用 storage 模块
  - `sites` 初始值改为 `[]`，`useEffect` 中 `getSites().then(setSites)` 异步加载
  - `categories` 从 `useState` + `useEffect` 改为 `useMemo` 派生，消除 set-state-in-effect 问题
  - `handleBatchDelete` / `handleAddSite` / `handleAddCategory` / `handleUpdateSite` / `handleImportComplete` 全部改为 `async`，调用 storage 对应函数
  - 移除所有散落的 `fetch` + `try/catch` fallback 代码

- **`src/components/AddSiteForm.jsx`** — 简化为纯表单验证，不再发 API，直接调用 `onAdd(formData)` 交由父组件处理
- **`src/components/ImportBookmarks.jsx`** — 改为调用 `importBookmarks(file)` 从 storage 模块导入，移除内联 API 调用

### 2. 壁纸加载优化（`src/App.jsx`）

**原因**：壁纸使用 CSS `backgroundImage` 直接加载，网络不好时无超时控制、无重试机制、失败只显示纯色 `#1a1a2e`。

**修改**：
- 改为 `new Image()` JS 预加载，6 秒超时（`WALLPAPER_TIMEOUT`）
- 超时/失败后每 10 秒自动重试（`retryRef` + `setTimeout` 递归），加载成功后停止
- 加载中/失败时显示三色渐变：`linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)`
- 组件卸载时 `cleanup` 取消所有定时器
- 移除未使用的 `timestamp` state

### 3. Favicon 级联回退（`src/App.jsx` + `functions/api/favicon.js`）

**原因**：favicon 单一来源 `favicon.im`，网络不好时图标全部显示占位符。Google S2 被墙、DuckDuckGo 返回占位 PNG 均不可用。

**修改**：
- 新建 `functions/api/favicon.js` — 服务端解析目标站点 HTML 中 `<link rel="icon">` 标签，获取真实 favicon URL，SVG 优先
- `FaviconImg` 组件（`src/App.jsx`）— 完整重写（详见 #9）
- `vite.config.js` 添加 `/api/favicon` 代理到 `huwo-nav.pages.dev`，本地开发可走生产 API

### 4. 全屏背景层重构（`src/App.jsx`）

**原因**：背景 `background-attachment: fixed` 在某些浏览器中不可靠，壁纸无法覆盖全屏。

**修改**：
- JSX 结构从单层 `<div>` 改为 `<><div background/><div content/></>`
- 背景层：`position: fixed; inset: 0; z-index: -1`，永远铺满视口
- 内容层：`minHeight: 100vh`，正常流式布局
- 背景层无 `backdropFilter`，仅内容区块有毛玻璃效果

### 5. UI 样式统一（`src/App.jsx`）

**原因**：三个内容区块宽度不一致、背景不透明（壁纸被遮挡）、圆角有锯齿。

**修改**：
- **三个区块（header 内层 div、分类导航 div、站点网格 main）** 统一样式：
  - `maxWidth: 1280px; margin: 16px auto 0`（header 和分类）或 `margin: 20px auto`（主内容），宽度一致且有间隔
  - `backgroundColor: rgba(255,255,255,0.06)` + `backdropFilter: blur(12px)` + `borderRadius: 8px` + `overflow: hidden`
  - header 背景从 `<header>` 移到内部 `maxWidth: 1280px` 的 div，使宽度与其他区块对齐
- **分类按钮**：`borderRadius` 从 `6px 6px 0 0`（tab 式）改为 `8px`（全圆角），移除 `borderBottom` 特殊处理，添加 `overflow: hidden`
- **站点卡片**：添加 `overflow: hidden` 防止 favicon 图片超出圆角造成锯齿

### 6. Bug 修复（`src/storage.js`）

**原因**：`deleteSites` 调用 `DELETE /api/sites`，API 返回 `{ success: true }`，但 `handleBatchDelete` 中 `setSites(remaining)` 期望数组，会导致状态被设为对象。

**修改**：
- `deleteSites` 中 API 成功后改为 `await resp.json()` 消费响应体，然后调用 `getSites()` 获取删除后的完整站点列表返回
- 与本地 fallback 分支（返回过滤后的数组）保持一致

### 7. 标题可编辑功能（`src/storage.js` + `src/App.jsx` + `src/components/EditTitleForm.jsx` + `functions/api/settings.js`）

**原因**：浏览器标签页标题（"小鹏导航"）和首页顶部标题（"我的个人网址导航"）硬编码在源码中，每次修改需要改代码并重新部署。

**修改文件**：

- **`src/storage.js`** — 新增 `getSettings()` 和 `updateSettings(settings)`
  - 使用 localStorage key `nav_settings`，默认值 `{ browserTitle: "小鹏导航", headerTitle: "我的个人网址导航" }`
  - `getSettings()`：GET /api/settings，失败读 localStorage
  - `updateSettings(settings)`：PUT /api/settings，失败写 localStorage

- **`functions/api/settings.js`（新建）** — 应用设置 API
  - GET：返回 KV 中 `app_settings` 键，无数据时返回默认值
  - PUT：写入 `app_settings` 键并返回保存后的对象

- **`src/App.jsx`**
  - 新增 `browserTitle`、`headerTitle`、`showEditTitleForm` 三个 state
  - 启动时 `getSettings()` 加载标题，`useEffect` 同步 `browserTitle` → `document.title`
  - 编辑模式工具栏新增"编辑标题"按钮（橙色）
  - 新增 EditTitleForm 模态弹窗，保存时调用 `updateSettings()` 并更新 state

- **`src/components/EditTitleForm.jsx`（新建）** — 编辑标题模态表单
  - 两个输入框：浏览器标签页标题、首页标题
  - 空白校验，保存回调 `onSave(browserTitle, headerTitle)`

### 8. 首页默认分类修复（`src/App.jsx`）

**原因**：`activeCategory` 初始值为 `''`（空字符串），过滤逻辑 `!activeCategory` 为 `true`，导致首页显示全部站点而非默认选中第一个分类。

**修改**：
- `activeCategory` 初始值从 `''` 改为 `null`（null = 未明确选择）
- 新增派生值 `effectiveCategory = activeCategory !== null ? activeCategory : (categories[0] || '')`
- 过滤逻辑和分类按钮高亮均改用 `effectiveCategory`
- 新增"全部"按钮（onClick 设 `setActiveCategory('')`），允许用户手动切回全部视图

### 9. FaviconImg 组件重写（`src/App.jsx` + `src/App.css`，2026-05-26）

**原因**：旧实现等待 API 返回后才渲染（返回 `null`），`onError` 用 DOM `data-tier` 追踪层级存在竞态问题（图标先显示后回退到 SVG），无加载反馈。

**修改**：
- `FaviconImg` 使用三态渲染：`loading` / `loaded` / `fallback`
- **加载态**：显示 CSS 旋转动画（`.favicon-spinner`，28px，蓝色边框），类似浏览器标签页加载效果
- **预加载**：`preload()` 工具函数用 `new Image()` Promise 封装，顺序尝试 `/favicon.ico` → `favicon.im`，全部失败则显示 SVG
- **SVG 占位符**：圆形地球图标（circle 背景 r=18），弧线 rx=13 确保不超出 40x40 viewBox，不会被裁切
- **后台优化**：加载成功后异步请求 `/api/favicon?domain=`，获取到不同地址时预加载验证后再替换
- 尺寸 48px，容器 60px
- `cancelledRef` 防止组件卸载后的 `setState` 调用

### 10. 分类记录功能（`src/App.jsx` + `src/storage.js` + `functions/api/settings.js`，2026-05-26）

**原因**：用户希望在切换分类后，刷新页面能恢复到上次查看的分类，但需要开关控制是否记录（而非控制是否恢复）。

**修改**：
- settings 新增 `rememberCategory`（bool）和 `savedCategory`（string），默认值 `false` / `''`
- 编辑工具栏新增"记录分类"开关按钮（绿色开/灰色关）
- **开关开**：切换分类时自动保存 `savedCategory`；**开关关**：不记录，但保留已有记录
- **页面加载**：只要有有效 `savedCategory`（非空且分类存在），无论开关状态都恢复
- `handleCategoryChange(category)` 统一处理分类切换
- 初始化 `useEffect` 条件：`categories.length > 0 && activeCategory === null && savedCategory && categories.includes(savedCategory)`
  - 不用 ref 防重入，改用 `activeCategory === null` 条件 —— 解决 sites/settings 异步加载顺序不确定导致的竞态
  - 不依赖 `rememberCategory` —— 恢复与开关状态解耦
- `EditTitleForm` 保存时保留 `rememberCategory` 和 `savedCategory` 字段

### 11. 搜索按钮标签修正（`src/App.jsx`，2026-05-26）

**原因**："搜索"按钮实际是清空搜索词的操作，标签有误导。

**修改**：按钮标签从"搜索"改为"清除"。

### 12. Favicon 获取精简（`src/App.jsx`，2026-05-26）

**原因**：多级回退（`/favicon.ico` → `favicon.im` → 后台 API）链路复杂，且 `favicon.im/zh/` 已足够稳定。

**修改**：简化为仅 `https://favicon.im/zh/${domain}` 单一来源，失败直接显示 SVG 占位符。移除 `/favicon.ico` 直连和后台 API 预加载逻辑。
