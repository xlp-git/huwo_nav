/**
 * 存储模块。
 * - 生产环境：读写走 Cloudflare Pages Functions → KV。读取失败时回退到 localStorage 缓存（只读）；
 *   写入失败直接抛出错误，由界面提示，绝不静默写到本地（否则刷新后改动会丢失）。
 * - 本地开发（vite dev，无 Functions/KV）：全部读写 localStorage。
 * - 写请求携带编辑密码（请求头 X-Edit-Password），由 functions/api/_middleware.js 校验。
 * - 数据结构与 KV 一致：key "nav_sites" → JSON 数组 [{ id, name, url, category, createdAt }]
 */

import { parseBookmarkHtml, mergeBookmarks } from './lib/bookmarks'

const LOCAL_MODE = import.meta.env.DEV

const STORAGE_KEY = 'nav_sites'
const SETTINGS_KEY = 'nav_settings'
const SAVED_CATEGORY_KEY = 'nav_saved_category'

const DEFAULT_SETTINGS = {
  browserTitle: '小鹏导航',
  headerTitle: '我的个人网址导航',
  rememberCategory: false,
}

// 编辑密码只保存在内存中，刷新或退出编辑即失效
let editPassword = ''

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* 存储已满或被禁用时忽略，仅影响本地缓存 */ }
}

function readLocal() {
  const sites = readJson(STORAGE_KEY, [])
  return Array.isArray(sites) ? sites : []
}

function writeLocal(sites) {
  writeJson(STORAGE_KEY, sites)
}

function normalizeUrl(url) {
  const value = String(url || '').trim()
  return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value
}

// 写请求：带密码头，非 2xx 时抛出服务端给出的错误信息
async function apiWrite(path, options = {}) {
  let resp
  try {
    resp = await fetch(path, {
      ...options,
      headers: { ...options.headers, 'X-Edit-Password': encodeURIComponent(editPassword) },
    })
  } catch {
    throw new Error('网络异常，保存失败，请稍后重试')
  }
  let data = null
  try {
    data = await resp.json()
  } catch { /* 非 JSON 响应 */ }
  if (!resp.ok) {
    throw new Error(data?.error || `保存失败（HTTP ${resp.status}）`)
  }
  return data
}

function jsonBody(method, body) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ---------- 编辑登录 ----------

export async function verifyPassword(password) {
  if (LOCAL_MODE) {
    // 仅本地开发使用；生产构建中这段会被整体移除，密码不会进入打包产物
    const devPassword = import.meta.env.VITE_PASSWORD || 'admin123'
    if (password !== devPassword) return { ok: false, error: '密码错误，请重新输入' }
    editPassword = password
    return { ok: true }
  }

  editPassword = password
  try {
    await apiWrite('/api/auth', { method: 'POST' })
    return { ok: true }
  } catch (error) {
    editPassword = ''
    return { ok: false, error: error.message.startsWith('密码错误') ? '密码错误，请重新输入' : error.message }
  }
}

export function clearPassword() {
  editPassword = ''
}

// ---------- 站点 ----------

export async function getSites() {
  if (!LOCAL_MODE) {
    try {
      const resp = await fetch('/api/sites')
      if (resp.ok) {
        const data = await resp.json()
        if (Array.isArray(data)) {
          writeLocal(data)
          return data
        }
      }
    } catch { /* 网络不可用，使用本地缓存 */ }
  }
  return readLocal()
}

export async function addSite(site) {
  if (!LOCAL_MODE) {
    return apiWrite('/api/sites', jsonBody('POST', site))
  }
  const sites = readLocal()
  const newSite = {
    ...site,
    url: normalizeUrl(site.url),
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
  }
  sites.push(newSite)
  writeLocal(sites)
  return newSite
}

export async function updateSite(updatedSite) {
  if (!LOCAL_MODE) {
    const sites = await apiWrite('/api/sites', jsonBody('PUT', updatedSite))
    writeLocal(sites)
    return sites
  }
  const sites = readLocal()
  const index = sites.findIndex(s => s.id === updatedSite.id)
  if (index === -1) throw new Error('站点不存在')
  sites[index] = { ...sites[index], ...updatedSite, url: normalizeUrl(updatedSite.url) }
  writeLocal(sites)
  return sites
}

export async function deleteSites(ids) {
  if (!LOCAL_MODE) {
    const sites = await apiWrite('/api/sites', jsonBody('DELETE', { ids }))
    writeLocal(sites)
    return sites
  }
  const idSet = new Set(ids)
  const sites = readLocal().filter(s => !idSet.has(s.id))
  writeLocal(sites)
  return sites
}

export async function addCategory(name) {
  if (!LOCAL_MODE) {
    const sites = await apiWrite('/api/sites', jsonBody('POST', { category: name }))
    writeLocal(sites)
    return sites
  }
  const sites = readLocal()
  if (sites.some(s => s.category === name)) {
    throw new Error('分类已存在')
  }
  sites.push({
    id: 'category_' + Date.now(),
    name: '分类占位: ' + name,
    url: '#',
    category: name,
    createdAt: new Date().toISOString(),
    isPlaceholder: true,
  })
  writeLocal(sites)
  return sites
}

// ---------- 设置 ----------

export async function getSettings() {
  if (!LOCAL_MODE) {
    try {
      const resp = await fetch('/api/settings')
      if (resp.ok) {
        const data = { ...DEFAULT_SETTINGS, ...(await resp.json()) }
        writeJson(SETTINGS_KEY, data)
        return data
      }
    } catch { /* 网络不可用，使用本地缓存 */ }
  }
  return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) }
}

export async function updateSettings(settings) {
  const data = LOCAL_MODE ? { ...DEFAULT_SETTINGS, ...settings } : await apiWrite('/api/settings', jsonBody('PUT', settings))
  writeJson(SETTINGS_KEY, data)
  return data
}

// 上次查看的分类只存在本设备：普通浏览时无需编辑密码，也不消耗 KV 写入额度
export function getSavedCategory() {
  const value = readJson(SAVED_CATEGORY_KEY, '')
  if (value) return value
  // 兼容旧版本：savedCategory 曾保存在设置里
  const legacy = readJson(SETTINGS_KEY, {}).savedCategory
  return typeof legacy === 'string' ? legacy : ''
}

export function setSavedCategory(category) {
  writeJson(SAVED_CATEGORY_KEY, category)
}

// ---------- 导入 ----------

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

// 在浏览器端解析（服务端只做校验和合并），返回 { count, skipped }
export async function importBookmarks(file) {
  const parsed = parseBookmarkHtml(await readFileText(file))
  if (parsed.length === 0) {
    throw new Error('没有在文件中找到可导入的 http/https 书签')
  }
  if (!LOCAL_MODE) {
    const result = await apiWrite('/api/import', jsonBody('POST', { sites: parsed }))
    return { count: result.imported, skipped: result.skipped || 0 }
  }
  const { merged, added, skipped } = mergeBookmarks(readLocal(), parsed)
  writeLocal(merged)
  return { count: added, skipped }
}
