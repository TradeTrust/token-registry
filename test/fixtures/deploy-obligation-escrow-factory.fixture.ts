import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { ObligationEscrowFactory } from "@tradetrust/contracts";

export const deployObligationEscrowFactoryFixture = async ({
  deployer,
}: {
  deployer: SignerWithAddress | Signer;
}) => {
  const escrowFactory = await ethers.getContractFactory("ObligationEscrowFactory");
  return (await escrowFactory.connect(deployer).deploy()) as unknown as ObligationEscrowFactory;
};
