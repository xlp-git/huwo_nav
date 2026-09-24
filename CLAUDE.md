# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"虎窝导航"（小鹏导航）— 个人网址导航站点，部署在 Cloudflare Pages，支持分类管理、搜索、密码保护的编辑模式、收藏夹导入等功能。

## Commands

```bash
npm install          # 安装依赖
npm run dev          # 启动 Vite 开发服务器 (http://localhost:5173)，本地模式读写 localStorage
npm run build        # 生产构建到 dist/
npm run lint         # ESLint 代码检查（当前 0 错误）
npm run preview      # 本地预览生产构建（无 Functions，写操作会失败，属正常）
npm run deploy       # 通过 Wrangler 部署 dist/ 到 Cloudflare Pages
```

> 本机若没有 node/npm，可用 bun：`bun --bun run dev|build|lint`。

## Tech Stack

| 层 | 技术 | 版本 |
|---|---|---|
| 前端框架 | React | 19.2 |
| 构建工具 | Vite | 7.3 |
| CSS 方案 | 手写 CSS（`src/App.css`，CSS 变量 + 样式类）；Tailwind 依赖仍在但未使用 | — |
| 代码检查 | ESLint | 9.39 (flat config) |
| 后端 | Cloudflare Pages Functions | — |
| 存储 | Cloudflare KV | — |
| 部署 | Wrangler | — |

## Project Structure

```
├── index.html                  # HTML 入口，lang="zh-CN"，标题 "小鹏导航"，favicon.ico
├── vite.config.js              # Vite 配置，单入口构建
├── wrangler.toml               # Cloudflare 配置，KV 绑定 NAV_SITES
├── eslint.config.js            # ESLint flat config，React hooks + refresh 插件
├── functions/                  # Cloudflare Pages Functions（生产后端）
│   └── api/
│       ├── _middleware.js      # /api/* 统一鉴权：写请求校验 X-Edit-Password == env.EDIT_PASSWORD
│       ├── auth.js             # POST /api/auth，编辑密码校验（通过中间件即 ok）
│       ├── sites.js            # 站点 CRUD API (GET/POST/PUT/DELETE)，字段白名单 + URL 校验
│       ├── import.js           # 收藏夹导入 API (POST JSON)，校验 + 去重合并
│       └── settings.js         # 应用设置 API (GET/PUT)，只保存已知字段
├── src/
│   ├── main.jsx                # React 入口，StrictMode + createRoot
│   ├── App.jsx                 # 主组件，所有状态和业务逻辑（含 FaviconImg、Clock 小组件）
│   ├── App.css                 # 全部样式：CSS 变量、布局、卡片、弹窗、轻提示、动效
│   ├── index.css               # Tailwind 指令（遗留）
│   ├── storage.js              # 存储模块：生产走 API（写失败抛错），本地开发走 localStorage
│   ├── lib/
│   │   └── bookmarks.js        # 收藏夹解析与去重合并（前端和 functions/api/import.js 共用）
│   └── components/
│       ├── Modal.jsx           # 通用弹窗：Esc / 点击遮罩关闭、入场动画
│       ├── AddSiteForm.jsx     # 添加站点表单（默认选中当前分类）
│       ├── EditSiteForm.jsx    # 编辑站点表单（由 App 的 Modal 包裹）
│       ├── EditTitleForm.jsx   # 编辑标题表单（浏览器标题/首页标题）
│       └── ImportBookmarks.jsx # 导入收藏夹表单（文件选择，浏览器端解析）
├── docs/
│   └── 项目进度与设计决策总结.md
└── public/
    └── vite.svg                # Vite 默认图标（未使用，实际使用 favicon.ico）
```

## Architecture

### 组件树与数据流

```
main.jsx → App.jsx (所有状态 + 所有业务逻辑)
  ├── 背景层（.bg-image 壁纸 + .bg-overlay 边缘渐暗）
  ├── 顶部栏（标题、编辑/退出编辑按钮）
  ├── hero：Clock 时钟 → 搜索框 → 编辑模式工具栏
  ├── .layout 两栏
  │   ├── 左侧分类栏 aside.sidebar（sticky 吸顶，内部 nav.categories 单独滚动）
  │   └── 右侧站点面板 main.panel（加载中骨架屏 / 空状态 / 站点网格）
  ├── AddSiteForm / ImportBookmarks / EditTitleForm（各自内部使用 Modal）
  ├── Modal：密码、添加分类、编辑站点（包 EditSiteForm）、确认框
  └── 轻提示栈（toast-stack）
```

App.jsx 是唯一的状态持有者，子组件通过 props 接收回调和数据，没有使用状态管理库或 Context。表单的 `onAdd` / `onUpdate` / `onSave` / `onComplete` 回调都是 async，失败时抛错，由表单在弹窗内显示错误并保持打开。

所有数据操作通过 `src/storage.js`：
- **生产环境**（`import.meta.env.DEV === false`）：读写走 `/api/*`。读取失败回退 localStorage 缓存（只读）；**写入失败直接抛错**，界面提示，绝不静默写本地
- **本地开发**（`vite dev`）：全部读写 localStorage，不请求 API
- 写请求自动带 `X-Edit-Password`（`encodeURIComponent` 编码，支持中文），密码只存在内存，退出编辑或刷新即清除

### 状态清单（App.jsx）

| 状态 | 类型 | 用途 |
|---|---|---|
| `sites` / `sitesLoading` | `[]` / `boolean` | 全部站点记录（含分类占位）；加载完成前显示骨架屏 |
| `visibleSites` | `[]` (useMemo) | 去掉 `isPlaceholder` 的真实站点，用于展示、搜索和计数 |
| `categories` | useMemo | 分类列表（含只有占位的空分类） |
| `activeCategory` | `null\|string` | 手动选择的分类（null = 未选，'' = 全部）；已不存在的分类视为 null |
| `savedCategory` | `string` | 本设备记录的上次分类（localStorage `nav_saved_category`） |
| `effectiveCategory` | 派生 | `有效的 activeCategory ?? 有效的 savedCategory ?? categories[0] ?? ''` |
| `selectedSites` | `[]` | 选中的站点 ID；批量操作只作用于当前可见的已选站点（`visibleSelected`），切换分类/退出编辑时清空 |
| `editMode` / `verifying` | `boolean` | 编辑模式 / 密码校验中 |
| `editingSite` | `object\|null` | 非空即显示编辑站点弹窗 |
| `showAddForm` / `showImportForm` / `showPasswordForm` / `showAddCategoryForm` / `showEditTitleForm` | `boolean` | 各弹窗显隐 |
| `confirmState` / `confirmBusy` | `object\|null` / `boolean` | 通用确认框（批量删除） |
| `toasts` | `[]` | 轻提示队列，`notify(message, type)` 推入，3.2 秒自动消失 |
| `searchTerm` | `string` | 搜索关键词 |
| `browserTitle` / `headerTitle` / `rememberCategory` | 设置 | 存 KV `app_settings` |

### 后端：Pages Functions

- 通过文件路径路由：`functions/api/xxx.js` → `/api/xxx`
- `_middleware.js` 作用于 `/api/*`：GET/HEAD/OPTIONS 放行；其余请求要求请求头 `X-Edit-Password`（URI 编码）与环境变量 `EDIT_PASSWORD` 一致（SHA-256 摘要后逐字节比较），否则 401；未配置 `EDIT_PASSWORD` 时拒绝一切写入（503）
- 所有写操作都是"读出 `all_sites` 整个数组 → 修改 → 写回"

### API 路由详情

**`POST /api/auth`**（需密码）— 返回 `{ ok: true }`，用于进入编辑模式时校验密码。

**`GET /api/sites`** — 返回 KV 中 `all_sites` 数组，若无数据返回 `[]`。

**`POST /api/sites`**（需密码）两种情况：
- 添加站点：body `{ name, url, category? }`，只取这三个字段；URL 自动补 `https://`，非 http/https 返回 400；自动生成 `id`、`createdAt`，返回新站点
- 添加分类：body 只含 `{ category }`，创建占位站点 `{ isPlaceholder: true, name: "分类占位: xxx", url: "#" }`，返回完整数组

**`PUT /api/sites`**（需密码）— body `{ id, name, url, category }`，在原记录上合并这三个字段（`id`/`createdAt` 不可改），返回完整数组；id 不存在 404。

**`DELETE /api/sites`**（需密码）— body `{ ids: [...] }`（必须是非空数组），返回删除后的完整数组。

**`POST /api/import`**（需密码）— body `{ sites: [{ name, url, category }] }`（≤ 20000 条）。收藏夹 HTML 由浏览器端 `parseBookmarkHtml` 解析（文件常含大量 base64 图标，服务端解析会超 Workers CPU 限额）；服务端过滤非 http/https，按 URL（忽略大小写和末尾 `/`）与已有数据去重合并，返回 `{ imported, skipped }`。

**`GET /api/settings`** — 返回 `app_settings`，缺省字段用默认值补齐。

**`PUT /api/settings`**（需密码）— 只保存 `{ browserTitle, headerTitle, rememberCategory }`，标题去空白并截断到 100 字。

### 数据模型

所有站点以单个 JSON 数组存储在 KV 命名空间 `NAV_SITES` 的 `all_sites` 键下（localStorage 缓存 key `nav_sites`）：

```json
{
  "id": "1712345678901",          // 基于时间戳的字符串 ID
  "name": "Google",               // 站点名称
  "url": "https://google.com",    // 站点 URL（仅 http/https）
  "category": "搜索",              // 分类名（可为空）
  "createdAt": "2024-01-01T...",  // ISO 时间戳
  "isPlaceholder": false          // 可选，分类占位记录为 true，前端不展示
}
```

分类并非独立存储，而是从 `sites` 中提取所有唯一的 `category` 值；创建空分类时插入 `isPlaceholder: true` 的占位记录来持久化。

应用设置存储在 KV 的 `app_settings` 键下（localStorage 缓存 key `nav_settings`）：

```json
{
  "browserTitle": "小鹏导航",
  "headerTitle": "我的个人网址导航",
  "rememberCategory": false
}
```

"上次查看的分类"只存本设备 localStorage `nav_saved_category`（普通浏览时无需密码、不消耗 KV 写入额度），兼容读取旧版存在 `nav_settings.savedCategory` 的值。

### 本地开发模式

`vite dev` 下 `storage.js` 全部读写 localStorage，不请求 API。编辑密码本地校验：`import.meta.env.VITE_PASSWORD || 'admin123'`，这段代码在生产构建中被整体移除，密码不会进入打包产物（可 `grep -r admin123 dist` 验证）。

## Key Behaviors

- **编辑模式**：点击"编辑" → 密码弹窗 → 生产环境 `POST /api/auth` 由服务端校验（本地开发用本地密码）→ 通过后 `editMode = true`；"退出编辑"清空内存中的密码和选择
- **站点交互**：普通模式点击/回车打开链接（`window.open`，仅允许 http/https，否则轻提示拦截）；编辑模式点击打开编辑弹窗。卡片 `tabIndex=0`，可 Tab 聚焦，有焦点框
- **分类过滤**：点击分类胶囊切换 `activeCategory` 并清空选择；新建分类后自动切换过去。分类在左侧竖排侧栏（见下方"分类侧栏"）；不显示站点数
- **搜索**：匹配 `name` 或 `url`（大小写不敏感），限定当前分类；`/` 聚焦搜索框，回车打开第一个结果（无结果时用必应搜索），Esc 清空
- **全选/批量删除**：只作用于当前可见站点；删除前弹统一样式的确认框，完成后轻提示
- **收藏夹导入**：浏览器端解析 Netscape HTML（按 `<DL>` 层级维护文件夹栈、解码 HTML 实体、过滤非 http 链接），已存在的网址自动跳过，完成后提示导入/跳过数量
- **弹窗**：统一 `Modal` 组件，Esc 或点击遮罩关闭（按下和松开都在遮罩上才关，避免拖选误关），缩放淡入动画；保存中禁用按钮，失败在弹窗内显示错误
- **轻提示**：底部居中玻璃胶囊，成功绿边、失败红边，替代 `alert`
- **加载骨架屏**：站点数据返回前显示 10 张闪光占位卡片，不再闪现"暂无站点"
- **Favicon 获取**：`FaviconImg` 预加载 `favicon.im/zh/{domain}`，加载中显示旋转动画，失败显示地球 SVG；`faviconCache` 缓存结果，重新挂载直接显示
- **背景壁纸**：`new Image()` 预加载 `api.xsot.cn/bing`，6 秒超时，失败/超时后 10 秒重试；任意一次成功即停止（超时后迟到的成功也会采用并取消重试，避免壁纸被替换）
- **全屏背景层**：`.bg-layer` 固定铺满，`.bg-image` 四周外扩 24px 供视差平移，`.bg-overlay` 只压暗上下边缘和四角
- **视觉风格**：起始页式布局（细顶栏 → 时钟 → 大号搜索框 → 胶囊分类 → 站点面板），深色半透明毛玻璃 + 白字，单一强调色蓝，危险操作红；样式集中在 `src/App.css`
- **时钟**：`Clock` 组件对齐整秒自更新，`HH:MM` + 右侧悬挂小号秒数 + 日期星期 + 时段问候语
- **鼠标动效**：壁纸视差（`--px/--py`）；面板柔光和卡片描边照亮（`--mx/--my`）；只改 CSS 变量不触发 React 渲染，触屏和 `prefers-reduced-motion` 下关闭
- **入场动画**：站点网格 `key={effectiveCategory}`，切换分类时卡片依次浮现
- **分类侧栏**：`.layout` 两栏网格，桌面侧栏 200px（分类项文字区 150px，完整显示 10 个汉字，左对齐），手机 92px（13px 字号居中、最多两行共 10 个汉字）。侧栏 `position: sticky` 吸顶；最大高度由 JS 动态设为"当前顶部到屏幕底部"（监听 scroll/resize/body 尺寸变化，rAF 节流），首屏整栏在屏幕内、吸顶后接近一屏高；列表内容超出时上/下边缘渐隐（`more-above` / `more-below` 类）；选中分类不在可见区域时自动滚动分类栏（只滚侧栏不滚页面）。选中项白底深字，悬停轻微右移
- **站点卡片**：横向长方形（左图标 + 右侧名称/域名两行）
- **响应式布局**：站点网格 `minmax(200px, 1fr)`，桌面站点区约 950px 一行 4 张；≤640px 时站点区约 234px 一行 1 张，显示名称 + 域名
- **标题编辑**：编辑模式下"编辑标题"修改浏览器标签页标题和首页标题，保存到 KV

## Configuration

### 环境变量

| 变量 | 设置位置 | 用途 |
|---|---|---|
| `EDIT_PASSWORD` | Cloudflare Pages → 设置 → 环境变量（建议设为"加密"） | **生产编辑密码**，由 `_middleware.js` 校验。未配置时线上所有写操作返回 503 |
| `VITE_PASSWORD` | 本地 `.env.local`（可选） | 仅本地开发的编辑密码，默认 `admin123`，不会进入生产构建 |

### KV 绑定

`wrangler.toml` 中定义 `NAV_SITES` 命名空间，需要在 Cloudflare 控制台创建并绑定到 Pages 项目。

### Vite 构建

单入口 `index.html`，输出格式 `es`，带 hash 的文件名。

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

### 13. 站点卡片全区域可点击跳转（`src/App.jsx`，2026-05-28）

**原因**：只有点击卡片内的名称链接（`<a>` 标签）才能跳转网站，点击图标区域无反应，交互不一致。

**修改**：
- 卡片外层 `<div>` 的 `onClick` 在非编辑模式下调用 `window.open(site.url, '_blank', 'noopener,noreferrer')`
- 编辑模式下仍调用 `handleEditSite(site)` 打开编辑表单
- 站点名称从 `<a>` 标签改为 `<span>`，避免 `<a>` 和父级 `window.open` 双重跳转
- `cursor` 统一为 `pointer`，不再区分编辑/非编辑模式
- 复选框添加 `onClick={(e) => e.stopPropagation()}`，阻止冒泡导致误触发卡片点击

### 14. 页面与布局视觉重设计（`src/App.jsx` + `src/App.css` + `src/components/*Form.jsx` + `ImportBookmarks.jsx`，2026-09-24）

**原因**：深色壁纸上的毛玻璃区块只叠 6% 白色，标题/分类却用近黑色字，几乎看不清；编辑工具栏六种颜色按钮杂乱；纯白站点卡片与深色背景对比生硬；搜索框小、页面缺少视觉重心。

**修改**：
- **布局**：改为起始页式 —— 透明细顶栏（标题 + 编辑按钮）→ 居中大号圆角搜索框（左侧放大镜图标，输入后框内出现 × 清除按钮）→ 编辑模式工具栏 → 胶囊式分类栏 → 站点面板
- **配色**：统一为深色半透明毛玻璃（`rgba(15,23,42,0.38)` + `blur(16px)`）+ 白字；只保留蓝色强调（添加站点）和红色危险（批量删除），其余按钮统一为描边玻璃按钮；"记录分类"开启时为绿色描边
- **分类**：胶囊按钮，选中为白底深字；横向滚动（隐藏滚动条），手机上不再换行堆叠
- **站点卡片**：去掉白色卡片底，改为透明卡片 + 白色圆角图标块（favicon 占 64%）+ 白字名称；悬停变亮上浮；选中时蓝色描边 + 蓝色底；复选框移到卡片右上角
- **空状态**：挪到站点面板内部显示
- **弹窗**：密码、添加分类、编辑站点及四个表单组件统一为 `.modal-mask` / `.modal` / `.field-input` / `.mbtn` 样式 —— 16px 圆角、遮罩加模糊、输入框聚焦蓝色光圈；密码和添加分类输入框自动聚焦
- **代码**：所有内联样式和 `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur` 改色逻辑换成 `App.css` 中的 CSS 变量 + 样式类（`:hover` / `:focus`）；"记录分类"开关和"全选"逻辑抽成 `toggleRememberCategory` / `toggleSelectAll`，行为不变。`App.jsx` 从 1030 行减到 537 行
- **行为不变**：状态、数据流、存储、搜索、分类记忆、点击跳转逻辑均未改动

### 15. 时钟、鼠标动效与壁纸透明度优化（`src/App.jsx` + `src/App.css`，2026-09-24）

**原因**：在 #14 基础上进一步美化，参考 Sun-Panel、Homarr、iTab 等开放导航/起始页：需要时钟显示、鼠标交互动效，并让壁纸更通透同时保证文字可读。

**修改**：
- **时钟**：新增 `Clock` 组件，放在搜索框上方居中；88px 细体数字（手机 60px），`tabular-nums` 防抖动，冒号按秒奇偶切换透明度；下方显示"M月D日 星期X · 问候语"（夜深了/早上好/上午好/中午好/下午好/晚上好）
- **壁纸透明度**：去掉整层暗色蒙版，背景拆为 `.bg-image`（壁纸，淡入）+ `.bg-overlay`（仅上下边缘渐暗 + 四角暗角）；站点面板底色降到 `rgba(15,23,42,0.3)`、`blur(24px) saturate(160%)`，顶边加内高光；所有白字加双层 `--text-shadow`，亮色壁纸下仍清晰
- **壁纸视差**：`.bg-image` 四周外扩 24px，按鼠标位置反向平移最多 12px
- **面板光斑**：`.panel::before` 520px 径向柔光跟随鼠标；`.site-card::before` 用径向渐变 + mask 只保留 1px 边框，实现光标附近卡片描边被"照亮"
- **卡片悬停**：上浮 4px + 投影，图标放大 1.1 倍（弹性曲线）并外发光；按下时轻微回缩
- **入场动画**：卡片 `card-in`（上浮 + 缩放淡入，`animation-fill-mode: backwards` 避免覆盖 hover 的 transform），切换分类时重播；时钟 `fade-up` 淡入
- **其他**：搜索框聚焦时从 580px 展宽到 660px 并出现蓝色外发光；分类胶囊悬停发光上浮，选中态加白色光晕
- **图标缓存**：`FaviconImg` 新增模块级 `faviconCache`，已加载过的图标重新挂载时直接显示
- **降级**：`motionEnabled()` 仅在 `(hover: hover) and (pointer: fine)` 且未开启减少动态效果时启用视差/光斑；`@media (hover: none)` 隐藏光斑，`prefers-reduced-motion` 关闭所有动画和过渡

### 16. 时钟显示秒数、站点卡片改为横向长方形（`src/App.jsx` + `src/App.css`，2026-09-24）

**原因**：用户希望时钟显示秒；方形站点格子太窄，较长的站点名显示不全。

**修改**：
- **时钟秒数**：`Clock` 新增 `ss`，以 0.42em 小号、75% 透明度的 `.clock-sec` 悬挂在分钟右侧（`position: absolute; left: 100%`，不占布局宽度，时:分仍居中）；冒号不再闪烁
- **站点卡片**：从竖向方块改为横向长方形 —— 左侧 44px 白色图标块，右侧 `.site-text` 两行：名称（14px/500）+ 域名（12px 淡色，新增 `hostOf()` 工具函数）；卡片常驻淡玻璃底 `rgba(255,255,255,0.06)` + 细边框
- **宽度**：桌面 `minmax(200px, 1fr)`，1200px 容器一行 5 张（每张约 218px），名称可完整显示约 10 个汉字 / 20 个英文字符；手机 `minmax(150px, 1fr)` 一行 2 张，隐藏域名，名称用 `line-clamp: 2` 最多两行、`overflow-wrap: anywhere` 优先在空格处换行
- **编辑模式**：网格加 `.editing` 类给卡片右侧留 32px，复选框改为垂直居中
- 名称仍超长时以省略号截断，悬停 `title` 显示全名

### 17. 全面排查隐患与交互美化（前后端多文件，2026-09-24）

**原因**：全量代码审查发现安全、数据一致性、功能和代码质量四类隐患；同时继续打磨交互细节。

**安全**：
- 编辑密码原先以 `VITE_PASSWORD` 打包进前端 JS，任何人可在源码中读到；写接口完全无鉴权，一条 `curl -X DELETE` 即可清空数据
- 新增 `functions/api/_middleware.js`：写请求校验 `X-Edit-Password`（URI 编码，支持中文）== 环境变量 `EDIT_PASSWORD`，SHA-256 摘要后逐字节比较；未配置时拒绝写入（503）
- 新增 `functions/api/auth.js`，进入编辑模式时由服务端校验密码；本地开发的密码校验代码在生产构建中被移除（已验证 `dist` 中无 `admin123`）
- 后端字段白名单：`sites.js` 只接受 `name/url/category`，URL 补 `https://` 且仅允许 http/https；PUT 不可篡改 `id/createdAt`；DELETE 校验 `ids` 为非空数组并返回剩余数组；`settings.js` 只保存三个已知字段并截断长度
- 前端 `openSite` 只打开 http/https 链接，拦截导入的 `javascript:` 等链接

**数据一致性**：
- `storage.js` 重写：生产环境写入失败直接抛错并在界面提示，不再静默写到 localStorage（原逻辑下 API 报错会假装保存成功，刷新后改动丢失）；本地开发（`import.meta.env.DEV`）全部走 localStorage
- 批量删除前弹确认框；选择在切换分类/退出编辑时清空；批量操作只作用于当前可见的已选站点，避免误删被搜索隐藏的站点
- "上次查看的分类"改存本设备 localStorage（`nav_saved_category`），普通浏览不需要密码，也不再每次点分类都写 KV（免费版每天 1000 次写入）；兼容读取旧 `nav_settings.savedCategory`

**功能修复**：
- 分类占位记录（`isPlaceholder`）不再显示为卡片（原先会出现"分类占位: xx"、点击打开 `#`）
- 收藏夹解析抽到 `src/lib/bookmarks.js`：单遍扫描按 `<DL>` 层级维护文件夹栈（修正嵌套文件夹结束后书签归错分类）、解码 HTML 实体、过滤非 http 链接、按 URL 去重（重复导入不再产生重复数据）
- 导入改为浏览器端解析、以 JSON 上传：原服务端对每个链接重扫全文（O(n²)），且收藏夹常含大量 base64 图标，服务端解析会超 Workers 免费版 10ms CPU 限额
- 壁纸：超时后迟到的加载成功会被采用并取消重试，修复壁纸被随后的重试替换成另一张；CSS `url("...")` 加引号
- 时钟对齐整秒刷新；`activeCategory` 指向已删除分类时自动回落；本地缓存损坏为非数组时不再崩溃
- `index.html` 改 `lang="zh-CN"`、修正 favicon MIME 类型

**代码质量**：
- 删除未使用的 `SiteCard.jsx`、备用 `src/worker.js`（及 Vite 第二入口、`wrangler.toml` 的 `main`/`[site]`）、无前端调用且可被滥用为抓取代理的 `functions/api/favicon.js`（及 Vite 代理）
- 消除 3 处 effect 内同步 setState（`FaviconImg` 改为派生初始值、`EditSiteForm` 改 `useState` 初始化 + `key`、分类恢复改为派生 `effectiveCategory`），ESLint 从 9 个错误降为 0

**交互美化**：
- 新增通用 `Modal` 组件：Esc / 点击遮罩关闭（按下松开都在遮罩上才关）、缩放淡入动画；所有弹窗统一使用
- 轻提示（toast）替代 `alert`；统一样式的确认框替代 `confirm`；表单保存失败在弹窗内显示错误并保持打开
- 加载骨架屏：数据返回前显示 10 张闪光占位卡片，不再闪现"暂无站点"
- 空状态按情况给出提示（搜索无结果 / 分类为空 / 无站点）
- 快捷键：`/` 聚焦搜索框（搜索框右侧显示 `/` 提示），回车打开第一个结果、无结果时用必应搜索，Esc 清空
- 站点卡片可 Tab 聚焦、回车打开，带焦点框；添加站点默认选中当前分类；新建分类后自动切换过去

**部署注意**：上线前必须在 Cloudflare Pages → 设置 → 环境变量中添加 `EDIT_PASSWORD`（生产和预览环境都要），否则线上无法保存任何修改。原 `VITE_PASSWORD` 变量可删除。

### 18. 分类胶囊等宽与自动换行（`src/App.jsx` + `src/App.css`，2026-09-24）

**原因**：分类胶囊宽度随名称字数变化，参差不齐；#17 加的站点数紧贴在名称后面，与胶囊整体不协调。用户线上已有 8 个字的分类，要求按 10 个字定宽，并去掉站点数。

**修改**：
- **最小宽度 180px**：14px 字号下 10 个汉字需 140px（实测粗体/常规体相同），180px 减去 1px 边框 ×2 和 18px 内边距 ×2 后文字区 142px，可完整显示 10 个汉字；更长的名称以省略号截断，悬停 `title` 显示全名
- **名称居中**：flex 居中，实测各胶囊名称中心偏移为 0
- **恢复换行**：#14 起分类栏是单行横向滚动且隐藏了滚动条，分类多了看起来像被裁掉。改为 `display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))` 自动换行，每列等分铺满整行，所有胶囊等宽且左右边缘与站点面板对齐（桌面一行 6 个，约 187px）
- **手机端**：固定一行 2 个（约 175px），字号 13px（10 个汉字 130px，文字区约 145px 仍可完整显示），高度 32px、间距 8px，分类多时更紧凑
- 验证：25 个分类下桌面 5 行、手机 13 行，无越界、无截断、无页面横向滚动
- **去掉站点数**：删除 `.chip-count` 徽标和 `categoryCounts` 计算（中间曾试过 132px + 三栏网格 + 右侧数量徽标，按用户意见放弃）
- **代码**："全部"和各分类共用 `renderChip(category, label)` 渲染
- 踩坑：最初按 176px 计算漏算了 2px 边框（`box-sizing: border-box`），导致 10 个字被截断

### 19. 分类改为左侧竖排侧栏（`src/App.jsx` + `src/App.css`，2026-09-24）

**原因**：分类放在站点上方时，分类一多就把站点区挤到下面（#18 的换行方案下 25 个分类桌面占 5 行、手机 13 行）。用户提议改为左侧竖排、可滚动；手机端选择同样用左侧窄栏（类似电商 App 分类页）。

**修改**：
- **布局**：`.layout` 两栏网格 `200px minmax(0, 1fr)`，时钟和搜索仍在上方居中；右侧站点区约 950px，一行 4 张卡片
- **侧栏**：`aside.sidebar` 毛玻璃面板，`position: sticky; top: 16px`，内部 `nav.categories` 纵向排列、`overflow-y: auto` 单独滚动（细滚动条、`overscroll-behavior: contain`）；分类项高 40px、左对齐、文字区 150px 可完整显示 10 个汉字；选中白底深字，悬停背景加亮并右移 4px
- **动态高度**：侧栏最大高度 = 视口高 − max(当前顶部, sticky top) − 间距，由 JS 在 scroll / resize / `document.body` 尺寸变化时（rAF 节流）更新。解决首屏侧栏下半截落在屏幕外、恢复到靠下分类时看不到选中项的问题
- **滚动提示**：列表可继续滚动时，用 `mask-image` 在上/下边缘渐隐（`more-above` / `more-below` 类由 `onScroll` 和 `ResizeObserver` 直接切换，不触发渲染）
- **自动定位**：`effectiveCategory` 变化时，若选中项不在"分类栏与屏幕的交集"内，滚动分类栏使其居中（只滚侧栏，不滚页面）
- **手机端**：侧栏 92px、sticky top 8px，分类项最小高 48px、13px 字号居中、`line-clamp: 2`（每行约 5 个汉字，共 10 个）；站点区单列，恢复显示域名（去掉 #16 手机端隐藏域名和名称两行的规则）
- **移除**：#18 的分类胶囊网格换行布局
- 验证：25 个分类 × 8 个站点，桌面/手机下刷新恢复第 21 个分类时选中项均在首屏可见；切到"全部"滚动页面后侧栏吸顶（桌面 top 16px、手机 8px）；无名称截断、无页面横向滚动
