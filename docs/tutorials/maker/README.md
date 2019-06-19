# Maker Tutorial

## Overview

In [Concepts](../getting-started/concepts.md), we learned about Makers and Takers and how they interact with one another using dApps and APIs. We looked at the [Indexer](../api/indexer.md) and learned about Intents. In this tutorial, you'll learn how to put together these concepts in order to provide liquidity on the AirSwap network. Over the course of this tutorial, you'll learn how to:

* Authenticate with the AirSwap Websocket
* Create Intents
* Receive order and quote requests
* Craft, sign and send orders

[View the code on GitHub](https://github.com/developers/tutorials/maker)

## Requirements

* NodeJS 8 or higher.
* Yarn (`npm install yarn`).
* An Ethereum key pair. You can use Metamask to create a new wallet and export the private key.
* Rinkeby ETH.
* At least 250 Rinkeby AST.

## Getting Started

First, use the [Faucet](https://faucet.rinkeby.io/) to obtain Rinkeby ETH. Then, go to the [AirSwap Sandbox](https://sandbox.airswap.io) and obtain at least 250 Rinkeby AST.

Use ENV to control which environment to connect to. We'll use the `sandbox` for Rinkeby. You can use for `production` for Mainnet when you're ready to go live.

`export ENV=sandbox`

Next, create a new project and add [AirSwap.js](https://gitub.com/airswap/AirSwap.js).

`yarn add airswap.js`

Next, open a JavaScript file (app.js) and import ethers.js and AirSwap.js.

```javascript
const ethers = require('ethers')
const Router = require('AirSwap.js/src/protocolMessaging')
```

We'll use ethers.js to import a private key using the wallet API.

```javascript
const wallet = new ethers.Wallet(PK)
```

Instantiate a simple message signer that signs any data.

```javascript
const messageSigner = data => wallet.signMessage(data)
```

## Connect and Authenticate

Instantiate a Router. This is a helper that abstracts away all of the complexities of interacting with the AirSwap Websocket and Indexer.

```javascript
const routerParams = {
  messageSigner,
  address,
  keyspace: false
}
const router = new Router(routerParams)
```

Next, create an asynchronous main() function to connect.

```javascript
async function main() {
    // Connect and authenticate with the AirSwap Websocket
    await router.connect().catch(e => {
      console.log('unable to connect to Websocket', e)
    })
}
```

## Create Intents

Let's create an Intent to sell AST for ETH. As we have learned, creating an intent requires 250 AST.

!> setIntents will fail if you do not have 250 AST per intent

Use `router.setIntents()` to create intents. This action is idempotent and replaces all other intents for your address. You call this method everytime your application starts. It should include the full list of intents. In your `main()` function:

```javascript
await router.setIntents([
  {
    makerToken: AST,
    takerToken: ETH,
    role: 'maker',
    supportedMethods: ["getOrder", "getQuote", "getMaxQuote"]
  }
]).then(() => {
  console.log('setIntents for AST/ETH')
}).catch(e => {
  console.log('unable to setIntents', e)
})
```

## Handle Requests

As we know, Takers query Intents on the Indexer to find Makers to trade with. Once they find Makers trading tokens they are interested in, Takers will send `getOrder`, `getQuote`, and `getMaxQuote` messages to discover pricing and executable orders. Use `router.RPC_METHOD_ACTIONS` to set callbacks that will be triggered when these messages are received from peers. In your main function:

```javascript
router.RPC_METHOD_ACTIONS['getOrder'] = getOrder
router.RPC_METHOD_ACTIONS['getQuote'] = getQuote
router.RPC_METHOD_ACTIONS['getMaxQuote'] = getMaxQuote
```

You'll need to implement these functions. They will receive an envelope, which is just a `sender`, `receiver` and a `message`. The `message` will contain a string-encoded JSON RPC call containing the request parameters.

For example, this is what a `getOrder` for a Taker looking to buy 100 AST for ETH on Rinkeby looks like:

```json
{
  "sender": "0x009176b43dba55ff8fde2c122bf4dbeea367e5d8",
  "receiver": "0x009176b43dba55ff8fde2c122bf4dbeea367e5d8",
  "message": {
    "id": "778ff032-45a5-4e5e-83fb-71e520ad611d",
    "jsonrpc": "2.0",
    "method": "getOrder",
    "params": {
      "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
      "takerToken": "0x0000000000000000000000000000000000000000",
      "takerAddress": "0x009176b43dba55ff8fde2c122bf4dbeea367e5d8",
      "makerAmount": "1000000"
    }
  }
}
```

In your `getOrder` handler function, you'll want to have some sort of pricing mechanism. In this example, we'll just use a fixed price of 0.01 ETH/AST. You can use [AirSwap.js/TokenMetadata](https://github.com/airswap/AirSwap.js/blob/develop/src/tokens/index.js) to convert between the atomic and decimal formatted amounts. The following function takes `getOrder` parameters and calculates `makerAmount` or `takerAmount` based on which amount is requested.

```javascript
function priceTrade(params) {
  // Assume a fixed price of 0.01 ETH/AST
  // You should implement your own pricing logic here.
  const price = 0.01

  let makerAmount
  let takerAmount

  if (params.makerAmount) {
    // Maker amount specified, calculate the amount taker must send
    makerAmount = params.makerAmount
    const makerAmountDecimals = TokenMetadata.formatDisplayValueByToken({address: params.makerToken}, params.makerAmount)
    const takerAmountDecimals = makerAmountDecimals * price
    takerAmount = TokenMetadata.formatAtomicValueByToken({address: params.takerToken}, takerAmountDecimals)
  } else if (params.takerAmount) {
    // Taker amount specified, calculate the amount maker must send
    takerAmount = params.takerAmount
    const takerAmountDecimals = TokenMetadata.formatDisplayValueByToken({address: params.takerToken}, params.takerAmount)
    const makerAmountDecimals = takerAmountDecimals / price
    makerAmount = TokenMetadata.formatAtomicValueByToken({address: params.makerToken}, makerAmountDecimals)
  }

  return {
    makerAmount,
    takerAmount
  }
}
```

Every request has a `makerToken` and `takerToken`. We used these values to price out a `makerAmount` and `takerAmount`. Next, set the `nonce` to a random number. This number allows us to use a transaction to cancel orders before they are filled. Set an `expiration` time to a future Unix epoch timestamp in seconds. This allows you to control how long the order is executable.

```javascript
order = {
  makerAmount: Number(makerAmount).toString(),
  takerAmount: Number(takerAmount).toString(),
  makerToken: params.makerToken,
  takerToken: params.takerToken,
  takerAddress: params.takerAddress,
  makerAddress: address,
  nonce: Number(Math.random() * 100000).toFixed().toString(),
  expiration: Math.round(new Date().getTime()/ 1000) + 300 // Expire after 5 minutes
}
```

## Sign Orders

Finally, we are ready to sign the order. We'll create a function that uses the `ethers` library to hash and sign the order.

```javascript
async function signOrder({ makerAddress, makerAmount, makerToken, takerAddress, takerAmount, takerToken, expiration, nonce }) {
  const types = [
    'address', // makerAddress
    'uint256', // makerAmount
    'address', // makerToken
    'address', // takerAddress
    'uint256', // takerAmount
    'address', // takertoken
    'uint256', // expiration
    'uint256', // nonce
  ]
  const hashedOrder = ethers.utils.solidityKeccak256(types, [
    makerAddress,
    makerAmount,
    makerToken,
    takerAddress,
    takerAmount,
    takerToken,
    expiration,
    nonce,
  ])

  console.log(hashedOrder)

  const signedMsg = await wallet.signMessage(ethers.utils.arrayify(hashedOrder))
  const sig = ethers.utils.splitSignature(signedMsg)

  return {
    ...order,
    ...sig
  }
}
```

## Send Responses

Once we have a signed order, we can send it back to the requester using the Router class. In general, it is good practice to send a response with the same `id` of the request that preceeded it (`payload.message.id`). Use the `payload.sender` attribute to return your response to the sender.

```javascript
// Sign the order
const signedOrder = await signOrder(order)

// Construct a JSON RPC response
response = {
  id: payload.message.id,
  jsonrpc: '2.0',
  result: signedOrder
}

// Send the order
router.call(payload.sender, response)
console.log('sent order', response)
```

## Next Steps

Congratulations! You've created a Maker.

Your application connects to the AirSwap Websocket, sets an Intent to trade AST/ETH and responds to requests with signed orders that can be executed by Takers on the Swap contract ([Rinkeby](https://rinkeby.etherscan.io/address/0x07fC7c43D8168a2730344E5CF958aaecc3B42B41) and [Mainnet](https://etherscan.io/address/0x8fd3121013a07c57f0d69646e86e7a4880b467b7)). Of course, this is a very simple implementation. You can enhance your Maker with better pricing algorithms, risk management, and hedging capabilities to compete with other Makers.

If you haven't done so already, [check out the code](https://github.com/airswap/developers/tree/master/docs/tutorials/maker/app.js) for this example. It includes examples of how to use TokenMetadata to check balances, respond to quote requests and more. If you feel that this tutorial is missing something, feel free to [open a pull request](https://github.com/airswap/developers/pulls). Thanks for reading and happy hunting!
