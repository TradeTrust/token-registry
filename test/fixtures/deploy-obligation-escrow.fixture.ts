import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { ObligationEscrow } from "@tradetrust/contracts";

export const deployObligationEscrowFixture = async ({ deployer }: { deployer: SignerWithAddress }) => {
  const obligationEscrowFactory = await ethers.getContractFactory("ObligationEscrow");
  return (await obligationEscrowFactory.connect(deployer).deploy()) as unknown as ObligationEscrow;
};
