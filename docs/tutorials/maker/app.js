const ethers = require('ethers')
const Router = require('AirSwap.js/src/protocolMessaging')
const TokenMetadata = require('AirSwap.js/src/tokens')
const DeltaBalances = require('AirSwap.js/src/deltaBalances')
const { getDeltaBalancesWalletAllowances } = require('AirSwap.js/src/deltaBalances/contractFunctions')
const { SWAP_LEGACY_CONTRACT_ADDRESS, httpProvider } = require('AirSwap.js/src/constants')
const { approveToken } = require('AirSwap.js/src/erc20')

const PK = process.env.PRIVATE_KEY
const ENV = process.env.ENV
if (!ENV) {
  console.log(`Please set ENV='development' to run against rinkeby, by default it runs against mainnet`)
}

if (!PK) {
  console.log('Please set the PRIVATE_KEY environment variable')
  process.exit(0)
}

const wallet = new ethers.Wallet(PK, httpProvider)
const address = wallet.address.toLowerCase()
const messageSigner = data => wallet.signMessage(data)
const routerParams = {
  messageSigner,
  address,
  keyspace: false,
  requireAuthentication: true,
}

const router = new Router(routerParams)

function priceTrade(params) {
  /**
   * YOU SHOULD IMPLEMENT YOUR OWN PRICING LOGIC HERE.
   * */

  // You probably want a bunch of conditionals,hedging logic, etc. here..
  // In our naive example, let's assume a fixed price of 1 TGBP/TUSD
  const price = 1

  let makerAmount
  let takerAmount

  if (params.makerAmount) {
    // Maker amount specified by user, so we calculate the takerAmount
    makerAmount = params.makerAmount
    const makerAmountDecimals = TokenMetadata.formatDisplayValueByToken(
      { address: params.makerToken },
      params.makerAmount,
    )
    const takerAmountDecimals = makerAmountDecimals * price
    takerAmount = TokenMetadata.formatAtomicValueByToken({ address: params.takerToken }, takerAmountDecimals)
  } else if (params.takerAmount) {
    // Taker amount specified by user, so we calculate the makerAmount
    takerAmount = params.takerAmount
    const takerAmountDecimals = TokenMetadata.formatDisplayValueByToken(
      { address: params.takerToken },
      params.takerAmount,
    )
    const makerAmountDecimals = takerAmountDecimals / price
    makerAmount = TokenMetadata.formatAtomicValueByToken({ address: params.makerToken }, makerAmountDecimals)
  }

  return {
    makerAmount,
    takerAmount,
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
    nonce: Number(Math.random() * 100000)
      .toFixed()
      .toString(),
    expiration: Math.round(new Date().getTime() / 1000) + 300, // Expire after 5 minutes
  }

  // Sign the order
  const signedOrder = await signOrder(order)

  // Construct a JSON RPC response
  response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: signedOrder,
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
    result: quote,
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

  // Price the trade for the maximum amount
  const { makerAmount, takerAmount } = priceTrade({ makerAmount: makerTokenBalance, ...params })
  const quote = {
    ...params,
    makerAmount,
    takerAmount,
  }

  // Construct a JSON RPC response
  const response = {
    id: payload.message.id,
    jsonrpc: '2.0',
    result: quote,
  }

  router.call(payload.sender, response)
  console.log('sent max quote', response)
}

async function approveTokensForTrade(tokens) {
  const walletEthBalance = await wallet.getBalance()
  if (walletEthBalance === 0) {
    console.error('Wallet balance is empty. Need some ETH to submit approval transactions')
    process.exit(0)
  }

  // we can't do this efficiently with Promise.all. Have to submit one by one otherwise we'll end up
  // sending transactions to the network faster than the network can propagate the “pending” nonce
  for (const [tokenAddress] of tokens) {
    console.log(`submitting approval for ${tokenAddress}..`)
    const tx = await approveToken(tokenAddress, SWAP_LEGACY_CONTRACT_ADDRESS, wallet)
    console.log(`submitted tx: ${tx.hash}`)
    const receipt = await tx.wait()
    console.log(`mined tx: ${receipt.transactionHash}`)
  }
}

async function main() {
  // 1. Connect and authenticate with the AirSwap Websocket
  await router.connect().catch(e => {
    console.log('unable to connect to Websocket', e)
  })

  // Fetch token metadata
  await TokenMetadata.ready
  const { TUSD, TGBP, TCAD, THKD, TAUD } = TokenMetadata.tokenAddressesBySymbol
  const tokenAddresses = [TUSD, TGBP, TCAD, THKD, TAUD]

  // Check to see if we've approved the Swap contract as a spender of these tokens yet
  const tokensNeedApproval = (await getDeltaBalancesWalletAllowances(
    address,
    SWAP_LEGACY_CONTRACT_ADDRESS,
    tokenAddresses,
  ))
    .map((allowanceBigNumber, idx) => [tokenAddresses[idx], allowanceBigNumber.toString()])
    .filter(([tokenAddress, tokenAllowance]) => {
      if (tokenAllowance === '0') {
        console.error(
          `Allowance for ${tokenAddress} is 0. Trades will fail until Swap contract is approved as a spender`,
        )
        return true
      }
      return false
    })

  // Try to automatically approve tokens with 0 allowance
  if (tokensNeedApproval.length > 0) {
    await approveTokensForTrade(tokensNeedApproval)
  }

  // Set an intent for each side of the market we want to make
  // Your wallet must have 250 AST per intent to complete this step
  // Get testnet AST from the rinkeby faucet
  // https://ast-faucet-ui.development.airswap.io

  await router
    .setIntents([
      {
        makerToken: TUSD,
        takerToken: TGBP,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TUSD,
        takerToken: TCAD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TUSD,
        takerToken: THKD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TUSD,
        takerToken: TAUD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TGBP,
        takerToken: TUSD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TCAD,
        takerToken: TUSD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: THKD,
        takerToken: TUSD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
      {
        makerToken: TAUD,
        takerToken: TUSD,
        role: 'maker',
        supportedMethods: ['getOrder', 'getQuote', 'getMaxQuote'],
        swapVersion: 1,
      },
    ])
    .then(() => {
      console.log('set intents successfully')
    })
    .catch(e => {
      console.log('unable to setIntents', e)
    })

  // Set handlers for quotes
  router.RPC_METHOD_ACTIONS['getOrder'] = getOrder
  router.RPC_METHOD_ACTIONS['getQuote'] = getQuote
  router.RPC_METHOD_ACTIONS['getMaxQuote'] = getMaxQuote
}

async function signOrder({
  makerAddress,
  makerAmount,
  makerToken,
  takerAddress,
  takerAmount,
  takerToken,
  expiration,
  nonce,
}) {
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
    ...sig,
  }
}

main()
