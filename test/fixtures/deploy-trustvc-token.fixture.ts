import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  ObligationEscrowFactory,
  TrustVCToken,
  ObligationRegistryFactory,
} from "@tradetrust/contracts";
import { Signer } from "ethers";
import { ethers } from "hardhat";

export const deployTrustVCTokenFixture = async ({
  deployer,
  name = "Obligation Registry",
  symbol = "STR",
  owner,
}: {
  deployer: SignerWithAddress | Signer;
  name?: string;
  symbol?: string;
  owner?: string;
}): Promise<{
  factory: ObligationRegistryFactory;
  obligationEscrowFactory: ObligationEscrowFactory;
  obligationToken: TrustVCToken;
}> => {
  const factoryFactory = await ethers.getContractFactory("ObligationRegistryFactory");
  const factory = (await factoryFactory.connect(deployer).deploy()) as unknown as ObligationRegistryFactory;

  const ownerAddress = owner ?? (await (deployer as SignerWithAddress).getAddress());
  const tx = await factory.connect(deployer).deploy(name, symbol, ownerAddress);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("TrustVCToken deploy receipt is null");

  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog({ topics: [...log.topics], data: log.data });
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "ObligationRegistryDeployed");

  if (!event) throw new Error("ObligationRegistryDeployed event not found");

  const obligationTokenAddress = event.args.obligationRegistry as string;
  const obligationEscrowFactoryAddress = await factory.obligationEscrowFactory();

  const obligationToken = (await ethers.getContractFactory("TrustVCToken")).attach(
    obligationTokenAddress
  ) as unknown as TrustVCToken;
  const obligationEscrowFactory = (await ethers.getContractFactory("ObligationEscrowFactory")).attach(
    obligationEscrowFactoryAddress
  ) as unknown as ObligationEscrowFactory;

  return { factory, obligationEscrowFactory, obligationToken };
};
