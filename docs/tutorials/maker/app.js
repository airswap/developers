const ethers = require('ethers')
const Router = require('AirSwap.js/src/protocolMessaging')
const TokenMetadata = require('AirSwap.js/src/tokens')
const DeltaBalances = require('AirSwap.js/src/deltaBalances')

const PK = process.env.PRIVATE_KEY
if (!PK) {
  console.log('Please set the PRIVATE_KEY environment variable')
  process.exit(0)
}

const AST = '0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8' // Rinkeby AST address
const ETH = '0x0000000000000000000000000000000000000000'

const wallet = new ethers.Wallet(PK)
const address = wallet.address.toLowerCase()
const messageSigner = data => wallet.signMessage(data)
const routerParams = {
  messageSigner,
  address,
  keyspace: false
}
const router = new Router(routerParams)

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

async function getOrder(payload) {
  const { params } = payload.message

  // Price the order
  const { makerAmount, takerAmount } = priceTrade(params)

  // Construct the order
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
}

async function getQuote(payload) {
  const { params } = payload.message

  // Price the quote
  const { makerAmount, takerAmount } = priceTrade(params)

  // Construct the quote
  quote = {
    makerAmount: Number(makerAmount).toString(),
    takerAmount: Number(takerAmount).toString(),
    makerToken: params.makerToken,
    takerToken: params.takerToken,
    makerAddress: address,
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
  const balances = await DeltaBalances.getManyBalancesManyAddresses([params.makerToken], [address])
  const makerTokenBalance = balances[address][params.makerToken]
  const takerTokenBalance = balances[address][params.takerToken]

  // Set the maker or taker amount depending on the available balance
  if (TokenMetadata.tokenSymbolsByAddress[params.takerToken] == 'ETH') {
    params.makerAmount = makerTokenBalance
  } else if (TokenMetadata.tokenSymbolsByAddress[params.makerToken == 'WETH']) {
    params.takerAmount = takerTokenBalance
  } else {
    // We can't make this trade. It'd be a good idea to send a response here but none is required.
    return
  }

  // Price the trade for the maximum amount
  const { makerAmount, takerAmount } = priceTrade(params)
  const quote = {
    ...params,
    makerAmount,
    takerAmount
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

    // Set an intent to trade AST/ETH
    // Your wallet must have 250 AST to complete this step.
    // If you have Rinkeby ETH, you can buy Rinkeby AST at:
    // https://sandbox.airswap.io
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

    // Set handlers for quotes
    router.RPC_METHOD_ACTIONS['getOrder'] = getOrder
    router.RPC_METHOD_ACTIONS['getQuote'] = getQuote
    router.RPC_METHOD_ACTIONS['getMaxQuote'] = getMaxQuote
}

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

  const signedMsg = await wallet.signMessage(ethers.utils.arrayify(hashedOrder))
  const sig = ethers.utils.splitSignature(signedMsg)

  return {
    ...order,
    ...sig
  }
}

main()