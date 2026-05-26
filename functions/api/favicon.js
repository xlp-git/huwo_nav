export async function onRequest(context) {
  const url = new URL(context.request.url)
  const domain = url.searchParams.get('domain')

  if (!domain) {
    return new Response(JSON.stringify({ error: 'domain required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const resp = await fetch(`https://${domain}/`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FaviconBot/1.0)' },
      redirect: 'follow',
    })

    const html = await resp.text()

    const linkRegex = /<link[^>]*\srel=["']([^"']*icon[^"']*)["'][^>]*\shref=["']([^"']+)["'][^>]*>/gi
    let match
    const icons = []

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[2]
      let resolved = href
      if (href.startsWith('/')) {
        resolved = `https://${domain}${href}`
      } else if (!href.startsWith('http')) {
        resolved = `https://${domain}/${href}`
      }
      if (resolved.endsWith('.svg')) {
        icons.unshift({ url: resolved })
      } else {
        icons.push({ url: resolved })
      }
    }

    if (icons.length > 0) {
      return new Response(JSON.stringify({ url: icons[0].url }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }
  } catch { /* page fetch failed */ }

  return new Response(JSON.stringify({ url: `https://${domain}/favicon.ico` }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
