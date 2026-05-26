const DEFAULT_SETTINGS = {
  browserTitle: '小鹏导航',
  headerTitle: '我的个人网址导航',
  rememberCategory: false,
  savedCategory: '',
}

export async function onRequest(context) {
  const { request, env } = context
  const method = request.method

  if (method === 'GET') {
    try {
      const raw = await env.NAV_SITES.get('app_settings')
      const settings = raw ? JSON.parse(raw) : DEFAULT_SETTINGS
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
      const settings = await request.json()
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
