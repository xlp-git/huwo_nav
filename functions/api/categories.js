// 分类管理：分类不单独存储，而是站点记录上的 category 字段，这里批量改写后一次写回 KV
// PUT    { from, to }                     重命名分类
// DELETE { name, mode: 'move' | 'delete' } 删除分类：move = 站点移到未分类，delete = 连同站点删除

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

function cleanName(value) {
  return String(value ?? '').trim().slice(0, 50);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method;

  try {
    if (method === 'PUT') {
      const data = await request.json();
      const from = cleanName(data.from);
      const to = cleanName(data.to);
      if (!from || !to) {
        return json({ error: '分类名称不能为空' }, 400);
      }
      const sites = await readSites(env);
      if (!sites.some(site => site.category === from)) {
        return json({ error: '分类不存在' }, 404);
      }
      if (from !== to && sites.some(site => site.category === to)) {
        return json({ error: `分类「${to}」已存在` }, 409);
      }
      const updated = sites.map(site => {
        if (site.category !== from) return site;
        return site.isPlaceholder
          ? { ...site, category: to, name: `分类占位: ${to}` }
          : { ...site, category: to };
      });
      await env.NAV_SITES.put('all_sites', JSON.stringify(updated));
      return json(updated);
    }

    if (method === 'DELETE') {
      const data = await request.json();
      const name = cleanName(data.name);
      if (!name || !['move', 'delete'].includes(data.mode)) {
        return json({ error: '参数无效' }, 400);
      }
      const sites = await readSites(env);
      if (!sites.some(site => site.category === name)) {
        return json({ error: '分类不存在' }, 404);
      }
      const updated = data.mode === 'delete'
        ? sites.filter(site => site.category !== name)
        : sites
          .filter(site => !(site.isPlaceholder && site.category === name))
          .map(site => (site.category === name ? { ...site, category: '' } : site));
      await env.NAV_SITES.put('all_sites', JSON.stringify(updated));
      return json(updated);
    }
  } catch (error) {
    return json({ error: error.message }, 500);
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: { 'Allow': 'PUT, DELETE' }
  });
}
