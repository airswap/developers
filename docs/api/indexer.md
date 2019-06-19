# Indexer

 In addition to peer-to-peer communication between Makers and Takers, there is a special service, called the Indexer, which both Makers and Takers can message to find or register Intent to trade specific tokens. This provides a mechanism for peer discovery and token utility.
 
 In order for Makers to be discoverable via the Indexer, 250 AST must be staked per pair, per direction. Generally, a Maker is selling if the takerToken is ETH and buying if the makerToken is WETH.
 
 Maker:

 > "I want to post Intents to buy AST and sell DAI (AST/ETH, WETH/DAI)."
 
Indexer:

> "You must hold at least 500 AST. Please acquire more and try again."

### Query Intents

A list of all standing Intents can be found via the AirSwap HTTP API: [Mainnet](https://api.airswap.io/intents) or [Rinkeby](https://api.sandbox.airswap.io/intents). Each entry is grouped by makerToken and takerToken, and includes a list of all addresses with Intents to be a Maker for that pair.

```json
[
  {
    "addresses":[
      "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
    ],
    "makerToken":"0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
    "takerToken":"0x0000000000000000000000000000000000000000" // ETH
  }
  ...
]```

In the response above, we can see that a Maker with address `0x6cc47be912a07fbe9cebe68c9e103fdf123b7269` is trading AST/ETH.

### Set Intents

Makers should signal their Intent to buy or sell a specific token pair by sending a JSON RPC call to the Indexer with the setIntents method. Calls to setIntents are idempotent, meaning you must pass your full set of Intents each time setIntents is called. At the moment, the only supported `role` is `maker`. At a minimum, Makers must implement the `getOrder` method. For Makers that support `getQuote` or `getMaxQuote`, the `supportedMethods` field should be set accordingly.

In rare cases, Makers may connect to the AirSwap Websocket with a different address than they use to sign orders. The `connectionaddress` field allows you to specify the address that you will be connecting with. The `address` field should always be the address of the wallet that signs orders and is approved by the AirSwap contract to move tokens.

!> It is not necessary to communicate directly with the Indexer over the AirSwap Websocket. The AirSwap.js client library can be used to simplify this procedure.

Request:

```json
{
  "address": "0x2222222222222222222222222222222222222222", // Your Maker address
  "intents": [
    {
      "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
      "takerToken": "0x0000000000000000000000000000000000000000", // ETH
      "role": "maker",
      "connectionaddress": "0x2222222222222222222222222222222222222222", // only necessary if different from the address above
      "supportedMethods": ["getOrder", "getQuote", "getMaxQuote"]
    }
  ]
}
```

Response:

```ok```