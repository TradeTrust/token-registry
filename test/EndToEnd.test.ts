import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  TitleEscrowFactory,
  TDocDeployer,
  TradeTrustTokenStandard,
  TradeTrustToken,
  TitleEscrow,
} from "@tradetrust/contracts";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import {
  deployTDocDeployerFixture,
  deployTradeTrustTokenStandardFixture,
  deployEscrowFactoryFixture,
} from "./fixtures";
import {
  createDeployFixtureRunner,
  getTestUsers,
  hexToString,
  remarkString,
  TestUsers,
  toAccessControlRevertMessage,
  txnHexRemarks,
} from "./helpers";
import { encodeInitParams } from "../src/utils";
import { defaultAddress, roleHash } from "../src/constants";

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
  let beneficiary: SignerWithAddress;
  let holder: SignerWithAddress;
  let holder1: SignerWithAddress;
  let nominee: string;
  let nominee1: SignerWithAddress;
  let nominee2: SignerWithAddress;
  let tokenId: string;
  let registryAdmin: SignerWithAddress;
  let minter: SignerWithAddress;
  let restorer: SignerWithAddress;
  let accepter: SignerWithAddress;
  const exceededLengthRemark = ethers.utils.hexlify(ethers.utils.randomBytes(121));

  let deployFixturesRunner: () => Promise<[TradeTrustTokenStandard, TitleEscrowFactory, TDocDeployer]>;
  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    deployer = users.carrier;
    nominee = defaultAddress.Zero;
    [, , , , nominee1, nominee2, holder1] = users.others;
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
      });
      it("should add a new implementation with the correct title escrow factory", async () => {
        await expect(deployerContract.addImplementation(implRegistryContract.address, escrowFactoryContract.address))
          .to.emit(deployerContract, "AddImplementation")
          .withArgs(implRegistryContract.address, escrowFactoryContract.address);

        expect(await deployerContract.implementations(implRegistryContract.address)).to.equal(
          escrowFactoryContract.address
        );
      });

      it("should revert if the implementation is already added", async () => {
        await expect(
          deployerContract.addImplementation(implRegistryContract.address, escrowFactoryContract.address)
        ).to.be.revertedWithCustomError(deployerContract, "ImplementationAlreadyAdded");
      });

      it("should remove an existing implementation", async () => {
        await deployerContract.removeImplementation(implRegistryContract.address);
        expect(await deployerContract.implementations(implRegistryContract.address)).to.equal(
          ethers.constants.AddressZero
        );
      });

      it("should revert when removing a non-existent implementation", async () => {
        await expect(deployerContract.removeImplementation(implRegistryContract.address)).to.be.revertedWithCustomError(
          deployerContract,
          "InvalidImplementation"
        );
      });
    });
    describe("Deploying a Clone", () => {
      beforeEach(async () => {
        // Re-add the implementation for testing the deploy function
        [implRegistryContract, escrowFactoryContract, deployerContract] = await loadFixture(deployFixturesRunner);
        await deployerContract.addImplementation(implRegistryContract.address, escrowFactoryContract.address);
      });

      it("should deploy a clone and initialize correctly", async () => {
        const initParams = encodeInitParams({
          name: fakeTokenName,
          symbol: fakeTokenSymbol,
          deployer: registryAdmin.address,
        });
        const tx = await deployerContract.deploy(implRegistryContract.address, initParams);
        const receipt: any = await tx.wait();

        // Get the clone address from the emitted
        const deployedEvent = receipt.events.find((event: any) => event.event === "Deployment");
        cloneAddress = deployedEvent.args.deployed;

        // Verify that the clone was initialized with the correct parameters
        const cloneContract = await ethers.getContractAt("TradeTrustTokenStandard", cloneAddress);
        expect(await cloneContract.titleEscrowFactory()).to.equals(escrowFactoryContract.address);
        expect(await cloneContract.name()).to.equal(fakeTokenName);
        expect(await cloneContract.symbol()).to.equal(fakeTokenSymbol);

        expect(await cloneContract.hasRole(roleHash.DefaultAdmin, registryAdmin.address)).to.be.true;
      });

      it("should revert when deploying with an unsupported implementation", async () => {
        const unsupportedImplementation = ethers.Wallet.createRandom().address;
        const params = ethers.utils.formatBytes32String("Invalid Test Parameters");

        await expect(deployerContract.deploy(unsupportedImplementation, params)).to.be.revertedWithCustomError(
          deployerContract,
          "UnsupportedImplementationContractAddress"
        );
      });
      it("should revert when deploying with an invalid input params", async () => {
        const params = ethers.utils.formatBytes32String("Invalid Test Parameters");
        await expect(deployerContract.deploy(implRegistryContract.address, params)).to.be.revertedWithCustomError(
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

      const tx = await deployerContract.deploy(implRegistryContract.address, initParams);
      const receipt: any = await tx.wait();
      const deployedEvent = receipt.events.find((event: any) => event.event === "Deployment");
      cloneAddress = deployedEvent.args.deployed;
      tokenRegistry = (await ethers.getContractAt("TradeTrustToken", cloneAddress)) as TradeTrustToken;
      titleEscrow = (await ethers.getContractAt(
        "TitleEscrow",
        await escrowFactoryContract.getAddress(tokenRegistry.address, tokenId)
      )) as TitleEscrow;
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.MinterRole, minter.address);
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.RestorerRole, restorer.address);
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.AccepterRole, accepter.address);
    });
    describe("Minting", () => {
      it("should not allow mint when called by restorer", async () => {
        await expect(
          tokenRegistry.connect(restorer).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.revertedWith(toAccessControlRevertMessage(restorer.address, ethers.utils.id("MINTER_ROLE")));
      });
      it("should not allow mint when called by accepter", async () => {
        await expect(
          tokenRegistry.connect(accepter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.revertedWith(toAccessControlRevertMessage(accepter.address, ethers.utils.id("MINTER_ROLE")));
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
          .withArgs(beneficiary.address, holder.address, true, tokenRegistry.address, tokenId, txnHexRemarks.mintRemark)
          .and.to.emit(tokenRegistry, "Transfer")
          .withArgs(defaultAddress.Zero, titleEscrow.address, tokenId)
          .and.to.emit(escrowFactoryContract, "TitleEscrowCreated")
          .withArgs(titleEscrow.address, tokenRegistry.address, tokenId)
          .and.to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(defaultAddress.Zero, beneficiary.address, tokenRegistry.address, tokenId, "0x")
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(defaultAddress.Zero, holder.address, tokenRegistry.address, tokenId, "0x");
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.mintRemark);
        expect(hexToString(remark)).to.equal(remarkString.mintRemark);
      });
    });
    describe("After Minting", () => {
      it("should have the correct owner", async () => {
        const titleEscrowAddress: string = await escrowFactoryContract.getAddress(tokenRegistry.address, tokenId);
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(titleEscrowAddress);
      });
      it("should revert when trying to mint with an existing tokenId", async () => {
        await expect(
          tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.revertedWithCustomError(tokenRegistry, "TokenExists");
      });
      it("should not allow burn without surrendering.", async () => {
        await expect(
          tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TokenNotSurrendered");
      });
    });
    describe("Paused", () => {
      it("should not allow pause when called by non-admin", async () => {
        await expect(tokenRegistry.connect(minter).pause(txnHexRemarks.pauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(minter.address, roleHash.DefaultAdmin)
        );
        await expect(tokenRegistry.connect(accepter).pause(txnHexRemarks.pauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(accepter.address, roleHash.DefaultAdmin)
        );
        await expect(tokenRegistry.connect(restorer).pause(txnHexRemarks.pauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(restorer.address, roleHash.DefaultAdmin)
        );
      });
      it("should allow pause when called by registry admin", async () => {
        const tx = await tokenRegistry.connect(registryAdmin).pause(txnHexRemarks.pauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "PauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.pauseRemark);
        const receipt: any = await tx.wait();

        // Extract the event arguments from the receipt
        const pauseEvent = receipt.events.find((event: any) => event.event === "PauseWithRemark");
        const [, emittedRemark] = pauseEvent.args;
        // convert the hex string to utf8 and compare
        expect(hexToString(emittedRemark)).to.equal(remarkString.pauseRemark);
        expect(await tokenRegistry.paused()).to.be.true;
        expect(await tokenRegistry.remark()).to.equal(txnHexRemarks.pauseRemark);
      });
      it("should not allow minting when paused", async () => {
        await expect(
          tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId, txnHexRemarks.mintRemark)
        ).to.be.rejectedWith("Pausable: paused");
      });

      it("should not allow burning when paused", async () => {
        await expect(tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark)).to.be.rejectedWith(
          "Pausable: paused"
        );
      });

      it("should not allow restoring when paused", async () => {
        await expect(tokenRegistry.connect(restorer).restore(tokenId, txnHexRemarks.restorerRemark)).to.be.rejectedWith(
          "Pausable: paused"
        );
      });
      it("should not allow un-pause when called by non-admin", async () => {
        await expect(tokenRegistry.connect(minter).unpause(txnHexRemarks.unPauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(minter.address, roleHash.DefaultAdmin)
        );
        await expect(tokenRegistry.connect(accepter).unpause(txnHexRemarks.unPauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(accepter.address, roleHash.DefaultAdmin)
        );
        await expect(tokenRegistry.connect(restorer).unpause(txnHexRemarks.unPauseRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(restorer.address, roleHash.DefaultAdmin)
        );
      });
      it("should  allow un-pause when called by registry admin", async () => {
        const tx = await tokenRegistry.connect(registryAdmin).unpause(txnHexRemarks.unPauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "UnpauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.unPauseRemark);
        const receipt: any = await tx.wait();

        // Extract the event arguments from the receipt
        const unpauseEvent = receipt.events.find((event: any) => event.event === "UnpauseWithRemark");
        const [, emittedRemark] = unpauseEvent.args;
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
        await escrowFactoryContract.getAddress(tokenRegistry.address, tokenId)
      )) as TitleEscrow;
    });
    it("should initialize with correct values", async () => {
      expect(await titleEscrow.registry()).to.equal(tokenRegistry.address);
      expect(await titleEscrow.tokenId()).to.equal(tokenId);
      expect(await titleEscrow.beneficiary()).to.equal(beneficiary.address);
      expect(await titleEscrow.holder()).to.equal(holder.address);
      expect(await titleEscrow.nominee()).to.equal(ethers.constants.AddressZero);
      expect(await titleEscrow.active()).to.be.true;
    });
    describe("Transfer Beneficiary", () => {
      describe("When Holder and Beneficiary are different", () => {
        it("1: should allow Beneficiary to nominate ", async () => {
          await expect(titleEscrow.connect(beneficiary).nominate(nominee1.address, txnHexRemarks.nominateRemark))
            .to.emit(titleEscrow, "Nomination")
            .withArgs(nominee, nominee1.address, tokenRegistry.address, tokenId, txnHexRemarks.nominateRemark);
          expect(await titleEscrow.remark()).to.equal(txnHexRemarks.nominateRemark);
        });
        it("2: should allow holder to transfer beneficiary", async () => {
          const newBeneficiary = nominee1;
          await expect(
            titleEscrow
              .connect(holder)
              .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark)
          )
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(
              beneficiary.address,
              newBeneficiary.address,
              tokenRegistry.address,
              tokenId,
              txnHexRemarks.beneficiaryTransferRemark
            );
          expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
          const remark = await titleEscrow.remark();
          expect(remark).to.equal(txnHexRemarks.beneficiaryTransferRemark);
          expect(hexToString(remark)).to.equal(remarkString.beneficiaryTransferRemark);
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        //  eslint-disable-next-line no-undef
        before(async () => {
          // current beneficiary is nominee1
          // current holder is holder
          // transfer beneficiary to holder
          await titleEscrow.connect(nominee1).nominate(holder.address, txnHexRemarks.nominateRemark);
          await titleEscrow
            .connect(holder)
            .transferBeneficiary(holder.address, txnHexRemarks.beneficiaryTransferRemark);
        });
        it("should allow holder to transfer beneficiary", async () => {
          const newBeneficiary = nominee2;
          await expect(
            titleEscrow
              .connect(holder)
              .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark)
          )
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(
              holder.address,
              newBeneficiary.address,
              tokenRegistry.address,
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
          titleEscrow.connect(holder).transferHolder(ethers.constants.AddressZero, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });

      it("should allow transfer to the new holder", async () => {
        const newHolder = holder1;
        await expect(titleEscrow.connect(holder).transferHolder(newHolder.address, txnHexRemarks.holderTransferRemark))
          .to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            holder.address,
            newHolder.address,
            tokenRegistry.address,
            tokenId,
            txnHexRemarks.holderTransferRemark
          );
        expect(await titleEscrow.holder()).to.equal(newHolder.address);
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.holderTransferRemark);
        expect(hexToString(remark)).to.equal(remarkString.holderTransferRemark);
      });
    });
    describe("Transfer Owners", () => {
      let currHolder: SignerWithAddress;
      let newHolder: SignerWithAddress;
      let newBeneficiary: SignerWithAddress;
      //  eslint-disable-next-line no-undef
      before(async () => {
        currHolder = holder1;
        newHolder = holder;
        newBeneficiary = holder;
        const prevBeneficiary = nominee2;
        await titleEscrow.connect(prevBeneficiary).nominate(currHolder.address, txnHexRemarks.nominateRemark);
        await titleEscrow
          .connect(currHolder)
          .transferBeneficiary(currHolder.address, txnHexRemarks.beneficiaryTransferRemark);
      });
      it("should not allow beneficiary transfer to zero address", async () => {
        await expect(
          titleEscrow
            .connect(currHolder)
            .transferOwners(defaultAddress.Zero, newHolder.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
      it("should not allow holder transfer to zero address", async () => {
        await expect(
          titleEscrow
            .connect(currHolder)
            .transferOwners(newBeneficiary.address, defaultAddress.Zero, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });
      it("should allow transfer to same new holder and beneficiary", async () => {
        // new holder and new beneficiary are same
        await expect(
          titleEscrow
            .connect(currHolder)
            .transferOwners(newBeneficiary.address, newHolder.address, txnHexRemarks.transferOwnersRemark)
        )
          .to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(
            currHolder.address,
            newBeneficiary.address,
            tokenRegistry.address,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          )
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            currHolder.address,
            newHolder.address,
            tokenRegistry.address,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          );

        expect(await titleEscrow.holder()).to.equal(newHolder.address);
        expect(await titleEscrow.beneficiary()).to.equal(newBeneficiary.address);
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.transferOwnersRemark);
        expect(hexToString(remark)).to.equal(remarkString.transferOwnersRemark);
      });
      it("should allow transfer to different new holder and beneficiary", async () => {
        // new holder and new beneficiary are different
        await expect(
          titleEscrow
            .connect(newHolder)
            .transferOwners(nominee2.address, holder1.address, txnHexRemarks.transferOwnersRemark)
        )
          .to.emit(titleEscrow, "BeneficiaryTransfer")
          .withArgs(
            newHolder.address,
            nominee2.address,
            tokenRegistry.address,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          )
          .and.to.emit(titleEscrow, "HolderTransfer")
          .withArgs(
            newHolder.address,
            holder1.address,
            tokenRegistry.address,
            tokenId,
            txnHexRemarks.transferOwnersRemark
          );

        expect(await titleEscrow.beneficiary()).to.equal(nominee2.address);
        expect(await titleEscrow.holder()).to.equal(holder1.address);
      });
    });
    describe("Paused", () => {
      it("Paused: should emit correct event with args when paused", async () => {
        const tx = tokenRegistry.connect(registryAdmin).pause(txnHexRemarks.pauseRemark);

        await expect(tx)
          .to.emit(tokenRegistry, "PauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.pauseRemark);
      });

      it("should not allow nomination when paused", async () => {
        //  eslint-disable-next-line no-undef
        await expect(
          titleEscrow.connect(beneficiary).nominate(nominee1.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer beneficiary when paused", async () => {
        await expect(
          titleEscrow.connect(holder).transferBeneficiary(nominee1.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer holder when paused", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(nominee1.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });

      it("should not allow transfer owners when paused", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(nominee1.address, holder1.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("should not allow surrender when paused", async () => {
        await expect(
          titleEscrow.connect(holder).surrender(txnHexRemarks.surrenderRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "RegistryContractPaused");
      });
      it("UnPaused: should  emit correct event with args when unpaused", async () => {
        const tx = tokenRegistry.connect(registryAdmin).unpause(txnHexRemarks.unPauseRemark);
        await expect(tx)
          .to.emit(tokenRegistry, "UnpauseWithRemark")
          .withArgs(registryAdmin.address, txnHexRemarks.unPauseRemark);
      });
    });
    describe("Surrender", () => {
      describe("When Holder and Beneficiary are not same", () => {
        it("should revert surrender if caller is not beneficiary", async () => {
          await expect(
            titleEscrow.connect(holder1).surrender(txnHexRemarks.surrenderRemark)
          ).to.be.revertedWithCustomError(titleEscrow, "CallerNotBeneficiary");
        });
        // current beneficiary is nominee2
        it("should revert surrender if the caller is not holder", async () => {
          await expect(
            titleEscrow.connect(nominee2).surrender(txnHexRemarks.surrenderRemark)
          ).to.be.revertedWithCustomError(titleEscrow, "CallerNotHolder");
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        //  eslint-disable-next-line no-undef
        before(async () => {
          //  setting both holder and beneficiary to the same address
          const currBeneficiary = nominee2;
          const newBeneficiary = holder;
          await titleEscrow.connect(currBeneficiary).nominate(newBeneficiary.address, txnHexRemarks.nominateRemark);
          await titleEscrow
            .connect(holder1)
            .transferBeneficiary(newBeneficiary.address, txnHexRemarks.beneficiaryTransferRemark);
          await titleEscrow.connect(holder1).transferHolder(holder.address, txnHexRemarks.holderTransferRemark);
        });
        it("should allow surrendering if the contract holds the token", async () => {
          await expect(titleEscrow.connect(holder).surrender(txnHexRemarks.surrenderRemark))
            .to.emit(titleEscrow, "Surrender")
            .withArgs(holder.address, tokenRegistry.address, tokenId, txnHexRemarks.surrenderRemark);
          // token id owner to be token registry after surrender
          expect(await tokenRegistry.ownerOf(tokenId)).to.equal(tokenRegistry.address);
          const remark = await titleEscrow.remark();
          expect(remark).to.equal(txnHexRemarks.surrenderRemark);
          expect(hexToString(remark)).to.equal(remarkString.surrenderRemark);
        });
      });
    });
    describe("After Surrender", () => {
      it("should not allow nomination", async () => {
        await expect(
          titleEscrow.connect(holder).nominate(nominee1.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(holder).transferBeneficiary(nominee1.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(nominee1.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow transfer owners", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(nominee1.address, holder1.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
      it("should not allow surrender", async () => {
        await expect(
          titleEscrow.connect(holder).surrender(txnHexRemarks.surrenderRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "TitleEscrowNotHoldingToken");
      });
    });
    describe("Restore", () => {
      it("should not allow restore if the caller is holder", async () => {
        await expect(tokenRegistry.connect(holder).restore(tokenId, txnHexRemarks.restorerRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(holder.address, ethers.utils.id("RESTORER_ROLE"))
        );
      });
      it("should not allow restore if the caller is minter", async () => {
        await expect(tokenRegistry.connect(minter).restore(tokenId, txnHexRemarks.restorerRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(minter.address, ethers.utils.id("RESTORER_ROLE"))
        );
      });
      it("should not allow restore if the caller is accepter", async () => {
        await expect(tokenRegistry.connect(accepter).restore(tokenId, txnHexRemarks.restorerRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(accepter.address, ethers.utils.id("RESTORER_ROLE"))
        );
      });
      it("should allow restore after surrender", async () => {
        expect(tokenRegistry.connect(restorer).restore(tokenId, txnHexRemarks.restorerRemark)).to.emit(
          titleEscrow,
          "Restor"
        );
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(titleEscrow.address);
        const remark = await titleEscrow.remark();
        expect(remark).to.equal(txnHexRemarks.restorerRemark);
        expect(hexToString(remark)).to.equal(remarkString.restorerRemark);
      });
    });
    describe("After Restore", () => {
      // before surrender both holder and beneficiary were same i.e holder
      it("should have previous holder as the holder", async () => {
        expect(await titleEscrow.holder()).to.equal(holder.address);
      });
      it("should have previous beneficiary as the beneficiary", async () => {
        expect(await titleEscrow.beneficiary()).to.equal(holder.address);
      });
      it("owner should be set back to titleEscrow", async () => {
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(titleEscrow.address);
      });
    });
    describe("Burn", () => {
      //  eslint-disable-next-line no-undef
      before(async () => {
        // re-surrender as the token was restore in above test case
        await expect(titleEscrow.connect(holder).surrender(txnHexRemarks.surrenderRemark))
          .to.emit(titleEscrow, "Surrender")
          .withArgs(holder.address, tokenRegistry.address, tokenId, txnHexRemarks.surrenderRemark);
      });
      it("should not allow burn if the caller is minter", async () => {
        await expect(tokenRegistry.connect(minter).burn(tokenId, txnHexRemarks.burnRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(minter.address, ethers.utils.id("ACCEPTER_ROLE"))
        );
      });
      it("should not allow burn if the caller is restorer", async () => {
        await expect(tokenRegistry.connect(restorer).burn(tokenId, txnHexRemarks.burnRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(restorer.address, ethers.utils.id("ACCEPTER_ROLE"))
        );
      });
      it("should not allow burn if the caller is holder", async () => {
        await expect(tokenRegistry.connect(holder).burn(tokenId, txnHexRemarks.burnRemark)).to.be.revertedWith(
          toAccessControlRevertMessage(holder.address, ethers.utils.id("ACCEPTER_ROLE"))
        );
      });
      it("should allow burn/shred after surrender if called is acceptor", async () => {
        await expect(tokenRegistry.connect(accepter).burn(tokenId, txnHexRemarks.burnRemark))
          .to.emit(titleEscrow, "Shred")
          .withArgs(tokenRegistry.address, tokenId, txnHexRemarks.burnRemark);
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
          titleEscrow.connect(beneficiary).nominate(nominee1.address, txnHexRemarks.nominateRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(
          titleEscrow.connect(holder).transferBeneficiary(nominee1.address, txnHexRemarks.beneficiaryTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer holder", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(nominee1.address, txnHexRemarks.holderTransferRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow transfer owners", async () => {
        await expect(
          titleEscrow
            .connect(holder)
            .transferOwners(nominee1.address, holder1.address, txnHexRemarks.transferOwnersRemark)
        ).to.be.revertedWithCustomError(titleEscrow, "InactiveTitleEscrow");
      });
      it("should not allow surrender", async () => {
        await expect(
          titleEscrow.connect(holder).surrender(txnHexRemarks.surrenderRemark)
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
