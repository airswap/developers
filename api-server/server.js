const express = require('express')
const rp = require('request-promise')
const ethers = require('ethers')
const Router = require('airswap.js/src/protocolMessaging')
const ERC20 = require('airswap.js/src/erc20')
const Swap = require('airswap.js/src/swap')
const { nest } = require('airswap.js/src/swap/utils')
const { SWAP_CONTRACT_ADDRESS } = require('airswap.js/src/constants')

const { PRIVATE_KEY, ENV } = process.env

if (!ENV) {
  console.log(`Please set ENV='development' to run on the rinkeby test network, by default it runs against mainnet`)
}

if (!PRIVATE_KEY) {
  throw new Error('must set PRIVATE_KEY and MAINNET environment variables')
}

if (!PRIVATE_KEY.startsWith('0x')) {
  throw new Error('private key must start with "0x"')
}

// You _must_ set up an order server if you want to provide orders on the AirSwap network
// check out the order-server-examples/ directory for working examples
const ORDER_SERVER_URL = process.env.ORDER_SERVER_URL || 'http://localhost:5004'

const app = express()
app.use(express.json())

const sendResponse = (res, data) => res.status(200).send(data)

const asyncMiddleware = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

const wallet = new ethers.Wallet(PRIVATE_KEY)
const address = wallet.address.toLowerCase()
const messageSigner = data => wallet.signMessage(data)

const routerParams = {
  messageSigner,
  address,
  keyspace: false,
  requireAuthentication: true,
}

const airswap = new Router(routerParams)

/**  RPC METHODS
 * These methods are called when other peers on the AirSwap
 * network contact us to request a quote or an order.
 * You must implement an order server at `ORDER_SERVER_URL`
 * with the routes /getOrder, /getQuote, and /getMaxQuote
 * to receive and process these forwarded requests.
 * getMakerSideOrder
 * getTakerSideOrder
 * getMakerSideQuote
 * getTakerSideQuote
 * getMaxQuote
 */

const getOrder = payload => {
  const { message, sender } = payload
  let { params } = message
  if (typeof params === 'string' && params.startsWith('-----BEGIN PGP MESSAGE-----')) {
    params = airswap.decryptMessage(params)
  }

  params.makerAddress = airswap.wallet.address

  // forward the order request to our Order Server and wait for a response
  rp({
    method: 'POST',
    uri: `${ORDER_SERVER_URL}/getOrder`,
    json: true,
    body: params,
  })
    .then(orderParams => {
      // Once we receive the order back from our Order Server, let's sign it
      const signedOrder = Swap.signSwap(
        nest({ ...orderParams, makerAddress: airswap.wallet.address, takerAddress: params.takerAddress }),
        wallet,
      )

      // Last, let's send our signed order back to the address who requested it
      airswap.call(
        sender,
        { id: message.id, jsonrpc: '2.0', result: signedOrder }, // response id matches their `message.id`
      )
      return signedOrder
    })
    .catch(e => console.log(e.message))
}

const getQuote = payload => {
  const { message, sender } = payload
  let { params } = message
  if (typeof params === 'string' && params.startsWith('-----BEGIN PGP MESSAGE-----')) {
    params = airswap.decryptMessage(params)
  }

  params.makerAddress = airswap.wallet.address

  // forward the quote request to our Order Server and wait for a response
  rp({
    method: 'POST',
    uri: `${ORDER_SERVER_URL}/getQuote`,
    json: true,
    body: params,
  })
    .then(quote => {
      // no need to sign anything before sending the quote back because this is just a price quote (not a firm order)
      airswap.call(
        sender,
        { id: message.id, jsonrpc: '2.0', result: quote }, // response id matches their `message.id`
      )
      return quote
    })
    .catch(e => console.log(e.message))
}

// This method is called in order for you to signal the largest trade you can provide
// It is a vital indicator of maximum liquidity in the AirSwap ecosystem.
const getMaxQuote = payload => {
  const { message, sender } = payload
  let { params } = message
  if (typeof params === 'string' && params.startsWith('-----BEGIN PGP MESSAGE-----')) {
    params = airswap.decryptMessage(params)
  }

  // forward the maxQuote request to our Order Server and wait for a response
  rp({
    method: 'POST',
    uri: `${ORDER_SERVER_URL}/getMaxQuote`,
    json: true,
    body: params,
  })
    .then(maxQuote => {
      // no need to sign anything before sending the maxQuote back because this is just a price maxQuote (not a firm order)
      airswap.call(
        sender,
        { id: message.id, jsonrpc: '2.0', result: maxQuote }, // response id matches their `message.id`
      )
      return maxQuote
    })
    .catch(e => console.log(e.message))
}

airswap.RPC_METHOD_ACTIONS.getMakerSideOrder = getOrder
airswap.RPC_METHOD_ACTIONS.getTakerSideOrder = getOrder
airswap.RPC_METHOD_ACTIONS.getMakerSideQuote = getQuote
airswap.RPC_METHOD_ACTIONS.getTakerSideQuote = getQuote
airswap.RPC_METHOD_ACTIONS.getMaxQuote = getMaxQuote

/* END RPC METHODS */

/**
 * Standard API Methods
 * These are methods that you call on your server locally to interact with others
 * on the AirSwap network, or to perform general tasks such as approving tokens
 * for trade and setting intents on the indexer.
 */

app.post(
  '/findIntents',
  asyncMiddleware(async (req, res) => {
    const { makerTokens, takerTokens, role = 'maker' } = req.body
    const intents = await airswap.findIntents(makerTokens, takerTokens, role)
    sendResponse(res, intents)
  }),
)

app.post(
  '/getIntents',
  asyncMiddleware(async (req, res) => {
    const intents = await airswap.getIntents(req.body.address)
    sendResponse(res, intents)
  }),
)

app.post(
  '/setIntents',
  asyncMiddleware(async (req, res) => {
    const intents = req.body.length ? req.body : null
    const data = await airswap.setIntents(intents)
    sendResponse(res, data)
  }),
)

app.post(
  '/getOrder',
  asyncMiddleware(async (req, res) => {
    const { makerAddress, params } = req.body
    try {
      const order = await airswap.getOrder(makerAddress, params)
      sendResponse(res, order)
    } catch (e) {
      sendResponse(res, e.message)
    }
  }),
)

app.post(
  '/getOrders',
  asyncMiddleware(async (req, res) => {
    const { intents, makerAmount } = req.body
    const orders = await airswap.getOrders(intents, makerAmount)
    sendResponse(res, orders)
  }),
)

app.post(
  '/getQuote',
  asyncMiddleware(async (req, res) => {
    const { makerAddress, makerToken, takerToken, makerAmount, takerAmount } = req.body
    const quote = await airswap.getQuote({ makerAddress, makerToken, takerToken, makerAmount, takerAmount })
    sendResponse(res, quote)
  }),
)

app.post(
  '/getMaxQuote',
  asyncMiddleware(async (req, res) => {
    const { makerAddress, makerToken, takerToken } = req.body
    const quote = await airswap.getMaxQuote({ makerAddress, makerToken, takerToken })
    sendResponse(res, quote)
  }),
)

app.post('/signOrder', (req, res) => {
  const { makerAddress, makerAmount, makerToken, takerAddress, takerAmount, takerToken, expiration, nonce } = req.body
  const order = {
    makerAddress,
    makerAmount,
    makerToken,
    takerAddress,
    takerAmount,
    takerToken,
    expiration,
    nonce,
  }
  const signedSwap = Swap.signSwap(nest(order), wallet)
  sendResponse(res, signedSwap)
})

app.post(
  '/fillOrder',
  asyncMiddleware(async (req, res) => {
    const { order } = req.body
    const tx = await Swap.swap(order, wallet)
    sendResponse(res, tx)
  }),
)

app.post(
  '/unwrapWeth',
  asyncMiddleware(async (req, res) => {
    const { amount } = req.body
    const tx = await ERC20.unwrapWeth(amount, wallet)
    sendResponse(res, tx)
  }),
)

app.post(
  '/wrapWeth',
  asyncMiddleware(async (req, res) => {
    const { amount } = req.body
    const tx = await ERC20.wrapWeth(amount, wallet)
    sendResponse(res, tx)
  }),
)

app.post(
  '/approveTokenForTrade',
  asyncMiddleware(async (req, res) => {
    const { tokenContractAddr } = req.body
    const tx = await ERC20.approveToken(tokenContractAddr, SWAP_CONTRACT_ADDRESS, wallet)
    sendResponse(res, tx)
  }),
)

app.post(
  '/registerPGPKey',
  asyncMiddleware(async (req, res) => {
    const tx = await airswap.registerPGPKey()
    sendResponse(res, tx)
  }),
)

/* END STANDARD API METHODS */

// Connect to AirSwap and listen for POSTs
airswap.connect()

// custom error handling middleware
// `next` _must_ be defined in the funciton signature here or else Express will not apply this custom error handling middleware!
app.use((err, req, res, next) => {
  console.error(`Error ocurred when invoking method ${req.url}`)
  console.log(err)
  res.status(500).send(err)
})

app.listen(5005, () => console.log(`API client server listening on port 5005! Order server url: ${ORDER_SERVER_URL}`))
