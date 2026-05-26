/**
 * API 优先 + localStorage 兜底的存储模块。
 * - 生产环境：API 调用 Cloudflare Pages Functions → KV，同时同步到 localStorage 作本地缓存
 * - 本地开发：API 不可用，自动降级到 localStorage
 * - 数据结构与 KV 一致：key "nav_sites" → JSON 数组 [{ id, name, url, category, createdAt }]
 */

const STORAGE_KEY = 'nav_sites'
const SETTINGS_KEY = 'nav_settings'

const DEFAULT_SETTINGS = {
  browserTitle: '小鹏导航',
  headerTitle: '我的个人网址导航',
  rememberCategory: false,
  savedCategory: '',
}

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeLocal(sites) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sites))
}

export async function getSites() {
  try {
    const resp = await fetch('/api/sites')
    if (resp.ok) {
      const data = await resp.json()
      writeLocal(data)
      return data
    }
  } catch { /* API unavailable, fallback to localStorage */ }
  return readLocal()
}

export async function addSite(site) {
  try {
    const resp = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(site),
    })
    if (resp.ok) return await resp.json()
  } catch { /* API unavailable, fallback to localStorage */ }

  const sites = readLocal()
  const newSite = {
    ...site,
    id: String(Date.now()),
    createdAt: new Date().toISOString(),
  }
  if (!newSite.url.startsWith('http://') && !newSite.url.startsWith('https://')) {
    newSite.url = 'https://' + newSite.url
  }
  sites.push(newSite)
  writeLocal(sites)
  return newSite
}

export async function updateSite(updatedSite) {
  try {
    const resp = await fetch('/api/sites', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSite),
    })
    if (resp.ok) return await resp.json()
  } catch { /* API unavailable, fallback to localStorage */ }

  const sites = readLocal()
  const index = sites.findIndex(s => s.id === updatedSite.id)
  if (index === -1) return null
  if (!updatedSite.url.startsWith('http://') && !updatedSite.url.startsWith('https://')) {
    updatedSite.url = 'https://' + updatedSite.url
  }
  sites[index] = updatedSite
  writeLocal(sites)
  return sites
}

export async function deleteSites(ids) {
  try {
    const resp = await fetch('/api/sites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    if (resp.ok) {
      await resp.json()
      return await getSites()
    }
  } catch { /* API unavailable, fallback to localStorage */ }

  const sites = readLocal().filter(s => !ids.includes(s.id))
  writeLocal(sites)
  return sites
}

export async function addCategory(name) {
  try {
    const resp = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: name }),
    })
    if (resp.ok) return { sites: await resp.json() }
  } catch { /* API unavailable, fallback to localStorage */ }

  const sites = readLocal()
  if (sites.some(s => s.category === name)) {
    return { error: '分类已存在' }
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
  return { sites }
}

export async function getSettings() {
  try {
    const resp = await fetch('/api/settings')
    if (resp.ok) {
      const data = await resp.json()
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
      return data
    }
  } catch { /* API unavailable, fallback to localStorage */ }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function updateSettings(settings) {
  try {
    const resp = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    if (resp.ok) {
      const data = await resp.json()
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
      return data
    }
  } catch { /* API unavailable, fallback to localStorage */ }

  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export function importBookmarks(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const html = e.target.result
      const parsed = parseBookmarkHtml(html)

      // 尝试 API 导入
      try {
        const formData = new FormData()
        formData.append('file', file)
        const resp = await fetch('/api/import', { method: 'POST', body: formData })
        if (resp.ok) {
          const result = await resp.json()
          const apiSites = await getSites()
          resolve({ count: result.imported, sites: apiSites })
          return
        }
      } catch { /* API unavailable, fallback to localStorage */ }

      // 本地兜底
      const existing = readLocal()
      const merged = [...existing, ...parsed]
      writeLocal(merged)
      resolve({ count: parsed.length, sites: merged })
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

function parseBookmarkHtml(html) {
  const sites = []
  const aTagRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const h3Regex = /<h3[^>]*>([\s\S]*?)<\/h3>/gi

  const folders = []
  let h3Match
  while ((h3Match = h3Regex.exec(html)) !== null) {
    folders.push({
      index: h3Match.index,
      name: h3Match[1].replace(/<[^>]+>/g, '').trim(),
    })
  }

  let aMatch
  while ((aMatch = aTagRegex.exec(html)) !== null) {
    const url = aMatch[1]
    const name = aMatch[2].replace(/<[^>]+>/g, '').trim()
    let folderName = ''
    for (let i = folders.length - 1; i >= 0; i--) {
      if (folders[i].index < aMatch.index) {
        folderName = folders[i].name
        break
      }
    }
    sites.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      name,
      url,
      category: folderName,
      createdAt: new Date().toISOString(),
    })
  }
  return sites
}
