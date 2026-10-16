import { Lock, Hammer, CheckCircle, Clock } from 'lucide-react'

const steps = [
  {
    icon: Lock,
    label: '1 — Client locks the advance',
    text: 'The client approves USDC and creates the order. Funds are held by the smart contract — neither party can touch them alone.',
  },
  {
    icon: Hammer,
    label: '2 — Maker builds, marks delivered',
    text: 'When the work is done and handed over, the maker marks it delivered on-chain.',
  },
  {
    icon: CheckCircle,
    label: '3 — Client releases payment',
    text: 'Happy with the result? The client releases the funds to the maker. If the deadline passes without delivery, the client can reclaim the advance. If the maker refunds at any point, the client gets the money back.',
  },
  {
    icon: Clock,
    label: '4 — Silence fallback',
    text: 'If the maker marks delivered but the client never responds, the maker can claim payment after 7 days.',
  },
]

export function HowItWorks() {
  return (
    <section className="rounded-3xl p-5 mb-6" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
      <h2 className="display text-base font-semibold mb-4" style={{ color: 'var(--ink)' }}>
        How it works
      </h2>
      <div className="space-y-3">
        {steps.map(({ icon: Icon, label, text }) => (
          <div key={label} className="flex gap-3">
            <div
              className="mt-0.5 flex-shrink-0 flex size-7 items-center justify-center rounded-xl"
              style={{ background: 'rgba(18,45,69,0.08)' }}
            >
              <Icon className="size-3.5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{label}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
