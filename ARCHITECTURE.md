# TradeTrust Token Registry — Architecture & Developer Notes

This document summarizes the repository’s purpose, structure, core contracts, SDK, deployment tasks, and common workflows. Use it as a quick reference to avoid re-reading the codebase.

Updated: 2025-11-14

---

## Overview
- The Token Registry implements a Soulbound-like ERC721 for Electronic Bills of Lading (eBL) restricted to Title Escrow contracts.
- Solidity contracts live in `contracts/`. The TypeScript SDK (utilities + constants + TypeChain outputs) is exported from `src/`.
- Hardhat drives compilation/testing/deployment with helper tasks in `tasks/`.
- Ethers v6 is the default in the SDK with compatibility shims for v5.

---

## Tech Stack
- Solidity: 0.8.22 (see `hardhat.config.ts`)
- OpenZeppelin: ^5.1.0 (upgradeable and non-upgradeable variants as used)
- Hardhat: ^2.22.x with toolbox, watcher, gas reporter
- Ethers: ^6.x (SDK includes v5 shims for select utils)
- TypeChain: outputs to `src/contracts` during build

---

## Repository Layout
- `contracts/`
  - Core:
    - `TradeTrustToken.sol`: non-upgradeable token (constructor-based)
    - `TitleEscrow.sol`: escrow contract managing beneficiary/holder and transfers
    - `TitleEscrowFactory.sol`: clones `TitleEscrow` per tokenId/registry
  - Base mixins (under `contracts/base/`):
    - `SBTUpgradeable.sol`: trimmed ERC721 with `bytes remark` and transfer hooks
    - `TradeTrustSBT.sol`: SBT + Pausable; `remarkLengthLimit`, `genesis()`, `titleEscrowFactory()`
    - `RegistryAccess.sol`: AccessControl roles setup (DefaultAdmin, MINTER, RESTORER, ACCEPTER)
    - `TradeTrustTokenBaseURI.sol`: baseURI storage and setter (admin)
    - `TradeTrustTokenMintable.sol`: `mint(beneficiary, holder, tokenId, remark)`
    - `TradeTrustTokenRestorable.sol`: `restore(tokenId, remark)`
    - `TradeTrustTokenBurnable.sol`: `burn(tokenId, remark)` (requires return-to-issuer)
    - `TradeTrustTokenBase.sol`: wires all mixins; enforces transfer restrictions; pause/unpause with remark
  - Presets (under `contracts/presets/`):
    - `TradeTrustTokenStandard.sol`: upgradeable/clone-target token (initializer)
    - `TitleEscrowSignable.sol`: TitleEscrow with EIP-712 off-chain endorsement
  - Utils/Lib/Interfaces:
    - `utils/SigHelper.sol`: EIP-712 domain, nonces, cancellation
    - `utils/TDocDeployer.sol`: owner-upgradeable deployer for clone targets
    - `lib/TitleEscrowStructs.sol`: `BeneficiaryTransferEndorsement`
    - `interfaces/`: ERC165 interfaces + custom error interfaces
  - Mocks: for tests

- `src/`
  - `index.ts`: exports `utils` and `constants`
  - `constants/`:
    - `role-hash.ts`: precomputed role hashes (incl. DefaultAdmin = ZeroHash)
    - `default-address.ts`: Zero and Burn addresses
    - `contract-address.ts`: on-chain addresses by chain for `TitleEscrowFactory`, `Deployer`, `TokenImplementation`
    - `contract-interfaces.ts` + `contract-interface-id.ts`: function selectors and interfaceId computation
  - `utils/`:
    - `compute-interface-id.ts`: XOR of 4-byte selectors; has v5/v6 shims
    - `compute-title-escrow-address.ts`: CREATE2 prediction for old flow (deprecated)
    - `encode-init-params.ts`: ABI-encodes (name, symbol, deployer) for initializer
    - `get-event-from-receipt.ts`: parses events for ethers v5/v6
  - TypeChain outputs: generated into `src/contracts` during build

- `tasks/`
  - `deploy-token.ts`: deploys token (standalone or via `TDocDeployer` clone path)
  - `deploy-token-impl.ts`: deploys `TradeTrustTokenStandard` implementation
  - `deploy-escrow-factory.ts`: deploys `TitleEscrowFactory`
  - `helpers/`: `deploy-contract.ts`, `verify-contract.ts`, `is-supported-title-escrow-factory.ts`, `wait.ts`

- `test/`: end-to-end and unit tests with Hardhat
- `scripts/`: build helpers (`addTsNoCheck.js`, `generateHashes.js`)
- `hardhat.config.ts`: networks, etherscan api keys, watcher, gas reporter

---

## Core Contract Architecture

### TradeTrust Token Family
Files: `contracts/base/*`, `contracts/TradeTrustToken.sol`, `contracts/presets/TradeTrustTokenStandard.sol`

- Roles (see `contracts/base/RegistryAccess.sol` and `src/constants/role-hash.ts`):
  - DefaultAdmin (`0x00`), `MINTER_ROLE`, `RESTORER_ROLE`, `ACCEPTER_ROLE`
- Pausing (see `TradeTrustTokenBase.sol`):
  - `pause(bytes remark)` / `unpause(bytes remark)` emit `PauseWithRemark`/`UnpauseWithRemark` (see `ITradeTrustSBT.sol`)
- Transfer restrictions (see `_beforeTokenTransfer` in `TradeTrustTokenBase.sol`):
  - Transfers allowed only to: `address(this)` (registry), the token’s `TitleEscrow` address, or the burn address `0x...dEaD`; otherwise revert `TransferFailure()`
- Remark field limit: `bytes remark` length <= 120 enforced on all entry points (see `TradeTrustSBT.sol` and Title Escrow)

Lifecycle methods:
- `mint(beneficiary, holder, tokenId, remark)` [MINTER]:
  - Calls `TitleEscrowFactory.create(tokenId)`
  - Mints token to the new `TitleEscrow` and passes encoded `(beneficiary, holder, remark)` via ERC721 `safeMint` data
- `restore(tokenId, remark)` [RESTORER]:
  - Requires registry holds token (returned to issuer)
  - Transfers token from registry back to the (predicted) `TitleEscrow`
- `burn(tokenId, remark)` [ACCEPTER]:
  - Requires token returned to issuer; calls `TitleEscrow.shred(remark)` then transfers token to burn address

Two deployment flavors:
- `TradeTrustToken.sol` (constructor-based)
- `TradeTrustTokenStandard.sol` (initializer-based for clones): `initialize(bytes params)` decodes `(name, symbol, admin)` and sets `titleEscrowFactory`

### Title Escrow
Files: `contracts/TitleEscrow.sol`, `contracts/presets/TitleEscrowSignable.sol`

State (per token): `registry`, `tokenId`, `beneficiary`, `holder`, `prevBeneficiary`, `prevHolder`, `nominee`, `active`, `bytes remark`.

Key flows:
- on mint (first receipt): `onERC721Received` decodes `(beneficiary, holder, remark)` and initializes; emits `TokenReceived(isMinting=true, ...)`.
- subsequent registry→escrow transfers set `remark` from transfer data; `TokenReceived(isMinting=false, ...)`.
- `nominate(address nominee, bytes remark)` [beneficiary]
- `transferBeneficiary(address nominee, bytes remark)` [holder]
  - If `beneficiary != holder`, `nominee` must equal the nominated address
- `transferHolder(address newHolder, bytes remark)` [holder]
- `transferOwners(address nominee, address newHolder, bytes remark)`
- Rejections (must be immediate next action):
  - `rejectTransferBeneficiary(bytes remark)` [beneficiary] (disallowed if beneficiary==holder)
  - `rejectTransferHolder(bytes remark)` [holder] (disallowed if holder==beneficiary)
  - `rejectTransferOwners(bytes remark)` [caller must be both beneficiary and holder]
- Return-to-issuer:
  - `returnToIssuer(bytes remark)` [caller must be both beneficiary and holder] → transfers token back to registry; resets prevs; sets remark
- Finalization:
  - `shred(bytes remark)` [only registry, only when escrow does NOT hold token] → sets `active=false`, clears owners

Signing (optional): `TitleEscrowSignable.sol`
- EIP-712 endorsement by holder for beneficiary transfer
- `transferBeneficiaryWithSig(endorsement, sig)` [beneficiary]
- `cancelBeneficiaryTransfer(endorsement)` [holder]
- Maintains `nonces[holder]`; cancelling or `_setHolder` increments nonce

### Title Escrow Factory
File: `contracts/TitleEscrowFactory.sol`
- Constructor deploys a single `TitleEscrow` implementation for cloning
- `create(uint256 tokenId)`: only callable by contracts (reverts if EOA); deterministic CREATE2 clone salt = `keccak256(abi.encodePacked(msg.sender, tokenId))`
- `getEscrowAddress(address tokenRegistry, uint256 tokenId)`: deterministic prediction helper

### Deployer Utility
File: `contracts/utils/TDocDeployer.sol`
- Owner-managed mapping `implementations[implementation] = titleEscrowFactory`
- `deploy(implementation, params)` clones the implementation and calls `initialize(bytes)` with `(params, titleEscrowFactory)`
- Emits `Deployment(deployed, implementation, deployer, titleEscrowFactory, params)`

---

## TypeScript SDK Surface
Exports via `src/index.ts`:
- `constants/`
  - `roleHash`: DefaultAdmin, MinterRole, RestorerRole, AccepterRole, plus admin-role hashes
  - `defaultAddress`: `Zero`, `Burn`
  - `contractAddress`: chainId → addresses for `TitleEscrowFactory`, `Deployer`, `TokenImplementation`
  - `contractInterfaceId`: interface ids computed from `contract-interfaces.ts`
- `utils/`
  - `encodeInitParams({ name, symbol, deployer })`
  - `computeInterfaceId(signatures: string[])`
  - `computeTitleEscrowAddress(params)` (deprecated)
  - `getEventFromReceipt(receipt, topic, iface)` (works for ethers v5 and v6 receipts)

Compatibility shims are included to support ethers v5 method names where needed.

---

## Hardhat Tasks & Helpers
- Aggregated in `tasks/index.ts` and imported by `hardhat.config.ts`.
- `deploy:factory` (`tasks/deploy-escrow-factory.ts`)
  - Deploys `TitleEscrowFactory`; optional verification (also verifies `TitleEscrow` implementation)
- `deploy:token:impl` (`tasks/deploy-token-impl.ts`)
  - Deploys `TradeTrustTokenStandard` implementation; optional verification
- `deploy:token` (`tasks/deploy-token.ts`)
  - Args: `--name`, `--symbol`, optional `--factory`, flags `--standalone`, `--verify`
  - If `--standalone`, deploys `TradeTrustToken` with constructor
  - Else uses `TDocDeployer` + `TokenImplementation` for the chain; extracts deployed address from `Deployment` event
  - Factory compatibility check: `helpers/is-supported-title-escrow-factory.ts` ensures the factory’s implementation supports the Title Escrow interface
- `helpers/verify-contract.ts`: wraps Hardhat verify with network check and idempotency

---

## Networks & Configuration
- Env (`.env.sample`):
  - `INFURA_APP_ID`, `DEPLOYER_PK` or `MNEMONIC` (one is required), Etherscan/Polygonscan/API keys, Stability/Astron keys
- Networks in `hardhat.config.ts`:
  - Ethereum: `mainnet`, `sepolia`
  - Polygon: `polygon`, `amoy`
  - XDC: `xdc`, `xdcapothem`
  - Stability: `stability`, `stabilitytestnet`
  - Astron: `astron`, `astrontestnet` (custom chains configured for verification)
- Gas reporter enabled with CoinMarketCap API key support

---

## Build, Test, Lint
- Build library:
  - `npm run build` → compile contracts, generate TypeChain to `src/contracts`, emit `dist/` (JS + types + artifacts)
- Tests:
  - `npm test` → Hardhat tests
  - Coverage: `npm run coverage`
- Lint:
  - Solidity: `npm run lint:sol` (solhint)
  - JS/TS: `npm run lint:js`

---

## Common Workflows
- Quick deploy (clone path):
  ```sh
  npx hardhat deploy:token --network stability --name "The Great Shipping Co." --symbol GSC
  ```
- Standalone deploy:
  ```sh
  npx hardhat deploy:token --network polygon --name "The Great Shipping Co." --symbol GSC --standalone
  ```
- Use existing factory:
  ```sh
  npx hardhat deploy:token --network polygon --name "The Great Shipping Co." --symbol GSC --factory 0xYourFactory
  ```
- Verify (where applicable): add `--verify` and ensure proper API key in `.env`.

---

## Quick API Reference (selected)

### Token (see `ITradeTrustToken.sol`)
- `mint(address beneficiary, address holder, uint256 tokenId, bytes remark) returns (address titleEscrow)`
- `restore(uint256 tokenId, bytes remark) returns (address titleEscrow)`
- `burn(uint256 tokenId, bytes remark)`
- `pause(bytes remark)` / `unpause(bytes remark)`
- `titleEscrowFactory() → ITitleEscrowFactory`
- `genesis() → uint256`

### TitleEscrow (see `ITitleEscrow.sol`)
- `nominate(address nominee, bytes remark)` [beneficiary]
- `transferBeneficiary(address nominee, bytes remark)` [holder]
- `transferHolder(address newHolder, bytes remark)` [holder]
- `transferOwners(address nominee, address newHolder, bytes remark)`
- `rejectTransferBeneficiary(bytes remark)` [beneficiary]
- `rejectTransferHolder(bytes remark)` [holder]
- `rejectTransferOwners(bytes remark)` [beneficiary & holder]
- `returnToIssuer(bytes remark)` [beneficiary & holder]
- `shred(bytes remark)` [registry only]
- Views: `beneficiary()`, `holder()`, `prevBeneficiary()`, `prevHolder()`, `active()`, `nominee()`, `registry()`, `tokenId()`, `isHoldingToken()`

### TitleEscrowSignable (see `ITitleEscrowSignable.sol`)
- `transferBeneficiaryWithSig(BeneficiaryTransferEndorsement endorsement, Sig sig)` [beneficiary]
- `cancelBeneficiaryTransfer(BeneficiaryTransferEndorsement endorsement)` [holder]

---

## Gotchas & Notes
- `remark` length must be ≤ 120 bytes on all relevant methods (`remarkLengthLimit` modifers in registry and escrow)
- `burn` requires token to be returned to issuer first (registry must hold the token)
- `TitleEscrowFactory.create` reverts if called by EOA; token contract must call it
- Transfers are limited to controlled endpoints (registry, escrow, burn) — see `TradeTrustTokenBase._beforeTokenTransfer`
- When paused, both registry and all escrow actions guarded by `whenNotPaused` will revert
- For clone deployments, ensure chain’s `Deployer` and `TokenImplementation` addresses exist in `src/constants/contract-address.ts`; otherwise use `--standalone`

---

## Where to Update When Adding Features
- New public functions: update corresponding interface in `contracts/interfaces/*` and, if used by tooling, the function signature list in `src/constants/contract-interfaces.ts`
- New networks: extend `hardhat.config.ts` and `src/constants/contract-address.ts`
- New SDK helpers: export in `src/utils/index.ts` and/or `src/constants/index.ts`

---

## Minimal Usage Snippets
- Connect to a token registry (SDK users):
  ```ts
  import { TradeTrustToken__factory } from "@tradetrust-tt/token-registry/contracts";
  const registry = TradeTrustToken__factory.connect(tokenAddress, signer);
  ```
- Calculate interfaceId:
  ```ts
  import { constants } from "@tradetrust-tt/token-registry";
  const id = constants.contractInterfaceId.TitleEscrow; // bytes4
  ```
- Extract event from a receipt (ethers v6):
  ```ts
  import { utils } from "@tradetrust-tt/token-registry";
  const evt = utils.getEventFromReceipt(receipt, "Deployment", contract.interface);
  ```

---

This file is the primary quick-reference for this repo. Keep it updated as contracts or tasks evolve.
