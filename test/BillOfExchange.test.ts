import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  TitleEscrow,
  TitleEscrowFactoryGetterMock,
  TitleEscrowSignable,
  TradeTrustToken,
  TradeTrustTokenMock,
} from "@tradetrust/contracts";
import faker from "faker";
import { Contract, Signer } from "ethers";
import { ethers } from "hardhat";
import { expect } from ".";
import { deployTokenFixture } from "./fixtures";
import { deployImplProxy } from "./fixtures/deploy-impl-proxy.fixture";
import { getTestUsers, getTitleEscrowContract, impersonateAccount, TestUsers, txnHexRemarks } from "./helpers";

describe("Bill of Exchange (eBOE)", async () => {
  let users: TestUsers;
  let registryContract: TradeTrustToken;
  let registryContractAsAdmin: TradeTrustToken;
  let tokenId: string;
  let thirdParty: SignerWithAddress;

  const Status = {
    Issued: 0n,
    Accepted: 1n,
    Rejected: 2n,
    Discharged: 3n,
  } as const;

  const remark = (text: string): string => ethers.hexlify(ethers.toUtf8Bytes(text));
  const boeRemark = (text = "eBOE remark"): string => remark(text);
  const EMPTY_REMARK = "0x";
  const longRemark = (): string => remark("x".repeat(121));

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    [thirdParty] = users.others;
  });

  beforeEach(async () => {
    tokenId = faker.datatype.hexaDecimal(64);
    [, registryContract] = await deployTokenFixture<TradeTrustToken>({
      tokenContractName: "TradeTrustToken",
      tokenName: "The Great Shipping Company",
      tokenInitials: "GSC",
      deployer: users.carrier,
    });
    registryContractAsAdmin = registryContract.connect(users.carrier);
  });

  const mint = async (
    beneficiary: SignerWithAddress,
    holder: SignerWithAddress,
    mintRemark: string,
    id: string = tokenId
  ): Promise<TitleEscrow> => {
    await registryContractAsAdmin.mint(beneficiary.address, holder.address, id, mintRemark);
    return getTitleEscrowContract(registryContract, id);
  };

  const freshTokenId = (): string => faker.datatype.hexaDecimal(64);

  const mintDiverged = async (id: string = tokenId): Promise<TitleEscrow> => {
    const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark(), id);
    await titleEscrow.connect(users.beneficiary).transferHolder(users.holder.address, boeRemark());
    return titleEscrow;
  };

  const mintAndAccept = async (id: string = tokenId): Promise<TitleEscrow> => {
    const titleEscrow = await mintDiverged(id);
    await titleEscrow.connect(users.holder).accept(boeRemark());
    return titleEscrow;
  };

  const mintRejectedDiverged = async (id: string = tokenId): Promise<TitleEscrow> => {
    const titleEscrow = await mintDiverged(id);
    await titleEscrow.connect(users.holder).reject(boeRemark());
    return titleEscrow;
  };

  const mintDischarged = async (id: string = tokenId): Promise<TitleEscrow> => {
    const titleEscrow = await mintAndAccept(id);
    await titleEscrow.connect(users.beneficiary).discharge(boeRemark());
    return titleEscrow;
  };

  const reconvergeToBeneficiary = async (titleEscrow: TitleEscrow): Promise<void> => {
    await titleEscrow.connect(users.holder).rejectTransferHolder(boeRemark());
  };

  describe("Mint", () => {
    it("should mint with status Issued by default", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("should not change the existing mint()'s function selector or beneficiary/holder assignment", async () => {
      const mintFragment = registryContract.interface.getFunction("mint");
      expect(mintFragment?.selector).to.equal(ethers.id("mint(address,address,uint256,bytes)").slice(0, 10));

      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());
      expect(await titleEscrow.beneficiary()).to.equal(users.beneficiary.address);
      expect(await titleEscrow.holder()).to.equal(users.holder.address);
      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("should reject minting the same tokenId twice", async () => {
      await mint(users.beneficiary, users.holder, boeRemark());

      await expect(
        registryContractAsAdmin.mint(users.beneficiary.address, users.holder.address, tokenId, boeRemark())
      ).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenExists");
    });
  });

  describe("Accept - accept", () => {
    it("should revert if beneficiary == holder", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).accept(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should revert if called by non-holder", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).accept(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "CallerNotHolder");
    });

    it("should succeed with owner != holder at mint without a prior transferHolder (direct presentment)", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await titleEscrow.connect(users.holder).accept(boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("should succeed, set status Accepted, and leave beneficiary/holder unchanged", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());
      const acceptRemark = boeRemark("accepted");

      const tx = titleEscrow.connect(users.holder).accept(acceptRemark);

      await expect(tx)
        .to.emit(titleEscrow, "StatusAccepted")
        .withArgs(users.holder.address, registryContract.target, tokenId, acceptRemark);
      expect(await titleEscrow.status()).to.equal(Status.Accepted);
      expect(await titleEscrow.beneficiary()).to.equal(users.beneficiary.address);
      expect(await titleEscrow.holder()).to.equal(users.holder.address);
    });

    it("should revert if status is not Issued (e.g. already Accepted)", async () => {
      const titleEscrow = await mintAndAccept();

      await expect(titleEscrow.connect(users.holder).accept(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InvalidStatusTransition"
      );
    });
  });

  describe("Reject - reject", () => {
    it("should revert if beneficiary == holder", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).reject(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should revert if called by non-holder", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).reject(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "CallerNotHolder");
    });

    it("should succeed with owner != holder at mint without a prior transferHolder (no prevHolder needed)", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await titleEscrow.connect(users.holder).reject(boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Rejected);
    });

    it("should succeed, set status Rejected, and leave beneficiary/holder roles untouched (status-only)", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());
      const dishonourRemark = boeRemark("dishonoured");

      const tx = titleEscrow.connect(users.holder).reject(dishonourRemark);

      await expect(tx)
        .to.emit(titleEscrow, "StatusRejected")
        .withArgs(users.holder.address, registryContract.target, tokenId, dishonourRemark);
      expect(await titleEscrow.status()).to.equal(Status.Rejected);
      expect(await titleEscrow.holder()).to.equal(users.holder.address);
      expect(await titleEscrow.beneficiary()).to.equal(users.beneficiary.address);
    });

    it("should revert if status is not Issued (e.g. already Accepted)", async () => {
      const titleEscrow = await mintAndAccept();

      await expect(titleEscrow.connect(users.holder).reject(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InvalidStatusTransition"
      );
    });
  });

  describe("Discharge - discharge", () => {
    it("should revert if beneficiary == holder", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should revert if called by non-beneficiary", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await expect(
        titleEscrow.connect(users.holder).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "CallerNotBeneficiary");
    });

    it("should succeed and set status Discharged from Accepted", async () => {
      const titleEscrow = await mintAndAccept();
      const paidRemark = boeRemark("paid");

      const tx = titleEscrow.connect(users.beneficiary).discharge(paidRemark);

      await expect(tx)
        .to.emit(titleEscrow, "StatusDischarged")
        .withArgs(users.beneficiary.address, registryContract.target, tokenId, paidRemark);
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });

    it("should revert if status is Issued (not yet accepted)", async () => {
      const titleEscrow = await mintDiverged();

      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition");
    });

    it("should revert if status is Rejected - discharge never closes a rejected bill", async () => {
      const titleEscrow = await mintRejectedDiverged();
      expect(await titleEscrow.status()).to.equal(Status.Rejected);

      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition");
    });
  });

  describe("Status transition matrix - invalid terminal transitions", () => {
    it("should revert accept from Rejected with InvalidStatusTransition args", async () => {
      const titleEscrow = await mintRejectedDiverged();

      await expect(titleEscrow.connect(users.holder).accept(boeRemark()))
        .to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition")
        .withArgs(Status.Rejected, Status.Issued);
    });

    it("should revert accept from Discharged", async () => {
      const titleEscrow = await mintDischarged();

      await expect(titleEscrow.connect(users.holder).accept(boeRemark()))
        .to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition")
        .withArgs(Status.Discharged, Status.Issued);
    });

    it("should revert reject from Rejected", async () => {
      const titleEscrow = await mintRejectedDiverged();

      await expect(titleEscrow.connect(users.holder).reject(boeRemark()))
        .to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition")
        .withArgs(Status.Rejected, Status.Issued);
    });

    it("should revert reject from Discharged", async () => {
      const titleEscrow = await mintDischarged();

      await expect(titleEscrow.connect(users.holder).reject(boeRemark()))
        .to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition")
        .withArgs(Status.Discharged, Status.Issued);
    });

    it("should revert discharge from Discharged (double discharge)", async () => {
      const titleEscrow = await mintDischarged();

      await expect(titleEscrow.connect(users.beneficiary).discharge(boeRemark()))
        .to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition")
        .withArgs(Status.Discharged, Status.Accepted);
    });
  });

  describe("Shared modifiers on BOE functions", () => {
    it("should revert accept, reject, and discharge when the registry is paused", async () => {
      const issuedEscrow = await mintDiverged();
      await registryContractAsAdmin.pause(txnHexRemarks.pauseRemark);
      expect(await issuedEscrow.status()).to.equal(Status.Issued);

      await expect(issuedEscrow.connect(users.holder).accept(boeRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "RegistryContractPaused"
      );
      await expect(issuedEscrow.connect(users.holder).reject(boeRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "RegistryContractPaused"
      );

      await registryContractAsAdmin.unpause(txnHexRemarks.unPauseRemark);
      await issuedEscrow.connect(users.holder).accept(boeRemark());
      await registryContractAsAdmin.pause(txnHexRemarks.pauseRemark);

      await expect(
        issuedEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(issuedEscrow, "RegistryContractPaused");
    });

    it("should allow BOE functions again after the registry is unpaused", async () => {
      const titleEscrow = await mintDiverged();
      await registryContractAsAdmin.pause(txnHexRemarks.pauseRemark);
      await registryContractAsAdmin.unpause(txnHexRemarks.unPauseRemark);

      await titleEscrow.connect(users.holder).accept(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("should revert BOE functions on an inactive escrow after shred", async () => {
      const titleEscrow = await mintDiverged();
      await reconvergeToBeneficiary(titleEscrow);
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());
      expect(await titleEscrow.active()).to.be.false;

      await expect(titleEscrow.connect(users.holder).accept(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InactiveTitleEscrow"
      );
    });

    it("should revert BOE functions when the escrow is not holding the token", async () => {
      const titleEscrow = await mintDiverged();
      await reconvergeToBeneficiary(titleEscrow);
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      expect(await titleEscrow.isHoldingToken()).to.be.false;

      await expect(
        titleEscrow.connect(users.beneficiary).accept(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
    });

    it("should revert accept, reject, and discharge when remark length exceeds 120 bytes", async () => {
      const issuedEscrow = await mintDiverged(tokenId);
      const acceptedEscrow = await mintAndAccept(freshTokenId());

      await expect(issuedEscrow.connect(users.holder).accept(longRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "RemarkLengthExceeded"
      );
      await expect(issuedEscrow.connect(users.holder).reject(longRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "RemarkLengthExceeded"
      );
      await expect(
        acceptedEscrow.connect(users.beneficiary).discharge(longRemark())
      ).to.be.revertedWithCustomError(acceptedEscrow, "RemarkLengthExceeded");
    });

    it("should accept empty remark 0x on accept, reject, and discharge", async () => {
      const issuedEscrow = await mint(users.beneficiary, users.holder, boeRemark(), freshTokenId());
      await issuedEscrow.connect(users.holder).accept(EMPTY_REMARK);
      expect(await issuedEscrow.status()).to.equal(Status.Accepted);

      const rejectEscrow = await mint(users.beneficiary, users.holder, boeRemark(), freshTokenId());
      await rejectEscrow.connect(users.holder).reject(EMPTY_REMARK);
      expect(await rejectEscrow.status()).to.equal(Status.Rejected);

      const dischargeEscrow = await mintAndAccept(freshTokenId());
      await dischargeEscrow.connect(users.beneficiary).discharge(EMPTY_REMARK);
      expect(await dischargeEscrow.status()).to.equal(Status.Discharged);
    });

    it("should revert when a third party calls accept, reject, or discharge", async () => {
      const issuedEscrow = await mint(users.beneficiary, users.holder, boeRemark(), freshTokenId());
      const acceptedEscrow = await mintAndAccept(freshTokenId());

      await expect(issuedEscrow.connect(thirdParty).accept(boeRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "CallerNotHolder"
      );
      await expect(issuedEscrow.connect(thirdParty).reject(boeRemark())).to.be.revertedWithCustomError(
        issuedEscrow,
        "CallerNotHolder"
      );
      await expect(
        acceptedEscrow.connect(thirdParty).discharge(boeRemark())
      ).to.be.revertedWithCustomError(acceptedEscrow, "CallerNotBeneficiary");
    });

    it("should overwrite remark on successful accept, reject, and discharge", async () => {
      const acceptRemark = boeRemark("accept remark");
      const issuedEscrow = await mint(users.beneficiary, users.holder, boeRemark(), freshTokenId());
      await issuedEscrow.connect(users.holder).accept(acceptRemark);
      expect(await issuedEscrow.remark()).to.equal(acceptRemark);

      const rejectRemark = boeRemark("reject remark");
      const rejectEscrow = await mint(users.beneficiary, users.holder, boeRemark(), freshTokenId());
      await rejectEscrow.connect(users.holder).reject(rejectRemark);
      expect(await rejectEscrow.remark()).to.equal(rejectRemark);

      const dischargeRemark = boeRemark("discharge remark");
      const dischargeEscrow = await mintAndAccept(freshTokenId());
      await dischargeEscrow.connect(users.beneficiary).discharge(dischargeRemark);
      expect(await dischargeEscrow.remark()).to.equal(dischargeRemark);
    });
  });

  describe("Owner / holder role dynamics vs status guards", () => {
    it("should revert accept after transferHolder reconverges roles while Issued", async () => {
      const titleEscrow = await mintDiverged();
      await reconvergeToBeneficiary(titleEscrow);

      await expect(
        titleEscrow.connect(users.beneficiary).accept(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should block accept, reject, and discharge while owner and holder are the same", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).accept(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
      await expect(
        titleEscrow.connect(users.beneficiary).reject(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should revert discharge after accept when transferHolder reconverges roles onto the owner", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.holder).transferHolder(users.beneficiary.address, boeRemark());

      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("should allow a new owner to discharge after financing endorsement while Accepted", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());

      await titleEscrow.connect(thirdParty).discharge(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
      expect(await titleEscrow.beneficiary()).to.equal(thirdParty.address);
    });

    it("should allow the original owner to discharge after the holder changes post-accept", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      await titleEscrow.connect(users.beneficiary).discharge(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });
  });

  describe("Status vs circulation - contract is permissive", () => {
    it("should keep status Issued during circulation while Issued", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("should keep status Accepted when transferHolder moves to a third party", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("should keep status Accepted during financing endorsement before discharge", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("should keep status Accepted when transferOwners assigns different owner and holder", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferOwners(thirdParty.address, users.carrier.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Accepted);
      expect(await titleEscrow.beneficiary()).to.equal(thirdParty.address);
      expect(await titleEscrow.holder()).to.equal(users.carrier.address);
    });

    it("should allow transferOwners to converge owner and holder while Accepted on-chain", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferOwners(thirdParty.address, thirdParty.address, boeRemark());

      expect(await titleEscrow.beneficiary()).to.equal(thirdParty.address);
      expect(await titleEscrow.holder()).to.equal(thirdParty.address);
      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("should keep status Rejected during circulation", async () => {
      const titleEscrow = await mintRejectedDiverged();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Rejected);
    });

    it("should keep status Discharged during circulation", async () => {
      const titleEscrow = await mintDischarged();
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });
  });

  describe("Existing ETR functions - unchanged, no status side effects", () => {
    it("transferBeneficiary(self) has no special-cased acceptance behaviour", async () => {
      const titleEscrow = await mintDiverged();

      await expect(
        titleEscrow.connect(users.holder).transferBeneficiary(users.beneficiary.address, boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "InvalidNominee");
      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("nominate(self) does not discharge - status stays Accepted", async () => {
      const titleEscrow = await mintAndAccept();
      expect(await titleEscrow.status()).to.equal(Status.Accepted);

      await expect(
        titleEscrow.connect(users.beneficiary).nominate(users.beneficiary.address, boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "TargetNomineeAlreadyBeneficiary");
      expect(await titleEscrow.status()).to.equal(Status.Accepted);
    });

    it("rejectTransferHolder does not set status - reverts the holder role only", async () => {
      const titleEscrow = await mintDiverged();

      const tx = titleEscrow.connect(users.holder).rejectTransferHolder(boeRemark());

      await expect(tx).to.emit(titleEscrow, "RejectTransferHolder");
      await expect(tx).to.not.emit(titleEscrow, "StatusRejected");
      expect(await titleEscrow.status()).to.equal(Status.Issued);
      expect(await titleEscrow.holder()).to.equal(users.beneficiary.address);
    });
  });

  describe("returnToIssuer / burn / restore interactions", () => {
    it("should revert returnToIssuer while Issued with owner != holder", async () => {
      const titleEscrow = await mintDiverged();

      await expect(titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "CallerNotHolder"
      );
    });

    it("should revert returnToIssuer while Accepted with owner != holder", async () => {
      const titleEscrow = await mintAndAccept();

      await expect(titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "CallerNotHolder"
      );
    });

    it("should revert returnToIssuer while Rejected before role reconvergence", async () => {
      const titleEscrow = await mintRejectedDiverged();

      await expect(titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "CallerNotHolder"
      );
    });

    it("should revert returnToIssuer while Discharged before role reconvergence", async () => {
      const titleEscrow = await mintDischarged();

      await expect(titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "CallerNotHolder"
      );
    });

    it("should revert rejectTransferHolder after reject when prevHolder is zero", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());
      await titleEscrow.connect(users.holder).reject(boeRemark());

      await expect(titleEscrow.connect(users.holder).rejectTransferHolder(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InvalidTransferToZeroAddress"
      );
    });

    it("should block BOE functions after Rejected burn while keeping the terminal status readable", async () => {
      const titleEscrow = await mintRejectedDiverged();
      await reconvergeToBeneficiary(titleEscrow);
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Rejected);
      expect(await titleEscrow.active()).to.be.false;
      await expect(titleEscrow.connect(users.holder).accept(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InactiveTitleEscrow"
      );
    });

    it("should block BOE functions after Discharged burn while keeping the terminal status readable", async () => {
      const titleEscrow = await mintDischarged();
      await titleEscrow.connect(users.beneficiary).nominate(users.holder.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(users.holder.address, boeRemark());
      await titleEscrow.connect(users.holder).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Discharged);
      expect(await titleEscrow.active()).to.be.false;
      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
    });

    it("should restore after returnToIssuer without burn and keep status Issued on the same escrow", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());

      await registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

      expect(await registryContract.ownerOf(tokenId)).to.equal(titleEscrow.target);
      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("should not restore after burn", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());

      await expect(
        registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark)
      ).to.be.revertedWithCustomError(registryContractAsAdmin, "TokenNotReturnedToIssuer");
      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });
  });

  describe("Plain ETR regression - status field present but unused", () => {
    it("should keep status Issued through a full endorsement chain without BOE calls", async () => {
      const titleEscrow = await mint(users.beneficiary, users.holder, boeRemark());

      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferHolder(thirdParty.address, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });

    it("should keep status Issued through returnToIssuer and burn without BOE calls", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());

      expect(await titleEscrow.status()).to.equal(Status.Issued);
      expect(await titleEscrow.active()).to.be.false;
    });

    it("should keep status Issued after restore on plain ETR", async () => {
      const titleEscrow = await mint(users.beneficiary, users.beneficiary, boeRemark());
      await titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.restore(tokenId, txnHexRemarks.restorerRemark);

      expect(await titleEscrow.status()).to.equal(Status.Issued);
    });
  });

  describe("End-to-end flows", () => {
    it("happy path: Issued -> Accepted -> Discharged", async () => {
      const titleEscrow = await mintDiverged();
      expect(await titleEscrow.status()).to.equal(Status.Issued);

      await titleEscrow.connect(users.holder).accept(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Accepted);

      await titleEscrow.connect(users.beneficiary).discharge(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });

    it("financing path: accept, endorse owner to bank, bank discharges", async () => {
      const titleEscrow = await mintDiverged();
      await titleEscrow.connect(users.holder).accept(boeRemark());
      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());

      await titleEscrow.connect(thirdParty).discharge(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });

    it("accepted early reconvergence on-chain: transferHolder to owner succeeds but discharge then fails", async () => {
      const titleEscrow = await mintAndAccept();
      await titleEscrow.connect(users.holder).transferHolder(users.beneficiary.address, boeRemark());
      expect(await titleEscrow.beneficiary()).to.equal(users.beneficiary.address);
      expect(await titleEscrow.holder()).to.equal(users.beneficiary.address);

      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "OwnerHolderMustDiffer");
    });

    it("discharged terminal: BOE functions revert but circulation remains possible on-chain", async () => {
      const titleEscrow = await mintDischarged();

      await expect(titleEscrow.connect(users.holder).accept(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InvalidStatusTransition"
      );
      await expect(titleEscrow.connect(users.holder).reject(boeRemark())).to.be.revertedWithCustomError(
        titleEscrow,
        "InvalidStatusTransition"
      );
      await expect(
        titleEscrow.connect(users.beneficiary).discharge(boeRemark())
      ).to.be.revertedWithCustomError(titleEscrow, "InvalidStatusTransition");

      await titleEscrow.connect(users.beneficiary).nominate(thirdParty.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(thirdParty.address, boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Discharged);
    });

    it("reject path: Issued -> Rejected (status-only) -> holder role separately reverted -> returnToIssuer -> reissue via mint", async () => {
      const titleEscrow = await mintDiverged();

      await titleEscrow.connect(users.holder).reject(boeRemark());
      expect(await titleEscrow.status()).to.equal(Status.Rejected);
      expect(await titleEscrow.holder()).to.equal(users.holder.address);

      await reconvergeToBeneficiary(titleEscrow);
      expect(await titleEscrow.beneficiary()).to.equal(await titleEscrow.holder());

      await expect(titleEscrow.connect(users.beneficiary).returnToIssuer(boeRemark())).to.emit(
        titleEscrow,
        "ReturnToIssuer"
      );
      expect(await titleEscrow.isHoldingToken()).to.be.false;

      const newTokenId = faker.datatype.hexaDecimal(64);
      await registryContractAsAdmin.mint(users.beneficiary.address, users.beneficiary.address, newTokenId, boeRemark());
      const newTitleEscrow = await getTitleEscrowContract(registryContract, newTokenId);

      expect(await newTitleEscrow.status()).to.equal(Status.Issued);
      expect(newTitleEscrow.target).to.not.equal(titleEscrow.target);
    });

    it("post-discharge burn flow: reconverge owner to holder via existing transfer primitives, then returnToIssuer + shred", async () => {
      const titleEscrow = await mintDischarged();

      await titleEscrow.connect(users.beneficiary).nominate(users.holder.address, boeRemark());
      await titleEscrow.connect(users.holder).transferBeneficiary(users.holder.address, boeRemark());
      expect(await titleEscrow.beneficiary()).to.equal(users.holder.address);
      expect(await titleEscrow.holder()).to.equal(users.holder.address);

      await titleEscrow.connect(users.holder).returnToIssuer(boeRemark());
      expect(await titleEscrow.isHoldingToken()).to.be.false;

      await registryContractAsAdmin.burn(tokenId, boeRemark());
      expect(await titleEscrow.active()).to.be.false;
    });

    it("should mint a fresh token with Issued status after a prior token was rejected and burned", async () => {
      const rejectedEscrow = await mintRejectedDiverged();
      await reconvergeToBeneficiary(rejectedEscrow);
      await rejectedEscrow.connect(users.beneficiary).returnToIssuer(boeRemark());
      await registryContractAsAdmin.burn(tokenId, boeRemark());

      const newTokenId = faker.datatype.hexaDecimal(64);
      await registryContractAsAdmin.mint(users.beneficiary.address, users.holder.address, newTokenId, boeRemark());
      const newTitleEscrow = await getTitleEscrowContract(registryContract, newTokenId);

      expect(await newTitleEscrow.status()).to.equal(Status.Issued);
    });
  });

  describe("TitleEscrowSignable inheritance", () => {
    let signableEscrow: TitleEscrowSignable;
    let signableRegistry: TradeTrustTokenMock;
    let signableTokenId: string;
    let registrySigner: Signer;

    beforeEach(async () => {
      signableTokenId = faker.datatype.hexaDecimal(64);
      const signableImpl = (await (await ethers.getContractFactory("TitleEscrowSignable"))
        .connect(users.carrier)
        .deploy()) as unknown as TitleEscrowSignable;
      signableEscrow = await deployImplProxy<TitleEscrowSignable & Contract>({
        implementation: signableImpl as TitleEscrowSignable & Contract,
        deployer: users.carrier,
      });

      const factoryGetterMock = (await (await ethers.getContractFactory("TitleEscrowFactoryGetterMock"))
        .connect(users.carrier)
        .deploy()) as unknown as TitleEscrowFactoryGetterMock;
      await factoryGetterMock.setAddress(signableEscrow.target);

      [, signableRegistry] = await deployTokenFixture<TradeTrustTokenMock>({
        tokenContractName: "TradeTrustTokenMock",
        tokenName: "The Great Shipping Company",
        tokenInitials: "GSC",
        deployer: users.carrier,
        escrowFactoryAddress: factoryGetterMock.target as string,
      });

      registrySigner = await impersonateAccount({ address: signableRegistry.target as string });
      await signableEscrow.initialize(signableRegistry.target, signableTokenId);

      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "address", "bytes"],
        [users.beneficiary.address, users.holder.address, boeRemark()]
      );
      await signableEscrow
        .connect(registrySigner as Signer)
        .onERC721Received(ethers.ZeroAddress, ethers.ZeroAddress, signableTokenId, data);
      await signableRegistry.connect(users.carrier).mintInternal(signableEscrow.target, signableTokenId);
    });

    it("should support accept on TitleEscrowSignable", async () => {
      await signableEscrow.connect(users.holder).accept(boeRemark());
      expect(await signableEscrow.status()).to.equal(Status.Accepted);
    });

    it("should support reject on TitleEscrowSignable", async () => {
      await signableEscrow.connect(users.holder).reject(boeRemark());
      expect(await signableEscrow.status()).to.equal(Status.Rejected);
    });

    it("should support discharge on TitleEscrowSignable", async () => {
      await signableEscrow.connect(users.holder).accept(boeRemark());
      await signableEscrow.connect(users.beneficiary).discharge(boeRemark());
      expect(await signableEscrow.status()).to.equal(Status.Discharged);
    });

    it("should compose transferBeneficiaryWithSig with accept without interference", async () => {
      const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);
      const domain = {
        name: "TradeTrust Title Escrow",
        version: "1",
        chainId,
        verifyingContract: signableEscrow.target as string,
      };
      const beneficiaryTransferTypes = {
        BeneficiaryTransfer: [
          { name: "beneficiary", type: "address" },
          { name: "holder", type: "address" },
          { name: "nominee", type: "address" },
          { name: "registry", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
        ],
      };
      const endorsement = {
        beneficiary: users.beneficiary.address,
        holder: users.holder.address,
        nominee: thirdParty.address,
        registry: signableRegistry.target as string,
        tokenId: signableTokenId,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        nonce: 0,
      };
      const sig = ethers.Signature.from(
        await users.holder.signTypedData(domain, beneficiaryTransferTypes, endorsement)
      );

      await signableEscrow.connect(users.holder).accept(boeRemark());
      expect(await signableEscrow.status()).to.equal(Status.Accepted);

      await signableEscrow.connect(users.beneficiary).transferBeneficiaryWithSig(endorsement, sig);
      expect(await signableEscrow.beneficiary()).to.equal(thirdParty.address);
      expect(await signableEscrow.status()).to.equal(Status.Accepted);

      await signableEscrow.connect(thirdParty).discharge(boeRemark());
      expect(await signableEscrow.status()).to.equal(Status.Discharged);
    });
  });
});
