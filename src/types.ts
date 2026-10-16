export enum OrderStatus {
  Funded = 0,
  Delivered = 1,
  Released = 2,
  Refunded = 3,
  Reclaimed = 4,
}

export interface Order {
  id: bigint
  client: `0x${string}`
  maker: `0x${string}`
  amount: bigint
  deliverBy: bigint
  deliveredAt: bigint
  status: OrderStatus
  title: string
}

export function statusLabel(s: OrderStatus): string {
  switch (s) {
    case OrderStatus.Funded: return 'Active'
    case OrderStatus.Delivered: return 'Delivered'
    case OrderStatus.Released: return 'Released'
    case OrderStatus.Refunded: return 'Refunded'
    case OrderStatus.Reclaimed: return 'Reclaimed'
  }
}

export function statusColor(s: OrderStatus): string {
  switch (s) {
    case OrderStatus.Funded: return 'bg-blue-50 text-blue-700'
    case OrderStatus.Delivered: return 'bg-amber-50 text-amber-700'
    case OrderStatus.Released: return 'bg-green-50 text-green-700'
    case OrderStatus.Refunded: return 'bg-slate-100 text-slate-600'
    case OrderStatus.Reclaimed: return 'bg-slate-100 text-slate-600'
  }
}
