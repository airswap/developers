const WebSocket = require('isomorphic-ws')
const ethers = require('ethers')
const erc20 = require('human-standard-token-abi')
const exchange = require('./exchangeABI.json')
const weth = require('./wethABI.json')
const pgpABI = require('./pgpABI.json')
const uuid = require('uuid4')
const openpgp = require('openpgp')

const { Contract, Wallet, utils, providers } = ethers

const TIMEOUT = 12000
const INDEXER_ADDRESS = '0x0000000000000000000000000000000000000000'
const IPFS_URL = 'https://ipfs.airswap.io:443'

const ipfs = require('nano-ipfs-store').at(IPFS_URL)

// Class Constructor
// ----------------
class AirSwap {
  // * `privateKey`: `string` - ethereum private key with `"0x"` prepended
  // * `infuraKey`: `string` - infura API key
  // * `nodeAddress`: `string` - optionally specify a geth/parity node instead of using infura
  // * `rpcActions`: `Object` - user defined methods; called by peers via JSON-RPC
  // * `networkId`: `string` - which ethereum network is used; `'rinkeby'` or `'mainnet'`
  constructor(config) {
    const { privateKey, infuraKey, nodeAddress, rpcActions = {}, networkId = 'rinkeby' } = config
    const networkName = networkId === 'mainnet' ? 'homestead' : 'rinkeby'

    // Create infura provider by default
    let provider = new providers.InfuraProvider(networkName, infuraKey)

    // If user specified, use a geth/parity node instead
    provider = nodeAddress ? new providers.JsonRpcProvider(nodeAddress, networkName) : provider

    // Create an ethereum wallet object for signing orders
    this.wallet = new Wallet(privateKey, provider)

    // Create an AirSwap contract object based on environment
    this.exchangeContract =
      networkId === 'mainnet'
        ? new Contract('0x8fd3121013a07c57f0d69646e86e7a4880b467b7', exchange.abi, this.wallet)
        : new Contract('0x07fc7c43d8168a2730344e5cf958aaecc3b42b41', exchange.abi, this.wallet)

    // Create a W-ETH contract object based on environment
    this.wethContract =
      networkId === 'mainnet'
        ? new Contract('0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', weth.abi, this.wallet)
        : new Contract('0xc778417e063141139fce010982780140aa0cd5ab', weth.abi, this.wallet)

    this.pgpContract =
      networkId === 'mainnet'
        ? new Contract('0xa6a52efd0e0387756bc0ef10a34dd723ac408a30', pgpABI, this.wallet)
        : new Contract('0x9d7efd45e45c575cafb25d49d43556f43ebe3456', pgpABI, this.wallet)
    // Set the websocket url based on environment
    this.socketUrl =
      networkId === 'mainnet' ? 'wss://connect.airswap-api.com/websocket' : 'wss://sandbox.airswap-api.com/websocket'

    // Websocket authentication state
    this.isAuthenticated = false

    // Promise resolvers/rejectors and timeouts for each call
    this.RESOLVERS = {}
    this.REJECTORS = {}
    this.TIMEOUTS = {}
    this.pgpKeys = {}

    // Inform the user if the address powering this instance has registered PGP keys for KeySpace protocol communication
    this.getPGPKey(this.wallet.address.toLowerCase())
      .then(() => console.log('KeySpace PGP key is registered for this address!'))
      .catch(e => console.log(e.message))

    // User defined methods that will be invoked by peers on the JSON-RPC
    this.RPC_METHOD_ACTIONS = rpcActions

    this.getOrders = this.getOrders.bind(this)
    this.fillOrder = this.fillOrder.bind(this)
  }

  // RPC Methods
  // ----------------

  // Prepare a formatted query to be submitted as a JSON-RPC call
  static makeRPC(method, params = {}, id = uuid()) {
    return {
      jsonrpc: '2.0',
      method,
      params,
      id,
    }
  }

  // Send a JSON-RPC `message` to a `receiver` address.
  // Optionally pass `resolve` and `reject` callbacks to handle a response
  call(receiver, message, resolve, reject) {
    const messageString = JSON.stringify({
      sender: this.wallet.address.toLowerCase(),
      receiver,
      message: JSON.stringify(message),
      id: uuid(),
    })
    this.socket.send(messageString)

    // Set the promise resolvers and rejectors for this call
    if (typeof resolve === 'function') {
      this.RESOLVERS[message.id] = resolve
    }
    if (typeof reject === 'function') {
      this.REJECTORS[message.id] = reject
    }

    // Set a timeout for this call
    this.TIMEOUTS[message.id] = setTimeout(() => {
      if (typeof reject === 'function') {
        reject({ message: `Request timed out. [${message.id}]`, code: -1 })
      }
    }, TIMEOUT)
  }

  // WebSocket Interaction
  // ----------------

  // Connect to AirSwap by opening websocket. The sequence:
  // 1. Open a websocket connection
  // 2. Receive a challenge (some random data to sign)
  // 3. Sign the data and send it back over the wire
  // 4. Receive an "ok" and start sending and receiving RPC
  connect(reconnect = true) {
    this.socket = new WebSocket(this.socketUrl)

    // Check socket health every 30 seconds
    this.socket.onopen = function healthCheck() {
      this.isAlive = true
      // trying to make this isomorphic, and ping/pong isn't supported in browser websocket api
      if (this.ping) {
        this.addEventListener('pong', () => {
          this.isAlive = true
        })

        this.interval = setInterval(() => {
          if (this.isAlive === false) {
            console.log('no response for 30s; closing socket')
            this.close()
          }
          this.isAlive = false
          this.ping()
        }, 30000)
      }
    }

    // The connection was closed
    this.socket.onclose = e => {
      this.isAuthenticated = false
      clearInterval(this.socket.interval)
      if (reconnect) {
        console.log('socket closed; attempting reconnect in 10s')
        setTimeout(() => {
          this.connect()
        }, 10000)
      } else {
        console.log('socket closed')
      }
    }

    // There was an error on the connection
    this.socket.onerror = event => {
      throw new Error(event)
    }

    // Promisify the `onmessage` handler. Allows us to return information
    // about the connection state after the authentication handshake
    return new Promise((resolve, reject) => {
      // Received a message
      this.socket.onmessage = event => {
        // We are authenticating
        if (!this.isAuthenticated) {
          switch (event.data) {
            // We have completed the challenge.
            case 'ok':
              this.isAuthenticated = true
              console.log('Authentication successful')
              resolve(event.data)
              break
            case 'not authorized':
              reject(new Error('Address is not authorized.'))
              break
            default:
              // We have been issued a challenge.
              const signature = this.wallet.signMessage(event.data)
              this.socket.send(signature)
          }
        } else if (this.isAuthenticated) {
          // We are already authenticated and are receiving an RPC.
          let payload
          let message

          try {
            payload = JSON.parse(event.data)
            message = payload.message && JSON.parse(payload.message)
            payload.message = message
          } catch (e) {
            console.error('Error parsing payload', e, payload)
          }

          if (!payload || !message) {
            return
          }

          if (message.method) {
            // Another peer is invoking a method.
            if (this.RPC_METHOD_ACTIONS[message.method]) {
              this.RPC_METHOD_ACTIONS[message.method](payload)
            }
          } else if (message.id) {
            // We have received a response from a method call.
            const isError = Object.prototype.hasOwnProperty.call(message, 'error')

            if (!isError && message.result) {
              // Resolve the call if a resolver exists.
              if (typeof this.RESOLVERS[message.id] === 'function') {
                this.RESOLVERS[message.id](message.result)
              }
            } else if (isError) {
              // Reject the call if a resolver exists.
              if (typeof this.REJECTORS[message.id] === 'function') {
                this.REJECTORS[message.id](message.error)
              }
            }

            // Call lifecycle finished; tear down resolver, rejector, and timeout
            delete this.RESOLVERS[message.id]
            delete this.REJECTORS[message.id]
            clearTimeout(this.TIMEOUTS[message.id])
          }
        }
      }
    })
  }

  // Disconnect from AirSwap by closing websocket
  disconnect() {
    this.socket.close(1000)
  }

  // Interacting with the Indexer
  // ----------------

  // Query the indexer for trade intents.
  // * returns a `Promise` which is resolved with an array of `intents`
  findIntents(makerTokens, takerTokens, role = 'maker') {
    if (!makerTokens || !takerTokens) {
      throw new Error('missing arguments makerTokens or takerTokens')
    }
    const payload = AirSwap.makeRPC('findIntents', {
      makerTokens,
      takerTokens,
      role,
    })

    return new Promise((resolve, reject) => this.call(INDEXER_ADDRESS, payload, resolve, reject))
  }

  // Call `getIntents` on the indexer to return an array of tokens that the specified address has published intent to trade
  // * parameter `address` is a lowercased Ethereum address to fetch intents for
  // * returns a `Promise` which is resolved with an array of intents set by a specific address
  getIntents(address) {
    const payload = AirSwap.makeRPC('getIntents', { address })
    return new Promise((resolve, reject) => this.call(INDEXER_ADDRESS, payload, resolve, reject))
  }

  // Call `setIntents` on the indexer with an array of trade `intent` objects.
  // * returns a `Promise` with the indexer response. Passes `'OK'` if succcessful.
  setIntents(intents) {
    const payload = AirSwap.makeRPC('setIntents', {
      address: this.wallet.address.toLowerCase(),
      intents,
    })
    return new Promise((resolve, reject) => this.call(INDEXER_ADDRESS, payload, resolve, reject))
  }

  // Make a JSON-RPC `getOrder` call on a maker and recieve back a signed order (or a timeout if they fail to respond)
  // * `makerAddress`: `string` - the maker address to request an order from
  // * `params`: `Object` - order parameters. Must specify 1 of either `makerAmount` or `takerAmount`. Must also specify `makerToken` and `takerToken` addresses
  getOrder(makerAddress, params) {
    const { makerAmount, takerAmount, makerToken, takerToken } = params
    const BadArgumentsError = new Error('bad arguments passed to getOrder')

    if (!makerAmount && !takerAmount) throw BadArgumentsError
    if (makerAmount && takerAmount) throw BadArgumentsError
    if (!takerToken || !makerToken) throw BadArgumentsError

    const payload = AirSwap.makeRPC('getOrder', {
      makerToken,
      takerToken,
      takerAddress: this.wallet.address.toLowerCase(),
      makerAmount: makerAmount ? String(makerAmount) : null,
      takerAmount: takerAmount ? String(takerAmount) : null,
    })
    return new Promise((res, rej) => this.call(makerAddress, payload, res, rej))
  }

  // Given an array of trade intents, make a JSON-RPC `getOrder` call for each `intent`
  getOrders(intents, params) {
    const { makerAmount, takerAmount } = params
    if (!Array.isArray(intents) || !(makerAmount || takerAmount)) {
      throw new Error('bad arguments passed to getOrders')
    }
    return Promise.all(
      intents.map(({ address, makerToken, takerToken }) => {
        const payload = AirSwap.makeRPC('getOrder', {
          makerToken,
          takerToken,
          takerAddress: this.wallet.address.toLowerCase(),
          ...params,
        })
        // `Promise.all` will return a complete array of resolved promises, or just the first rejection if a promise fails.
        // To mitigate this, we `catch` errors on individual promises so that `Promise.all` always returns a complete array
        return new Promise((res, rej) => this.call(address, payload, res, rej)).catch(e => e)
      }),
    )
  }

  // Make a JSON-RPC `getQuote` call on a maker and recieve back an unsigned order (or a timeout if they fail to respond)
  // * `makerAddress`: `string` - the maker address to request a quote from
  // * `makerToken`: `string` - the address of the token that the maker will send
  // * `takerToken`: `string` - the address of the token that the taker will send
  // * `makerAmount`: `string` - the atomic amount of tokens that the maker will send (only fill in one of EITHER makerAmount OR takerAmount. The maker will fill in the side you don't specify when they send back the quote)
  // * `takerAmount`: `string` - the atomic amount of tokens that the taker will send (only fill in one of EITHER takerAmount OR makerAmount. The maker will fill in the side you don't specify when they send back the quote)
  getQuote({ makerToken, takerToken, makerAddress, makerAmount, takerAmount }) {
    if (makerAmount && takerAmount) {
      throw new Error('should only ever specify one of either makerAmount or takerAmount')
    }
    if (!makerToken || !takerToken || !makerAddress || (!makerAmount && !takerAmount)) {
      throw new Error('bad arguments passed to getQuote')
    }

    const payload = AirSwap.makeRPC('getQuote', { makerToken, takerToken, makerAmount, takerAmount })
    return new Promise((res, rej) => this.call(makerAddress, payload, res, rej))
  }

  // Make a JSON-RPC `getMaxQuote` call on a maker and recieve back an unsigned order for the largest possible trade the maker could make for the specified tokens (or a timeout if they fail to respond)
  // * `makerAddress`: `string` - the maker address to request a quote from
  // * `makerToken`: `string` - the address of the token that the maker will send
  // * `takerToken`: `string` - the address of the token that the taker will send
  getMaxQuote({ makerToken, takerToken, makerAddress }) {
    if (!makerToken || !takerToken || !makerAddress) {
      throw new Error('bad arguments passed to getMaxQuote')
    }

    const payload = AirSwap.makeRPC('getMaxQuote', { makerToken, takerToken })
    return new Promise((res, rej) => this.call(makerAddress, payload, res, rej))
  }

  // Interacting with Ethereum
  // ----------------

  // Return a signed `order` object for a taker to fill
  signOrder({ makerAddress, makerAmount, makerToken, takerAddress, takerAmount, takerToken, expiration, nonce }) {
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
    const hashedOrder = utils.solidityKeccak256(types, [
      makerAddress,
      makerAmount,
      makerToken,
      takerAddress,
      takerAmount,
      takerToken,
      expiration,
      nonce,
    ])

    const signedMsg = this.wallet.signMessage(ethers.utils.arrayify(hashedOrder))
    const sig = ethers.utils.splitSignature(signedMsg)

    return {
      makerAddress,
      makerAmount,
      makerToken,
      takerAddress,
      takerAmount,
      takerToken,
      expiration,
      nonce,
      ...sig,
    }
  }

  // Submit a signed `order` object by calling `fill` on the AirSwap smart contract.
  // * optionally pass an object to configure gas settings and amount of ether sent
  // * returns a `Promise`
  fillOrder(order, config = {}) {
    const { value, gasLimit = 160000, gasPrice = utils.parseEther('0.000000040') } = config

    if (!order.nonce) {
      throw new Error('bad order object')
    }
    return this.exchangeContract.fill(
      order.makerAddress,
      order.makerAmount,
      order.makerToken,
      order.takerAddress,
      order.takerAmount,
      order.takerToken,
      order.expiration,
      order.nonce,
      order.v,
      order.r,
      order.s,
      {
        value: value ? utils.bigNumberify(String(value)) : utils.parseEther('0'),
        gasLimit,
        gasPrice,
      },
    )
  }

  // Unwrap `amount` of W-ETH.
  // * optionally pass an object to configure gas settings
  // * returns a `Promise`
  unwrapWeth(amount, config = {}) {
    const { gasLimit = 160000, gasPrice = utils.parseEther('0.000000040') } = config
    return this.wethContract.withdraw(utils.parseEther(String(amount)), {
      gasLimit,
      gasPrice,
    })
  }

  // Wrap `amount` of W-ETH.
  // * optionally pass an object to configure gas settings
  // * returns a `Promise`
  wrapWeth(amount, config = {}) {
    const { gasLimit = 160000, gasPrice = utils.parseEther('0.000000040') } = config
    return this.wethContract.deposit({
      value: Number(amount),
      gasLimit,
      gasPrice,
    })
  }

  // Give the AirSwap smart contract permission to transfer an ERC20 token.
  // * Must call `approveTokenForTrade` one time for each token you want to trade
  // * Optionally pass an object to configure gas settings
  // * returns a `Promise`
  approveTokenForTrade(tokenContractAddr, config = {}) {
    const { gasLimit = 160000, gasPrice = utils.parseEther('0.000000040') } = config
    const tokenContract = new Contract(tokenContractAddr, erc20, this.wallet)

    return tokenContract.approve(
      this.exchangeContract.address.toLowerCase(),
      '1000000000000000000000000000', // large approval amount so we don't have to approve ever again
      { gasLimit, gasPrice },
    )
  }

  // registers a new PGP keyset on the contract for this wallet
  async registerPGPKey() {
    const address = this.wallet.address.toLowerCase()
    this.signedSeed = this.wallet.signMessage(`I'm generating my encryption keys for AirSwap ${address}`)
    const existingKey = await this.getPGPKey(address)
    if (existingKey) {
      return 'Key already set on PGP contract, should only be set once'
    }

    const { privateKeyArmored, publicKeyArmored } = await openpgp.generateKey({
      userIds: [{ address }],
      curve: 'p256', // ECC curve name, most widely supported
      passphrase: this.signedSeed,
    })
    const walletPGPKey = { privateKeyArmored, publicKeyArmored }
    this.pgpKeys[address] = walletPGPKey
    const ipfsHash = await ipfs.add(JSON.stringify(walletPGPKey))
    return this.pgpContract.addPublicKey(ipfsHash, {
      value: 0,
      gasLimit: 160000,
      gasPrice: utils.parseEther('0.000000040'),
    })
  }

  // look up a PGP keyset by wallet address
  async getPGPKey(address) {
    if (this.pgpKeys[address]) {
      return this.pgpKeys[address]
    } else {
      try {
        const ipfsHash = await this.pgpContract.addressToPublicKey(this.wallet.address)
        this.pgpKeys[address] = await ipfs.cat(ipfsHash)
        return this.pgpKeys[address]
      } catch (e) {
        throw new Error('PGP key is not registered for this address')
      }
    }
  }

  // decrypts a message intended for this wallet to read
  async decryptMessage(encryptedMessage) {
    const walletKey = this.pgpKeys[this.wallet.address]
    if (!walletKey) {
      return new Error('PGP Key not set for this address')
    }
    const { keys } = await openpgp.key.readArmored(walletKey.private)
    const privKeyObj = keys[0]
    await privKeyObj.decrypt(this.signedSeed)
    openpgp
      .decrypt({
        message: await openpgp.message.readArmored(encryptedMessage),
        privateKeys: [privKeyObj],
      })
      .then(plaintext => {
        return plaintext.data
      })
  }

  // encrypts a message intended to be read by the owner of the wallet corresponding to the 'address'
  async encryptMessage(message, address) {
    const key = this.getPGPKey(address.toLowerCase())
    if (!key) {
      return new Error('PGP Key not set for this address')
    }
    return openpgp
      .encrypt({
        message: openpgp.message.fromText(message), // input as Message object
        publicKeys: (await openpgp.key.readArmored(key.public)).keys, // for encryption
      })
      .then(ciphertext => {
        return ciphertext.data
      })
      .catch(reject)
  }
}

module.exports = AirSwap
