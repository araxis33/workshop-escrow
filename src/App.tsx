import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi } from 'viem'
import { HammerIcon, ExternalLink } from 'lucide-react'
import { NETWORKS, DEFAULT_NETWORK, NetworkConfig, USDC_DECIMALS } from './config'
import { HowItWorks } from './components/HowItWorks'
import { NetworkBanner } from './components/NetworkBanner'
import { NewOrderForm } from './components/NewOrderForm'
import { OrderList } from './components/OrderList'
import { formatAddress } from './utils'

type Tab = 'pay' | 'build' | 'new'

export default function App() {
  const { address, isConnected, chainId } = useAccount()
  const [tab, setTab] = useState<Tab>('new')
  const [refreshKey, setRefreshKey] = useState(0)

  // Determine active network from wallet's current chain.
  // When no wallet is connected, default to Arc Mainnet (not testnet) so the
  // production site shows the right contract by default.
  const activeNetwork: NetworkConfig =
    (isConnected && chainId !== undefined
      ? Object.values(NETWORKS).find((n) => n.chainId === chainId)
      : undefined) ?? DEFAULT_NETWORK

  const hasEscrow = activeNetwork.escrowAddress !== ''

  // USDC balance (ERC-20 view — the only balance we show on Arc)
  const { data: usdcBalance } = useReadContract({
    address: activeNetwork.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: activeNetwork.chainId,
    query: { enabled: !!address, refetchInterval: 10000 },
  })

  const formattedBalance = usdcBalance !== undefined
    ? (Number(usdcBalance) / 10 ** USDC_DECIMALS).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <header className="sticky top-0 z-10 w-full" style={{ background: 'rgba(249,249,252,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl" style={{ background: 'var(--accent)' }}>
              <HammerIcon className="size-4 text-white" />
            </div>
            <div>
              <p className="display text-sm font-semibold leading-none" style={{ color: 'var(--ink)' }}>Workshop Escrow</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{activeNetwork.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && address && formattedBalance !== null && (
              <div className="hidden sm:flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium tabular-nums" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                <span className="font-semibold">${formattedBalance}</span>
                <span style={{ color: 'var(--subtle)' }}>USDC</span>
              </div>
            )}
            <ConnectKitButton.Custom>
              {({ isConnected, show, address: addr }) => (
                <button
                  onClick={show}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{ background: isConnected ? 'var(--surface-muted)' : 'var(--accent)', color: isConnected ? 'var(--ink)' : '#fff' }}
                >
                  {isConnected && addr ? formatAddress(addr) : 'Connect'}
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Balance card (mobile) */}
        {isConnected && address && formattedBalance !== null && (
          <div className="sm:hidden rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: 'var(--surface-muted)' }}>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Your USDC balance</span>
            <span className="display font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>
              ${formattedBalance} <span className="font-normal text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
            </span>
          </div>
        )}

        {/* Network mismatch banner */}
        <NetworkBanner targetNetwork={activeNetwork} />

        {/* How it works */}
        <HowItWorks />

        {/* Tabs — only shown when escrow is deployed */}
        {hasEscrow && <div className="flex gap-1 rounded-2xl p-1" style={{ background: 'var(--surface-muted)' }}>
          {(['new', 'pay', 'build'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all"
              style={{
                background: tab === t ? 'var(--surface-strong)' : 'transparent',
                color: tab === t ? 'var(--ink)' : 'var(--subtle)',
                boxShadow: tab === t ? '0 1px 4px rgba(18,45,69,0.08)' : 'none',
              }}
            >
              {t === 'new' ? 'New order' : t === 'pay' ? 'I pay' : 'I build'}
            </button>
          ))}
        </div>}

        {/* Not-deployed notice */}
        {!hasEscrow && (
          <div className="rounded-2xl px-5 py-4 text-center space-y-1.5" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Not deployed on {activeNetwork.name} yet</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Open <a href="./deploy.html" className="underline" style={{ color: 'var(--accent-hover)' }}>deploy.html</a> to deploy the contract with your own wallet, then add the address to <code className="mono text-xs">src/config.ts</code>.
            </p>
          </div>
        )}

        {/* Tab content — only shown when escrow is deployed */}
        {hasEscrow && tab === 'new' && (
          <NewOrderForm
            network={activeNetwork}
            onCreated={() => {
              setRefreshKey((k) => k + 1)
              setTimeout(() => setTab('pay'), 800)
            }}
          />
        )}
        {hasEscrow && tab === 'pay' && (
          <OrderList key={`pay-${refreshKey}`} network={activeNetwork} role="client" onAction={() => setRefreshKey((k) => k + 1)} />
        )}
        {hasEscrow && tab === 'build' && (
          <OrderList key={`build-${refreshKey}`} network={activeNetwork} role="maker" onAction={() => setRefreshKey((k) => k + 1)} />
        )}

        {/* Footer */}
        <footer className="pt-2 pb-6 space-y-1">
          <p className="text-center text-xs" style={{ color: 'var(--subtle)' }}>
            Funds held by smart contract · No admin · No fees
          </p>
          <p className="text-center text-xs flex items-center justify-center gap-2 flex-wrap" style={{ color: 'var(--subtle)' }}>
            <span>Built with Arc Studio</span>
            <span aria-hidden>·</span>
            {activeNetwork.escrowAddress && (
              <a
                href={`${activeNetwork.explorer}/address/${activeNetwork.escrowAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
                style={{ color: 'var(--accent-hover)' }}
              >
                Contract on explorer <ExternalLink className="size-3" />
              </a>
            )}
            {activeNetwork.escrowAddress && <span aria-hidden>·</span>}
            <a
              href="https://github.com/araxis33/workshop-escrow"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent-hover)' }}
            >
              Source <ExternalLink className="size-3" />
            </a>
          </p>
        </footer>
      </main>
    </div>
  )
}
