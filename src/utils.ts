import { USDC_DECIMALS } from './config'

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatUsdc(raw: bigint): string {
  const n = Number(raw) / 10 ** USDC_DECIMALS
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseUsdc(s: string): bigint {
  const n = parseFloat(s)
  if (isNaN(n) || n <= 0) throw new Error('Invalid amount')
  return BigInt(Math.round(n * 10 ** USDC_DECIMALS))
}

export function formatDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function parseOnchainError(err: unknown): string {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || (err as { code?: number })?.code === 4001) return 'Cancelled.'
  if (msg.includes('insufficient')) return 'Insufficient USDC balance or allowance.'
  if (msg.includes('notactive')) return 'Order is no longer active.'
  if (msg.includes('notclient')) return 'Only the client can do this.'
  if (msg.includes('notmaker')) return 'Only the maker can do this.'
  if (msg.includes('deadlinenotpassed')) return 'Deadline has not passed yet.'
  if (msg.includes('mustbefunded')) return 'Order must be in Funded status.'
  if (msg.includes('silenceperiodnotover')) return 'The 7-day silence period is not over yet.'
  if (msg.includes('notdelivered')) return 'Order has not been marked delivered.'
  if (msg.includes('notfunded')) return 'Order is not in Funded status.'
  if (msg.includes('deadlinepassedfordelivery')) return 'The delivery deadline has already passed.'
  if (msg.includes('reverted')) return 'Transaction failed. Check order status and try again.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error. Please try again.'
  return 'Something went wrong. Please try again.'
}
