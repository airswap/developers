# Approvals

When setting up a Maker, it is necessary to approve the [Swap contract](https://etherscan.io/address/0x8fd3121013a07c57f0d69646e86e7a4880b467b7) to move tokens on your behalf. To do so, you must call `approve` on each ERC20 token you plan to trade, in addition to WETH. You can use the [API Server](advanced/api-server.md) to easily set approvals. This only needs to be done once.