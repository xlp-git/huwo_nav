const DEFAULT_SETTINGS = {
  browserTitle: '小鹏导航',
  headerTitle: '我的个人网址导航',
  rememberCategory: false,
  categoryOrder: [],
  // 记录分类开启时的"上次查看的分类"：'' = 无记录，'__all__' = 全部，其余为分类名（含 '__uncategorized__'）
  savedCategory: '',
}

// 只合并已知字段：请求里没带的字段保留原值（例如只保存分类顺序时不会清空标题），未知字段丢弃
function merge(base, input) {
  const settings = { ...base }
  if (typeof input?.browserTitle === 'string' && input.browserTitle.trim()) {
    settings.browserTitle = input.browserTitle.trim().slice(0, 100)
  }
  if (typeof input?.headerTitle === 'string' && input.headerTitle.trim()) {
    settings.headerTitle = input.headerTitle.trim().slice(0, 100)
  }
  if (input && 'rememberCategory' in input) {
    settings.rememberCategory = Boolean(input.rememberCategory)
  }
  if (Array.isArray(input?.categoryOrder)) {
    const names = input.categoryOrder
      .filter(name => typeof name === 'string')
      .map(name => name.trim().slice(0, 50))
      .filter(Boolean)
    settings.categoryOrder = [...new Set(names)].slice(0, 500)
  }
  if (typeof input?.savedCategory === 'string') {
    settings.savedCategory = input.savedCategory.trim().slice(0, 50)
  }
  return settings
}

export async function readSettings(env) {
  const raw = await env.NAV_SITES.get('app_settings')
  return merge(DEFAULT_SETTINGS, raw ? JSON.parse(raw) : {})
}

export async function onRequest(context) {
  const { request, env } = context
  const method = request.method

  if (method === 'GET') {
    try {
      return new Response(JSON.stringify(await readSettings(env)), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (method === 'PUT') {
    try {
      const settings = merge(await readSettings(env), await request.json())
      await env.NAV_SITES.put('app_settings', JSON.stringify(settings))
      return new Response(JSON.stringify(settings), {
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response('Method Not Allowed', {
    status: 405,
    headers: { 'Allow': 'GET, PUT' },
  })
}
