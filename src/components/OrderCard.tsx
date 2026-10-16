import { useState, useMemo } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ExternalLink, Loader2, CheckCircle } from 'lucide-react'
import type { Abi } from 'viem'
import { Order, OrderStatus, statusLabel, statusColor } from '../types'
import { NetworkConfig, WORKSHOP_ESCROW_ABI } from '../config'
import { formatUsdc, formatAddress, formatDate, parseOnchainError } from '../utils'

const ESCROW_ABI = WORKSHOP_ESCROW_ABI as Abi

interface Props {
  order: Order
  network: NetworkConfig
  role: 'client' | 'maker'
  onAction?: () => void
}

interface Action {
  fn: string
  label: string
  description: string
  style: 'primary' | 'danger' | 'ghost'
}

function getActions(order: Order, role: 'client' | 'maker', now: number): Action[] {
  const actions: Action[] = []
  const deliverByPassed = now > Number(order.deliverBy)
  const silencePassed = order.deliveredAt > 0n && now > Number(order.deliveredAt) + 7 * 86400

  if (role === 'client') {
    if (order.status === OrderStatus.Funded || order.status === OrderStatus.Delivered) {
      actions.push({
        fn: 'release',
        label: 'Release payment',
        description: 'Send the advance to the maker. Do this once you are happy with the result.',
        style: 'primary',
      })
    }
    if (order.status === OrderStatus.Funded && deliverByPassed) {
      actions.push({
        fn: 'reclaim',
        label: 'Reclaim advance',
        description: 'The deadline passed without delivery. Get your money back.',
        style: 'danger',
      })
    }
  }

  if (role === 'maker') {
    if (order.status === OrderStatus.Funded) {
      actions.push({
        fn: 'markDelivered',
        label: 'Mark delivered',
        description: 'Confirm you have handed over the finished work.',
        style: 'primary',
      })
    }
    if (order.status === OrderStatus.Funded || order.status === OrderStatus.Delivered) {
      actions.push({
        fn: 'refund',
        label: 'Refund client',
        description: 'Cancel the job and return the advance to the client.',
        style: 'danger',
      })
    }
    if (order.status === OrderStatus.Delivered && silencePassed) {
      actions.push({
        fn: 'claimAfterSilence',
        label: 'Claim after 7 days',
        description: 'The client has not responded for 7 days. Claim the payment.',
        style: 'primary',
      })
    }
  }

  return actions
}

export function OrderCard({ order, network, role, onAction }: Props) {
  const { address, chainId } = useAccount()
  const isWrongChain = chainId !== network.chainId
  const [pendingFn, setPendingFn] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState(false)

  const { writeContractAsync } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  if (isSuccess && !done) {
    setDone(true)
    setTxHash(undefined)
    setPendingFn(null)
    onAction?.()
  }

  const now = useNow()
  const actions = getActions(order, role, now)
  const otherParty = role === 'client' ? order.maker : order.client
  const otherLabel = role === 'client' ? 'Maker' : 'Client'

  const otherAddress = role === 'client' ? order.maker : order.client
  const isMe = address?.toLowerCase() === otherAddress.toLowerCase()

  async function handleAction(fn: string) {
    if (!address) return
    setErrorMsg('')
    setPendingFn(fn)
    try {
      const hash = await writeContractAsync({
        address: network.escrowAddress as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: fn,
        args: [order.id],
        chainId: network.chainId,
      })
      setTxHash(hash)
    } catch (err) {
      setErrorMsg(parseOnchainError(err))
      setPendingFn(null)
    }
  }

  return (
    <div className="rounded-3xl p-4 space-y-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{order.title}</p>
          <p className="mono text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            #{order.id.toString()}
          </p>
        </div>
        <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor(order.status)}`}>
          {statusLabel(order.status)}
        </span>
      </div>

      {/* Details row */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Detail label="Amount">
          <span className="display font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>
            ${formatUsdc(order.amount)} <span className="font-normal text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
          </span>
        </Detail>
        <Detail label="Deliver by">
          <span style={{ color: 'var(--ink)' }}>{formatDate(order.deliverBy)}</span>
        </Detail>
        <Detail label={otherLabel}>
          <span className="mono" style={{ color: isMe ? 'var(--accent-hover)' : 'var(--ink)' }}>
            {isMe ? 'You' : formatAddress(otherParty)}
          </span>
        </Detail>
        {order.deliveredAt > 0n && (
          <Detail label="Delivered at">
            <span style={{ color: 'var(--ink)' }}>{formatDate(order.deliveredAt)}</span>
          </Detail>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.07)', color: 'var(--danger)' }}>
          {errorMsg}
        </p>
      )}

      {/* Success receipt */}
      {done && txHash && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(26,128,71,0.07)' }}>
          <CheckCircle className="size-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
          <a
            href={`${network.explorer}/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1"
            style={{ color: 'var(--success)' }}
          >
            Done — view on explorer <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {/* Action buttons */}
      {!isWrongChain && actions.length > 0 && (
        <div className="space-y-2 pt-1">
          {actions.map((action) => {
            const isBusy = pendingFn === action.fn || (pendingFn === action.fn && isConfirming)
            return (
              <div key={action.fn}>
                <button
                  onClick={() => { void handleAction(action.fn) }}
                  disabled={!!pendingFn || isConfirming}
                  className="w-full rounded-xl py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    background: action.style === 'primary' ? 'var(--accent)' : action.style === 'danger' ? 'var(--danger)' : 'var(--surface-muted)',
                    color: action.style === 'ghost' ? 'var(--ink)' : '#fff',
                    border: action.style === 'ghost' ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {isBusy ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" />
                      {isConfirming ? 'Confirming…' : 'Confirm in wallet…'}
                    </span>
                  ) : action.label}
                </button>
                <p className="text-xs mt-1 px-0.5" style={{ color: 'var(--subtle)' }}>
                  {action.description}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--subtle)', letterSpacing: '0.06em', fontSize: '0.65rem' }}>{label}</p>
      <div className="text-xs" style={{ color: 'var(--ink-2)' }}>{children}</div>
    </div>
  )
}

// Module-level constant — computed once at load time, acceptable for deadline comparisons
const MODULE_LOAD_TS = Math.floor(Date.now() / 1000)

function useNow(): number {
  return useMemo(() => MODULE_LOAD_TS, [])
}
