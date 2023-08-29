# Flows

## Announce flow

```mermaid
sequenceDiagram
autonumber
  participant A as Oracle Owner
  participant D as Distributor/Restroom-mw.DID_Admin
  participant I as did.dyne.org
  rect rgb(191, 223, 255)
  note left of A: `make keygen`
  A->A: Keygen 
  end
  rect rgb(191, 223, 255)
  note left of A: `make announce`
  A->A: Create DID Document 
  A->>D: Request to sign DID-Document
  D->D: Verifies signature(s) of DID-Document
  D->D: Sign sign DID-Document
  D->>I: Request register Oracle DID-Document
  I->>D: Return registered DID-Document
  D->D: (If Distributor) store DID-Document in DB
  D->>A: Return DID-Document signed
  A->A: Stores signed and registered DID-Document on file system
  end
```

1. Oracle owner generates a private and public keys (SKs + PKs) via `make keygen`
1. Oracle owner creates DID-Document with PKs via `make announce`
1. Oracle owner request DID-Document signature and registration
1. Distributor/Restroom-mw.DID_Admin verifie signature(s) of DID-Document 
1. Distributor/Restroom-mw.DID_Admin signs DID-Document using DID.domain.context_A sk
1. Distributor/Restroom-mw.DID_Admin request did.dyne.org to registers DID-Document
1. did.dyne.org returns registered DID-Document
1. (If Distributor is acting) stores DID-Document on DB
1. Distributor/Restroom-mw.DID_Admin returns DID-Document to Oracle Owner
1. Oracle owner stores signed and registered DID-Document on file system

## Goodbye flow

```mermaid
sequenceDiagram
autonumber
  participant A as Oracle Owner
  participant I as did.dyne.org
  rect rgb(191, 223, 255)
  note left of A: `make goodbye`
  A->A: Create DID deactivation request
  A->>I: Request deactivation
  I->I: Deactivate DID-Document
  I->>A: Return deactivated DID-Document
  end
```
## Distributor or Restroom mw Admin?
A DID Document has to be signed by an admin.
It is simple to setup a restroom instance which offers a contract to sign DID Document, it just need a DID Admin secret key.

One can also make an oracle offer the contract to sign DID Document, this kind of oracle is known as "Distributor".
One may decide to use a Distributor, instead of a simple restroom instance if he wants more features, e.g. being able to listen to websockets.
