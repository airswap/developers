const express = require('express')
const rp = require('request-promise')
const ethers = require('ethers')
const Router = require('airswap.js/src/protocolMessaging')
const Swap = require('airswap.js/src/swap')
const { nest } = require('airswap.js/src/swap/utils')

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

const ORDER_SERVER_URL = process.env.ORDER_SERVER_URL || 'http://localhost:5004/getOrder'

const app = express()
// json body parser middleware
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
 * network contact us to request a quote or an order
 * getMakerSideOrder
 * getTakerSideOrder
 * getMakerSideQuote
 * getTakerSideQuote
 * getMaxQuote
 */

const getOrder = payload => {
  const { message, sender, receiver } = payload
  let { params } = message
  if (typeof params === 'string' && params.startsWith('-----BEGIN PGP MESSAGE-----')) {
    params = airswap.decryptMessage(params)
  }

  params.makerAddress = airswap.wallet.address

  rp({
    method: 'POST',
    uri: ORDER_SERVER_URL,
    json: true,
    body: params,
  })
    .then(orderParams => {
      // Sign the order
      const signedOrder = Swap.signSwap(
        nest({ ...orderParams, makerAddress: airswap.wallet.address, takerAddress: params.takerAddress }),
        wallet,
      )

      airswap.call(
        sender, // send order to address who requested it
        { id: message.id, jsonrpc: '2.0', result: signedOrder }, // response id should match their `message.id`
      )
      return signedOrder
    })
    .catch(e => console.log(e.message))
}

airswap.RPC_METHOD_ACTIONS.getMakerSideOrder = getOrder
airswap.RPC_METHOD_ACTIONS.getTakerSideOrder = getOrder

/* END RPC METHODS */

/**
 * Standard API Methods
 * These are methods that you call on your server locally to interact with others
 * on the AirSwap network, or to perform general tasks such as approving tokens
 * for trade and setting intents on the indexer.
 */

app.post('/findIntents', async (req, res) => {
  const { makerTokens, takerTokens, role = 'maker' } = req.body
  const intents = await airswap.findIntents(makerTokens, takerTokens, role)
  sendResponse(res, intents)
})

app.post(
  '/getIntents',
  asyncMiddleware(async (req, res) => {
    const intents = await airswap.getIntents(req.body.address)
    sendResponse(res, intents)
  }),
)

app.post('/setIntents', async (req, res) => {
  const intents = req.body.length ? req.body : null
  const data = await airswap.setIntents(intents)
  sendResponse(res, data)
})

app.post('/getOrder', async (req, res) => {
  const { makerAddress, params } = req.body
  try {
    const order = await airswap.getOrder(makerAddress, params)
    sendResponse(res, order)
  } catch (e) {
    sendResponse(res, e.message)
  }
})

app.post('/getOrders', async (req, res) => {
  const { intents, makerAmount } = req.body
  const orders = await airswap.getOrders(intents, makerAmount)
  sendResponse(res, orders)
})

app.post('/getQuote', async (req, res) => {
  const { makerAddress, makerToken, takerToken, makerAmount, takerAmount } = req.body
  const quote = await airswap.getQuote({ makerAddress, makerToken, takerToken, makerAmount, takerAmount })
  sendResponse(res, quote)
})

app.post('/getMaxQuote', async (req, res) => {
  const { makerAddress, makerToken, takerToken } = req.body
  const quote = await airswap.getMaxQuote({ makerAddress, makerToken, takerToken })
  sendResponse(res, quote)
})

app.post('/signOrder', (req, res) => {
  const { makerAddress, makerAmount, makerToken, takerAddress, takerAmount, takerToken, expiration, nonce } = req.body
  sendResponse(
    res,
    airswap.signOrder({
      makerAddress,
      makerAmount,
      makerToken,
      takerAddress,
      takerAmount,
      takerToken,
      expiration,
      nonce,
    }),
  )
})

app.post('/fillOrder', async (req, res) => {
  const { order, config } = req.body
  const tx = await airswap.fillOrder(order, config)
  sendResponse(res, tx)
})

app.post('/unwrapWeth', async (req, res) => {
  const { amount, config } = req.body
  const tx = await airswap.unwrapWeth(amount, config)
  sendResponse(res, tx)
})

app.post('/wrapWeth', async (req, res) => {
  const { amount, config } = req.body
  const tx = await airswap.wrapWeth(amount, config)
  sendResponse(res, tx)
})

app.post('/approveTokenForTrade', async (req, res) => {
  const { tokenContractAddr, config } = req.body
  const tx = await airswap.approveTokenForTrade(tokenContractAddr, config)
  sendResponse(res, tx)
})

app.post('/registerPGPKey', async (req, res) => {
  const tx = await airswap.registerPGPKey()
  sendResponse(res, tx)
})

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
