# API Server

## Introduction

The API Server implements AirSwap.js to provide a REST HTTP API for interacting with the AirSwap network. You can use it locally to get/set intents, approve tokens for trading, submit orders, and more. You can also use it as a proxy for getOrder requests if you wish to implement a Maker in a different language than JavaScript.

!> Running this example allows any peer on the AirSwap network to request / receive signed orders from you. The reference implementation should not be used on mainnet without proper order handling logic. By connecting to and using the AirSwap services you accept the [AirSwap Terms of Use](https://swap.tech/airswap-terms-of-use.pdf). Please also be sure to review the [LICENSE](LICENSE).

## Requirements

- Node.js v8.5 or greater
- NPM or Yarn
- An Ethereum private key

## Example

1. In this example, we will make orders for AST/ETH. Setting an intent using the Indexer requires your wallet to hold 250 AST per token pair. To purchase AST on the Rinkeby network, head to the [Sandbox](https://sandbox.airswap.io/).

2.  Start the Client Server in Rinkeby mode with a private key:

    - `npm install`
    - `PRIVATE_KEY=0x000000000 MAINNET=0 node server.js`

2.  Set a trade intent for the token pair we plan to trade. 

    ```
    curl -X POST \
      http://localhost:5005/setIntents \
      -H 'Content-Type: application/json' \
      -d '[{
      "makerToken": "0x27054b13b1b798b345b591a4d22e6562d47ea75a",
      "takerToken": "0x0000000000000000000000000000000000000000",
      "role": "maker"
    }]'
    ```

3.  Approve the AirSwap smart contract to move AST on our behalf. This call must be made _only once_ for each token you intend to trade.

    ```
    curl -X POST \
      http://localhost:5005/approveTokenForTrade \
      -H 'Content-Type: application/json' \
      -d '{
      "tokenContractAddr": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8"
    }'
    ```

4.  The Ethereum address corresponding to the private key from step 1 is now ready to serve orders for the AST/ETH pair. Now, it's time to implement your own order handling logic to serve incoming `getOrder` requests. Head over to the `order-server-examples/` directory to get started.

## Endpoints

All endpoints only accept POST requests with a JSON body.

#### findIntents

---

- **URL**

  /findIntents

- **Data Params**

  ```
    {
    "makerTokens": Array<string>,
    "takerTokens": Array<string>
    }
  ```

- **Sample Call:**

  ```
  curl -X POST \
  http://localhost:5005/findIntents \
  -H 'Content-Type: application/json' \
  -d '{
    "makerTokens": ["0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8"],
    "takerTokens": ["0x0000000000000000000000000000000000000000"]
  }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  [{
    "address": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
    "makerToken": 0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8,
    "takerToken": 0x0000000000000000000000000000000000000000,
    "role": "maker"
  },
  ...]
  ```

#### setIntents

---

- **URL**

  /setIntents

- **Data Params**

  ```
  [{
    "makerToken": string,
    "takerToken": string,
    "role": string
  },
  ...]
  ```

- **Sample Call:**

  ```
  curl -X POST \
    http://localhost:5005/setIntents \
    -H 'Content-Type: application/json' \
    -d '[{
    "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "takerToken": "0x0000000000000000000000000000000000000000",
    "role": "maker"
  }]'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:** `ok`

#### getIntents

---

- **URL**

  /getIntents

- **Data Params**

  ```
    {
      "address": string,
    }
  ```

- **Sample Call:**

  ```
  curl -X POST \
    http://localhost:5005/getIntents \
    -H 'Content-Type: application/json' \
    -d '{
    "address": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269"
  }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  [{
    "address": "0x2369267687a84ac7b494dae2f1542c40e37f4455",
    "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "takerToken": "0x0000000000000000000000000000000000000000",
    "role": "maker"
  }]
  ```

- **Notes:**
  The address specified in Data Params is case sensitive.

#### getOrder

---

- **URL**

  /getOrder

- **Data Params**

  ```
  {
    "makerAddress": string,
    "params":
    {
      "makerAmount": string,
      "makerToken": string,
      "takerToken": string
    }
  }
  ```

- **Sample Call:**
  ```
  curl -X POST \
    http://localhost:5005/getOrder \
    -H 'Content-Type: application/json' \
    -d '  {
      "makerAddress": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
      "params": {
        "makerAmount": "100000",
        "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
        "takerToken": "0x0000000000000000000000000000000000000000"
      }
    }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  {
    "makerAddress": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
    "makerAmount": "100000",
    "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "takerAddress": "0x61ba956bb7d4e7146efaf74ccf327d213e96713c",
    "takerAmount": "2993000000000000",
    "takerToken": "0x0000000000000000000000000000000000000000",
    "expiration": 1532447264,
    "nonce": "33382012",
    "v": 27,
    "r": "0xd0382d77c3adf0641f05f64a49cf5011a0324129fddf961dfc7c98732e58a42e",
    "s": "0x3f671cbd665786459b516f3ae054aa6742e049449c8271a3f5c44e8c1925e4d0"
  }
  ```

#### signOrder

---

- **URL**

  /signOrder

- **Data Params**

  ```
  {
    makerAddress: string,
    makerAmount: string,
    makerToken: string,
    takerAddress: string,
    takerAmount: string,
    takerToken: string,
    expiration: number,
    nonce: string
  }
  ```

- **Sample Call:**
  ```
  curl -X POST \
    http://localhost:5005/signOrder \
    -H 'Content-Type: application/json' \
    -d '    {
    "makerAddress": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
    "makerAmount": "100000",
    "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "takerAddress": "0x61ba956bb7d4e7146efaf74ccf327d213e96713c",
    "takerAmount": "2993000000000000",
    "takerToken": "0x0000000000000000000000000000000000000000",
    "expiration": 1532447264,
    "nonce": "33382012"
  }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  {
    "makerAddress": "0x6cc47be912a07fbe9cebe68c9e103fdf123b7269",
    "makerAmount": "100000",
    "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "takerAddress": "0x61ba956bb7d4e7146efaf74ccf327d213e96713c",
    "takerAmount": "2993000000000000",
    "takerToken": "0x0000000000000000000000000000000000000000",
    "expiration": 1532447264,
    "nonce": "33382012",
    "v": 27,
    "r": "0xd0382d77c3adf0641f05f64a49cf5011a0324129fddf961dfc7c98732e58a42e",
    "s": "0x3f671cbd665786459b516f3ae054aa6742e049449c8271a3f5c44e8c1925e4d0"
  }
  ```

#### fillOrder

---

- **URL**

  /fillOrder

- **Data Params**

  ```
  {
    "order": {
        "makerAddress": "0x60834d72a52B0Ddc1601f7739f44632CCfbf3886",
        "makerAmount": "10000",
        "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
        "takerAddress": "0x61ba956bb7d4e7146efaf74ccf327d213e96713c",
        "takerAmount": "1000000000000000",
        "takerToken": "0x0000000000000000000000000000000000000000",
        "expiration": 1532452110,
        "nonce": "6466",
        "r": "0xab65c90919c2bbb31764dcc450a9d4fffbabddf8363b7b1dc5a0ef2235274635",
        "s": "0x3d099c0af5f1ecc2ccf7999160d6d62f3c1fc16c66749a527962b804e990aefb",
        "v": 27
    },
    "config": {
      value: string,
      gasLimit: number,
      gasPrice: string
    }
  }
  ```

- **Sample Call:**

  ```
  curl -X POST \
    http://localhost:5005/fillOrder \
    -H 'Content-Type: application/json' \
    -d '{
    "order": {
        "makerAddress": "0x60834d72a52B0Ddc1601f7739f44632CCfbf3886",
        "makerAmount": "10000",
        "makerToken": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
        "takerAddress": "0x61ba956bb7d4e7146efaf74ccf327d213e96713c",
        "takerAmount": "1000000000000000",
        "takerToken": "0x0000000000000000000000000000000000000000",
        "expiration": 1532452110,
        "nonce": "6466",
        "r": "0xab65c90919c2bbb31764dcc450a9d4fffbabddf8363b7b1dc5a0ef2235274635",
        "s": "0x3d099c0af5f1ecc2ccf7999160d6d62f3c1fc16c66749a527962b804e990aefb",
        "v": 27
    },
    "config": {}
  }'
  ```

- **Notes:**
  The `config` key in data params is optional

- **Sample Response:**

  - **Code:** 200
  - **Content:**

  ```
  {
      "nonce": 20,
      "gasPrice": {
          "_bn": "9502f9000"
      },
      "gasLimit": {
          "_bn": "27100"
      },
      "to": "0x07fC7c43D8168a2730344E5CF958aaecc3B42B41",
      "value": {
          "_bn": "0"
      },
      "data": "0x1d4d691d00000000000000000000000060834d72a52b0ddc1601f7739f44632ccfbf38860000000000000000000000000000000000000000000000000000000000002710000000000000000000000000cc1cbd4f67cceb7c001bd4adf98451237a193ff800000000000000000000000061ba956bb7d4e7146efaf74ccf327d213e96713c00000000000000000000000000000000000000000000000000038d7ea4c680000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005b575d0e0000000000000000000000000000000000000000000000000000000000001942000000000000000000000000000000000000000000000000000000000000001bab65c90919c2bbb31764dcc450a9d4fffbabddf8363b7b1dc5a0ef22352746353d099c0af5f1ecc2ccf7999160d6d62f3c1fc16c66749a527962b804e990aefb",
      "v": 43,
      "r": "0x87288ad9ac4b15fed159857cb30a46c6ddb52f48cae1fb05820732596dcf27ca",
      "s": "0x68a284764d3b97093ad0196cc68abc8fce676f41e2484ac5a1762a372527f390",
      "chainId": 4,
      "from": "0x61ba956Bb7D4e7146eFaf74Ccf327d213e96713C",
      "hash": "0x9bac349471a0553abb9aa146ca68296c1987a57cdc8e1062be73fed95194aaf4"
  }
  ```

#### unwrapWeth

---

- **URL**

  /unwrapWeth

- **Data Params**

  ```
  {
    "amount": string,
    "config": {
      value: string,
      gasLimit: number,
      gasPrice: string
    }
  }
  ```

- **Sample Call:**

  ```
  curl -X POST \
    http://localhost:5005/unwrapWeth \
    -H 'Content-Type: application/json' \
    -d '{
    "amount": "10000000000000000",
    "config": {}
  }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  {
    "nonce": 21,
    "gasPrice": {
        "_bn": "9502f9000"
    },
    "gasLimit": {
        "_bn": "27100"
    },
    "to": "0xc778417E063141139Fce010982780140Aa0cD5Ab",
    "value": {
        "_bn": "0"
    },
    "data": "0x2e1a7d4d000000000000000000000000000000000001ed09bead87c0378d8e6400000000",
    "v": 44,
    "r": "0x0bb55004cb08e6834881b64a503295a6030b8aab19806810ae9608c84aa7b2e9",
    "s": "0x11e1094c6e00093577dacd433a752687c384f1c92f86a45e2992633046f9e1e7",
    "chainId": 4,
    "from": "0x61ba956Bb7D4e7146eFaf74Ccf327d213e96713C",
    "hash": "0xb4de23394c51ca871e64f77ef3d7ac81f57fe93e58e87bc62cebb0c84da19e98"
  }
  ```

- **Notes:**
  `amount` must be denominated in WEI. The `config` key in data params is optional.

#### approveTokenForTrade

---

- **URL**

  /approveTokenForTrade

- **Data Params**

  ```
  {
    "tokenContractAddr": string,
    "config": {
      value: string,
      gasLimit: number,
      gasPrice: string
    }
  }
  ```

- **Sample Call:**

  ```
  curl -X POST \
    http://localhost:5005/approveTokenForTrade \
    -H 'Content-Type: application/json' \
    -d '{
    "tokenContractAddr": "0xcc1cbd4f67cceb7c001bd4adf98451237a193ff8",
    "config": {}
  }'
  ```

- **Sample Response:**

  - **Code:** 200 <br />
  - **Content:**

  ```
  {
    "nonce": 23,
    "gasPrice": {
      "_bn": "9502f9000"
    },
    "gasLimit": {
      "_bn": "27100"
    },
    "to": "0xCC1CBD4f67cCeb7c001bD4aDF98451237a193Ff8",
    "value": {
      "_bn": "0"
    },
    "data": "0x095ea7b300000000000000000000000007fc7c43d8168a2730344e5cf958aaecc3b42b410000000000000000000000000000000000000000033b2e3c9fd0803ce8000000",
    "v": 43,
    "r": "0x4ce519845525c54da7a71504ece39d5d82740be16f0c9ec72376779ea889cee4",
    "s": "0x532a8313693309f03727fbd3b80280c3ed7f2baa59abdeeb69d722b882f2a795",
    "chainId": 4,
    "from": "0x61ba956Bb7D4e7146eFaf74Ccf327d213e96713C",
    "hash": "0xfaa790499265fb27b90fcfc25563c5a640d7e2df417076e75e437a04ac325d00"
  }
  ```

- **Notes:**
  The `config` key in data params is optional.