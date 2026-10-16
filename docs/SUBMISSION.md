# Workshop Escrow

USDC escrow for custom-made work on Arc. A client locks the advance, the workshop builds, and the money moves only by the rules in the contract.

## The problem

I build furniture to order. Small workshops ask for a 50% advance before they buy materials. Clients are afraid to send money to a stranger, and workshops are afraid to start without it. Today the only answer is trust.

## What it does

- **Client locks the advance** in USDC (`createOrder`). Nobody can touch it alone.
- **Maker marks it delivered** when the job is handed over (`markDelivered`, only before the deadline).
- **Client releases the payment** (`release`), or the maker returns it (`refund`).
- **Deadline passed without delivery:** the client takes the money back (`reclaim`).
- **Client silent for 7 days after delivery:** the maker can claim it (`claimAfterSilence`).

No owner, no admin, no fees, no upgrades.

## Live on Arc Mainnet

- App: https://araxis33.github.io/workshop-escrow/
- Contract: `0xf999268ef7e91cc767f4f6752eea38841d3f9a43` — https://explorer.arc.io/address/0xf999268ef7e91cc767f4f6752eea38841d3f9a43
- Deploy: `0x2550ddbc46e110d7d20c4f1faf843ba61ec23ecbc850d748876e7f2eabacfe3a` (runtime code checked byte for byte against the tested build)
- First order, 1 USDC locked: https://explorer.arc.io/tx/0x709a3a72d5abc703f63c77b723ed5190adf6658ca9807c11d16047c25df4ccce
- Payment released to the maker: https://explorer.arc.io/tx/0xc6d24e6495594e9964473f187d448165597c9781cc6ce8ace616f7720e5dc6d3
- Source: https://github.com/araxis33/workshop-escrow
- Walkthrough video: https://araxis33.github.io/workshop-escrow/walkthrough.mp4

## How I used Arc Studio

- Described the escrow and its rules in plain language; Arc Studio wrote `WorkshopEscrow.sol`, 54 Foundry tests (all pass, including fuzz and an invariant that the escrow balance always equals the open orders) and deployed it to Arc Testnet.
- Its security review caught a real hole before deploy: the maker could mark an order delivered after the deadline and block the client's refund. It added the deadline check.
- It built the React app (new order, "I pay" / "I build" lists, only the buttons the connected wallet may press) and a `deploy.html` page so I could ship the same tested bytecode to Arc Mainnet from my own wallet.
- After the first real mainnet order the list crashed (the struct came back as an object, not a tuple). I fixed it and sent the fix back into the Arc Studio project, so the workspace matches what is live.

Arc Studio project: https://studio.arc.io/app/c8b0dff3-1f33-4518-bdf7-5629c71fd804

## Next

Partial advances (deposit + final payment in one order), a shareable order link for the client, and RU/RO interface for workshops in Moldova.
