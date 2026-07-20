import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ObligationEscrowFactory, TrustVCToken } from "@tradetrust/contracts";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { deployObligationEscrowFactoryFixture } from "./deploy-obligation-escrow-factory.fixture";

export const deployTrustVCTokenFixture = async ({
  deployer,
  name = "Obligation Registry",
  symbol = "STR",
}: {
  deployer: SignerWithAddress | Signer;
  name?: string;
  symbol?: string;
}): Promise<{
  obligationEscrowFactory: ObligationEscrowFactory;
  obligationToken: TrustVCToken;
}> => {
  const obligationEscrowFactory = await deployObligationEscrowFactoryFixture({ deployer });

  const obligationToken = (await (
    await ethers.getContractFactory("TrustVCToken")
  )
    .connect(deployer)
    .deploy(name, symbol, await obligationEscrowFactory.getAddress())) as unknown as TrustVCToken;

  return { obligationEscrowFactory, obligationToken };
};
