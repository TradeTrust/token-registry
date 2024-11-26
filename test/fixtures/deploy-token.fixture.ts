import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { TitleEscrowFactory } from "@tradetrust/contracts";
import { Contract, Signer } from "ethers";
import { ethers } from "hardhat";

export const deployTokenFixture = async <T extends Contract | unknown>({
  tokenContractName,
  tokenName,
  tokenInitials,
  deployer,
  escrowFactoryAddress = undefined,
}: {
  tokenContractName: string;
  tokenName: string;
  tokenInitials: string;
  deployer: SignerWithAddress | Signer;
  escrowFactoryAddress?: string;
  useMock?: boolean;
}): Promise<[TitleEscrowFactory, T]> => {
  const escrowFactory = await ethers.getContractFactory("TitleEscrowFactory");
  let titleEscrowFactoryContract: TitleEscrowFactory;
  if (!escrowFactoryAddress) {
    titleEscrowFactoryContract = (await escrowFactory.connect(deployer).deploy()) as unknown as TitleEscrowFactory;
    // eslint-disable-next-line no-param-reassign
    escrowFactoryAddress = titleEscrowFactoryContract.target as string;
  } else {
    titleEscrowFactoryContract = escrowFactory.attach(escrowFactoryAddress) as unknown as TitleEscrowFactory;
  }

  const tradeTrustTokenFactory = await ethers.getContractFactory(tokenContractName);
  const tradeTrustTokenContract: T = (await tradeTrustTokenFactory
    .connect(deployer)
    .deploy(tokenName, tokenInitials, escrowFactoryAddress)) as T;

  return [titleEscrowFactoryContract, tradeTrustTokenContract];
};
