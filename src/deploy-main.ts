/**
 * Deploy Workshop Escrow to Arc Mainnet
 * Vanilla TS — no React, no wagmi, no ConnectKit.
 * Sends a raw eth_sendTransaction from the injected wallet.
 */

import escrowArtifact from '../contracts/out/WorkshopEscrow.sol/WorkshopEscrow.json'

const ARC_MAINNET_CHAIN_ID = 5042
const ARC_MAINNET_HEX = '0x' + ARC_MAINNET_CHAIN_ID.toString(16) // "0x13b2"
const ARC_MAINNET_RPC = 'https://rpc.mainnet.arc.io'
const ARC_MAINNET_EXPLORER = 'https://explorer.arc.io'
const MIN_GAS_PRICE_WEI = 20n * 1_000_000_000n // 20 gwei

// ── DOM refs ────────────────────────────────────────────────────────────────
const walletDisplay = document.getElementById('wallet-display')!
const networkSection = document.getElementById('network-section')!
const networkDisplay = document.getElementById('network-display')!
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement
const btnSwitch = document.getElementById('btn-switch') as HTMLButtonElement
const btnDeploy = document.getElementById('btn-deploy') as HTMLButtonElement
const statusEl = document.getElementById('status')!
const resultEl = document.getElementById('result')!
const resultAddress = document.getElementById('result-address')!
const resultExplorer = document.getElementById('result-explorer') as HTMLAnchorElement
const codeMatch = document.getElementById('code-match')!
const pasteLine = document.getElementById('paste-line')!

// ── State ────────────────────────────────────────────────────────────────────
type EIP1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on: (event: string, cb: (...args: unknown[]) => void) => void
}

let provider: EIP1193 | null = null
let account: string | null = null
let chainId: number | null = null

// ── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg: string, kind: 'idle' | 'info' | 'success' | 'error') {
  statusEl.textContent = msg
  statusEl.className = `status ${kind}`
}

function setStatusHtml(html: string, kind: 'idle' | 'info' | 'success' | 'error') {
  statusEl.innerHTML = html
  statusEl.className = `status ${kind}`
}


function renderState() {
  if (!provider || !account) {
    walletDisplay.textContent = 'Not connected'
    walletDisplay.style.fontFamily = "'DM Sans', sans-serif"
    walletDisplay.style.color = 'var(--subtle)'
    networkSection.style.display = 'none'
    btnConnect.style.display = ''
    btnSwitch.style.display = 'none'
    btnDeploy.style.display = 'none'
    return
  }

  walletDisplay.textContent = account
  walletDisplay.style.fontFamily = "'JetBrains Mono', Menlo, monospace"
  walletDisplay.style.color = 'var(--ink)'
  networkSection.style.display = ''
  btnConnect.style.display = 'none'

  const onArc = chainId === ARC_MAINNET_CHAIN_ID
  networkDisplay.textContent = onArc ? `Arc Mainnet (${chainId})` : `Wrong network — Chain ID ${chainId ?? '?'} (need 5042)`
  networkDisplay.style.color = onArc ? 'var(--success)' : 'var(--danger)'

  btnSwitch.style.display = onArc ? 'none' : ''
  btnDeploy.style.display = onArc ? '' : 'none'
  btnDeploy.disabled = false
}

// ── RPC helper ────────────────────────────────────────────────────────────────
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(ARC_MAINNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = (await res.json()) as { result?: T; error?: { message: string } }
  if (json.error) throw new Error(json.error.message)
  return json.result as T
}

// ── Gas estimation ────────────────────────────────────────────────────────────
async function estimateGas(bytecode: string, from: string): Promise<{ gasLimit: string; maxFeePerGas: string }> {
  // 1. eth_estimateGas for the deployment
  const estimatedHex = await rpc<string>('eth_estimateGas', [{ from, data: bytecode }])
  const estimated = BigInt(estimatedHex)
  const gasLimit = '0x' + ((estimated * 125n) / 100n).toString(16) // +25%

  // 2. eth_gasPrice for current base
  const gasPriceHex = await rpc<string>('eth_gasPrice', [])
  const gasPrice = BigInt(gasPriceHex)
  // Add 20% to current gas price, but never below 20 gwei floor
  const bumped = (gasPrice * 120n) / 100n
  const maxFeePerGas = '0x' + (bumped > MIN_GAS_PRICE_WEI ? bumped : MIN_GAS_PRICE_WEI).toString(16)

  return { gasLimit, maxFeePerGas }
}

// ── Connect ──────────────────────────────────────────────────────────────────
async function connect() {
  const eth = (window as unknown as { ethereum?: EIP1193 }).ethereum
  if (!eth) {
    setStatus('No injected wallet found. Install Rabby or MetaMask.', 'error')
    return
  }
  provider = eth

  try {
    setStatusHtml('<span class="spinner"></span> Requesting accounts…', 'info')
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[]
    account = accounts[0] ?? null

    const chainHex = await provider.request({ method: 'eth_chainId' }) as string
    chainId = parseInt(chainHex, 16)

    provider.on('accountsChanged', (accs) => {
      account = (accs as string[])[0] ?? null
      renderState()
    })
    provider.on('chainChanged', (hex) => {
      chainId = parseInt(hex as string, 16)
      renderState()
    })

    setStatus('', 'idle')
    renderState()
  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'Connection refused'
    setStatus(msg.includes('rejected') ? 'Connection cancelled.' : `Error: ${msg}`, 'error')
  }
}

// ── Switch chain ──────────────────────────────────────────────────────────────
async function switchToArc() {
  if (!provider) return
  btnSwitch.disabled = true
  try {
    setStatusHtml('<span class="spinner"></span> Switching to Arc Mainnet…', 'info')
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARC_MAINNET_HEX }],
    })
    const chainHex = await provider.request({ method: 'eth_chainId' }) as string
    chainId = parseInt(chainHex, 16)
    setStatus('', 'idle')
    renderState()
  } catch (switchErr) {
    // 4902 = chain not added
    const code = (switchErr as { code?: number }).code
    if (code === 4902) {
      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: ARC_MAINNET_HEX,
            chainName: 'Arc',
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
            rpcUrls: [ARC_MAINNET_RPC],
            blockExplorerUrls: [ARC_MAINNET_EXPLORER],
          }],
        })
        const chainHex = await provider.request({ method: 'eth_chainId' }) as string
        chainId = parseInt(chainHex, 16)
        setStatus('', 'idle')
        renderState()
      } catch (addErr) {
        const msg = (addErr as { message?: string }).message ?? 'Unknown error'
        setStatus(msg.includes('rejected') ? 'Cancelled.' : `Add chain failed: ${msg}`, 'error')
      }
    } else if (code !== 4001) {
      const msg = (switchErr as { message?: string }).message ?? 'Unknown error'
      setStatus(`Switch failed: ${msg}`, 'error')
    } else {
      setStatus('', 'idle')
    }
  }
  btnSwitch.disabled = false
}

// ── Deploy ────────────────────────────────────────────────────────────────────
async function deploy() {
  if (!provider || !account) return
  btnDeploy.disabled = true
  resultEl.style.display = 'none'

  try {
    const bytecode = escrowArtifact.bytecode.object
    const deployedBytecode = escrowArtifact.deployedBytecode.object

    setStatusHtml('<span class="spinner"></span> Estimating gas…', 'info')
    const { gasLimit, maxFeePerGas } = await estimateGas(bytecode, account)

    setStatusHtml('<span class="spinner"></span> Waiting for wallet signature…', 'info')
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        data: bytecode,
        value: '0x0',
        chainId: '0x' + (5042).toString(16), // Rabby on Arc returned 4001 without explicit chainId/value
        gas: gasLimit,
        maxFeePerGas,
        // no maxPriorityFeePerGas — Arc is PoS-like, tips are optional
      }],
    }) as string

    setStatusHtml(`<span class="spinner"></span> Transaction sent. Waiting for receipt… <br/><small style="word-break:break-all">${txHash}</small>`, 'info')

    // Poll for receipt
    let receipt: { contractAddress?: string; status?: string } | null = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      receipt = await rpc<{ contractAddress?: string; status?: string } | null>(
        'eth_getTransactionReceipt',
        [txHash],
      )
      if (receipt) break
    }

    if (!receipt || !receipt.contractAddress) {
      setStatus(receipt?.status === '0x0'
        ? 'Transaction reverted. Check gas and try again.'
        : 'No receipt after 3 min — check the explorer for tx status.', 'error')
      btnDeploy.disabled = false
      return
    }

    const contractAddr = receipt.contractAddress

    // Code match check
    setStatusHtml('<span class="spinner"></span> Verifying deployed bytecode…', 'info')
    const onChainCode = await rpc<string>('eth_getCode', [contractAddr, 'latest'])

    // The page deploys this exact artifact and the contract has no immutables, so the code must match byte for byte
    const artifactCode = (deployedBytecode.startsWith('0x') ? deployedBytecode.slice(2) : deployedBytecode).toLowerCase()
    const chainCode = (onChainCode.startsWith('0x') ? onChainCode.slice(2) : onChainCode).toLowerCase()
    const matches = artifactCode.length > 0 && chainCode === artifactCode

    setStatus('', 'idle')

    // Show result
    resultEl.style.display = ''
    resultAddress.textContent = contractAddr
    resultExplorer.href = `${ARC_MAINNET_EXPLORER}/address/${contractAddr}`

    codeMatch.textContent = matches
      ? 'Code matches the tested build'
      : 'Warning: deployed bytecode does not match the artifact. Verify manually before using.'
    codeMatch.className = `match ${matches ? 'ok' : 'bad'}`

    pasteLine.textContent =
      `escrowAddress: '${contractAddr}',  // Arc Mainnet`

  } catch (err) {
    const msg = (err as { message?: string }).message ?? 'Unknown error'
    setStatus(msg.includes('rejected') || msg.includes('denied')
      ? 'Transaction cancelled.'
      : `Deploy failed: ${msg}`, 'error')
    btnDeploy.disabled = false
  }
}

// ── Event bindings ────────────────────────────────────────────────────────────
btnConnect.addEventListener('click', () => { void connect() })
btnSwitch.addEventListener('click', () => { void switchToArc() })
btnDeploy.addEventListener('click', () => { void deploy() })

// ── Initial check (wallet may already be connected) ──────────────────────────
void (async () => {
  const eth = (window as unknown as { ethereum?: EIP1193 }).ethereum
  if (!eth) return
  provider = eth
  try {
    const accounts = await provider.request({ method: 'eth_accounts' }) as string[]
    if (accounts.length > 0) {
      account = accounts[0]
      const chainHex = await provider.request({ method: 'eth_chainId' }) as string
      chainId = parseInt(chainHex, 16)
      provider.on('accountsChanged', (accs) => {
        account = (accs as string[])[0] ?? null
        renderState()
      })
      provider.on('chainChanged', (hex) => {
        chainId = parseInt(hex as string, 16)
        renderState()
      })
      renderState()
    }
  } catch { /* not connected yet */ }
})()
