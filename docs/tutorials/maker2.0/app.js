const dotenv = require('dotenv')
dotenv.config()
const ethers = require('ethers')
const Router = require('airswap.js/src/protocolMessaging')
const TokenMetadata = require('airswap.js/src/tokens')
const DeltaBalances = require('airswap.js/src/deltaBalances')
const Swap = require('airswap.js/src/swap')
const { nest } = require('airswap.js/src/swap/utils')

const PK = process.env.PRIVATE_KEY
const ENV = process.env.ENV

const signerSymbol = 'WETH'
const senderSymbol = 'DAI'

if (!ENV) {
  // noinspection JSAnnotator
  console.log(`Please set ENV='development' to run against rinkeby, by default it runs against mainnet`)
}

if (!PK) {
  console.log('Please set the PRIVATE_KEY environment variable')
  process.exit(0)
}

const wallet = new ethers.Wallet(PK)

const address = wallet.address.toLowerCase()
const messageSigner = data => wallet.signMessage(data)
const routerParams = {
  messageSigner,
  address,
  keyspace: false,
  requireAuthentication: true
}

const router = new Router(routerParams)
console.log(`connecting to ${router.socketUrl}`)
function priceTrade(params) {
  // Assume a fixed price of 0.01 DAI/WETH
  // You should implement your own pricing logic here.
  const price = 160

  let signerParam
  let senderParam

  if (params.signerParam) {
    // Signer amount specified, calculate the amount sender must send
    signerParam = params.signerParam
    const signerParamDecimals = TokenMetadata.formatDisplayValueByToken({address: params.signerToken}, params.signerParam)
    const senderParamDecimals = signerParamDecimals * price
    senderParam = TokenMetadata.formatAtomicValueByToken({address: params.senderToken}, senderParamDecimals)
  } else if (params.senderParam) {
    // Sender amount specified, calculate the amount signer must send
    senderParam = params.senderParam
    const senderParamDecimals = TokenMetadata.formatDisplayValueByToken({address: params.senderToken}, params.senderParam)
    const signerParamDecimals = senderParamDecimals / price
    signerParam = TokenMetadata.formatAtomicValueByToken({address: params.signerToken}, signerParamDecimals)
  }
  return {
    signerParam,
    senderParam
  }
}

async function getOrder(payload) {
  const { params } = payload.message
  // Price the order
  const { signerParam, senderParam } = priceTrade(params)

  // Construct the order
  const order = {
    nonce: `${Date.now()}`,
    signerWallet: address,
    senderWallet: params.senderWallet,
    signerParam: signerParam,
    senderParam: senderParam,
    signerToken: params.signerToken,
    senderToken: params.senderToken,
    expiry: `${Math.round(new Date().getTime()/ 1000) + 300}` // Expire after 5 minutes
  }

  // Sign the order
  const signedOrder = await Swap.signSwap(nest(order), wallet)

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
  const { signerParam, senderParam } = priceTrade(params)

  // Construct the quote
  const quote = {
    signerKind: '0x277f8169',
    signerParam: signerParam,
    signerToken: params.signerToken,
    senderKind: '0x277f8169',
    senderParam: senderParam,
    senderToken: params.senderToken,
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
  // This method is called in order for you to signal the largest trade you can provide
  // It is a vital indicator of maximum liquidity in the AirSwap ecosystem.
  const { params } = payload.message

  // Get our token balances to see how much liquidity we have available
  const balances = await DeltaBalances.getManyBalancesManyAddresses([params.signerToken], [address])
  const signerTokenBalance = balances[address][params.signerToken]

  params.signerParam = signerTokenBalance
  // Price the trade for the maximum amount
  const { signerParam, senderParam } = priceTrade(params)

  const quote = {
    ...params,
    signerParam,
    senderParam,
    signerKind: '0x277f8169',
    senderKind: '0x277f8169',
  }

  // Construct a JSON RPC response
  response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: quote
  }

  // Send the max quote
  router.call(payload.sender, response)
  // console.log('sent max quote', response)
}

async function main() {
  // Connect and authenticate with the AirSwap Websocket
  await router.connect().catch(e => {
    console.log('unable to connect to Websocket', e)
  })

  // Fetch token metadata
  await TokenMetadata.ready
  const signerToken = TokenMetadata.tokenAddressesBySymbol[signerSymbol]
  const senderToken = TokenMetadata.tokenAddressesBySymbol[senderSymbol]

  // Set an intent to trade DAI/WETH
  // Your wallet must have 250 DAI to complete this step.
  // If you have Rinkeby ETH, you can buy Rinkeby DAI at:
  // https://instant.development.airswap.io

  const intents = [
    {
      makerToken: signerToken,
      takerToken: senderToken,
      role: 'maker',
      supportedMethods: ["getSignerSideOrder", "getSenderSideOrder", "getSignerSideQuote", "getSenderSideQuote", "getMaxQuote"],
      swapVersion: 2
    }
  ]


  await router.setIntents(intents).then((resp) => {
    console.log(`setIntents for ${signerSymbol}/${senderSymbol}`, resp, JSON.stringify(intents, null, 2), address)
  }).catch(e => {
    console.log(`unable to setIntents for signerWallet ${address}`, JSON.stringify(intents, null, 2), e)
  })

  // Set handlers for quotes
  router.RPC_METHOD_ACTIONS['getSignerSideOrder'] = getOrder
  router.RPC_METHOD_ACTIONS['getSenderSideOrder'] = getOrder
  router.RPC_METHOD_ACTIONS['getSignerSideQuote'] = getQuote
  router.RPC_METHOD_ACTIONS['getSenderSideQuote'] = getQuote
  router.RPC_METHOD_ACTIONS['getMaxQuote'] = getMaxQuote
}

main()
