const routes = [
  { method: 'GET', pattern: /^health$/ },
  { method: 'GET', pattern: /^v1\/$/ },
  { method: 'GET', pattern: /^v1\/x402\/supported$/ },
  { method: 'GET', pattern: /^v1\/tokens\/(rhc|base)\/[A-Za-z0-9]+$/ },
  { method: 'GET', pattern: /^v1\/market\/(networks(\/(robinhood|base))?\/trending_pools|search\/pools|networks\/(robinhood|base)\/pools\/[A-Za-z0-9]{32,64}(\/ohlcv\/(minute|hour|day))?)$/ },
  { method: 'GET', pattern: /^v1\/market\/networks\/(robinhood|base)\/tokens\/multi\/0x[a-fA-F0-9]{40}(,0x[a-fA-F0-9]{40}){0,29}$/ },
  { method: 'POST', pattern: /^v1\/transactions\/submit$/ },
  { method: 'POST', pattern: /^v1\/media\/images$/ },
  { method: 'GET', pattern: /^v1\/transactions\/(rhc|base)\/0x[a-fA-F0-9]{64}$/ },
  { method: 'GET', pattern: /^v1\/events$/ },
  { method: 'GET', pattern: /^v1\/workspace\/?$/ },
  { method: 'PUT', pattern: /^v1\/workspace\/?$/ },
  { method: 'POST', pattern: /^v1\/workspace\/(challenge|verify)$/ },
  { method: 'POST', pattern: /^v1\/workspace\/revoke$/ },
  { method: 'POST', pattern: /^v1\/(quote|build\/trade|launch\/quote|build\/launch)$/ },
  { method: 'POST', pattern: /^v1\/x402\/(verify|settle)$/ },
]

export default async function handler(request, response) {
  const incoming = new URL(request.url, 'http://localhost')
  const paths = incoming.searchParams.getAll('path')
  const path = paths.length === 1 ? paths[0] : ''
  const method = request.method || 'GET'

  if (!path || !routes.some((route) => route.method === method && route.pattern.test(path))) {
    return response.status(404).json({ error: 'Slipway API route not found' })
  }

  const configuredUrl = process.env.SLIPWAY_API_URL?.trim()
  if (!configuredUrl) {
    return response.status(503).json({ error: 'Slipway API is not configured on this deployment' })
  }

  let target
  try {
    const root = new URL(configuredUrl)
    if (!['http:', 'https:'].includes(root.protocol)) throw new Error('invalid protocol')
    root.pathname = `${root.pathname.replace(/\/$/, '')}/${path}`
    incoming.searchParams.delete('path')
    root.search = incoming.searchParams.toString()
    target = root
  } catch {
    return response.status(503).json({ error: 'Slipway API configuration is invalid' })
  }

  const headers = new Headers({ accept: 'application/json' })
  if (request.headers['content-type']) headers.set('content-type', request.headers['content-type'])
  if (request.headers.authorization) headers.set('authorization', request.headers.authorization)
  // Replace any client-supplied value; Vercel supplies x-real-ip at its edge.
  const realIp = request.headers['x-real-ip']
  const forwardedFor = request.headers['x-forwarded-for']
  const clientIp = (typeof realIp === 'string' && realIp.trim())
    || (typeof forwardedFor === 'string' && forwardedFor.split(',').at(-1)?.trim())
    || 'unknown'
  headers.set('x-slipway-client-ip', clientIp.slice(0, 128))
  if (path !== 'health' && path !== 'health/') {
    const apiKey = process.env.API_KEY?.trim()
    if (!apiKey) return response.status(503).json({ error: 'Slipway API authentication is not configured on this deployment' })
    headers.set('x-api-key', apiKey)
  }

  try {
    const upstream = await fetch(target, {
      method,
      headers,
      body: method === 'GET' ? undefined : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {}),
      signal: AbortSignal.timeout(25_000),
    })
    response.status(upstream.status)
    response.setHeader('content-type', upstream.headers.get('content-type') || 'application/json')
    const cacheControl = upstream.headers.get('cache-control')
    if (cacheControl) response.setHeader('cache-control', cacheControl)
    return response.send(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    return response.status(502).json({ error: 'Slipway API could not be reached' })
  }
}
