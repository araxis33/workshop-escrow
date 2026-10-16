# Workshop Escrow

> Built with Arc Studio - money-powered apps in minutes

USDC escrow for bespoke workshop orders. A client locks an advance; the maker gets it when the job is handed over and the client confirms.

---

## What This App Does

A two-party USDC escrow for custom work (furniture, craft, bespoke orders):
- Client deposits USDC advance via `createOrder`
- Maker marks work delivered via `markDelivered`
- Client releases to maker via `release`, or reclaims if deadline passes
- Maker can refund at any time, or claim after 7-day silence post-delivery

## Deployed Contracts

| Network | Address | Explorer |
|---|---|---|
| Arc Testnet | `0xf65746ad0acab166f125c2e2bc2d93784e6b1d43` | https://explorer.testnet.arc.io/address/0xf65746ad0acab166f125c2e2bc2d93784e6b1d43 |
| Arc Mainnet | `0xf999268ef7e91cc767f4f6752eea38841d3f9a43` | https://explorer.arc.io/address/0xf999268ef7e91cc767f4f6752eea38841d3f9a43 |

Deploy tx: `0x898fb42d980163d04f69574b47420c6d55e7d22c5427990d13efc0307818a2e9`

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, Arc Light design
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity ^0.8.20 + Foundry. Source: `contracts/WorkshopEscrow.sol`. Tests: `contracts/test/WorkshopEscrow.t.sol` (54 tests, all pass). Build: `forge build`. Test: `forge test`.
- Wallet: injected (MetaMask, Rabby, etc.)
- Chains: Arc Testnet (5042002) + Arc Mainnet (5042)
- Token: USDC (6 decimals, 0x3600000000000000000000000000000000000000)

## Key Files

- `src/App.tsx` - Shell, header, tab navigation
- `src/config.ts` - wagmi config + contract config + NETWORKS map
- `src/types.ts` - Order struct and status enums
- `src/utils.ts` - formatUsdc, parseUsdc, parseOnchainError, formatAddress
- `src/hooks/useEscrow.ts` - wagmi read hooks for escrow contract
- `src/components/HowItWorks.tsx` - Explainer block
- `src/components/NetworkBanner.tsx` - Wrong-chain banner + switch button
- `src/components/NewOrderForm.tsx` - approve + createOrder form with step status
- `src/components/OrderCard.tsx` - Per-order card with contextual action buttons
- `src/components/OrderList.tsx` - List of orders for a given role
- `contracts/WorkshopEscrow.sol` - Core contract
- `contracts/test/WorkshopEscrow.t.sol` - Foundry unit tests

## Security Notes

- All critical + high findings fixed before deploy
- One known documented limitation: if either party is Circle-blocklisted after order creation, the settlement path will revert (no admin recovery — documented in contract NatSpec)
- Contract is Arc-only (constructor guards block.chainid == 5042002 || 5042)
- claimAfterSilence (7-day maker claim) is an INTENTIONAL feature per spec

## To Run

```
bun install
bun run dev
```
