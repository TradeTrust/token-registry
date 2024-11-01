import { TitleEscrow, TradeTrustToken, TradeTrustTokenMock } from "@tradetrust/contracts";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { getEventFromReceipt } from "../../src/utils";
import { txnHexRemarks } from "../helpers";
import { TransactionReceipt } from "ethers";

export const mintTokenFixture = async ({
  token,
  beneficiary,
  holder,
  tokenId,
}: {
  token: TradeTrustToken | TradeTrustTokenMock;
  beneficiary: SignerWithAddress;
  holder: SignerWithAddress;
  tokenId: string;
}) => {
  const tx = await token.mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark);
  const receipt = await tx.wait();
  if (receipt === null) {
    throw new Error("Transaction receipt is null.");
  }

  const titleEscrowFactoryInterface = (await ethers.getContractFactory("TitleEscrowFactory")).interface;
  // const titleEscrowCreatedEvent = titleEscrowFactoryInterface.getEvent("TitleEscrowCreated");
  // const topicHash = titleEscrowCreatedEvent ? titleEscrowCreatedEvent.topicHash : "0x";
  const event = getEventFromReceipt<any>(
    receipt as unknown as TransactionReceipt,
    "TitleEscrowCreated",
    titleEscrowFactoryInterface
  );

  const escrowAddress = event.args.titleEscrow;

  const titleEscrowFactory = await ethers.getContractFactory("TitleEscrow");
  const titleEscrow = titleEscrowFactory.attach(escrowAddress) as unknown as TitleEscrow;

  return { tokenId, titleEscrow, event };
};
