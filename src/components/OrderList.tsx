import { useAccount } from 'wagmi'
import { useOrdersOf, useOrders } from '../hooks/useEscrow'
import { parseOrder } from '../hooks/useEscrow'
import { OrderCard } from './OrderCard'
import { NetworkConfig } from '../config'
import { Loader2 } from 'lucide-react'

interface Props {
  network: NetworkConfig
  role: 'client' | 'maker'
  onAction?: () => void
}

export function OrderList({ network, role, onAction }: Props) {
  const { address } = useAccount()
  const escrowAddress = network.escrowAddress as `0x${string}`

  const { data: ids, isLoading: isLoadingIds, refetch: refetchIds } = useOrdersOf(
    escrowAddress,
    network.chainId,
    address,
    role,
  )

  const orderedIds = (ids as bigint[] | undefined)?.slice().reverse() ?? []

  const { data: ordersData, isLoading: isLoadingOrders, refetch: refetchOrders } = useOrders(
    escrowAddress,
    network.chainId,
    orderedIds,
  )

  function handleAction() {
    void refetchIds()
    void refetchOrders()
    onAction?.()
  }

  if (!address) {
    return (
      <EmptyState text="Connect your wallet to see your orders." />
    )
  }

  if (!network.escrowAddress) {
    return <EmptyState text="Contract not yet deployed on this network." />
  }

  if (isLoadingIds || isLoadingOrders) {
    return (
      <div className="flex items-center justify-center py-10 gap-2" style={{ color: 'var(--subtle)' }}>
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Loading orders…</span>
      </div>
    )
  }

  if (!orderedIds.length) {
    return (
      <EmptyState
        text={role === 'client'
          ? 'No orders yet. Create one above to lock an advance.'
          : 'No orders assigned to you as maker yet.'}
      />
    )
  }

  const orders = ordersData
    ?.map((r, i) => r.status === 'success' && r.result ? parseOrder(r.result as Parameters<typeof parseOrder>[0], orderedIds[i]) : null)
    .filter(Boolean)

  if (!orders?.length) {
    return <EmptyState text="Could not load orders." />
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => order && (
        <OrderCard key={order.id.toString()} order={order} network={network} role={role} onAction={handleAction} />
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl px-4 py-8 text-center" style={{ background: 'var(--surface-muted)' }}>
      <p className="text-sm" style={{ color: 'var(--subtle)' }}>{text}</p>
    </div>
  )
}
