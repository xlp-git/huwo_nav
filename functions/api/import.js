import { mergeBookmarks, isHttpUrl } from '../../src/lib/bookmarks.js'

// 处理收藏夹导入的 API 请求。
// 收藏夹 HTML 在浏览器端解析（文件常含大量 base64 图标，服务端解析会超出 Workers CPU 限额），
// 这里只接收精简后的 JSON：{ sites: [{ name, url, category }] }，校验后与已有数据去重合并。
const MAX_IMPORT = 20000;

export async function onRequest(context) {
  const { request, env } = context;

  // 只处理 POST 请求
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Allow': 'POST' }
    });
  }

  try {
    const { sites } = await request.json();

    if (!Array.isArray(sites) || sites.length > MAX_IMPORT) {
      return new Response(JSON.stringify({ error: `sites 必须是数组，且不超过 ${MAX_IMPORT} 条` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const parsed = sites
      .filter(site => site && isHttpUrl(site.url))
      .map(site => ({
        name: String(site.name || site.url).trim().slice(0, 100),
        url: String(site.url).trim(),
        category: String(site.category || '').trim().slice(0, 50)
      }));

    const existingSites = JSON.parse(await env.NAV_SITES.get('all_sites') || '[]');
    const { merged, added, skipped } = mergeBookmarks(existingSites, parsed);

    if (added > 0) {
      await env.NAV_SITES.put('all_sites', JSON.stringify(merged));
    }

    return new Response(JSON.stringify({ success: true, imported: added, skipped }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
