import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { ObligationEscrow, ObligationEscrowFactory, TrustVCToken } from "@tradetrust/contracts";
import { Contract, Signer } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { contractInterfaceId, defaultAddress } from "../src/constants";
import { deployObligationEscrowFixture, deployTrustVCTokenFixture } from "./fixtures";
import { deployImplProxy } from "./fixtures/deploy-impl-proxy.fixture";
import { getTestUsers, impersonateAccount, TestUsers, txnHexRemarks } from "./helpers";

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

const Status = {
  Issued: 0,
  Accepted: 1,
  Rejected: 2,
  Discharged: 3,
} as const;

const TerminationReason = {
  None: 0,
  ReturnToIssuer: 1,
  Rejected: 2,
  Discharged: 3,
} as const;

describe("ObligationEscrow", async () => {
  let users: TestUsers;
  let tokenId: string;
  const exceededLengthRemark = ethers.hexlify(ethers.randomBytes(121));

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
  });

  beforeEach(async () => {
    tokenId = faker.datatype.hexaDecimal(64);
  });

  const getEscrowContract = async (obligationToken: TrustVCToken, id: string): Promise<ObligationEscrow> => {
    const factoryAddr = await obligationToken.obligationEscrowFactory();
    const factory = (await ethers.getContractFactory("ObligationEscrowFactory")).attach(
      factoryAddr
    ) as unknown as ObligationEscrowFactory;
    const escrowAddress = await factory.getEscrowAddress(await obligationToken.getAddress(), id);
    return (await ethers.getContractFactory("ObligationEscrow")).attach(escrowAddress) as unknown as ObligationEscrow;
  };

  const mint = async (
    obligationToken: TrustVCToken,
    beneficiary: SignerWithAddress,
    holder: SignerWithAddress,
    id: string
  ): Promise<ObligationEscrow> => {
    await (
      await obligationToken
        .connect(users.carrier)
        .mint(beneficiary.address, holder.address, id, txnHexRemarks.mintRemark)
    ).wait();
    return getEscrowContract(obligationToken, id);
  };

  const mintWithReceipt = async (
    obligationToken: TrustVCToken,
    beneficiary: SignerWithAddress,
    holder: SignerWithAddress,
    id: string
  ): Promise<{ escrow: ObligationEscrow; mintBlockNumber: number }> => {
    const receipt = await (
      await obligationToken
        .connect(users.carrier)
        .mint(beneficiary.address, holder.address, id, txnHexRemarks.mintRemark)
    ).wait();
    return {
      escrow: await getEscrowContract(obligationToken, id),
      mintBlockNumber: receipt!.blockNumber,
    };
  };

  describe("ERC165 Support", () => {
    let obligationToken: TrustVCToken;
    let escrow: ObligationEscrow;

    // eslint-disable-next-line no-undef
    before(async () => {
      ({ obligationToken } = await deployTrustVCTokenFixture({ deployer: users.carrier }));
    });

    beforeEach(async () => {
      escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
    });

    it("should support IObligationEscrow interface", async () => {
      expect(await escrow.supportsInterface(contractInterfaceId.ObligationEscrow)).to.be.true;
    });
  });

  describe("General Behaviours", () => {
    let implContract: ObligationEscrow;

    // eslint-disable-next-line no-undef
    before(async () => {
      implContract = await deployObligationEscrowFixture({ deployer: users.carrier });
    });

    it("should not allow initialising the implementation directly", async () => {
      const tx = implContract.initialize(defaultAddress.Zero, tokenId);
      await expect(tx).to.be.revertedWithCustomError(implContract, "InvalidInitialization");
    });
  });

  describe("Initialisation (fresh clone)", () => {
    let implContract: ObligationEscrow;
    let cloneContract: ObligationEscrow;
    let registryAddress: string;

    // eslint-disable-next-line no-undef
    before(async () => {
      implContract = await deployObligationEscrowFixture({ deployer: users.carrier });
    });

    beforeEach(async () => {
      const { obligationToken } = await deployTrustVCTokenFixture({ deployer: users.carrier });
      registryAddress = await obligationToken.getAddress();
      cloneContract = await deployImplProxy<ObligationEscrow & Contract>({
        implementation: implContract as ObligationEscrow & Contract,
        deployer: users.carrier,
      });
      await cloneContract.initialize(registryAddress, tokenId);
    });

    it("should set the correct registry address", async () => {
      expect(await cloneContract.registry()).to.equal(registryAddress);
    });

    it("should set active to true", async () => {
      expect(await cloneContract.active()).to.be.true;
    });

    it("should set the correct token ID", async () => {
      expect(await cloneContract.tokenId()).to.equal(tokenId);
    });

    it("should keep beneficiary/holder/nominee/prevBeneficiary/prevHolder as zero address", async () => {
      expect(await cloneContract.beneficiary()).to.equal(defaultAddress.Zero);
      expect(await cloneContract.holder()).to.equal(defaultAddress.Zero);
      expect(await cloneContract.nominee()).to.equal(defaultAddress.Zero);
      expect(await cloneContract.prevBeneficiary()).to.equal(defaultAddress.Zero);
      expect(await cloneContract.prevHolder()).to.equal(defaultAddress.Zero);
    });

    it("should set terminationReason to None", async () => {
      expect(await cloneContract.terminationReason()).to.equal(TerminationReason.None);
    });

    it("should leave mintBlock and shredBlock at zero before mint", async () => {
      expect(await cloneContract.mintBlock()).to.equal(0);
      expect(await cloneContract.shredBlock()).to.equal(0);
    });

    it("should not be registered and revert status()", async () => {
      expect(await cloneContract.isRegistered()).to.be.false;
      await expect(cloneContract.status()).to.be.revertedWithCustomError(cloneContract, "NotRegistered");
    });

    it("should not allow re-initialisation", async () => {
      const tx = cloneContract.initialize(registryAddress, tokenId);
      await expect(tx).to.be.revertedWithCustomError(cloneContract, "InvalidInitialization");
    });
  });

  describe("IERC721Receiver Behaviour", () => {
    let implContractSrc: ObligationEscrow;
    let fakeRegistry: TrustVCToken;
    let fakeRegistryWallet: Signer;
    let implContract: ObligationEscrow;
    let fakeAddress: string;

    // eslint-disable-next-line no-undef
    before(async () => {
      implContractSrc = await deployObligationEscrowFixture({ deployer: users.carrier });
    });

    beforeEach(async () => {
      ({ obligationToken: fakeRegistry } = await deployTrustVCTokenFixture({ deployer: users.carrier }));
      fakeRegistryWallet = await impersonateAccount({ address: await fakeRegistry.getAddress() });
      fakeAddress = ethers.getAddress(faker.finance.ethereumAddress());

      implContract = await deployImplProxy<ObligationEscrow & Contract>({
        implementation: implContractSrc as ObligationEscrow & Contract,
        deployer: users.carrier,
      });
      await implContract.initialize(await fakeRegistry.getAddress(), tokenId);
    });

    it("should revert for the wrong tokenId", async () => {
      const wrongTokenId = faker.datatype.hexaDecimal(64);
      const tx = implContract
        .connect(fakeRegistryWallet)
        .onERC721Received(fakeAddress, fakeAddress, wrongTokenId, "0x00");

      await expect(tx).to.be.revertedWithCustomError(implContract, "InvalidTokenId").withArgs(wrongTokenId);
    });

    it("should revert when caller is not the registry", async () => {
      const [notRegistry] = users.others;
      const tx = implContract.connect(notRegistry).onERC721Received(fakeAddress, fakeAddress, tokenId, "0x00");

      await expect(tx).to.be.revertedWithCustomError(implContract, "InvalidRegistry").withArgs(notRegistry.address);
    });

    describe("Minting receive", () => {
      let data: string;

      beforeEach(async () => {
        data = new ethers.AbiCoder().encode(
          ["address", "address", "bytes"],
          [users.beneficiary.address, users.holder.address, txnHexRemarks.mintRemark]
        );
      });

      it("should set beneficiary and holder from data", async () => {
        await implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, data);

        expect(await implContract.beneficiary()).to.equal(users.beneficiary.address);
        expect(await implContract.holder()).to.equal(users.holder.address);
      });

      it("should register the escrow and set status to Issued", async () => {
        const tx = implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, data);
        const receipt = await (await tx).wait();

        expect(await implContract.isRegistered()).to.be.true;
        expect(await implContract.status()).to.equal(Status.Issued);
        expect(await implContract.mintBlock()).to.equal(receipt!.blockNumber);
        expect(await implContract.shredBlock()).to.equal(0);
        await expect(tx)
          .to.emit(implContract, "StatusInitialized")
          .withArgs(tokenId, await fakeRegistry.getAddress());
      });

      it("should emit TokenReceived with isMinting true", async () => {
        const tx = implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, data);

        await expect(tx)
          .to.emit(implContract, "TokenReceived")
          .withArgs(
            users.beneficiary.address,
            users.holder.address,
            true,
            await fakeRegistry.getAddress(),
            tokenId,
            txnHexRemarks.mintRemark
          );
      });

      it("should emit BeneficiaryTransfer and HolderTransfer events", async () => {
        const tx = implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, data);

        await expect(tx)
          .to.emit(implContract, "BeneficiaryTransfer")
          .withArgs(defaultAddress.Zero, users.beneficiary.address, await fakeRegistry.getAddress(), tokenId, "0x");
        await expect(tx)
          .to.emit(implContract, "HolderTransfer")
          .withArgs(defaultAddress.Zero, users.holder.address, await fakeRegistry.getAddress(), tokenId, "0x");
      });

      it("should revert on empty data", async () => {
        const tx = implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

        await expect(tx).to.be.revertedWithCustomError(implContract, "EmptyReceivingData");
      });

      it("should revert when beneficiary is zero address", async () => {
        const zeroBeneficiaryData = new ethers.AbiCoder().encode(
          ["address", "address", "bytes"],
          [defaultAddress.Zero, users.holder.address, txnHexRemarks.mintRemark]
        );
        const tx = implContract
          .connect(fakeRegistryWallet)
          .onERC721Received(fakeAddress, fakeAddress, tokenId, zeroBeneficiaryData);

        await expect(tx)
          .to.be.revertedWithCustomError(implContract, "InvalidTokenTransferToZeroAddressOwners")
          .withArgs(defaultAddress.Zero, users.holder.address);
      });

      it("should revert when holder is zero address", async () => {
        const zeroHolderData = new ethers.AbiCoder().encode(
          ["address", "address", "bytes"],
          [users.beneficiary.address, defaultAddress.Zero, txnHexRemarks.mintRemark]
        );
        const tx = implContract
          .connect(fakeRegistryWallet)
          .onERC721Received(fakeAddress, fakeAddress, tokenId, zeroHolderData);

        await expect(tx)
          .to.be.revertedWithCustomError(implContract, "InvalidTokenTransferToZeroAddressOwners")
          .withArgs(users.beneficiary.address, defaultAddress.Zero);
      });
    });

    describe("After minting receive", () => {
      beforeEach(async () => {
        const data = new ethers.AbiCoder().encode(
          ["address", "address", "bytes"],
          [users.beneficiary.address, users.holder.address, txnHexRemarks.mintRemark]
        );
        await implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, data);
      });

      it("should accept subsequent receive without data and emit isMinting false", async () => {
        const tx = implContract.connect(fakeRegistryWallet).onERC721Received(fakeAddress, fakeAddress, tokenId, "0x");

        await expect(tx)
          .to.emit(implContract, "TokenReceived")
          .withArgs(
            users.beneficiary.address,
            users.holder.address,
            false,
            await fakeRegistry.getAddress(),
            tokenId,
            "0x"
          );
      });
    });
  });

  describe("Operational behaviours (via a real TrustVCToken)", () => {
    let obligationToken: TrustVCToken;
    let escrow: ObligationEscrow;

    // eslint-disable-next-line no-undef
    before(async () => {
      ({ obligationToken } = await deployTrustVCTokenFixture({ deployer: users.carrier }));
    });

    describe("Status lifecycle (accept/reject/discharge)", () => {
      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
      });

      it("should start Issued and registered right after mint", async () => {
        expect(await escrow.status()).to.equal(Status.Issued);
        expect(await escrow.isRegistered()).to.be.true;
      });

      it("should record mintBlock on mint and leave shredBlock at zero", async () => {
        const { escrow: mintedEscrow, mintBlockNumber } = await mintWithReceipt(
          obligationToken,
          users.beneficiary,
          users.holder,
          faker.datatype.hexaDecimal(64)
        );
        expect(await mintedEscrow.mintBlock()).to.equal(mintBlockNumber);
        expect(await mintedEscrow.shredBlock()).to.equal(0);
      });

      it("should not allow remark length to exceed limit on accept/reject/discharge", async () => {
        await expect(escrow.connect(users.holder).accept(exceededLengthRemark)).to.be.revertedWithCustomError(
          escrow,
          "RemarkLengthExceeded"
        );
        await expect(escrow.connect(users.holder).reject(exceededLengthRemark)).to.be.revertedWithCustomError(
          escrow,
          "RemarkLengthExceeded"
        );
      });

      it("should allow the holder to accept an Issued title", async () => {
        const tx = escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);

        await expect(tx)
          .to.emit(escrow, "StatusAccepted")
          .withArgs(tokenId, users.holder.address, txnHexRemarks.mintRemark);
        expect(await escrow.status()).to.equal(Status.Accepted);
        expect(await escrow.active()).to.be.true;
      });

      it("should not allow non-holder to accept", async () => {
        const tx = escrow.connect(users.beneficiary).accept(txnHexRemarks.mintRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });

      it("should not allow accepting a title that is not Issued", async () => {
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        const tx = escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        await expect(tx)
          .to.be.revertedWithCustomError(escrow, "InvalidStatusTransition")
          .withArgs(Status.Accepted, Status.Issued);
      });

      it("should allow the holder to reject an Issued title and auto-shred it", async () => {
        const mintBlock = await escrow.mintBlock();
        const tx = escrow.connect(users.holder).reject(txnHexRemarks.mintRemark);
        const receipt = await (await tx).wait();

        await expect(tx)
          .to.emit(escrow, "StatusRejected")
          .withArgs(tokenId, users.holder.address, txnHexRemarks.mintRemark);
        await expect(tx)
          .to.emit(escrow, "Shred")
          .withArgs(await obligationToken.getAddress(), tokenId, TerminationReason.Rejected, txnHexRemarks.mintRemark);
        expect(await escrow.status()).to.equal(Status.Rejected);
        expect(await escrow.active()).to.be.false;
        expect(await escrow.terminationReason()).to.equal(TerminationReason.Rejected);
        expect(await escrow.beneficiary()).to.equal(defaultAddress.Zero);
        expect(await escrow.holder()).to.equal(defaultAddress.Zero);
        expect(await obligationToken.ownerOf(tokenId)).to.equal(BURN_ADDRESS);
        expect(await escrow.shredBlock()).to.equal(receipt!.blockNumber);
        expect(await escrow.mintBlock()).to.equal(mintBlock);
      });

      it("should not allow non-holder to reject", async () => {
        const tx = escrow.connect(users.beneficiary).reject(txnHexRemarks.mintRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });

      it("should not allow rejecting a title that is not Issued", async () => {
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        const tx = escrow.connect(users.holder).reject(txnHexRemarks.mintRemark);
        await expect(tx)
          .to.be.revertedWithCustomError(escrow, "InvalidStatusTransition")
          .withArgs(Status.Accepted, Status.Issued);
      });

      it("should not allow discharging a title that is not Accepted", async () => {
        const tx = escrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark);
        await expect(tx)
          .to.be.revertedWithCustomError(escrow, "InvalidStatusTransition")
          .withArgs(Status.Issued, Status.Accepted);
      });

      it("should allow the beneficiary to discharge an Accepted title and auto-shred it", async () => {
        const mintBlock = await escrow.mintBlock();
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        const tx = escrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark);
        const receipt = await (await tx).wait();

        await expect(tx)
          .to.emit(escrow, "StatusDischarged")
          .withArgs(tokenId, users.beneficiary.address, txnHexRemarks.mintRemark);
        expect(await escrow.status()).to.equal(Status.Discharged);
        expect(await escrow.active()).to.be.false;
        expect(await escrow.terminationReason()).to.equal(TerminationReason.Discharged);
        expect(await obligationToken.ownerOf(tokenId)).to.equal(BURN_ADDRESS);
        expect(await escrow.shredBlock()).to.equal(receipt!.blockNumber);
        expect(await escrow.mintBlock()).to.equal(mintBlock);
      });

      it("should not allow non-beneficiary to discharge", async () => {
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        const tx = escrow.connect(users.holder).discharge(txnHexRemarks.mintRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotBeneficiary");
      });

      it("should revert accept/reject when beneficiary equals holder", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);

        await expect(
          dualEscrow.connect(users.beneficiary).accept(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(dualEscrow, "OwnerHolderMustDiffer");
        await expect(
          dualEscrow.connect(users.beneficiary).reject(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(dualEscrow, "OwnerHolderMustDiffer");
      });

      it("should allow the beneficiary to discharge when beneficiary equals holder (only beneficiary check)", async () => {
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        await escrow.connect(users.holder).transferHolder(users.beneficiary.address, txnHexRemarks.mintRemark);

        const tx = escrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark);
        await expect(tx).to.not.be.reverted;
        expect(await escrow.status()).to.equal(Status.Discharged);
      });

      it("should revert accept while the registry is paused", async () => {
        await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);

        await expect(escrow.connect(users.holder).accept(txnHexRemarks.mintRemark)).to.be.revertedWithCustomError(
          escrow,
          "RegistryContractPaused"
        );

        await obligationToken.connect(users.carrier).unpause(txnHexRemarks.unPauseRemark);
      });

      it("should revert reject while the registry is paused", async () => {
        await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);

        await expect(escrow.connect(users.holder).reject(txnHexRemarks.mintRemark)).to.be.revertedWithCustomError(
          escrow,
          "RegistryContractPaused"
        );

        await obligationToken.connect(users.carrier).unpause(txnHexRemarks.unPauseRemark);
      });

      it("should revert discharge while the registry is paused", async () => {
        await escrow.connect(users.holder).accept(txnHexRemarks.mintRemark);
        await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);

        await expect(
          escrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(escrow, "RegistryContractPaused");

        await obligationToken.connect(users.carrier).unpause(txnHexRemarks.unPauseRemark);
      });
    });

    describe("Nomination", () => {
      let beneficiaryNominee: SignerWithAddress;

      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
        [beneficiaryNominee] = users.others;
      });

      it("should not allow remark length to exceed limit", async () => {
        const tx = escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, exceededLengthRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "RemarkLengthExceeded");
      });

      it("should allow beneficiary to nominate a new beneficiary", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        expect(await escrow.nominee()).to.equal(beneficiaryNominee.address);
      });

      it("should not allow non-beneficiary to nominate", async () => {
        const tx = escrow.connect(users.holder).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotBeneficiary");
      });

      it("should not allow nominating the current beneficiary", async () => {
        const tx = escrow.connect(users.beneficiary).nominate(users.beneficiary.address, txnHexRemarks.nominateRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "TargetNomineeAlreadyBeneficiary");
      });

      it("should not allow nominating the same nominee twice", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        const tx = escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "NomineeAlreadyNominated");
      });

      it("should emit Nomination event", async () => {
        const tx = escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await expect(tx)
          .to.emit(escrow, "Nomination")
          .withArgs(
            defaultAddress.Zero,
            beneficiaryNominee.address,
            await obligationToken.getAddress(),
            tokenId,
            txnHexRemarks.nominateRemark
          );
      });

      it("should not allow nominating when escrow is not holding token", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
        await dualEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const tx = dualEscrow
          .connect(users.beneficiary)
          .nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await expect(tx).to.be.revertedWithCustomError(dualEscrow, "TitleEscrowNotHoldingToken");
      });
    });

    describe("Transfer beneficiary / holder / owners", () => {
      let beneficiaryNominee: SignerWithAddress;
      let newHolder: SignerWithAddress;

      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
        [beneficiaryNominee, newHolder] = users.others;
      });

      it("should allow holder to transfer to a nominated beneficiary", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await escrow
          .connect(users.holder)
          .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

        expect(await escrow.beneficiary()).to.equal(beneficiaryNominee.address);
        expect(await escrow.nominee()).to.equal(defaultAddress.Zero);
      });

      it("should not allow non-holder to transfer beneficiary", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        const tx = escrow
          .connect(users.beneficiary)
          .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });

      it("should not allow transferring beneficiary to zero address", async () => {
        const tx = escrow
          .connect(users.holder)
          .transferBeneficiary(defaultAddress.Zero, txnHexRemarks.beneficiaryTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "InvalidTransferToZeroAddress");
      });

      it("should not allow transferring beneficiary to a non-nominated address", async () => {
        const tx = escrow
          .connect(users.holder)
          .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "InvalidNominee");
      });

      it("should emit BeneficiaryTransfer event", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        const tx = escrow
          .connect(users.holder)
          .transferBeneficiary(beneficiaryNominee.address, txnHexRemarks.beneficiaryTransferRemark);

        await expect(tx)
          .to.emit(escrow, "BeneficiaryTransfer")
          .withArgs(
            users.beneficiary.address,
            beneficiaryNominee.address,
            await obligationToken.getAddress(),
            tokenId,
            txnHexRemarks.beneficiaryTransferRemark
          );
      });

      it("should allow holder to transfer to a new holder", async () => {
        await escrow.connect(users.holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);

        expect(await escrow.holder()).to.equal(newHolder.address);
        expect(await escrow.prevHolder()).to.equal(users.holder.address);
      });

      it("should not allow non-holder to transfer holder", async () => {
        const tx = escrow
          .connect(users.beneficiary)
          .transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });

      it("should not allow transferring holder to zero address", async () => {
        const tx = escrow.connect(users.holder).transferHolder(defaultAddress.Zero, txnHexRemarks.holderTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "InvalidTransferToZeroAddress");
      });

      it("should not allow transferring holder to the current holder", async () => {
        const tx = escrow
          .connect(users.holder)
          .transferHolder(users.holder.address, txnHexRemarks.holderTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "RecipientAlreadyHolder");
      });

      it("should emit HolderTransfer event", async () => {
        const tx = escrow.connect(users.holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);
        await expect(tx)
          .to.emit(escrow, "HolderTransfer")
          .withArgs(
            users.holder.address,
            newHolder.address,
            await obligationToken.getAddress(),
            tokenId,
            txnHexRemarks.holderTransferRemark
          );
      });

      it("should transfer both beneficiary and holder via transferOwners", async () => {
        await escrow.connect(users.beneficiary).nominate(beneficiaryNominee.address, txnHexRemarks.nominateRemark);
        await escrow
          .connect(users.holder)
          .transferOwners(beneficiaryNominee.address, newHolder.address, txnHexRemarks.transferOwnersRemark);

        expect(await escrow.beneficiary()).to.equal(beneficiaryNominee.address);
        expect(await escrow.holder()).to.equal(newHolder.address);
      });

      it("should revert transferOwners when caller is not holder", async () => {
        const tx = escrow
          .connect(users.beneficiary)
          .transferOwners(beneficiaryNominee.address, newHolder.address, txnHexRemarks.transferOwnersRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });
    });

    describe("Reject transfer", () => {
      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
      });

      it("should allow beneficiary to reject a pending beneficiary transfer", async () => {
        const [newBeneficiary] = users.others;
        await escrow.connect(users.beneficiary).nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
        await escrow
          .connect(users.holder)
          .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);

        const tx = escrow.connect(newBeneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

        await expect(tx)
          .to.emit(escrow, "RejectTransferBeneficiary")
          .withArgs(
            newBeneficiary.address,
            users.beneficiary.address,
            await obligationToken.getAddress(),
            tokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await escrow.beneficiary()).to.equal(users.beneficiary.address);
      });

      it("should revert rejectTransferBeneficiary when there is no pending transfer", async () => {
        const tx = escrow.connect(users.beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "InvalidTransferToZeroAddress");
      });

      it("should allow holder to reject a pending holder transfer", async () => {
        const [newHolder] = users.others;
        await escrow.connect(users.holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark);

        const tx = escrow.connect(newHolder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

        await expect(tx)
          .to.emit(escrow, "RejectTransferHolder")
          .withArgs(
            newHolder.address,
            users.holder.address,
            await obligationToken.getAddress(),
            tokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await escrow.holder()).to.equal(users.holder.address);
      });

      it("should revert rejectTransferHolder when there is no pending transfer", async () => {
        const tx = escrow.connect(users.holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "InvalidTransferToZeroAddress");
      });

      it("should revert rejectTransferHolder/Beneficiary with DualRoleRejectionRequired when beneficiary==holder", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
        const [newOwner] = users.others;
        await dualEscrow
          .connect(users.beneficiary)
          .transferOwners(newOwner.address, newOwner.address, txnHexRemarks.transferOwnersRemark);

        const txHolder = dualEscrow.connect(newOwner).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);
        await expect(txHolder).to.be.revertedWithCustomError(dualEscrow, "DualRoleRejectionRequired");

        const txBeneficiary = dualEscrow
          .connect(newOwner)
          .rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);
        await expect(txBeneficiary).to.be.revertedWithCustomError(dualEscrow, "DualRoleRejectionRequired");
      });

      it("should allow dual-role owner to rejectTransferOwners", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
        const [newOwner] = users.others;
        await dualEscrow
          .connect(users.beneficiary)
          .transferOwners(newOwner.address, newOwner.address, txnHexRemarks.transferOwnersRemark);

        const tx = dualEscrow.connect(newOwner).rejectTransferOwners(txnHexRemarks.rejectTransferRemark);

        await expect(tx)
          .to.emit(dualEscrow, "RejectTransferOwners")
          .withArgs(
            newOwner.address,
            users.beneficiary.address,
            newOwner.address,
            users.beneficiary.address,
            await obligationToken.getAddress(),
            dualTokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await dualEscrow.beneficiary()).to.equal(users.beneficiary.address);
        expect(await dualEscrow.holder()).to.equal(users.beneficiary.address);
      });

      it("should revert rejectTransferOwners when there is no pending transfer", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);

        const tx = dualEscrow.connect(users.beneficiary).rejectTransferOwners(txnHexRemarks.rejectTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(dualEscrow, "InvalidTransferToZeroAddress");
      });

      it("should revert rejectTransferOwners when caller is not the dual-role owner", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
        const [newOwner] = users.others;
        await dualEscrow
          .connect(users.beneficiary)
          .transferOwners(newOwner.address, newOwner.address, txnHexRemarks.transferOwnersRemark);

        const tx = dualEscrow.connect(users.holder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark);
        await expect(tx).to.be.revertedWithCustomError(dualEscrow, "CallerNotBeneficiary");
      });
    });

    describe("returnToIssuer / shred (classic ETR path)", () => {
      let dualEscrow: ObligationEscrow;

      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);

        const dualTokenId = faker.datatype.hexaDecimal(64);
        dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
      });

      it("should revert returnToIssuer when beneficiary != holder", async () => {
        // onlyBeneficiary passes (caller is beneficiary) then onlyHolder fails, since roles differ.
        const tx = escrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);
        await expect(tx).to.be.revertedWithCustomError(escrow, "CallerNotHolder");
      });

      it("should allow dual-role owner to returnToIssuer", async () => {
        const tx = dualEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        await expect(tx)
          .to.emit(dualEscrow, "ReturnToIssuer")
          .withArgs(
            users.beneficiary.address,
            await obligationToken.getAddress(),
            await dualEscrow.tokenId(),
            txnHexRemarks.returnToIssuerRemark
          );
        expect(await dualEscrow.isHoldingToken()).to.be.false;
        expect(await dualEscrow.active()).to.be.true;
      });

      it("should revert shred if escrow is still holding the token", async () => {
        const tx = dualEscrow.connect(users.carrier).shred(txnHexRemarks.burnRemark);
        await expect(tx).to.be.revertedWithCustomError(dualEscrow, "TokenNotReturnedToIssuer");
      });

      it("should revert shred when caller is not registry", async () => {
        await dualEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const tx = dualEscrow.connect(users.beneficiary).shred(txnHexRemarks.burnRemark);
        await expect(tx).to.be.revertedWithCustomError(dualEscrow, "InvalidRegistry");
      });

      it("should shred via burn() and set terminationReason to ReturnToIssuer", async () => {
        const mintBlock = await dualEscrow.mintBlock();
        await dualEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        const tx = obligationToken.connect(users.carrier).burn(await dualEscrow.tokenId(), txnHexRemarks.burnRemark);
        const receipt = await (await tx).wait();

        await expect(tx)
          .to.emit(dualEscrow, "Shred")
          .withArgs(
            await obligationToken.getAddress(),
            await dualEscrow.tokenId(),
            TerminationReason.ReturnToIssuer,
            txnHexRemarks.burnRemark
          );
        expect(await dualEscrow.active()).to.be.false;
        expect(await dualEscrow.terminationReason()).to.equal(TerminationReason.ReturnToIssuer);
        expect(await dualEscrow.beneficiary()).to.equal(defaultAddress.Zero);
        expect(await dualEscrow.holder()).to.equal(defaultAddress.Zero);
        expect(await dualEscrow.shredBlock()).to.equal(receipt!.blockNumber);
        expect(await dualEscrow.mintBlock()).to.equal(mintBlock);
      });
    });

    describe("isHoldingToken", () => {
      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
      });

      it("should return true while holding the token", async () => {
        expect(await escrow.isHoldingToken()).to.be.true;
      });

      it("should return false after returnToIssuer", async () => {
        const dualTokenId = faker.datatype.hexaDecimal(64);
        const dualEscrow = await mint(obligationToken, users.beneficiary, users.beneficiary, dualTokenId);
        await dualEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark);

        expect(await dualEscrow.isHoldingToken()).to.be.false;
      });
    });

    describe("Inactive escrow guard", () => {
      let inactiveEscrow: ObligationEscrow;

      beforeEach(async () => {
        inactiveEscrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
        await inactiveEscrow.connect(users.holder).reject(txnHexRemarks.mintRemark);
      });

      it("should revert nominate", async () => {
        const tx = inactiveEscrow
          .connect(users.beneficiary)
          .nominate(users.carrier.address, txnHexRemarks.nominateRemark);
        await expect(tx).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
      });

      it("should revert transferBeneficiary/transferHolder/transferOwners", async () => {
        await expect(
          inactiveEscrow
            .connect(users.holder)
            .transferBeneficiary(users.carrier.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
        await expect(
          inactiveEscrow.connect(users.holder).transferHolder(users.carrier.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
        await expect(
          inactiveEscrow
            .connect(users.holder)
            .transferOwners(users.carrier.address, users.carrier.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
      });

      it("should revert accept/reject/discharge once inactive", async () => {
        await expect(
          inactiveEscrow.connect(users.holder).accept(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
        await expect(
          inactiveEscrow.connect(users.holder).reject(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
        await expect(
          inactiveEscrow.connect(users.beneficiary).discharge(txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
      });

      it("should revert returnToIssuer and shred", async () => {
        await expect(
          inactiveEscrow.connect(users.beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
        await expect(
          inactiveEscrow.connect(users.carrier).shred(txnHexRemarks.burnRemark)
        ).to.be.revertedWithCustomError(inactiveEscrow, "InactiveTitleEscrow");
      });

      it("should not revert isHoldingToken", async () => {
        expect(await inactiveEscrow.isHoldingToken()).to.be.false;
      });
    });

    describe("Pause interplay", () => {
      beforeEach(async () => {
        escrow = await mint(obligationToken, users.beneficiary, users.holder, tokenId);
        await obligationToken.connect(users.carrier).pause(txnHexRemarks.pauseRemark);
      });

      afterEach(async () => {
        if (await obligationToken.paused()) {
          await obligationToken.connect(users.carrier).unpause(txnHexRemarks.unPauseRemark);
        }
      });

      it("should revert nominate/transferHolder/transferBeneficiary/transferOwners while paused", async () => {
        await expect(
          escrow.connect(users.beneficiary).nominate(users.carrier.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(escrow, "RegistryContractPaused");
        await expect(
          escrow.connect(users.holder).transferHolder(users.carrier.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(escrow, "RegistryContractPaused");
      });
    });
  });
});
