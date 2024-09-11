import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TitleEscrow, TitleEscrowFactory, TradeTrustToken } from "@tradetrust/contracts";
import faker from "faker";
import { expect } from ".";
import { contractInterfaceId } from "../src/constants";
import { computeTitleEscrowAddress } from "../src/utils";
import { deployTokenFixture, DeployTokenFixtureRunner } from "./fixtures";
import { createDeployFixtureRunner, getTestUsers, getTitleEscrowContract, TestUsers, txnHexRemarks } from "./helpers";

describe("TradeTrustTokenRestorable", async () => {
  let users: TestUsers;
  let registryContract: TradeTrustToken;

  let registryName: string;
  let registrySymbol: string;

  let registryContractAsAdmin: TradeTrustToken;

  let mockTitleEscrowFactoryContract: TitleEscrowFactory;

  let tokenId: string;
  let titleEscrowImplAddr: string;
  let titleEscrowContract: TitleEscrow;

  let deployTokenFixtureRunner: DeployTokenFixtureRunner;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();

    registryName = "The Great Shipping Company";
    registrySymbol = "GSC";

    deployTokenFixtureRunner = async () =>
      createDeployFixtureRunner(
        ...(await deployTokenFixture<TradeTrustToken>({
          tokenContractName: "TradeTrustToken",
          tokenName: registryName,
          tokenInitials: registrySymbol,
          deployer: users.carrier,
        }))
      );
  });

  beforeEach(async () => {
    tokenId = faker.datatype.hexaDecimal(64);

    [mockTitleEscrowFactoryContract, registryContract] = await loadFixture(deployTokenFixtureRunner);

    registryContractAsAdmin = registryContract.connect(users.carrier);
    titleEscrowImplAddr = await mockTitleEscrowFactoryContract.implementation();

    await registryContractAsAdmin.mint(
      users.beneficiary.address,
      users.beneficiary.address,
      tokenId,
      txnHexRemarks.mintRemark
    );
    titleEscrowContract = await getTitleEscrowContract(registryContract, tokenId);
  });

  it("should support ITradeTrustTokenRestorable", async () => {
    const interfaceId = contractInterfaceId.TradeTrustTokenRestorable;

    const res = await registryContract.supportsInterface(interfaceId);

    expect(res).to.be.true;
  });

  it("should revert if Invalid token", async () => {
    const invalidTokenId = faker.datatype.hexaDecimal(64);
    const tx = registryContractAsAdmin.restore(invalidTokenId, txnHexRemarks.restorerRemark);

    await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "InvalidTokenId");
  });

  it("should revert if token is not surrendered", async () => {
    const tx = registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

    await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenNotSurrendered");
  });

  it("should not allow to restore burnt token", async () => {
    await titleEscrowContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);
    await registryContractAsAdmin.burn(tokenId, txnHexRemarks.burnRemark);

    const tx = registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

    await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenNotSurrendered");
  });

  it("should allow to restore after token is surrendered", async () => {
    await titleEscrowContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

    const tx = registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

    await expect(tx).to.not.be.reverted;
  });

  it("should restore to the correct title escrow", async () => {
    const expectedTitleEscrowAddr = computeTitleEscrowAddress({
      tokenId,
      registryAddress: registryContract.address,
      implementationAddress: titleEscrowImplAddr,
      factoryAddress: mockTitleEscrowFactoryContract.address,
    });
    await titleEscrowContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

    await registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);
    const res = await registryContract.ownerOf(tokenId);

    expect(res).to.equal(expectedTitleEscrowAddr);
  });

  it("should emit Transfer event with the correct values", async () => {
    const titleEscrowAddress = computeTitleEscrowAddress({
      tokenId,
      registryAddress: registryContract.address,
      implementationAddress: titleEscrowImplAddr,
      factoryAddress: mockTitleEscrowFactoryContract.address,
    });
    await titleEscrowContract.connect(users.beneficiary).surrender(txnHexRemarks.surrenderRemark);

    const tx = await registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

    expect(tx).to.emit(registryContract, "Transfer").withArgs(registryContract.address, titleEscrowAddress, tokenId);
  });
});
