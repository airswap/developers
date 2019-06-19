# WETH

The role of WETH is important in the AirSwap ecosystem. After having been given approval, smart contracts can move any ERC20 token. ETH is not an ERC20 token and therefore must be wrapped in order to be moved by smart contracts.

!> Makers must set the `makerToken` as WETH when setting an Intent to buy tokens. For example, if you wish to setup a Maker to both buy and sell AST, you must add Intents for WETH/AST (buy) and AST/ETH (sell).

!> As a Maker, you should keep a balance of WETH on hand if you're providing liquidity to buy tokens.

## Maker Sell

Intent to send an ERC20 and receive ETH:

```json
{
  "makerToken": "0x27054b13b1b798b345b591a4d22e6562d47ea75a",
  "takerToken": "0x0000000000000000000000000000000000000000"
}```

## Maker Buy

Intnet to send WETH and receive an ERC20.

```json
{
  "makerToken": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "takerToken": "0x27054b13b1b798b345b591a4d22e6562d47ea75a"
}```

## Addresses

The address for Mainnet WETH is: `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`

The address for Rinkeby WETH is: `0xc778417e063141139fce010982780140aa0cd5ab`