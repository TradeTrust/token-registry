// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { ITradeTrustSBT, ITitleEscrowFactory } from "./ITradeTrustSBT.sol";
import { ITradeTrustTokenRestorable } from "./ITradeTrustTokenRestorable.sol";
import { ITradeTrustTokenBurnable } from "./ITradeTrustTokenBurnable.sol";
import { ITradeTrustTokenMintable } from "./ITradeTrustTokenMintable.sol";

interface ITradeTrustToken is
  ITradeTrustTokenMintable,
  ITradeTrustTokenBurnable,
  ITradeTrustTokenRestorable,
  ITradeTrustSBT
{}
