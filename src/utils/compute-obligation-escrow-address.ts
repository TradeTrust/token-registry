import { ethers as packedEthers } from "ethers";

export interface ComputeObligationEscrowAddressParams {
  implementationAddress: string;
  factoryAddress: string;
  registryAddress: string;
  tokenId: string;
}

const ethers = { ...packedEthers };

if (ethers.version.includes("/5")) {
  (ethers as any).keccak256 = (ethers as any).utils.keccak256;
  (ethers as any).solidityPackedKeccak256 = (ethers as any).utils.solidityKeccak256;
  (ethers as any).solidityPacked = (ethers as any).utils.solidityPack;
  (ethers as any).getCreate2Address = (ethers as any).utils.getCreate2Address;
}

/**
 * Computes the deterministic EIP-1167 clone address for an ObligationEscrow,
 * mirroring ObligationEscrowFactory.getEscrowAddress (same scheme as TitleEscrowFactory).
 */
export const computeObligationEscrowAddress = (params: ComputeObligationEscrowAddressParams) => {
  const { implementationAddress, factoryAddress, registryAddress, tokenId } = params;
  const initCodeHash = (ethers as any).keccak256(
    `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${implementationAddress.substring(2)}5af43d82803e903d91602b57fd5bf3`
  );
  const salt = (ethers as any).solidityPackedKeccak256(
    ["bytes"],
    [(ethers as any).solidityPacked(["address", "uint256"], [registryAddress, tokenId])]
  );
  return (ethers as any).getCreate2Address(factoryAddress, salt, initCodeHash);
};
