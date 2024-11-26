import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { TitleEscrowMock } from "@tradetrust/contracts";

// deploying the mock escrow contract
export const deployTitleEscrowMockFixture = async ({ deployer }: { deployer: SignerWithAddress }) => {
  const titleEscrowMockFactory = await ethers.getContractFactory("TitleEscrowMock");
  return (await titleEscrowMockFactory.connect(deployer).deploy()) as unknown as TitleEscrowMock;
};
