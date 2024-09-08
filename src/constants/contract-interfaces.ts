export const contractInterfaces = {
  TradeTrustSBT: ["genesis()", "titleEscrowFactory()"],
  TradeTrustTokenMintable: ["mint(address,address,uint256,bytes)"],
  TradeTrustTokenBurnable: ["burn(uint256,bytes)"],
  TradeTrustTokenRestorable: ["restore(uint256,bytes)"],
  TitleEscrow: [
    "nominate(address,bytes)",
    "transferBeneficiary(address,bytes)",
    "transferHolder(address,bytes)",
    "transferOwners(address,address,bytes)",
    "beneficiary()",
    "holder()",
    "active()",
    "nominee()",
    "registry()",
    "tokenId()",
    "isHoldingToken()",
    "surrender(bytes)",
    "shred(bytes)",
  ],
  TitleEscrowSignable: [
    "transferBeneficiaryWithSig((address,address,address,address,uint256,uint256,uint256),(bytes32,bytes32,uint8))",
    "cancelBeneficiaryTransfer((address,address,address,address,uint256,uint256,uint256))",
  ],
  TitleEscrowFactory: ["create(address,address,uint256)", "getAddress(address,uint256)"],
  AccessControl: [
    "hasRole(bytes32,address)",
    "getRoleAdmin(bytes32)",
    "grantRole(bytes32,address)",
    "revokeRole(bytes32,address)",
    "renounceRole(bytes32,address)",
  ],
  SBT: ["balanceOf(address)", "ownerOf(uint256)", "transferFrom(address,address,uint256)"],
};
