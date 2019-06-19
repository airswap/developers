# Peer API

The main entrypoint to the AirSwap network is a WebSocket interface that allows peers to communicate using a JSON RPC and a set of methods defined by the Swap protocol: getQuote, getMaxQuote, getOrder.

!> These examples ignore WebSocket authentication and JSON RPC request / response formatting. These concepts are abstracted away by our client libraries and won't be needed by most developers. For more information, including the exact message specification, see: [Websocket](advanced/websocket.md).

!> In the following examples, `makerAmount` and `takerAmount` are Wei values, meaning they take ERC20 decimals into account. You can find a full list of indexed token metadata for: [Mainnet](https://token-metadata.airswap.io/tokens) or [Rinkeby](https://token-metadata.airswap.io/rinkebyTokens).

!> In general, the peer sending a request is generally a Taker and the responder is a Maker. In the scenarios below, assume we are the Taker.

### getQuote

A Taker constructs a request describing the tokens they wish to swap and the amount they wish to send or receive . The Maker responds with a Quote containing the amount they will send or receive, depending on the parameters requested by the Taker.

Request (Taker)

> "How much AST would you swap for 9 ETH?"

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222", // Maker wallet address
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
  "takerToken": "0x0000000000000000000000000000000000000000", // ETH
  "takerAmount": "9000000000000000000" // 9 ETH
}```

Response (Maker)

> "I would swap 9,987 AST for 9 ETH"

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222",
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
  "takerToken": "0x0000000000000000000000000000000000000000",
  "takerAmount": "9000000000000000000", // 9 ETH
  "makerAmount": "99870000" // 9,987 AST
}```

### getMaxQuote

Similar to a getQuote, but the Taker does not specify any amount. Instead, the Maker sends back the maximum Quote sizes for the pair specified by the Taker. This is used to signal the amount of available liquidity for a given token.

Request (Taker)

> "What is the maximum amount of AST you would swap for ETH?"

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222", // Maker wallet address
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
  "takerToken": "0x0000000000000000000000000000000000000000", // ETH
}```

Response (Maker)

> "I'd swap 1,785,999 AST for 387 ETH"

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222", // Maker wallet address
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
  "takerToken": "0x0000000000000000000000000000000000000000", // ETH
  "takerAmount": "387000000000000000000", // 387 ETH
  "makerAmount": "17859990000" // 1,785,999 AST
}```

### getOrder

Also similar to getQuote, but should only be called when the Taker is ready to execute an order. The Maker will return a cryptographically signed order, which can be execute using the Swap contract within the Maker's desired expiration time. Because an order creates risk exposure, Maker's often implement their own logic when deciding whether to return an order. For example, a Maker may elect to not return an order at all if the Taker does not have a sufficient balance to complete the transaction.

Request (Taker)

> "I'm ready to swap 9 ETH for AST."

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222", // Maker wallet address
  "takerAddress": "0x1111111111111111111111111111111111111111", // Our wallet address
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
  "takerToken": "0x0000000000000000000000000000000000000000", // ETH
  "takerAmount": "9000000000000000000" // 9 ETH
}```

Response (Maker)

> "The price changed a bit since the quote, but here's a signed order of 9,755 AST for 9 ETH."

```json
{
  "makerAddress": "0x2222222222222222222222222222222222222222", // Maker wallet address
  "takerAddress": "0x1111111111111111111111111111111111111111", // Our wallet address
  "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8", // AST
  "takerToken": "0x0000000000000000000000000000000000000000", // ETH
  "takerAmount": "9000000000000000000", // 9 ETH
  "makerAmount": "97550000", // 9.9755 AST
  "expiration": 1559662751, // Unix epoch seconds after which order is no longer valid
  "nonce": "86900328", // A unique ID that gives the maker cancelation optionality
  "r": "0x4ef9fce2898a9fd1a5427e126f1e3a9cb407593735e07693acff44ac5b8b50dd",
  "s": "0x5c56394b11125e83f9eeb8a2b73b2073f1700f04e3777666a360ac09637724d8",
  "v": 28
}```
