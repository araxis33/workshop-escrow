import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { NetworkConfig } from '../config'

interface Props {
  targetNetwork: NetworkConfig
}

export function NetworkBanner({ targetNetwork }: Props) {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === targetNetwork.chainId) return null

  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-4"
      style={{ background: 'rgba(180,43,76,0.06)', border: '1px solid rgba(180,43,76,0.18)' }}
    >
      <AlertTriangle className="size-4 flex-shrink-0" style={{ color: 'var(--danger)' }} />
      <p className="text-xs flex-1" style={{ color: 'var(--danger)' }}>
        Wrong network. Switch to {targetNetwork.name} to interact.
      </p>
      <button
        onClick={() => switchChain({ chainId: targetNetwork.chainId })}
        disabled={isPending}
        className="text-xs font-semibold px-3 py-1.5 rounded-xl transition-opacity disabled:opacity-50"
        style={{ background: 'var(--danger)', color: '#fff' }}
      >
        {isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          `Switch to ${targetNetwork.shortName}`
        )}
      </button>
    </div>
  )
}
