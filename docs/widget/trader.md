# Trader Widget

![AirSwap Widget](../assets/dapps/widget.1.gif)

The AirSwap Trader Widget is an embeddable, HTML+JavaScript element that can be dropped into any webpage to share and settle over-the-counter trades with no counterparty risk, no deposits, and no fees.

!> Pop-up blockers can prevent the AirSwap Trader Widget from loading properly.

### Setup
Add this to your index.html or respective file to load the widget script.

```html
<head>
    <script src="https://cdn.airswap.io/gallery/airswap-trader-widget.js"></script>
</head>
```

### Usage

Add the following code to where you want to open the widget. The onCreate callback function is triggered once the user successfully creates an order. The order details, signature and cid (ipfs hash) are passed as arguments.

```js
window.AirSwapTrader.render(
  {
    onCreate: (order, signature, cid) => {
      console.log('Order created!')
    },
    onClose: (transactionHash) => {
      console.log('Widget closed')
    },
  },
  'body',
)
```
\
If you want to pre-fill some of the data in the trade builder, you can add an order object to the parameters. Providing a value in the object will lock the corresponding field in the widget, preventing the user from changing the value.
```js
window.AirSwapTrader.render(
  {
    order: {
      makerToken: '0xce787654722aed819d7a8073576d2b2b359641b5',
      makerParam: '1000000000000000000',
      takerToken: '0xc778417e063141139fce010982780140aa0cd5ab',
      takerParam: '10000000000000000',
    },
    onCreate: (order, signature, cid) => {
      console.log('Order created!')
    },
    onClose: (transactionHash) => {
      console.log('Widget closed')
    },
  },
  'body',
)
```
\
To render a take order screen, add the full order and signature objects to the options. The onSwap callback function will be triggered when the taker fills the order and passes the hash of the transaction as an argument.
```js
window.AirSwapTrader.render(
  {
    order: {
      makerToken: '0xce787654722aed819d7a8073576d2b2b359641b5',
      makerParam: '1000000000000000000',
      makerWallet: '0xd68bb3350887ed3ee128b5ac4b7d852e24c5d366',
      takerToken: '0xc778417e063141139fce010982780140aa0cd5ab',
      takerParam: '10000000000000000',
      takerWallet: '0x0000000000000000000000000000000000000000',
      expiry: 1567024230,
      nonce: 1566932032583
    },
    signature: {
      version: '0x01',
      signer: '0x1ffb1788e56a755a74d3b63a787b09b65ca35e12',
      r: '0xf49aca3b76c7ca2e0639410cc20e97f0fed8a5ac943841caab728bf5f0449d70',
      s: '0x0ea08946287a9ab239e6ce0d90f004e3c211883183d92e2a40323a6c704c75e9',
      v: 27,
    },
    onSwap: (transactionHash) => {
      console.log('Trade complete!')
    },
    onClose: (transactionHash) => {
      console.log('Widget closed')
    },
  },
  'body',
)
```
\
If you have the full signed order details stored in IPFS (Inter Planetary File System), you can just use the IPFS hash instead.
```js
window.AirSwapTrader.render(
  {
    cid: 'Qmf1WGjvWALQbGjou7D6Vs6EzwWTwDTePtFY8a8afedK9R',
    onSwap: (transactionHash) => {
      console.log('Trade complete!')
    },
    onClose: (transactionHash) => {
      console.log('Widget closed')
    },
  },
  'body',
)
```

## Options

#### order `orderType (object)`, `optional`
Provide values to pre-populate the trade builder. If any of these parameters are specified, it will lock the value in the widget. When setting a signed order, all values must be set.
```js
order: {
  makerToken: '0xce787654722aed819d7a8073576d2b2b359641b5',
  makerParam: '1000000000000000000',
  makerWallet: '0xd68bb3350887ed3ee128b5ac4b7d852e24c5d366',
  takerToken: '0xc778417e063141139fce010982780140aa0cd5ab',
  takerParam: '10000000000000000',
  takerWallet: '0x0000000000000000000000000000000000000000',
  expiry: 1567024230,
  nonce: 1566932032583
}
```
| Type | Key | Description |
| ----------- | ----------- | ----------- |
| string | `makerToken` | `optional` - Sets the maker token address. Defaults to DAI |
| string | `makerParam` | `optional` - Sets the maker param. This can either be an atomic amount of ERC-20 tokens or ID of an ERC-721 token |
| string | `makerWallet` | `optional` - Sets the maker wallet address. This value is only used when you have a signed order for the user to take. Only used when providing a signed order. |
| string | `takerToken` | `optional` - Sets the taker token address. Defaults to ETH |
| string | `takerParam` | `optional` - Sets the taker param. This can either be an atomic amount of ERC-20 tokens or ID of an ERC-721 token |
| string | `takerWallet` | `optional` - Sets the taker wallet address. This value is only used when you have a signed order for the user to take. Only used when providing a signed order. |
| int | `expiry` | `optional` - Unix timestamp of order expiry. |
| string | `nonce` | `optional` - Nonce of the order. Only used when providing a signed order. |


#### signature `signatureType (object)`, `optional`
The signature of the order.
```js
signature: {
  version: '0x01',
  signer: '0x1ffb1788e56a755a74d3b63a787b09b65ca35e12',
  r: '0xec5aac45d8d9fb9f1b32206db8ca5745bef0ff6cca4e10f96891712932674144',
  s: '0x74b363b16641a9cf51c8cad2e3b26bfcaec825b32122aeb41dce3db24ad90ec4',
  v: 28,
}
```
| Type | Key | Description |
| ----------- | ----------- | ----------- |
| string | `version` | `required` - Sets the maker token address. Defaults to DAI |
| string | `signer` | `required` - Sets the maker token address. Defaults to DAI |
| string | `r` | `required` - Sets the maker token address. Defaults to DAI |
| string | `s` | `required` - Sets the maker param. This can either be an amount of ERC-20 tokens or ID of ERC-721 tokens |
| number | `v` | `required` - Sets the maker token address. Defaults to DAI |


#### cid `string`, `optional`
IPFS (Inter Planetary File System) hash for the order. If provided, the widget will fetch the order details from IPFS and display a take order screen.


#### onCreate `Function`, `optional`
Callback function triggered on creation of the trade. Passes the order, signature, and cid to the function as arguments.
```js
function onCreate(order, signature, cid) {
    console.log('Order Created!');
    ...
} 
```
| Type | Parameter | Description |
| ----------- | ----------- | ----------- |
| object | `order` | The [order details](#order-ordertype-object-optional) |
| object | `signature` | The [order signature](#signature-signaturetype-object-optional) |
| string | `cid` | The [IPFS hash](#cid-string-optional) of the order |


#### onSwap `Function`, `optional`
Callback function triggered on successful trade. Passes the transaction hash of the fill event as an argument.
```js
function onSwap(transactionHash) {
    console.log('Trade Completed!');
    ...
} 
```
| Type | Parameter | Description |
| ----------- | ----------- | ----------- |
| `transactionHash` | `string` | Order details |


#### onCancel `Function`, `optional`
Callback function triggered on cancel of the trade. Passes the transaction hash of the cancellation event as an argument.
```js
function onCancel(transactionHash) {
    console.log('Trade Cancelled!');
    ...
} 
```
| Type | Parameter | Description |
| ----------- | ----------- | ----------- |
| `transactionHash` | `string` | Order details |


#### onClose `Function`, `required`
Callback function triggered when the user closes the widget. No arguments.

```js
function onClose() {
    console.log('Widget closed');
}
```
