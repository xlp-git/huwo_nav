const DEFAULT_SETTINGS = {
  browserTitle: '小鹏导航',
  headerTitle: '我的个人网址导航',
  rememberCategory: false,
}

// 只保存已知字段，防止写入任意内容
function sanitize(input) {
  const settings = { ...DEFAULT_SETTINGS }
  if (typeof input?.browserTitle === 'string' && input.browserTitle.trim()) {
    settings.browserTitle = input.browserTitle.trim().slice(0, 100)
  }
  if (typeof input?.headerTitle === 'string' && input.headerTitle.trim()) {
    settings.headerTitle = input.headerTitle.trim().slice(0, 100)
  }
  settings.rememberCategory = Boolean(input?.rememberCategory)
  return settings
}

export async function onRequest(context) {
  const { request, env } = context
  const method = request.method

  if (method === 'GET') {
    try {
      const raw = await env.NAV_SITES.get('app_settings')
      const settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
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

  if (method === 'PUT') {
    try {
      const settings = sanitize(await request.json())
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
