/**
 * 收藏夹（Netscape Bookmark HTML）解析，前端本地导入和 functions/api/import.js 共用。
 * - 单遍扫描，按 <DL> 嵌套层级维护文件夹栈，书签归入最近一层文件夹
 * - 只保留 http/https 链接（过滤 javascript: 小书签、place: 等）
 * - 解码名称中的 HTML 实体
 */

const TOKEN_RE = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b([^>]*)>([\s\S]*?)<\/a>|<(\/?)dl\b[^>]*>/gi
const HREF_RE = /\shref\s*=\s*"([^"]*)"/i

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(num) ? String.fromCodePoint(num) : match
    }
    return ENTITIES[code.toLowerCase()] ?? match
  })
}

function cleanText(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, '')).trim()
}

export function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

// 去重用的 URL 归一化：忽略大小写和末尾斜杠
export function urlKey(url) {
  return String(url || '').trim().toLowerCase().replace(/\/+$/, '')
}

export function parseBookmarkHtml(html) {
  const sites = []
  const folderStack = []
  let pendingFolder = null
  let match

  TOKEN_RE.lastIndex = 0
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const [, h3, aAttrs, aText, dlClose] = match
    if (h3 !== undefined) {
      pendingFolder = cleanText(h3)
    } else if (aAttrs !== undefined) {
      const hrefMatch = HREF_RE.exec(aAttrs)
      const url = hrefMatch ? decodeEntities(hrefMatch[1]).trim() : ''
      if (!isHttpUrl(url)) continue
      sites.push({
        name: cleanText(aText) || url,
        url,
        category: folderStack.length ? folderStack[folderStack.length - 1] : '',
      })
    } else if (dlClose === '/') {
      folderStack.pop()
    } else {
      // <DL> 开启新层级：紧跟在 <H3> 后面的是该文件夹，否则沿用上一层
      folderStack.push(pendingFolder ?? (folderStack[folderStack.length - 1] || ''))
      pendingFolder = null
    }
  }
  return sites
}

/**
 * 与已有站点合并：跳过 URL 已存在（含本批次内重复）的书签，并补全 id/createdAt。
 * 返回 { merged, added, skipped }
 */
export function mergeBookmarks(existing, parsed) {
  const seen = new Set(existing.map(site => urlKey(site.url)))
  const now = Date.now()
  const createdAt = new Date(now).toISOString()
  const added = []
  parsed.forEach((site, i) => {
    const key = urlKey(site.url)
    if (seen.has(key)) return
    seen.add(key)
    added.push({
      id: `${now}${i}${Math.random().toString(36).slice(2, 7)}`,
      ...site,
      createdAt,
    })
  })
  return { merged: [...existing, ...added], added: added.length, skipped: parsed.length - added.length }
}
