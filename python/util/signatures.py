import unittest

from util.types import address, uint
from web3.auto import w3
from eth_account.messages import defunct_hash_message

from sha3 import keccak_256
from bitcoin import ecdsa_raw_sign
from eth_utils import hexadecimal
from ethereum import utils

# The following signature utilities are used during messaging system
# authentication and signing orders on the Swap Protocol.


def sign(message_text, private_key):
    message_hash = defunct_hash_message(text=message_text)
    signature_obj = w3.eth.account.signHash(message_hash, private_key=private_key)
    return signature_obj['signature'].hex()


def recover(text, signature):
    message_hash = defunct_hash_message(text=text)
    address = w3.eth.account.recoverHash(message_hash, signature=signature)
    return address.lower()


def ecdsa(order, priv_key):

    hashed_order = keccak_256(
        address(order['makerAddress']) +
        uint(order['makerAmount']) +
        address(order['makerToken']) +
        address(order['takerAddress']) +
        uint(order['takerAmount']) +
        address(order['takerToken']) +
        uint(order['expiration']) +
        uint(order['nonce'])
    )

    magic = keccak_256(b'\x19Ethereum Signed Message:\n32' + hashed_order.digest())
    v, r, s = ecdsa_raw_sign(magic.hexdigest(), hexadecimal.decode_hex(priv_key))
    r = utils.int_to_hex(r)
    s = utils.int_to_hex(s)

    # Ensuring that the parameters are correct length
    if len(r) < 66:
        r = b'0x0' + r[2:]
    if len(s) < 66:
        diff = 66 - len(s)
        s = '0x' + '0' * diff + s[2:]

    return v, r, s


class Test(unittest.TestCase):
    def test_signature(self):
        random_acc = w3.eth.account.create()

        address = random_acc.address.lower()
        priv_key = random_acc.privateKey.hex()
        message = 'futurefinance'
        signature = sign(message, priv_key)

        self.assertEqual(recover(message, signature), address)


if __name__ == '__main__':
    unittest.main()
