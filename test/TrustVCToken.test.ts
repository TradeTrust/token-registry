import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ObligationEscrow, ObligationEscrowFactory, TrustVCToken } from "@tradetrust/contracts";
import { expect } from "chai";
import faker from "faker";
import { ethers } from "hardhat";
import { defaultAddress, roleHash } from "../src/constants";
import { deployTrustVCTokenFixture } from "./fixtures";
import { getTestUsers, impersonateAccount, TestUsers, txnHexRemarks } from "./helpers";

enum Status {
  Issued = 0,
  Accepted = 1,
  Rejected = 2,
  Discharged = 3,
}

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

describe("TrustVCToken", () => {
  let users: TestUsers;
  let obligationToken: TrustVCToken;
  let tokenId: string;

  const getEscrow = async (id: string): Promise<ObligationEscrow> => {
    const factoryAddr = await obligationToken.obligationEscrowFactory();
    const factory = await ethers.getContractAt("ObligationEscrowFactory", factoryAddr);
    const escrowAddress = await factory.getEscrowAddress(await obligationToken.getAddress(), id);
    return (await ethers.getContractAt("ObligationEscrow", escrowAddress)) as unknown as ObligationEscrow;
  };

  const mint = async (beneficiary: SignerWithAddress, holder: SignerWithAddress, id: string) => {
    await (
      await obligationToken
        .connect(users.carrier)
        .mint(beneficiary.address, holder.address, id, txnHexRemarks.mintRemark)
    ).wait();
    return getEscrow(id);
  };

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
  });

  beforeEach(async () => {
    ({ obligationToken } = await deployTrustVCTokenFixture({ deployer: users.carrier }));
    tokenId = faker.datatype.hexaDecimal(64);
  });

  it("should mint titles on the token and run accept/reject/discharge lifecycle on escrow", async () => {
    const escrow = await mint(users.beneficiary, users.holder, tokenId);

    expect(await escrow.status()).to.equal(Status.Issued);
    expect(await escrow.isRegistered()).to.be.true;
    expect(await escrow.beneficiary()).to.equal(users.beneficiary.address);
    expect(await escrow.holder()).to.equal(users.holder.address);
    expect(await obligationToken.ownerOf(tokenId)).to.equal(await escrow.getAddress());

    await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
    expect(await escrow.status()).to.equal(Status.Accepted);

    const rejectTokenId = faker.datatype.hexaDecimal(64);
    const rejectEscrow = await mint(users.beneficiary, users.holder, rejectTokenId);
    await rejectEscrow.connect(users.holder).reject(txnHexRemarks.mintRemark);
    expect(await rejectEscrow.status()).to.equal(Status.Rejected);
    expect(await rejectEscrow.active()).to.be.false;
    expect(await obligationToken.ownerOf(rejectTokenId)).to.equal(BURN_ADDRESS);

    const dischargeTokenId = faker.datatype.hexaDecimal(64);
    const dischargeEscrow = await mint(users.beneficiary, users.holder, dischargeTokenId);
    await dischargeEscrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
    await dischargeEscrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark);
    expect(await dischargeEscrow.status()).to.equal(Status.Discharged);
    expect(await dischargeEscrow.active()).to.be.false;
    expect(await obligationToken.ownerOf(dischargeTokenId)).to.equal(BURN_ADDRESS);
  });

  it("should revert mint while paused", async () => {
    await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);

    const tx = obligationToken
      .connect(users.carrier)
      .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);

    await expect(tx).to.be.revertedWithCustomError(obligationToken, "EnforcedPause");
  });

  it("should revert minting the same tokenId twice", async () => {
    await mint(users.beneficiary, users.holder, tokenId);

    const tx = obligationToken
      .connect(users.carrier)
      .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark);

    await expect(tx).to.be.revertedWithCustomError(obligationToken, "TokenExists");
  });

  it("should not require beneficiary and holder to differ at mint (unchanged from classic ETR)", async () => {
    const escrow = await mint(users.beneficiary, users.beneficiary, tokenId);

    expect(await escrow.beneficiary()).to.equal(users.beneficiary.address);
    expect(await escrow.holder()).to.equal(users.beneficiary.address);
  });

  it("should set the deployer as default admin", async () => {
    expect(await obligationToken.hasRole(roleHash.DefaultAdmin, users.carrier.address)).to.be.true;
  });

  describe("Reads", () => {
    it("should return the correct obligationEscrowFactory address", async () => {
      const escrowFactoryAddress = await obligationToken.obligationEscrowFactory();
      expect(escrowFactoryAddress).to.not.equal(defaultAddress.Zero);

      const escrowFactory = (await ethers.getContractAt(
        "ObligationEscrowFactory",
        escrowFactoryAddress
      )) as unknown as ObligationEscrowFactory;
      expect(await escrowFactory.implementation()).to.not.equal(defaultAddress.Zero);
    });

    it("should return the same address for titleEscrowFactory() and obligationEscrowFactory()", async () => {
      expect(await obligationToken.titleEscrowFactory()).to.equal(await obligationToken.obligationEscrowFactory());
    });

    it("should return the initialisation block as genesis", async () => {
      const deployTx = obligationToken.deploymentTransaction();
      const receipt = await deployTx!.wait();

      expect(await obligationToken.genesis()).to.equal(receipt!.blockNumber);
    });
  });

  describe("Constructor validation", () => {
    it("should revert with ZeroAddress when obligationEscrowFactory is the zero address", async () => {
      const TrustVCTokenFactory = await ethers.getContractFactory("TrustVCToken");

      await expect(
        TrustVCTokenFactory.connect(users.carrier).deploy("Test", "TST", defaultAddress.Zero)
      ).to.be.revertedWithCustomError(TrustVCTokenFactory, "ZeroAddress");
    });

    it("should revert with InvalidObligationEscrowFactory when the address has no code", async () => {
      const TrustVCTokenFactory = await ethers.getContractFactory("TrustVCToken");
      const [eoa] = users.others;

      await expect(
        TrustVCTokenFactory.connect(users.carrier).deploy("Test", "TST", eoa.address)
      ).to.be.revertedWithCustomError(TrustVCTokenFactory, "InvalidObligationEscrowFactory");
    });
  });

  describe("burnFromEscrow", () => {
    it("should revert with CallerNotEscrow when called by an address that is not the title's escrow", async () => {
      await mint(users.beneficiary, users.holder, tokenId);
      const [notEscrow] = users.others;

      const tx = obligationToken.connect(notEscrow).burnFromEscrow(tokenId, txnHexRemarks.burnRemark);

      await expect(tx).to.be.revertedWithCustomError(obligationToken, "CallerNotEscrow");
    });

    it("should revert while paused, even when called by the correct escrow", async () => {
      await mint(users.beneficiary, users.holder, tokenId);
      await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);

      const escrow = await getEscrow(tokenId);
      const escrowWallet = await impersonateAccount({ address: await escrow.getAddress() });

      const tx = obligationToken.connect(escrowWallet).burnFromEscrow(tokenId, txnHexRemarks.burnRemark);
      await expect(tx).to.be.revertedWithCustomError(obligationToken, "EnforcedPause");
    });

    it("should not allow remark length to exceed limit, even when called by the correct escrow", async () => {
      await mint(users.beneficiary, users.holder, tokenId);
      const escrow = await getEscrow(tokenId);
      const escrowWallet = await impersonateAccount({ address: await escrow.getAddress() });
      const exceededLengthRemark = ethers.hexlify(ethers.randomBytes(121));

      const tx = obligationToken.connect(escrowWallet).burnFromEscrow(tokenId, exceededLengthRemark);
      await expect(tx).to.be.revertedWithCustomError(obligationToken, "RemarkLengthExceeded");
    });
  });
});
