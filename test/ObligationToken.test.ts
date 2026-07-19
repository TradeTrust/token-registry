import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ObligationEscrow, ObligationEscrowFactory, ObligationToken } from "@tradetrust/contracts";
import { expect } from "chai";
import faker from "faker";
import { ethers } from "hardhat";
import { defaultAddress, roleHash } from "../src/constants";
import { deployObligationTokenFixture } from "./fixtures";
import { getTestUsers, impersonateAccount, TestUsers, txnHexRemarks } from "./helpers";

enum Status {
  Issued = 0,
  Accepted = 1,
  Rejected = 2,
  Discharged = 3,
}

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

describe("ObligationToken", () => {
  let users: TestUsers;
  let obligationToken: ObligationToken;
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
    ({ obligationToken } = await deployObligationTokenFixture({ deployer: users.carrier }));
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

  describe("Reads", () => {
    it("should return the correct obligationEscrowFactory address", async () => {
      const escrowFactoryAddress = await obligationToken.obligationEscrowFactory();
      expect(escrowFactoryAddress).to.not.equal(defaultAddress.Zero);

      const escrowFactory = await ethers.getContractAt("ObligationEscrowFactory", escrowFactoryAddress);
      expect(await (escrowFactory as unknown as ObligationEscrowFactory).beacon()).to.not.equal(defaultAddress.Zero);
    });

    it("should return the same address for titleEscrowFactory() and obligationEscrowFactory()", async () => {
      expect(await obligationToken.titleEscrowFactory()).to.equal(await obligationToken.obligationEscrowFactory());
    });
  });

  describe("initialize validation", () => {
    let escrowFactoryAddress: string;

    beforeEach(async () => {
      const escrowFactory = await (
        await ethers.getContractFactory("ObligationEscrowFactory")
      ).deploy(users.carrier.address);
      escrowFactoryAddress = await escrowFactory.getAddress();
    });

    const deployObligationTokenProxy = async (
      admin: string,
      obligationEscrowFactoryAddress: string
    ): Promise<Promise<unknown>> => {
      const implementation = await (await ethers.getContractFactory("ObligationToken")).deploy();
      const initData = implementation.interface.encodeFunctionData("initialize", [
        "Test Registry",
        "TST",
        admin,
        obligationEscrowFactoryAddress,
      ]);
      const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      return ProxyFactory.connect(users.carrier).deploy(await implementation.getAddress(), initData);
    };

    it("should revert with ZeroAddress when admin is the zero address", async () => {
      const implementation = await (await ethers.getContractFactory("ObligationToken")).deploy();

      await expect(deployObligationTokenProxy(defaultAddress.Zero, escrowFactoryAddress)).to.be.revertedWithCustomError(
        implementation,
        "ZeroAddress"
      );
    });

    it("should revert with ZeroAddress when obligationEscrowFactory is the zero address", async () => {
      const implementation = await (await ethers.getContractFactory("ObligationToken")).deploy();

      await expect(
        deployObligationTokenProxy(users.carrier.address, defaultAddress.Zero)
      ).to.be.revertedWithCustomError(implementation, "ZeroAddress");
    });

    it("should revert with InvalidObligationEscrowFactory when the address has no code", async () => {
      const implementation = await (await ethers.getContractFactory("ObligationToken")).deploy();
      const [eoa] = users.others;

      await expect(deployObligationTokenProxy(users.carrier.address, eoa.address)).to.be.revertedWithCustomError(
        implementation,
        "InvalidObligationEscrowFactory"
      );
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

  describe("UUPS upgrade", () => {
    it("should revert when a non-owner attempts to upgrade", async () => {
      const [notOwner] = users.others;
      const newImplementation = await (await ethers.getContractFactory("ObligationToken")).deploy();

      const tx = obligationToken.connect(notOwner).upgradeToAndCall(await newImplementation.getAddress(), "0x");

      await expect(tx).to.be.revertedWithCustomError(obligationToken, "OwnableUnauthorizedAccount");
    });

    it("should allow the owner to upgrade and preserve existing storage", async () => {
      await mint(users.beneficiary, users.holder, tokenId);
      const escrowFactoryBefore = await obligationToken.obligationEscrowFactory();
      const genesisBefore = await obligationToken.genesis();

      const newImplementation = await (await ethers.getContractFactory("ObligationToken")).deploy();
      await obligationToken.connect(users.carrier).upgradeToAndCall(await newImplementation.getAddress(), "0x");

      expect(await obligationToken.obligationEscrowFactory()).to.equal(escrowFactoryBefore);
      expect(await obligationToken.genesis()).to.equal(genesisBefore);
      expect(await obligationToken.hasRole(roleHash.DefaultAdmin, users.carrier.address)).to.be.true;
      expect(await obligationToken.ownerOf(tokenId)).to.not.equal(defaultAddress.Zero);
    });
  });
});
