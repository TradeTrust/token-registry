import { TitleEscrow, TitleEscrowFactory, TradeTrustToken, TradeTrustTokenMock } from "@tradetrust/contracts";
import { ethers } from "hardhat";

export const getTitleEscrowContract = async (
  tokenContract: TradeTrustToken | TradeTrustTokenMock,
  tokenId: string | number
): Promise<TitleEscrow> => {
  const titleEscrowAddr = await tokenContract.ownerOf(tokenId);
  const titleEscrowFactory = await ethers.getContractFactory("TitleEscrow");
  return titleEscrowFactory.attach(titleEscrowAddr) as TitleEscrow;
};

export const getTitleEscrowFactoryFromToken = async (
  tokenContract: TradeTrustToken | TradeTrustTokenMock
): Promise<TitleEscrowFactory> => {
  const escrowFactoryAddr = await tokenContract.titleEscrowFactory();
  return (await ethers.getContractFactory("TitleEscrowFactory")).attach(escrowFactoryAddr) as TitleEscrowFactory;
};

export const toAccessControlRevertMessage = (account: string, role: string): string => {
  return `AccessControl: account ${account.toLowerCase()} is missing role ${role}`;
};

export const createDeployFixtureRunner = async <T extends any[number][]>(...fixtures: T) => {
  return Promise.all(fixtures);
};

export const txnRemarks = {
  mintRemark: ethers.utils.toUtf8Bytes(
    "Remark: Document minted for cargo shipment by The Great Shipping Co. as part of the initial processing."
  ),
  burnRemark: ethers.utils.toUtf8Bytes(
    "Remark: Document permanently burned due to finalization of the process or irreversible changes."
  ),
  nominateRemark: ethers.utils.toUtf8Bytes(
    "Remark: New beneficiary nominated for the shipment to ensure proper handling and delivery."
  ),
  beneficiaryTransferRemark: ethers.utils.toUtf8Bytes(
    "Remark: Beneficiary rights transferred to update the recipient information for the document."
  ),
  holderTransferRemark: ethers.utils.toUtf8Bytes(
    "Remark: Holder rights endorsed and transferred to reflect changes in the responsible party for the cargo."
  ),
  surrenderRemark: ethers.utils.toUtf8Bytes(
    "Remark: Document surrendered as the cargo has been successfully delivered or no longer required."
  ),
  transferOwnersRemark: ethers.utils.toUtf8Bytes(
    "Remark: Ownership of the document transferred to update the records for the new managing party."
  ),
  restorerRemark: ethers.utils.toUtf8Bytes(
    "Remark: Document restored to reactivate it for further processing or corrections."
  ),
};
