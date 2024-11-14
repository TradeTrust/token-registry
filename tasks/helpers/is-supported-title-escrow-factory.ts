import { ethers, Provider } from "ethers";
import { TitleEscrow, TitleEscrowFactory } from "@tradetrust/contracts";
import { contractInterfaceId } from "../../src/constants";

export const isSupportedTitleEscrowFactory = async (factoryAddress: string, provider?: Provider): Promise<boolean> => {
  const titleEscrowFactoryContract = new ethers.Contract(
    factoryAddress,
    ["function implementation() view returns (address)"],
    provider ?? ethers.getDefaultProvider()
  ) as unknown as TitleEscrowFactory;
  console.log("support tescrow");
  const implAddr = await titleEscrowFactoryContract.implementation();
  console.log("support tescrow2");
  const implContract = new ethers.Contract(
    implAddr,
    ["function supportsInterface(bytes4 interfaceId) view returns (bool)"],
    provider ?? ethers.getDefaultProvider()
  ) as unknown as TitleEscrow;
  console.log("support tescrow3");
  return implContract.supportsInterface(contractInterfaceId.TitleEscrow);
};
