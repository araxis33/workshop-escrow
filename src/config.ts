/**
 * wagmi + contract configuration for Workshop Escrow
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import escrowArtifact from '../contracts/out/WorkshopEscrow.sol/WorkshopEscrow.json'

// Register chain with tracing only when running inside the Arc Studio sandbox
// (sandbox embeds the app in an iframe; outside that context this is a no-op)
if (typeof window !== 'undefined' && window.parent !== window) {
  // Dynamic import so the tracing module is tree-shaken in a standalone production build
  void import('./tracing').then(({ registerChain }) => {
    registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
  })
}

// Arc Mainnet chain definition (chain ID 5042)
export const arcMainnet = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.arc.io'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://explorer.arc.io' },
  },
} as const

export const config = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [arcMainnet.id]: http(),
    [mainnet.id]: http(), // ENS resolution
  },
})

// ─── Networks supported by this app ───────────────────────────────────────────

export interface NetworkConfig {
  chainId: number
  name: string
  shortName: string
  rpc: string
  explorer: string
  usdcAddress: `0x${string}`
  escrowAddress: `0x${string}` | ''
  isTestnet: boolean
}

export const NETWORKS: Record<string, NetworkConfig> = {
  arcTestnet: {
    chainId: 5042002,
    name: 'Arc Testnet',
    shortName: 'Arc Testnet',
    rpc: 'https://rpc.testnet.arc.io',
    explorer: 'https://explorer.testnet.arc.io',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    escrowAddress: '0xf65746ad0acab166f125c2e2bc2d93784e6b1d43',
    isTestnet: true,
  },
  arcMainnet: {
    chainId: 5042,
    name: 'Arc Mainnet',
    shortName: 'Arc',
    rpc: 'https://rpc.mainnet.arc.io',
    explorer: 'https://explorer.arc.io',
    usdcAddress: '0x3600000000000000000000000000000000000000',
    escrowAddress: '', // TODO: fill in after mainnet deploy
    isTestnet: false,
  },
}

// When no wallet is connected, default to Arc Mainnet
export const DEFAULT_NETWORK = NETWORKS.arcMainnet

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find((n) => n.chainId === chainId)
}

// ─── Contract ABI ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WORKSHOP_ESCROW_ABI = escrowArtifact.abi as any[]

export const USDC_DECIMALS = 6
