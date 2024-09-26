import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TitleEscrow, TradeTrustToken } from "@tradetrust/contracts";
import faker from "faker";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { deployTokenFixture, DeployTokenFixtureRunner } from "./fixtures";
import { createDeployFixtureRunner, getTestUsers, getTitleEscrowContract, TestUsers, txnHexRemarks } from "./helpers";

describe("TradeTrustTokenRevocable", async () => {
  let users: TestUsers;
  let registryContract: TradeTrustToken;

  let registryName: string;
  let registrySymbol: string;

  let registryContractAsAdmin: TradeTrustToken;

  //   let mockTitleEscrowFactoryContract: TitleEscrowFactory;

  let tokenId: string;
  // let titleEscrowImplAddr: string;
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

    [, registryContract] = await loadFixture(deployTokenFixtureRunner);

    registryContractAsAdmin = registryContract.connect(users.carrier);
    // titleEscrowImplAddr = await mockTitleEscrowFactoryContract.implementation();

    await registryContractAsAdmin.mint(
      users.beneficiary.address,
      users.holder.address,
      tokenId,
      txnHexRemarks.mintRemark
    );
    titleEscrowContract = await getTitleEscrowContract(registryContract, tokenId);
  });

  it("should support ITradeTrustTokenRevocable", async () => {
    const interfaceId = contractInterfaceId.TradeTrustTokenRevocable;

    const res = await registryContract.supportsInterface(interfaceId);

    expect(res).to.be.true;
  });

  it("should set revocability to true", async () => {
    const res = await titleEscrowContract.isRevocable();

    expect(res).to.be.true;
  });

  it("should revert if Invalid token", async () => {
    const invalidTokenId = faker.datatype.hexaDecimal(64);
    const tx = registryContractAsAdmin.revoke(invalidTokenId, txnHexRemarks.revokerRemark);

    await expect(tx).to.be.revertedWithCustomError(registryContractAsAdmin, "InvalidTokenId");
  });

  it("should revert if any transaction made in the contract", async () => {
    await titleEscrowContract
      .connect(users.holder)
      .transferHolder(users.beneficiary.address, txnHexRemarks.holderTransferRemark);
    const tx = registryContractAsAdmin.revoke(tokenId, txnHexRemarks.revokerRemark);

    await expect(tx).to.be.revertedWithCustomError(titleEscrowContract, "RevocationExpired");
  });

  it("should allow to revoke after the minting", async () => {
    const tx = registryContractAsAdmin.revoke(tokenId, txnHexRemarks.revokerRemark);
    await expect(tx).to.not.be.reverted;
  });
  it("should have correct values after revoking", async () => {
    await registryContractAsAdmin.revoke(tokenId, txnHexRemarks.revokerRemark);
    expect(await titleEscrowContract.active()).to.be.false;
    expect(await titleEscrowContract.isHoldingToken()).to.be.false;
    expect(await titleEscrowContract.beneficiary()).to.equal(defaultAddress.Zero);
    expect(await titleEscrowContract.holder()).to.equal(defaultAddress.Zero);
    expect(await titleEscrowContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
    expect(await titleEscrowContract.prevHolder()).to.equal(defaultAddress.Zero);
    expect(await titleEscrowContract.isRevocable()).to.be.false;
  });

  it("should revoke to the burn address", async () => {
    await registryContractAsAdmin.revoke(tokenId, txnHexRemarks.revokerRemark);
    const res = await registryContract.ownerOf(tokenId);

    expect(res).to.equal(defaultAddress.Burn);
  });

  it("should emit Revoke and Transfer event with the correct values", async () => {
    const tx = await registryContractAsAdmin.revoke(tokenId, txnHexRemarks.revokerRemark);

    await expect(tx)
      .to.emit(registryContract, "Transfer")
      .withArgs(titleEscrowContract.address, registryContract.address, tokenId) // transfer from titleEscrow to registry
      .to.emit(registryContract, "Transfer")
      .withArgs(registryContract.address, defaultAddress.Burn, tokenId) // transfer from registry to burn address
      .and.to.emit(titleEscrowContract, "Revoke")
      .withArgs(registryContract.address, tokenId, txnHexRemarks.revokerRemark);
  });
});
