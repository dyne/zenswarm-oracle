<p align="center">
  <h1>ZENSWARM ORACLE</h1>

  A zenswarm oracle is a web API whose identity is registered to a [DID controller](https://github.com/dyne/w3C-DID) and is able to run zencode smart contract (through [restroom-mw](https://github.com/dyne/restroom-mw)).

This repository contains some utilities that allow a user to
- generate a keyring (which defines the identity of the oracle)
- announce (i.e. register) the oracle to the DID controller
- run a express service which provides all of the restroom-mw middlewares
- deannounce (aka goodbye) the oracle identity

</p>

<div align="center">

# Zenswarm oracle

### Registered restroom-mw instance


</div>

<p align="center">
  <a href="https://dyne.org">
    <img src="https://files.dyne.org/software_by_dyne.png" width="170">
  </a>
</p>

## 🔨 Usage
Before using Zenswarm oracle you need:
* [Zenroom](https://zenroom.org/#downloads)
* Jq
* Docker
* [Restroom-test](https://github.com/dyne/zencode-tools/releases/latest/)

The `secrets` directory will be shared with the zenswarm oracle container.
For example, this will let the oracle read the keyring we are going to generate.

The first step is to generate the keyring of the oracle
```bash
  make keygen DESCRIPTION="test oracle"
```
This command will generate a file `secrets/keys.json` with the newly created keyring.

Then, one has to announce the oracle to the DID controller. 
```bash
  make announce
```
This command will generate two files:
* `secrets/DID.json` with the the DID;
* `secrets/DID_document.json` with the the DID document and the DID document metadata;

At this point, one can run the oracle instance
```bash
  make build
  make run
```
That will be launched on localhost on port 3000. To see the available contracts visit http://localhost:3000/docs.

To stop the container simply run
```
  make kill
```

Finally, once the oracle is no more needed, one have to deannounce the oracle to the DID controller.
```bash
  make goodbye
```

## 😍 Acknowledgements

<a href="https://dyne.org">
  <img src="https://files.dyne.org/software_by_dyne.png" width="222">
</a>

Copyleft (ɔ) 2023 by [Dyne.org](https://www.dyne.org) foundation, Amsterdam

Designed, written and maintained by [Denis Roio](https://github.com/jaromil), [Andrea D'Intino](https://github.com/andrea-dintino), [Alberto Lerda](https://github.com/albertolerda) and [Matteo Cristino](https://github.com/matteo-cristino).

## 💼 License

    Zenswarm oracle - Announced restroom-mw instance
    Copyleft (ɔ) 2023 Dyne.org foundation

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation, either version 3 of the
    License, or (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
