import { useState } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import type { Abi } from 'viem'
import { Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { NetworkConfig, WORKSHOP_ESCROW_ABI } from '../config'
import { parseUsdc, parseOnchainError } from '../utils'

const ESCROW_ABI = WORKSHOP_ESCROW_ABI as Abi

// Module-level constant for the min selectable date (tomorrow)
const TODAY_PLUS_ONE = new Date(Date.now() + 86400000).toISOString().split('T')[0]

interface Props {
  network: NetworkConfig
  onCreated?: () => void
}

type Step = 'idle' | 'checking' | 'approving' | 'waiting-approve' | 'creating' | 'waiting-create' | 'done' | 'error'

export function NewOrderForm({ network, onCreated }: Props) {
  const { address, chainId } = useAccount()
  const [maker, setMaker] = useState('')
  const [amount, setAmount] = useState('')
  const [deliverBy, setDeliverBy] = useState('')
  const [title, setTitle] = useState('')
  const [step, setStep] = useState<Step>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()

  const isWrongChain = chainId !== network.chainId
  const escrowAddress = network.escrowAddress as `0x${string}`
  const usdcAddress = network.usdcAddress

  // Read current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    chainId: network.chainId,
    query: { enabled: !!address && !!escrowAddress },
  })

  const { writeContractAsync } = useWriteContract()

  const { isLoading: isWaitingApprove } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isLoading: isWaitingCreate, isSuccess: isCreateSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!address || !escrowAddress) return
    setErrorMsg('')

    let amountRaw: bigint
    try {
      amountRaw = parseUsdc(amount)
    } catch {
      setErrorMsg('Enter a valid USDC amount.')
      return
    }

    const deliverByTs = Math.floor(new Date(deliverBy).getTime() / 1000)
    if (deliverByTs <= Math.floor(Date.now() / 1000)) {
      setErrorMsg('Deliver-by date must be in the future.')
      return
    }

    if (!/^0x[0-9a-fA-F]{40}$/.test(maker)) {
      setErrorMsg('Enter a valid maker address.')
      return
    }

    try {
      setStep('checking')
      await refetchAllowance()
      const currentAllowance = (allowance ?? 0n)

      if (currentAllowance < amountRaw) {
        setStep('approving')
        const approveTx = await writeContractAsync({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [escrowAddress, amountRaw],
          chainId: network.chainId,
        })
        setApproveTxHash(approveTx)
        setStep('waiting-approve')
        // Wait for approve to confirm
        await waitForTx(approveTx, network.rpc)
      }

      setStep('creating')
      const createTx = await writeContractAsync({
        address: escrowAddress,
        abi: ESCROW_ABI,
        functionName: 'createOrder',
        args: [
          maker as `0x${string}`,
          amountRaw,
          BigInt(deliverByTs),
          title,
        ],
        chainId: network.chainId,
      })
      setTxHash(createTx)
      setStep('waiting-create')
    } catch (err) {
      setErrorMsg(parseOnchainError(err))
      setStep('error')
    }
  }

  // Once confirmed, mark done
  if (isCreateSuccess && step === 'waiting-create') {
    setStep('done')
    onCreated?.()
  }

  const isPending = ['checking', 'approving', 'waiting-approve', 'creating', 'waiting-create'].includes(step)

  if (step === 'done' && txHash) {
    return (
      <div className="rounded-3xl p-5" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="size-5" style={{ color: 'var(--success)' }} />
          <span className="display font-semibold text-base" style={{ color: 'var(--success)' }}>Order created</span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          USDC is now locked in the contract. The maker can mark it delivered once the work is done.
        </p>
        <a
          href={`${network.explorer}/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--accent-hover)' }}
        >
          View on explorer <ExternalLink className="size-3" />
        </a>
        <button
          className="mt-4 w-full rounded-2xl py-3 text-sm font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
          onClick={() => { setStep('idle'); setMaker(''); setAmount(''); setDeliverBy(''); setTitle(''); setTxHash(undefined); setApproveTxHash(undefined) }}
        >
          Create another order
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} className="rounded-3xl p-5 space-y-4" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', backdropFilter: 'blur(20px)' }}>
      <h2 className="display text-base font-semibold" style={{ color: 'var(--ink)' }}>New order</h2>

      <Field label="Order title">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Custom oak dining table"
          required
          maxLength={100}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        />
      </Field>

      <Field label="Maker address" hint="The workshop or craftsperson who will build the piece">
        <input
          type="text"
          value={maker}
          onChange={(e) => setMaker(e.target.value)}
          placeholder="0x…"
          required
          className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        />
      </Field>

      <Field label="Advance amount (USDC)">
        <input
          inputMode="decimal"
          type="text"
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '')
            if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
          }}
          placeholder="0.00"
          required
          className="display w-full rounded-xl px-3 py-2.5 text-lg font-bold tabular-nums outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        />
      </Field>

      <Field label="Deliver by">
        <input
          type="date"
          value={deliverBy}
          onChange={(e) => setDeliverBy(e.target.value)}
          required
          min={TODAY_PLUS_ONE}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
        />
      </Field>

      {errorMsg && (
        <p className="text-xs rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.07)', color: 'var(--danger)' }}>
          {errorMsg}
        </p>
      )}

      <StepStatus step={step} isWaitingApprove={isWaitingApprove} _isWaitingCreate={isWaitingCreate} />

      <button
        type="submit"
        disabled={!address || isWrongChain || isPending || !network.escrowAddress}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: 'var(--accent)' }}
      >
        {!address
          ? 'Connect wallet first'
          : isWrongChain
          ? `Switch to ${network.shortName}`
          : !network.escrowAddress
          ? 'Contract not deployed on this network'
          : isPending
          ? <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />{stepLabel(step)}</span>
          : 'Lock advance in escrow'}
      </button>
    </form>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
        {label}
      </label>
      {hint && <p className="text-xs" style={{ color: 'var(--subtle)' }}>{hint}</p>}
      {children}
    </div>
  )
}

function stepLabel(step: Step): string {
  switch (step) {
    case 'checking': return 'Checking allowance…'
    case 'approving': return 'Approving USDC…'
    case 'waiting-approve': return 'Waiting for approval…'
    case 'creating': return 'Creating order…'
    case 'waiting-create': return 'Confirming…'
    default: return 'Working…'
  }
}

function StepStatus({ step, isWaitingApprove, _isWaitingCreate }: { step: Step; isWaitingApprove: boolean; _isWaitingCreate: boolean }) {
  if (step === 'idle' || step === 'done' || step === 'error') return null
  return (
    <div className="rounded-xl px-3 py-2.5 text-xs space-y-1" style={{ background: 'rgba(18,45,69,0.05)', border: '1px solid var(--border)' }}>
      <StepRow label="Approve USDC" done={['waiting-create', 'creating'].includes(step) || (step === 'waiting-approve' && !isWaitingApprove)} active={step === 'approving' || step === 'waiting-approve'} />
      <StepRow label="Create order" done={false} active={step === 'creating' || step === 'waiting-create'} />
    </div>
  )
}

function StepRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle className="size-3.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
      ) : active ? (
        <Loader2 className="size-3.5 flex-shrink-0 animate-spin" style={{ color: 'var(--accent-hover)' }} />
      ) : (
        <div className="size-3.5 rounded-full flex-shrink-0" style={{ background: 'var(--border-strong)' }} />
      )}
      <span style={{ color: done ? 'var(--success)' : active ? 'var(--ink)' : 'var(--subtle)' }}>{label}</span>
    </div>
  )
}

// Lightweight tx waiter that polls the RPC until the tx is mined
async function waitForTx(hash: `0x${string}`, rpcUrl: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await sleep(2000)
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getTransactionReceipt', params: [hash], id: 1 }),
      })
      const json = await res.json() as { result: { status: string } | null }
      if (json.result?.status === '0x1') return
    } catch {
      // ignore, keep polling
    }
  }
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }
