const supportedEvmChains = {
  'Robinhood Chain': { slug: 'rhc', chainId: 4663 },
  Base: { slug: 'base', chainId: 8453 },
}
export const chainIds = Object.fromEntries(Object.entries(supportedEvmChains).map(([name, chain]) => [name, chain.slug]))
export const launchChainIds = Object.fromEntries(Object.entries(supportedEvmChains).map(([name, chain]) => [name, chain.chainId]))
const numericChainIds = Object.fromEntries(Object.values(supportedEvmChains).map(({ slug, chainId }) => [slug, chainId]))

const defaultEndpoint = '/api/slipway'

function apiRoot(endpoint) {
  const value = endpoint?.trim() || defaultEndpoint
  let base
  try {
    base = new URL(value, typeof window === 'undefined' ? undefined : window.location.origin)
  } catch {
    throw new Error('Enter a valid Slipway API endpoint.')
  }
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('Use an HTTPS endpoint.')
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('Enter the service URL without credentials, query parameters or fragments.')
  }
  if (typeof window !== 'undefined' && base.origin !== window.location.origin) {
    throw new Error('Use the same-origin /api/slipway endpoint so requests stay on Slipway’s server stack.')
  }
  base.pathname = base.pathname.replace(/\/+$/, '')
  if (base.pathname.endsWith('/v1')) base.pathname = base.pathname.slice(0, -3)
  if (typeof window !== 'undefined' && base.pathname.replace(/\/$/, '') !== '/api/slipway') {
    throw new Error('Use /api/slipway as the frontend API endpoint.')
  }
  return base.href.replace(/\/$/, '')
}

function apiUrl(root, path, query = '') {
  const url = new URL(root)
  const params = new URLSearchParams(query)
  if (typeof window !== 'undefined' && url.origin === window.location.origin && url.pathname === '/api/slipway') {
    url.searchParams.set('path', path)
    for (const [key, value] of params) url.searchParams.append(key, value)
    return url.href
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${path}`
  url.search = params.toString()
  return url.href
}

async function readJson(response) {
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('The service returned an unreadable response.')
  }
  if (!response.ok) {
    const error = new Error(typeof data.message === 'string' ? data.message : typeof data.error === 'string' ? data.error : `The service returned ${response.status}.`)
    error.status = response.status
    throw error
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The service returned an incomplete response.')
  }
  return data
}

export function isTokenAddress(address, chain) {
  if (typeof address !== 'string' || !Object.hasOwn(chainIds, chain)) return false
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

export function quoteRequest(values, settings) {
  if (!isTokenAddress(values.token, values.chain)) throw new Error('Enter a valid public token address for this chain.')
  if (!Number.isFinite(+values.amount) || +values.amount <= 0) throw new Error('Enter an amount greater than zero.')
  return {
    chain: chainIds[values.chain],
    token: values.token,
    side: values.side.toLowerCase(),
    ...(values.quoteAsset ? { quoteAsset: values.quoteAsset } : {}),
    amount: values.amount,
    amountType: 'in',
    slippageBps: Math.round(settings.slippage * 100),
  }
}

export function formatTokenAmount(value, significantDigits = 6) {
  const text = String(value ?? '')
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text || '—'
  const [whole, fraction = ''] = text.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  const wholeSignificant = normalizedWhole === '0' ? 0 : normalizedWhole.length
  let fractionDigits
  if (wholeSignificant) fractionDigits = Math.max(0, significantDigits - wholeSignificant)
  else {
    const firstNonZero = fraction.search(/[1-9]/)
    fractionDigits = firstNonZero < 0 ? 0 : firstNonZero + significantDigits
  }
  const displayedFraction = fraction.slice(0, Math.min(fraction.length, fractionDigits, 18)).replace(/0+$/, '')
  return displayedFraction ? `${normalizedWhole}.${displayedFraction}` : normalizedWhole
}

export async function request(endpoint, path, body) {
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, `v1/${path}`), {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The service took too long to respond. Try again.' : 'Could not reach your Slipway service.')
  })
  return readJson(response)
}

export function launchQuoteRequest(endpoint, values) {
  const chain = launchChainIds[values.chain]
  if (!chain) throw new Error('Choose a supported launch chain.')
  return request(endpoint, 'launch/quote', { ...values, chain })
}

export function launchQuoteMatches(quote, { chain, venue, wallet }) {
  const expectedChainId = launchChainIds[chain]
  return Boolean(quote && expectedChainId && typeof wallet === 'string'
    && quote.chain === expectedChainId && quote.chainId === expectedChainId
    && quote.venue === venue && typeof quote.wallet === 'string'
    && quote.wallet.toLowerCase() === wallet.toLowerCase())
}

export function evmBuildMatches(build, { chain, wallet }) {
  const expectedChainId = launchChainIds[chain]
  return Boolean(build && expectedChainId && typeof wallet === 'string'
    && build.chain === chainIds[chain] && build.chainId === expectedChainId
    && typeof build.wallet === 'string' && build.wallet.toLowerCase() === wallet.toLowerCase()
    && Array.isArray(build.payloads) && build.payloads.length > 0
    && build.payloads.every((payload) => payload?.kind === 'evm_transaction' && payload.chainId === expectedChainId
      && typeof payload.from === 'string' && payload.from.toLowerCase() === wallet.toLowerCase()))
}

export async function uploadTokenImage(endpoint, image, token) {
  if (typeof image !== 'string' || !/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
    || image.length > 2_800_000) {
    throw new Error('Choose a PNG, JPG, GIF or WebP image up to 2 MB.')
  }
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('Connect a wallet to upload a token image.')
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, 'v1/media/images'), {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ image }),
    signal: AbortSignal.timeout(60_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'Image upload timed out. Try again.' : 'Could not reach Slipway image storage.')
  })
  const result = await readJson(response)
  if (typeof result.url !== 'string' || !result.url.startsWith('https://res.cloudinary.com/')) {
    throw new Error('Image storage returned an invalid image URL.')
  }
  return result
}

export async function checkBackend(endpoint) {
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, 'health'), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The backend check timed out.' : 'Could not reach the Slipway backend.')
  })
  return readJson(response)
}

export async function marketRequest(endpoint, path, signal) {
  if (typeof path !== 'string' || path.startsWith('/') || path.includes('..')) {
    throw new Error('Choose a valid market data path.')
  }
  const root = apiRoot(endpoint)
  const timeout = AbortSignal.timeout(15_000)
  const requestSignal = signal && typeof AbortSignal.any === 'function'
    ? AbortSignal.any([signal, timeout])
    : timeout
  const [marketPath, query = ''] = path.split('?', 2)
  const response = await fetch(apiUrl(root, `v1/market/${marketPath}`, query), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: requestSignal,
  }).catch((error) => {
    if (error.name === 'AbortError') throw error
    throw new Error(error.name === 'TimeoutError' ? 'Market data took too long to respond.' : 'Could not reach Slipway market data.')
  })
  return readJson(response)
}

export async function submitTransaction(endpoint, chain, signedTransaction) {
  if (!['rhc', 'base'].includes(chain) || typeof signedTransaction !== 'string' || !/^0x(?:[a-fA-F0-9]{2}){1,100000}$/.test(signedTransaction)) {
    throw new Error('Provide a supported chain and signed EVM transaction.')
  }
  return request(endpoint, 'transactions/submit', { chain, signedTransaction })
}

export async function getTransactionStatus(endpoint, chain, hash) {
  if (!['rhc', 'base'].includes(chain) || typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) {
    throw new Error('Provide a supported chain and valid transaction hash.')
  }
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, `v1/transactions/${chain}/${hash}`), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'Transaction status took too long to respond.' : 'Could not reach Slipway transaction tracking.')
  })
  return readJson(response)
}

export async function submitBuiltTransactions(endpoint, build, provider = globalThis.window?.ethereum, onStatus = () => {}, pollIntervalMs = 2_000) {
  if (!provider?.request || !build || !Object.hasOwn(numericChainIds, build.chain) || numericChainIds[build.chain] !== build.chainId
    || typeof build.wallet !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(build.wallet)
    || !Array.isArray(build.payloads) || !build.payloads.length
    || !build.payloads.every((payload) => payload?.kind === 'evm_transaction' && payload.chainId === build.chainId
      && typeof payload.from === 'string' && payload.from.toLowerCase() === build.wallet.toLowerCase())) {
    throw new Error('Connect an EVM wallet and build a valid Slipway transaction first.')
  }
  const expectedChainId = `0x${Number(build.chainId).toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expectedChainId }] })
  } catch (error) {
    if (error?.code !== 4902) throw error
    const chain = build.chain === 'base'
      ? { chainId: expectedChainId, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }
      : { chainId: expectedChainId, chainName: 'Robinhood Chain', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'], blockExplorerUrls: ['https://robinhoodchain.blockscout.com'] }
    await provider.request({ method: 'wallet_addEthereumChain', params: [chain] })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expectedChainId }] })
  }
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  if (!Array.isArray(accounts) || !accounts.some((account) => typeof account === 'string' && account.toLowerCase() === build.wallet.toLowerCase())) {
    throw new Error('The connected wallet does not match the wallet used to build this transaction.')
  }
  const results = []
  for (const payload of build.payloads) {
    if (payload.kind !== 'evm_transaction' || payload.chainId !== build.chainId || typeof payload.from !== 'string' || payload.from.toLowerCase() !== build.wallet.toLowerCase()
      || !/^0x[a-fA-F0-9]{40}$/.test(payload.to) || !/^0x(?:[a-fA-F0-9]{2})*$/.test(payload.data)
      || !/^0x[0-9a-fA-F]+$/.test(payload.value)) {
      throw new Error('The unsigned transaction payload is invalid or does not match this wallet and chain.')
    }
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: build.wallet, to: payload.to, value: payload.value, data: payload.data }] })
    if (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new Error('The wallet returned an invalid transaction hash.')
    onStatus({ purpose: payload.purpose, hash, status: 'submitted' })
    let status = { status: 'pending' }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      status = await getTransactionStatus(endpoint, build.chain, hash)
      onStatus({ purpose: payload.purpose, hash, status: status.status })
      if (status.status === 'confirmed' || status.status === 'reverted') break
    }
    results.push({ purpose: payload.purpose, hash, status: status.status })
    if (status.status === 'reverted') throw new Error(`The ${payload.purpose.replaceAll('_', ' ')} transaction reverted (${hash}).`)
    if (status.status !== 'confirmed') throw new Error(`The ${payload.purpose.replaceAll('_', ' ')} transaction is still pending (${hash}).`)
  }
  return results
}

export async function getEvents(endpoint, { after = 0, chain, types, wallet, limit = 100 } = {}) {
  if (!Number.isSafeInteger(Number(after)) || Number(after) < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500
    || (chain !== undefined && !['rhc', 'base'].includes(chain))
    || (wallet !== undefined && (typeof wallet !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(wallet)))
    || (types !== undefined && (!Array.isArray(types) || types.length > 3 || types.some((type) => !['token.launched', 'pool.graduated', 'pool.initialized'].includes(type))))) {
    throw new Error('Provide valid event feed filters.')
  }
  const query = new URLSearchParams({ after: String(after), limit: String(limit) })
  if (chain) query.set('chain', chain)
  if (wallet) query.set('wallet', wallet)
  if (types?.length) query.set('types', types.join(','))
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, 'v1/events', query.toString()), {
    method: 'GET',
    credentials: 'omit',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The event feed took too long to respond.' : 'Could not reach Slipway event feed.')
  })
  return readJson(response)
}

export async function resolveToken(endpoint, chain, address) {
  if (!Object.hasOwn(chainIds, chain) || !isTokenAddress(address, chain)) {
    throw new Error('Enter a valid public token address for the selected chain.')
  }
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, `v1/tokens/${chainIds[chain]}/${encodeURIComponent(address)}`), {
    method: 'GET',
    credentials: 'omit',
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'The service took too long to respond. Try again.' : 'Could not reach your Slipway service.')
  })
  const data = await readJson(response)
  if (typeof data.venue !== 'string' || typeof data.phase !== 'string') {
    throw new Error('The service returned an incomplete token route.')
  }
  return data
}


async function workspaceRequest(endpoint, method, token, body, action = '') {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('Sign with your wallet to access its workspace.')
  const root = apiRoot(endpoint)
  const response = await fetch(apiUrl(root, `v1/workspace${action}`), {
    method,
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  }).catch((error) => {
    throw new Error(error.name === 'TimeoutError' ? 'Wallet workspace sync timed out.' : 'Could not reach your Slipway workspace service.')
  })
  return readJson(response)
}

export async function createWorkspaceSession(endpoint, wallet, chainId, signMessage) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet) || ![4663, 8453].includes(chainId) || typeof signMessage !== 'function') throw new Error('Connect a wallet on Base or Robinhood Chain to sync your workspace.')
  const challenge = await request(endpoint, 'workspace/challenge', { wallet, chainId })
  if (challenge.wallet?.toLowerCase() !== wallet.toLowerCase() || challenge.chainId !== chainId || typeof challenge.message !== 'string' || typeof challenge.nonce !== 'string') {
    throw new Error('The service returned an invalid wallet challenge.')
  }
  const signature = await signMessage({ message: challenge.message })
  const session = await request(endpoint, 'workspace/verify', { wallet, nonce: challenge.nonce, signature })
  if (session.wallet?.toLowerCase() !== wallet.toLowerCase() || typeof session.token !== 'string' || !/^[a-f0-9]{64}$/i.test(session.token)) {
    throw new Error('The service returned an invalid wallet workspace session.')
  }
  return session
}

export async function getCloudWorkspace(endpoint, token) {
  return workspaceRequest(endpoint, 'GET', token)
}

export async function putCloudWorkspace(endpoint, token, { drafts, watches }) {
  return workspaceRequest(endpoint, 'PUT', token, { drafts, watches })
}

export async function revokeWorkspaceSession(endpoint, token) {
  return workspaceRequest(endpoint, 'POST', token, undefined, '/revoke')
}
