import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { TitleEscrow } from "@tradetrust/contracts";

export const deployTitleEscrowFixture = async ({ deployer }: { deployer: SignerWithAddress }) => {
  const titleEscrowFactory = await ethers.getContractFactory("TitleEscrow");
  return (await titleEscrowFactory.connect(deployer).deploy()) as unknown as TitleEscrow;
};
