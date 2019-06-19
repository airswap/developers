# WebSocket

In addition to using [AirSwap.js](api/airswapjs.md) or the [API Server](advanced/api-server.md), it is possible to connect directly to the AirSwap Websocket to communicate with peers or the Indexer. 

!> The Mainnet Websocket URL is: `wss://connect.airswap-api.com/websocket`. The Rinkeby Websocket URL is: `wss://sandbox.airswap-api.com/websocket`.

## Authentication

The authentication sequence is as follows:

1. Open a WebSocket connection to the Mainnet or Rinkeby Websocket.
2. Once connected, you will receive a data frame, which is a unique challenge. For example: `By signing this message, I am proving that I control the selected account for use on the AirSwap trading network. b20e2c31-8de5-11e9-8383-c2c6a98cdf1d`.
3. Hash and sign this data using a Web3 library. You can find an example using JavaScript [here](https://github.com/ethereum/wiki/wiki/JavaScript-API#web3ethsign).
4. Send the signed data over the socket to the server.
5. If accepted, you will receive a data frame containing `ok` and are now free to send and receive RPC messages.

## Message Envelope

To send messages, construct an envelope in the following JSON format and send the string over the socket. You will not receive an acknowledgement of the messages you send but may receive a response from the receiver. In order to send a message to the Indexer, use the address: `0x0000000000000000000000000000000000000000`.

**Properties**

- `sender`: Your lowercased Ethereum address.
- `receiver`: The lowercased Ethereum address of the receiving peer.
- `message`: A stringified JSON-RPC message.

```json
{
  "sender": "0x0..."
  "receiver": "0x0..."
  "message": "{\"id\":1, ...}"
}```