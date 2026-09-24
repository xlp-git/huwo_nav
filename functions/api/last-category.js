// PUT { category } 记录"上次查看的分类"，各设备通用。
// 普通浏览时切换分类就要记录，所以这是唯一免编辑密码的写接口（_middleware.js 放行），
// 只能改 savedCategory 这一个字段；记录分类未开启时拒绝，值没变时不写 KV（免费版每天 1000 次写入）。
import { readSettings } from './settings.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function onRequest(context) {
  const { request, env } = context
  if (request.method !== 'PUT') {
    return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'PUT' } })
  }
  try {
    const data = await request.json()
    const category = typeof data?.category === 'string' ? data.category.trim().slice(0, 50) : ''
    if (!category) {
      return json({ error: '分类不能为空' }, 400)
    }
    const settings = await readSettings(env)
    if (!settings.rememberCategory) {
      return json({ error: '记录分类未开启' }, 409)
    }
    if (settings.savedCategory !== category) {
      settings.savedCategory = category
      await env.NAV_SITES.put('app_settings', JSON.stringify(settings))
    }
    return json(settings)
  } catch (error) {
    return json({ error: error.message }, 500)
  }
}
