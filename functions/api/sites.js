// 处理站点相关的 API 请求

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function readSites(env) {
  const sites = JSON.parse(await env.NAV_SITES.get('all_sites') || '[]');
  return Array.isArray(sites) ? sites : [];
}

// 补全协议并校验：只接受 http/https
function normalizeUrl(url) {
  let value = String(url || '').trim();
  if (!value) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
  return /^https?:\/\//i.test(value) ? value : '';
}

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  try {
    // GET 请求 - 获取所有站点
    if (method === 'GET') {
      return json(await readSites(env));
    }

    // POST 请求 - 添加站点或分类
    if (method === 'POST') {
      const data = await request.json();
      const sites = await readSites(env);

      // 如果是添加分类
      if (data.category && !data.name && !data.url) {
        const category = cleanText(data.category, 50);
        if (!sites.some(site => site.category === category)) {
          sites.push({
            id: `category_${Date.now()}`,
            name: `分类占位: ${category}`,
            url: '#',
            category,
            createdAt: new Date().toISOString(),
            isPlaceholder: true
          });
          await env.NAV_SITES.put('all_sites', JSON.stringify(sites));
        }
        return json(sites, 201);
      }

      // 添加站点：只取已知字段
      const name = cleanText(data.name, 100);
      const url = normalizeUrl(data.url);
      if (!name || !url) {
        return json({ error: '站点名称或 URL 无效（仅支持 http/https）' }, 400);
      }
      const site = {
        id: Date.now().toString(),
        name,
        url,
        category: cleanText(data.category, 50),
        createdAt: new Date().toISOString()
      };
      sites.push(site);
      await env.NAV_SITES.put('all_sites', JSON.stringify(sites));
      return json(site, 201);
    }

    // DELETE 请求 - 删除站点
    if (method === 'DELETE') {
      const { ids } = await request.json();
      if (!Array.isArray(ids) || ids.length === 0) {
        return json({ error: 'ids 必须是非空数组' }, 400);
      }
      const idSet = new Set(ids);
      const sites = await readSites(env);
      const filteredSites = sites.filter(site => !idSet.has(site.id));
      await env.NAV_SITES.put('all_sites', JSON.stringify(filteredSites));
      return json(filteredSites);
    }

    // PUT 请求 - 更新站点：在原记录上合并允许修改的字段
    if (method === 'PUT') {
      const data = await request.json();
      const sites = await readSites(env);
      const index = sites.findIndex(site => site.id === data.id);
      if (index === -1) {
        return json({ error: '站点不存在' }, 404);
      }
      const name = cleanText(data.name, 100);
      const url = normalizeUrl(data.url);
      if (!name || !url) {
        return json({ error: '站点名称或 URL 无效（仅支持 http/https）' }, 400);
      }
      sites[index] = { ...sites[index], name, url, category: cleanText(data.category, 50) };
      await env.NAV_SITES.put('all_sites', JSON.stringify(sites));
      return json(sites);
    }
  } catch (error) {
    return json({ error: error.message }, 500);
  }

  // 不支持的请求方法
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { 'Allow': 'GET, POST, PUT, DELETE' }
  });
}
