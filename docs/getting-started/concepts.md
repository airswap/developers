# Concepts {docsify-ignore-all}

AirSwap is not an exchange. AirSwap has no order book, no deposits, no withdrawals and no counterparty risk.

AirSwap is a network for matching and peer-to-peer communication network for participants interested in trading the same assets. AirSwap makes trade more efficient by facilitating counterparty discovery and price negotiation off-chain, and execution of atomic swaps on-chain.

### How is it different from on-chain order books?

With on-chain order books, Makers spend gas to create, update or cancel orders. This results in less-frequent updates and less-competitive pricing due to the overhead of interacting with the blockchain. AirSwap moves price discovery and negotiation off-chain by providing an Indexer for peer discovery and the Swap protocol for communication and settlement. Once a Taker has received an order at an acceptable price, they can immediately execute it on-chain. Neither party will ever experience slippage or front-running.

### How is it different from liquidity reserves?

Liquidity reserves allow token holders to deposit tokens and theoretically earn a yield when the token trades in a direction away from the balance of tokens. Pricing is done at a constant rate relative to the reserves and is prone to large spreads and asymmetry. On AirSwap, Makers can price more aggressively because they can run complex algorithms and respond more quickly to moves in the market due to these activities occurring off-chain (i.e. not spending gas).

