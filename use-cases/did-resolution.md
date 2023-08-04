A smart contract may need some data from an external device, for example it could be the result of a HTTP request. In the current example, given a did (e.g. `did:dyne:admin:DMMYfDo7VpvKRHoJmiXvEpXrfbW3sCfhUBE4tBeXmNrJ`) we want to make a GET request to `https://did.dyne.org/dids/did:dyne:admin:DMMYfDo7VpvKRHoJmiXvEpXrfbW3sCfhUBE4tBeXmNrJ`.

A smart contract cannot make the request directly. The idea is to split the solidity code in two smart contracts:
- `SC A`: ends with an event in which he request the data he needs
- `SC B`: takes as input the data needed to proceed

One (or more) oracles listen to the topic of the event of the `SC A`. When the event is emitted, the first oracle that resolve the request call the smart contract `SC B` (to be fair, multiple oracles could call `SC B`, but only the fist one succeed).

## Is it limited to HTTP requests?
Absolutely not! Oracle can execute any zencode. We could also make them use cryptographic primitives which are not available in Ethereum (and too costly to implement in solidity): EdDSA, [Reflow](https://arxiv.org/abs/2105.14527)

## Is it really distributed?
At the moment it is quite centralized, but we are working on making it peer-to-peer by keeping making each oracle keep a list of peer oracle in a SQLite database.
