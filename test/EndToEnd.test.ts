import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
// import { Contract } from "ethers";
import {
  TDocDeployer,
  TitleEscrow,
  TitleEscrowFactory,
  TradeTrustToken,
  TradeTrustTokenStandard,
} from "@tradetrust/contracts";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { defaultAddress, roleHash } from "../src/constants";
import { encodeInitParams } from "../src/utils";
import {
  deployEscrowFactoryFixture,
  deployTDocDeployerFixture,
  deployTradeTrustTokenStandardFixture,
} from "./fixtures";
import {
  createDeployFixtureRunner,
  getTestUsers,
  hexToString,
  remarkString,
  TestUsers,
  txnHexRemarks,
} from "./helpers";

describe("End to end", () => {
  let users: TestUsers;
  let deployer: SignerWithAddress;
  let deployerContract: TDocDeployer;
  let implRegistryContract: TradeTrustTokenStandard;
  let escrowFactoryContract: TitleEscrowFactory;
  let cloneAddress: string;
  let fakeTokenName: string;
  let fakeTokenSymbol: string;
  let tokenRegistry: TradeTrustToken;
  let titleEscrow: TitleEscrow;
  let tokenRegistryAddress: string;
  let implRegistryContractAddress: string;
  let escrowFactoryContractAddress: string;

  let prevBeneficiary: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let newBeneficiary: SignerWithAddress;

  let prevHolder: SignerWithAddress;
  let holder: SignerWithAddress;
  let newHolder: SignerWithAddress;

  let nominee: SignerWithAddress;

  let tokenId: string;
  let registryAdmin: SignerWithAddress;
  let minter: SignerWithAddress;
  let restorer: SignerWithAddress;
  let accepter: SignerWithAddress;

  let testNominee: SignerWithAddress;

  let testHolder1: SignerWithAddress;
  let testHolder2: SignerWithAddress;
  let testHolder3: SignerWithAddress;
  let testHolder4: SignerWithAddress;

  let testBeneficiary1: SignerWithAddress;
  let testBeneficiary2: SignerWithAddress;
  let testBeneficiary3: SignerWithAddress;

  const exceededLengthRemark = ethers.hexlify(ethers.randomBytes(121));

  let deployFixturesRunner: () => Promise<[TradeTrustTokenStandard, TitleEscrowFactory, TDocDeployer]>;
  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    deployer = users.carrier;
    [
      ,
      ,
      ,
      ,
      testHolder1,
      testHolder2,
      testHolder3,
      testHolder4,
      testBeneficiary1,
      testBeneficiary2,
      testBeneficiary3,
      testNominee,
    ] = users.others;
    tokenId = faker.datatype.hexaDecimal(64);
    fakeTokenName = "The Great Shipping Co.";
    fakeTokenSymbol = "GSC";
    beneficiary = users.beneficiary;
    holder = users.holder;
    [registryAdmin, minter, restorer, accepter] = users.others;

    // registryAdmin = users.others[faker.datatype.number(users.others.length - 1)];
    deployFixturesRunner = async () =>
      createDeployFixtureRunner(
        deployTradeTrustTokenStandardFixture({ deployer }),
        deployEscrowFactoryFixture({ deployer }),
        deployTDocDeployerFixture({ deployer })
      );
  });

  describe("tDoc deployer", () => {
    describe("Implementation Management", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        [implRegistryContract, escrowFactoryContract, deployerContract] = await loadFixture(deployFixturesRunner);
        implRegistryContractAddress = await implRegistryContract.getAddress();
        escrowFactoryContractAddress = escrowFactoryContract.target as string;
      });

      it("should add a new implementation with the correct title escrow factory", async () => {
        await expect(deployerContract.addImplementation(implRegistryContractAddress, escrowFactoryContractAddress))
          .to.emit(deployerContract, "AddImplementation")
          .withArgs(implRegistryContractAddress, escrowFactoryContractAddress);

        expect(await deployerContract.implementations(implRegistryContractAddress)).to.equal(
          escrowFactoryContractAddress
        );
      });

      it("should revert if the implementation is already added", async () => {
        await expect(
          deployerContract.addImplementation(implRegistryContractAddress, escrowFactoryContractAddress)
        ).to.be.revertedWithCustomError(deployerContract, "ImplementationAlreadyAdded");
      });

      it("should remove an existing implementation", async () => {
        await deployerContract.removeImplementation(implRegistryContractAddress);
        expect(await deployerContract.implementations(implRegistryContractAddress)).to.equal(ethers.ZeroAddress);
      });

      it("should revert when removing a non-existent implementation", async () => {
        await expect(deployerContract.removeImplementation(implRegistryContractAddress)).to.be.revertedWithCustomError(
          deployerContract,
          "InvalidImplementation"
        );
      });
    });
    describe("Deploying a Clone", () => {
      beforeEach(async () => {
        // Re-add the implementation for testing the deploy function
        [implRegistryContract, escrowFactoryContract, deployerContract] = await loadFixture(deployFixturesRunner);
        implRegistryContractAddress = await implRegistryContract.getAddress();
        escrowFactoryContractAddress = escrowFactoryContract.target as string;
        await deployerContract.addImplementation(implRegistryContractAddress, escrowFactoryContractAddress);
      });

      it("should deploy a clone and initialize correctly", async () => {
        const initParams = encodeInitParams({
          name: fakeTokenName,
          symbol: fakeTokenSymbol,
          deployer: registryAdmin.address,
        });
        await deployerContract.deploy(implRegistryContractAddress, initParams);
        const filter = deployerContract.filters.Deployment;
        const events = await deployerContract.queryFilter(filter, -1);
        const event = events[0];
        ({ deployed: cloneAddress } = event.args);

        // Verify that the clone was initialized with the correct parameters
        const cloneContract = await ethers.getContractAt("TradeTrustTokenStandard", cloneAddress);
        expect(await cloneContract.titleEscrowFactory()).to.equals(escrowFactoryContractAddress);
        expect(await cloneContract.name()).to.equal(fakeTokenName);
        expect(await cloneContract.symbol()).to.equal(fakeTokenSymbol);

        expect(await cloneContract.hasRole(roleHash.DefaultAdmin, registryAdmin.address)).to.be.true;
      });

      it("should revert when deploying with an unsupported implementation", async () => {
        const unsupportedImplementation = ethers.Wallet.createRandom().address;
        const params = ethers.encodeBytes32String("Invalid Test Parameters");

        await expect(deployerContract.deploy(unsupportedImplementation, params)).to.be.revertedWithCustomError(
          deployerContract,
          "UnsupportedImplementationContractAddress"
        );
      });
      it("should revert when deploying with an invalid input params", async () => {
        const params = ethers.encodeBytes32String("Invalid Test Parameters");
        await expect(deployerContract.deploy(implRegistryContractAddress, params)).to.be.revertedWithCustomError(
          deployerContract,
          "ImplementationInitializationFailure"
        );
      });
    });
  });

  describe("TradeTrustToken", () => {
    // eslint-disable-next-line no-undef
    before(async () => {
      const initParams = encodeInitParams({
        name: fakeTokenName,
        symbol: fakeTokenSymbol,
        deployer: registryAdmin.address,
      });

      await deployerContract.deploy(implRegistryContractAddress, initParams);
      const filter = deployerContract.filters.Deployment;
      const events = await deployerContract.queryFilter(filter, -1);
      cloneAddress = events[0].args.deployed;
      tokenRegistry = (await ethers.getContractAt("TradeTrustToken", cloneAddress)) as unknown as TradeTrustToken;
      tokenRegistryAddress = await tokenRegistry.getAddress();
      titleEscrow = (await ethers.getContractAt(
        "TitleEscrow",
        await escrowFactoryContract.getEscrowAddress(tokenRegistryAddress, tokenId)
      )) as unknown as TitleEscrow;
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.MinterRole, minter.address);
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.RestorerRole, restorer.address);
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.AccepterRole, accepter.address);
    });
    describe("Minting", () => {
      it("should not allow mint when called by restorer", async () => {
        await expect(
          tokenRegistry.connect(restorer).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        )
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(restorer.address, ethers.id("MINTER_ROLE"));
      });
      it("should not allow mint when called by accepter", async () => {
        await expect(
          tokenRegistry.connect(accepter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        )
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(accepter.address, ethers.id("MINTER_ROLE"));
      });
      it("should not allow mint if remark length is greater than 120 character", async () => {
        await expect(
          tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId, exceededLengthRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "RemarkLengthExceeded");
      });
      it("should mint a token Id if called by minter", async () => {
        const tx = await tokenRegistry
          .connect(minter)
          .mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark);
        await expect(tx)
          .to.emit(titleEscrow, "TokenReceived")
          .withArgs(beneficiary.address, holder.address, true, tokenRegistryAddress, tokenId, txnHexRemarks.mintRemark)
          .and.to.emit(tokenRegistry, "Transfer")
          .withArgs(defaultAddress.Zero, await titleEscrow.getAddress(), tokenId)
          .and.to.emit(escrowFactoryContract, "TitleEscrowCreated")
          .withArgs(await titleEscrow.getAddress(), tokenRegistryAddress, tokenId)
          .and.to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(defaultAddress.Zero, beneficiary.address, tokenRegistryAddress, tokenId, "0x")
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(defaultAddress.Zero, holder.address, tokenRegistryAddress, tokenId, "0x");
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.mintRemark);
        expect(hexToString(remark)).to.equal(remarkString.mintRemark);
      });
    });
    describe("After Minting", () => {
      it("should have the correct owner", async () => {
        const titleEscrowAddress: string = await escrowFactoryContract.getEscrowAddress(tokenRegistryAddress, tokenId);
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(titleEscrowAddress);
      });
      it("should revert when trying to mint with an existing tokenId", async () => {
        await expect(
          tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "TokenExists");
      });
      it("should not allow burn without returning to issuer.", async () => {
        await expect(
          tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TokenNotReturnedToIssuer");
      });
      it("should revert when trying rejectTranferBeneficiary", async () => {
        await expect(
          titleEscrow.connect(beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
      it("should revert when trying rejectTranferHolder", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
    });
    describe("Paused", () => {
      it("should not allow pause when called by non-admin", async () => {
        await expect(tokenRegistry.connect(minter).pause(txnHexRemarks.pauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(minter.address, roleHash.DefaultAdmin);
        await expect(tokenRegistry.connect(accepter).pause(txnHexRemarks.pauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(accepter.address, roleHash.DefaultAdmin);
        await expect(tokenRegistry.connect(restorer).pause(txnHexRemarks.pauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(restorer.address, roleHash.DefaultAdmin);
      });
      it("should allow pause when called by registry admin", async () => {
        const tx = await tokenRegistry.connect(registryAdmin).pause(txnHexRemarks.pauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "PauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.pauseRemark);
        // const receipt: any = await tx.wait();

        // Extract the event arguments from the receipt
        const filter = tokenRegistry.filters.PauseWithRemark;
        const events = await tokenRegistry.queryFilter(filter, -1);
        const event = events[0];
        const [, emittedRemark] = event.args;

        // convert the hex string to utf8 and compare
        expect(hexToString(emittedRemark)).to.equal(remarkString.pauseRemark);
        expect(await tokenRegistry.paused()).to.be.true;
        expect(await tokenRegistry.remark()).to.equal(txnHexRemarks.pauseRemark);
      });
      it("should not allow minting when paused", async () => {
        await expect(
          tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "EnforcedPause");
      });

      it("should not allow burning when paused", async () => {
        await expect(
          tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "EnforcedPause");
      });

      it("should not allow restoring when paused", async () => {
        await expect(
          tokenRegistry.connect(restorer).restore(tokenId, txnHexRemarks.restorerRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "EnforcedPause");
      });
      it("should not allow un-pause when called by non-admin", async () => {
        await expect(tokenRegistry.connect(minter).unpause(txnHexRemarks.unPauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(minter.address, roleHash.DefaultAdmin);
        await expect(tokenRegistry.connect(accepter).unpause(txnHexRemarks.unPauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(accepter.address, roleHash.DefaultAdmin);

        await expect(tokenRegistry.connect(restorer).unpause(txnHexRemarks.unPauseRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(restorer.address, roleHash.DefaultAdmin);
      });
      it("should  allow un-pause when called by registry admin", async () => {
        const tx = await tokenRegistry.connect(registryAdmin).unpause(txnHexRemarks.unPauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "UnpauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.unPauseRemark);

        // Extract the event arguments from the receipt
        const filter = tokenRegistry.filters.UnpauseWithRemark;
        const events = await tokenRegistry.queryFilter(filter, -1);
        const event = events[0];
        const [, emittedRemark] = event.args;

        // convert the hex string to utf8 and compare
        expect(hexToString(emittedRemark)).to.equal(remarkString.unPauseRemark);
        expect(await tokenRegistry.paused()).to.be.false;
        expect(await tokenRegistry.remark()).to.equal(txnHexRemarks.unPauseRemark);
      });
    });
  });

  describe("Title Escrow", () => {
    //  eslint-disable-next-line no-undef
    before(async () => {
      titleEscrow = (await ethers.getContractAt(
        "TitleEscrow",
        await escrowFactoryContract.getEscrowAddress(tokenRegistryAddress, tokenId)
      )) as unknown as TitleEscrow;
    });
    it("should initialize with correct values", async () => {
      expect(await titleEscrow.registry()).to.equal(tokenRegistryAddress);
      expect(await titleEscrow.tokenId()).to.equal(tokenId);
      expect(await titleEscrow.beneficiary()).to.equal(beneficiary.address);
      expect(await titleEscrow.holder()).to.equal(holder.address);
      expect(await titleEscrow.nominee()).to.equal(ethers.ZeroAddress);
      expect(await titleEscrow.active()).to.be.true;
      expect(await titleEscrow.prevBeneficiary()).to.equal(defaultAddress.Zero);
      expect(await titleEscrow.prevHolder()).to.equal(defaultAddress.Zero);
    });
    describe("Transfer Beneficiary", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        nominee = testNominee;
      });
      describe("When Holder and Beneficiary are different", () => {
        it("1: should allow Beneficiary to nominate ", async () => {
          await expect(titleEscrow.connect(beneficiary).nominate(nominee.address, txnHexRemarks.nominateRemark))
            .to.emit(titleEscrow, "Nomination")
            .withArgs(
              defaultAddress.Zero,
              nominee.address,
              tokenRegistryAddress,
              tokenId,
              txnHexRemarks.nominateRemark
            );
          expect(await titleEscrow.remark()).to.equal(txnHexRemarks.nominateRemark);
        });
        it("2: should allow holder to transfer beneficiary", async () => {
          newBeneficiary = nominee;
          prevBeneficiary = beneficiary;
          await expect(
            titleEscrow.connect(holder).transferBeneficiary(nominee.address, txnHexRemarks.beneficiaryTransferRemark)
          )
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(
              beneficiary.address,
              nominee.address,
              tokenRegistryAddress,
              tokenId,
              txnHexRemarks.beneficiaryTransferRemark
            );
          expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
          expect(await titleEscrow.prevBeneficiary()).to.equal(prevBeneficiary.address);
          const remark = await titleEscrow.remark();
          expect(remark).to.equal(txnHexRemarks.beneficiaryTransferRemark);
          expect(hexToString(remark)).to.equal(remarkString.beneficiaryTransferRemark);
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        // eslint-disable-next-line no-undef
        before(async () => {
          // current beneficiary is nominee1
          // current holder is holder
          // transfer beneficiary to holder
          prevBeneficiary = beneficiary;
          beneficiary = nominee;
          newBeneficiary = testBeneficiary1;

          // transaction to make beneficiary and holder same
          await titleEscrow.connect(beneficiary).nominate(holder.address, txnHexRemarks.nominateRemark);
          await titleEscrow
            .connect(holder)
            .transferBeneficiary(holder.address, txnHexRemarks.beneficiaryTransferRemark);
          beneficiary = holder;
        });
        it("should allow holder to transfer beneficiary", async () => {
          await expect(
            titleEscrow
              .connect(holder)
              .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark)
          )
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(
              beneficiary.address,
              newBeneficiary.address,
              tokenRegistryAddress,
              tokenId,
              txnHexRemarks.beneficiaryTransferRemark
            );

          expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
          expect(await titleEscrow.remark()).to.equal(txnHexRemarks.beneficiaryTransferRemark);
        });
      });
    });
    describe("Transfer Holder", () => {
      it("should not allow  transfer to itself", async () => {
        expect(
          titleEscrow.connect(holder).transferHolder(holder.address, txnHexRemarks.holderTransferRemark)
        ).to.be.be.revertedWithCustomError(titleEscrow, "RecipientAlreadyHolder");
      });

      it("should not allow transfer to zero address", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(ethers.ZeroAddress, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });

      it("should allow transfer to the new holder", async () => {
        newHolder = testHolder1;
        await expect(titleEscrow.connect(holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark))
          .to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            holder.address,
            newHolder.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.holderTransferRemark
          );
        expect(await titleEscrow.holder()).to.equal(newHolder.address);
        expect(await titleEscrow.prevHolder()).to.equal(holder.address);
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.holderTransferRemark);
        expect(hexToString(remark)).to.equal(remarkString.holderTransferRemark);
      });
    });
    describe("Transfer Owners", () => {
      //  eslint-disable-next-line no-undef
      before(async () => {
        holder = newHolder;
        newHolder = testHolder2;
        beneficiary = newBeneficiary;
        newBeneficiary = newHolder;
        await titleEscrow.connect(beneficiary).nominate(holder.address, txnHexRemarks.nominateRemark);
        await titleEscrow.connect(holder).transferBeneficiary(holder.address, txnHexRemarks.beneficiaryTransferRemark);
        prevBeneficiary = beneficiary;
        beneficiary = holder;
      });
      it("should not allow beneficiary transfer to zero address", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(defaultAddress.Zero, newHolder.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
      it("should not allow holder transfer to zero address", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(newBeneficiary.address, defaultAddress.Zero, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
      it("should allow transfer to same new holder and beneficiary", async () => {
        // new holder and new beneficiary are same
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark)
        )
          .to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(
            holder.address,
            newBeneficiary.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          )
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            holder.address,
            newHolder.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          );

        expect(await titleEscrow.holder()).to.equal(newHolder.address);
        expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
        expect(await titleEscrow.prevHolder()).to.equal(holder.address);
        expect(await titleEscrow.prevBeneficiary()).to.equal(holder.address);
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.transferOwnersRemark);
        expect(hexToString(remark)).to.equal(remarkString.transferOwnersRemark);
      });
      it("should allow transfer to different new holder and beneficiary", async () => {
        prevHolder = holder;
        holder = newHolder;
        newHolder = testHolder3;
        prevBeneficiary = holder;
        beneficiary = newBeneficiary;
        newBeneficiary = testBeneficiary2;
        // new holder and new beneficiary are different
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark)
        )
          .to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(
            beneficiary.address,
            newBeneficiary.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          )
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            holder.address,
            newHolder.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          );

        expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
        expect(await titleEscrow.holder()).to.equal(newHolder.address);
        expect(await titleEscrow.prevHolder()).to.equal(holder.address);
        expect(await titleEscrow.prevBeneficiary()).to.equal(beneficiary.address);
      });
    });
    describe("Reject Transfer Beneficiary", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        prevBeneficiary = beneficiary;
        beneficiary = newBeneficiary;
      });
      it("should not allow reject transfer beneficiary if the caller is not beneficiary", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "CallerNotBeneficiary");
      });
      it("should allow beneficiary to reject transfer beneficiary", async () => {
        await expect(titleEscrow.connect(beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark))
          .to.emit(titleEscrow, "RejectTransferBeneficiary")
          .withArgs(
            beneficiary.address,
            prevBeneficiary.address,
            await tokenRegistry.getAddress(),
            tokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await titleEscrow.beneficiary()).to.equal(prevBeneficiary.address);
        expect(await titleEscrow.prevBeneficiary()).to.equal(defaultAddress.Zero);
        expect(await titleEscrow.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
      });
    });
    describe("Reject Transfer Holder", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        prevHolder = holder;
        holder = newHolder;
      });
      it("should not allow reject transfer holder if the caller is not holder", async () => {
        await expect(
          titleEscrow.connect(beneficiary).rejectTransferHolder(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "CallerNotHolder");
      });
      it("should allow holder to reject transfer holder", async () => {
        await expect(titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark))
          .to.emit(titleEscrow, "RejectTransferHolder")
          .withArgs(
            holder.address,
            prevHolder.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await titleEscrow.holder()).to.equal(prevHolder.address);
        expect(await titleEscrow.prevHolder()).to.equal(defaultAddress.Zero);
        expect(await titleEscrow.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
      });
    });

    describe("Reject Transfer Owners", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        holder = prevHolder;
        beneficiary = prevBeneficiary;
        newHolder = testHolder3;
        newBeneficiary = newHolder; // transfer to same holder and beneficiary
        await titleEscrow
          .connect(holder)
          .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark);
        prevBeneficiary = beneficiary;
        beneficiary = newBeneficiary;
        prevHolder = holder;
        holder = newHolder;
      });

      it("should not allow reject transfer owners if the caller is not holder", async () => {
        await expect(
          titleEscrow.connect(prevHolder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "CallerNotBeneficiary");
      });
      it("should not allow holder to reject only holder transfer", async () => {
        const tx = titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrow, "DualRoleRejectionRequired");
      });
      it("should not allow beneficiary to reject only beneficiary transfer", async () => {
        const tx = titleEscrow.connect(holder).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark);

        await expect(tx).to.be.revertedWithCustomError(titleEscrow, "DualRoleRejectionRequired");
      });
      it("should allow holder to reject transfer owners", async () => {
        await expect(titleEscrow.connect(holder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark))
          .to.emit(titleEscrow, "RejectTransferOwners")
          .withArgs(
            beneficiary.address,
            prevBeneficiary.address,
            holder.address,
            prevHolder.address,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.rejectTransferRemark
          );
        expect(await titleEscrow.holder()).to.equal(prevHolder.address);
        expect(await titleEscrow.beneficiary()).to.equal(prevBeneficiary.address);
        expect(await titleEscrow.prevHolder()).to.equal(defaultAddress.Zero);
        expect(await titleEscrow.prevBeneficiary()).to.equal(defaultAddress.Zero);
        expect(await titleEscrow.remark()).to.equal(txnHexRemarks.rejectTransferRemark);
      });
    });

    describe("Paused", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        newBeneficiary = testBeneficiary3;
        newHolder = testHolder4;
      });
      it("Paused: should emit correct event with args when paused", async () => {
        const tx = tokenRegistry.connect(registryAdmin).pause(txnHexRemarks.pauseRemark);

        await expect(tx)
          .to.emit(tokenRegistry, "PauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.pauseRemark);
      });

      it("should not allow nomination when paused", async () => {
        //  eslint-disable-next-line no-undef
        await expect(
          titleEscrow.connect(beneficiary).nominate(newBeneficiary.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer beneficiary when paused", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer holder when paused", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer owners when paused", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("should not allow returnToIssuer when paused", async () => {
        await expect(
          titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("should not allow reject transfer beneficiary when paused", async () => {
        await expect(
          titleEscrow.connect(beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("should not allow reject transfer holder when paused", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("should not allow reject owner transfer when paused", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("UnPaused: should  emit correct event with args when unpaused", async () => {
        const tx = tokenRegistry.connect(registryAdmin).unpause(txnHexRemarks.unPauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "UnpauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.unPauseRemark);
      });
    });
    describe("ReturnToIssuer", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        holder = prevHolder;
        beneficiary = prevBeneficiary;
        await titleEscrow.connect(holder).transferHolder(testHolder4.address, txnHexRemarks.holderTransferRemark);
        holder = testHolder4;
      });
      describe("When Holder and Beneficiary are not same", () => {
        it("should revert returnToIssuer if caller is not beneficiary", async () => {
          await expect(
            titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
          ).to.be.revertedWithCustomError(titleEscrow, "CallerNotBeneficiary");
        });
        // current beneficiary is nominee2
        it("should revert returnToIssuer if the caller is not holder", async () => {
          await expect(
            titleEscrow.connect(beneficiary).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
          ).to.be.revertedWithCustomError(titleEscrow, "CallerNotHolder");
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        //  eslint-disable-next-line no-undef
        before(async () => {
          //  setting both holder and beneficiary to the same address
          await titleEscrow
            .connect(holder)
            .transferHolder(beneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          holder = beneficiary;
        });
        it("should allow returning to issuer if the contract holds the token", async () => {
          await expect(titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark))
            .to.emit(titleEscrow, "ReturnToIssuer")
            .withArgs(holder.address, tokenRegistryAddress, tokenId, txnHexRemarks.returnToIssuerRemark);
          // token id owner to be token registry after returnToIssuer
          expect(await tokenRegistry.ownerOf(tokenId)).to.equal(tokenRegistryAddress);
          expect(await titleEscrow.prevHolder()).to.equal(defaultAddress.Zero);
          expect(await titleEscrow.prevBeneficiary()).to.equal(defaultAddress.Zero);
          const remark = await titleEscrow.remark();
          expect(remark).to.equal(txnHexRemarks.returnToIssuerRemark);
          expect(hexToString(remark)).to.equal(remarkString.returnToIssuerRemark);
        });
      });
    });
    describe("After ReturnToIssuer", () => {
      it("should not allow nomination", async () => {
        await expect(
          titleEscrow.connect(holder).nominate(nominee.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(holder).transferBeneficiary(nominee.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(testHolder4.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer owners", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(nominee.address, testHolder4.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow returnToIssuer", async () => {
        await expect(
          titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow reject transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow reject transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow reject owner transfer", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
    });
    describe("Restore", () => {
      it("should not allow restore if the caller is holder", async () => {
        await expect(tokenRegistry.connect(holder).restore(tokenId, txnHexRemarks.restorerRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(holder.address, ethers.id("RESTORER_ROLE"));
      });
      it("should not allow restore if the caller is minter", async () => {
        await expect(tokenRegistry.connect(minter).restore(tokenId, txnHexRemarks.restorerRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(minter.address, ethers.id("RESTORER_ROLE"));
      });
      it("should not allow restore if the caller is accepter", async () => {
        await expect(tokenRegistry.connect(accepter).restore(tokenId, txnHexRemarks.restorerRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(accepter.address, ethers.id("RESTORER_ROLE"));
      });
      it("should allow restore after returnToIssuer", async () => {
        await expect(tokenRegistry.connect(restorer).restore(tokenId, txnHexRemarks.restorerRemark))
          .to.emit(titleEscrow, "TokenReceived")
          .withArgs(
            beneficiary.address,
            holder.address,
            false,
            tokenRegistryAddress,
            tokenId,
            txnHexRemarks.restorerRemark
          );
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(await titleEscrow.getAddress());
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.restorerRemark);
        expect(hexToString(remark)).to.equal(remarkString.restorerRemark);
      });
    });
    describe("After Restore", () => {
      // before returnToIssuer both holder and beneficiary were same i.e holder
      it("should have previous holder as the holder", async () => {
        expect(await titleEscrow.holder()).to.equal(holder.address);
      });
      it("should have previous beneficiary as the beneficiary", async () => {
        expect(await titleEscrow.beneficiary()).to.equal(holder.address);
      });
      it("owner should be set back to titleEscrow", async () => {
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(await titleEscrow.getAddress());
      });
      it("should have zero address as prevBeneficiary and prevHolder", async () => {
        expect(await titleEscrow.prevBeneficiary()).to.equal(defaultAddress.Zero);
        expect(await titleEscrow.prevHolder()).to.equal(defaultAddress.Zero);
      });
    });
    describe("Burn", () => {
      //  eslint-disable-next-line no-undef
      before(async () => {
        // re-returnToIssuer as the token was restore in above test case
        await expect(titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark))
          .to.emit(titleEscrow, "ReturnToIssuer")
          .withArgs(holder.address, tokenRegistryAddress, tokenId, txnHexRemarks.returnToIssuerRemark);
      });
      it("should not allow burn if the caller is minter", async () => {
        await expect(tokenRegistry.connect(minter).burn(tokenId, txnHexRemarks.burnRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(minter.address, ethers.id("ACCEPTER_ROLE"));
      });
      it("should not allow burn if the caller is restorer", async () => {
        await expect(tokenRegistry.connect(restorer).burn(tokenId, txnHexRemarks.burnRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(restorer.address, ethers.id("ACCEPTER_ROLE"));
      });
      it("should not allow burn if the caller is holder", async () => {
        await expect(tokenRegistry.connect(holder).burn(tokenId, txnHexRemarks.burnRemark))
          .to.be.revertedWithCustomError(tokenRegistry, "AccessControlUnauthorizedAccount")
          .withArgs(holder.address, ethers.id("ACCEPTER_ROLE"));
      });
      it("should allow burn/shred after returnToIssuer if called is acceptor", async () => {
        await expect(tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark))
          .to.emit(titleEscrow, "Shred")
          .withArgs(tokenRegistryAddress, tokenId, txnHexRemarks.burnRemark);
        expect(await titleEscrow.active()).to.be.false;
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.burnRemark);
        expect(hexToString(remark)).to.equal(remarkString.burnRemark);
      });
    });
    describe("After Burn", () => {
      it("beneficiary address should be zero", async () => {
        expect(await titleEscrow.beneficiary()).to.equal(defaultAddress.Zero);
      });
      it("holder address should be zero", async () => {
        expect(await titleEscrow.active()).to.be.false;
      });
      it("burn address should be new owner of token", async () => {
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(defaultAddress.Burn);
      });
      it("should not allow nomination", async () => {
        await expect(
          titleEscrow.connect(beneficiary).nominate(nominee.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(holder).transferBeneficiary(nominee.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(testHolder4.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer owners", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(nominee.address, testHolder4.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow reject transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(beneficiary).rejectTransferBeneficiary(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow reject transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferHolder(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow reject owner transfer", async () => {
        await expect(
          titleEscrow.connect(holder).rejectTransferOwners(txnHexRemarks.rejectTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow returnToIssuer", async () => {
        await expect(
          titleEscrow.connect(holder).returnToIssuer(txnHexRemarks.returnToIssuerRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow burn", async () => {
        await expect(
          tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
    });
  });
});
