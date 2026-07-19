import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { ObligationEscrowFactory } from "@tradetrust/contracts";

export const deployObligationEscrowFactoryFixture = async ({ deployer }: { deployer: SignerWithAddress }) => {
  const escrowFactory = await ethers.getContractFactory("ObligationEscrowFactory");
  return (await escrowFactory.connect(deployer).deploy(deployer.address)) as unknown as ObligationEscrowFactory;
};
