import { useReadContract, useReadContracts } from 'wagmi'
import type { Abi } from 'viem'
import { WORKSHOP_ESCROW_ABI } from '../config'
import { Order } from '../types'

const ESCROW_ABI = WORKSHOP_ESCROW_ABI as Abi

export function useOrderCount(escrowAddress: `0x${string}`, chainId: number) {
  return useReadContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'orderCount',
    chainId,
    query: { refetchInterval: 8000 },
  })
}

export function useOrdersOf(
  escrowAddress: `0x${string}`,
  chainId: number,
  address: `0x${string}` | undefined,
  role: 'client' | 'maker',
) {
  return useReadContract({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: role === 'client' ? 'ordersOfClient' : 'ordersOfMaker',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: !!address,
      refetchInterval: 8000,
    },
  })
}

export function useOrders(
  escrowAddress: `0x${string}`,
  chainId: number,
  ids: bigint[],
) {
  const contracts = ids.map((id) => ({
    address: escrowAddress,
    abi: ESCROW_ABI,
    functionName: 'getOrder' as const,
    args: [id] as const,
    chainId,
  }))

  return useReadContracts({
    contracts,
    query: {
      enabled: ids.length > 0,
      refetchInterval: 8000,
    },
  })
}

export function parseOrder(raw: readonly [string, string, bigint, bigint, bigint, number, string], id: bigint): Order {
  return {
    id,
    client: raw[0] as `0x${string}`,
    maker: raw[1] as `0x${string}`,
    amount: raw[2],
    deliverBy: raw[3],
    deliveredAt: raw[4],
    status: raw[5],
    title: raw[6],
  }
}
