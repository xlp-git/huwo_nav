// /api/* 统一鉴权：GET/HEAD 放行，其余写请求必须携带正确的编辑密码。
// 密码只保存在 Cloudflare Pages 环境变量 EDIT_PASSWORD 中，前端不再内置。
// 请求头 X-Edit-Password 为 encodeURIComponent 编码后的密码（支持中文等非 ASCII 字符）。

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function digest(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return new Uint8Array(buf)
}

// 比较摘要而非原文，长度固定，逐字节异或避免提前返回
async function safeEqual(a, b) {
  const [da, db] = await Promise.all([digest(a), digest(b)])
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i]
  return diff === 0
}

export async function onRequest(context) {
  const { request, env, next } = context
  if (READ_METHODS.has(request.method)) return next()

  const expected = env.EDIT_PASSWORD
  if (!expected) {
    return json({ error: '服务端未配置 EDIT_PASSWORD，已拒绝写入' }, 503)
  }

  let given = ''
  try {
    given = decodeURIComponent(request.headers.get('X-Edit-Password') || '')
  } catch {
    given = ''
  }
  if (!given || !(await safeEqual(given, expected))) {
    return json({ error: '密码错误或编辑登录已失效' }, 401)
  }
  return next()
}
