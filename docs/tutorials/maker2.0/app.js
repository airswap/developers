const dotenv = require('dotenv')
dotenv.config()
const ethers = require('ethers')
const Router = require('AirSwap.js/src/protocolMessaging')
const TokenMetadata = require('AirSwap.js/src/tokens')
const DeltaBalances = require('AirSwap.js/src/deltaBalances')
const Swap = require('AirSwap.js/src/swap')
const PK = process.env.PRIVATE_KEY
const ENV = process.env.ENV

const makerSymbol = 'WETH'
const takerSymbol = 'DAI'

if (!ENV) {
  console.log(`Please set ENV='development' to run against rinkeby, by default it runs against mainnet`)
}

if (!PK) {
  console.log('Please set the PRIVATE_KEY environment variable')
  process.exit(0)
}



const wallet = new ethers.Wallet(PK)

console.log('test', wallet.signMessage)

const address = wallet.address.toLowerCase()
const messageSigner = data => wallet.signMessage(data)
const routerParams = {
  messageSigner,
  address,
  keyspace: false,
  requireAuthentication: true
}

const router = new Router(routerParams)

function priceTrade(params) {
  // Assume a fixed price of 0.01 DAI/WETH
  // You should implement your own pricing logic here.
  const price = 200

  let makerParam
  let takerParam

  if (params.makerParam) {
    // Maker amount specified, calculate the amount taker must send
    makerParam = params.makerParam
    const makerParamDecimals = TokenMetadata.formatDisplayValueByToken({address: params.makerToken}, params.makerParam)
    const takerParamDecimals = makerParamDecimals * price
    takerParam = TokenMetadata.formatAtomicValueByToken({address: params.takerToken}, takerParamDecimals)
  } else if (params.takerParam) {
    // Taker amount specified, calculate the amount maker must send
    takerParam = params.takerParam
    const takerParamDecimals = TokenMetadata.formatDisplayValueByToken({address: params.takerToken}, params.takerParam)
    const makerParamDecimals = takerParamDecimals / price
    makerParam = TokenMetadata.formatAtomicValueByToken({address: params.makerToken}, makerParamDecimals)
  }
  console.log('PRICED TRADE', makerParam,
    takerParam)
  return {
    makerParam,
    takerParam
  }
}

async function getOrder(payload) {
  const { params } = payload.message

  // Price the order
  const { makerParam, takerParam } = priceTrade(params)

  // Construct the order
  const order = {
    nonce: Date.now(),
    makerWallet: address,
    takerWallet: params.takerWallet,
    makerParam: makerParam,
    takerParam: takerParam,
    makerToken: params.makerToken,
    takerToken: params.takerToken,
    expiry: Math.round(new Date().getTime()/ 1000) + 300 // Expire after 5 minutes
  }
  // Sign the order
  const signedOrder = await Swap.signSwap(order, wallet)

  // Construct a JSON RPC response
  response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: signedOrder
  }

  // Send the order
  router.call(payload.sender, response)
  console.log('sent order', response)
}

async function getQuote(payload) {
  const { params } = payload.message

  // Price the quote
  const { makerParam, takerParam } = priceTrade(params)

  // Construct the quote
  const quote = {
    makerParam: makerParam,
    takerParam: takerParam,
    makerToken: params.makerToken,
    takerToken: params.takerToken,
    makerWallet: address,
  }

  // Construct a JSON RPC response
  response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: quote
  }

  // Send the quote
  router.call(payload.sender, response)
  console.log('sent quote', response)
}

async function getMaxQuote(payload) {
  console.log(payload)
  // This method is called in order for you to signal the largest trade you can provide
  // It is a vital indicator of maximum liquidity in the AirSwap ecosystem.
  const { params } = payload.message

  // Get our token balances to see how much liquidity we have available
  const balances = await DeltaBalances.getManyBalancesManyAddresses([params.makerToken], [address])
  const makerTokenBalance = balances[address][params.makerToken]

  params.makerParam = makerTokenBalance

  // Price the trade for the maximum amount
  const { makerParam, takerParam } = priceTrade(params)
  const quote = {
    ...params,
    makerParam,
    takerParam,
    makerWallet: address
  }

  // Construct a JSON RPC response
  response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: quote
  }

  // Send the max quote
  router.call(payload.sender, response)
  console.log('sent max quote', response)
}

async function main() {
  // Connect and authenticate with the AirSwap Websocket
  await router.connect().catch(e => {
    console.log('unable to connect to Websocket', e)
  })

  // Fetch token metadata
  await TokenMetadata.ready
  const makerToken = TokenMetadata.tokenAddressesBySymbol[makerSymbol]
  const takerToken = TokenMetadata.tokenAddressesBySymbol[takerSymbol]

  // Set an intent to trade DAI/WETH
  // Your wallet must have 250 DAI to complete this step.
  // If you have Rinkeby ETH, you can buy Rinkeby DAI at:
  // https://instant.development.airswap.io

  const intents = [
    {
      makerToken,
      takerToken,
      role: 'maker',
      supportedMethods: ["getOrder", "getQuote", "getMaxQuote"],
      swapVersion: 2
    }
  ]

  await router.setIntents(intents).then((resp) => {
    console.log(`setIntents for ${makerSymbol}/${takerSymbol}`, resp, JSON.stringify(intents, null, 2), address)
  }).catch(e => {
    console.log('unable to setIntents', e)
  })

  // Set handlers for quotes
  router.RPC_METHOD_ACTIONS['getOrder'] = getOrder
  router.RPC_METHOD_ACTIONS['getQuote'] = getQuote
  router.RPC_METHOD_ACTIONS['getMaxQuote'] = getMaxQuote
}

main()
