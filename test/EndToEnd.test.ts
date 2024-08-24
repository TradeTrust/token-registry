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
import { createDeployFixtureRunner, getTestUsers, TestUsers, toAccessControlRevertMessage } from "./helpers";
import { encodeInitParams } from "../src/utils";
import { defaultAddress, roleHash } from "../src/constants";

describe("End to end", async () => {
  let users: TestUsers;
  let deployer: SignerWithAddress;
  let deployerContract: TDocDeployer;
  let implRegistryContract: TradeTrustTokenStandard;
  let escrowFactoryContract: TitleEscrowFactory;
  let cloneAddress: string;
  let fakeTokenName: string;
  let fakeTokenSymbol: string;
  let tokenRegistry: TradeTrustToken;
  let beneficiary: SignerWithAddress;
  let holder: SignerWithAddress;
  let tokenId: string;
  let registryAdmin: SignerWithAddress;
  let minter: SignerWithAddress;
  let restorer: SignerWithAddress;
  let accepter: SignerWithAddress;
  let deployFixturesRunner: () => Promise<[TradeTrustTokenStandard, TitleEscrowFactory, TDocDeployer]>;
  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
    deployer = users.carrier;
    deployFixturesRunner = async () =>
      createDeployFixtureRunner(
        deployTradeTrustTokenStandardFixture({ deployer }),
        deployEscrowFactoryFixture({ deployer }),
        deployTDocDeployerFixture({ deployer })
      );
  });

  describe("tDoc deployer", async () => {
    describe("Implementation Management", () => {
      // eslint-disable-next-line no-undef
      before(async () => {
        // fakeTitleEscrowFactory = ethers.utils.getAddress(faker.finance.ethereumAddress());
        [implRegistryContract, escrowFactoryContract, deployerContract] = await loadFixture(deployFixturesRunner);
        console.log("this 1", implRegistryContract.address);
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
        fakeTokenName = "The Great Shipping Co.";
        fakeTokenSymbol = "GSC";
        registryAdmin = users.others[faker.datatype.number(users.others.length - 1)];
        // Re-add the implementation for testing the deploy function
        [implRegistryContract, escrowFactoryContract, deployerContract] = await loadFixture(deployFixturesRunner);
        await deployerContract.addImplementation(implRegistryContract.address, escrowFactoryContract.address);
      });

      it("should deploy a clone and initialize it correctly", async () => {
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
      tokenId = faker.datatype.hexaDecimal(64);
      fakeTokenName = "The Great Shipping Co.";
      fakeTokenSymbol = "GSC";
      beneficiary = users.beneficiary;
      holder = users.holder;
      registryAdmin = users.others[users.others.length - 1];
      minter = registryAdmin;
      restorer = users.others[users.others.length - 5];
      accepter = users.others[users.others.length - 6];
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
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.RestorerRole, restorer.address);
      await tokenRegistry.connect(registryAdmin).grantRole(roleHash.AccepterRole, accepter.address);
    });
    describe("Minting", async () => {
      it("should mint a token Id", async () => {
        const escrowAddress = escrowFactoryContract.getAddress(tokenRegistry.address, tokenId);
        expect(tokenRegistry.connect(minter).mint(beneficiary.address, holder.address, tokenId))
          .to.emit(tokenRegistry, "Transfer")
          .withArgs(defaultAddress.Zero, escrowAddress, tokenId);
      });
      it("should revert when trying to mint with an existing tokenId", async () => {
        await expect(
          tokenRegistry.connect(registryAdmin).mint(beneficiary.address, holder.address, tokenId)
        ).to.be.revertedWithCustomError(tokenRegistry, "TokenExists");
      });
      it("should revert when called by an address without the MINTER_ROLE", async () => {
        await expect(
          tokenRegistry.connect(beneficiary).mint(beneficiary.address, holder.address, tokenId)
        ).to.be.revertedWith(toAccessControlRevertMessage(beneficiary.address, ethers.utils.id("MINTER_ROLE")));
      });
      it("should revert when called by an address without the MINTER_ROLE", async () => {
        const titleEscrow = (await ethers.getContractAt(
          "TitleEscrow",
          await escrowFactoryContract.getAddress(tokenRegistry.address, tokenId)
        )) as TitleEscrow;
        await expect(tokenRegistry.connect(accepter).burn(tokenId)).to.be.revertedWithCustomError(
          titleEscrow,
          "TokenNotSurrendered"
        );
      });
    });
  });
  describe("Title Escrow", async () => {
    let titleEscrow: TitleEscrow;
    let nominee: string;
    let nominee1: SignerWithAddress;
    let nominee2: SignerWithAddress;
    let holder1: SignerWithAddress;
    //  eslint-disable-next-line no-undef
    before(async () => {
      nominee = defaultAddress.Zero;
      nominee1 = users.others[users.others.length - 2];
      nominee2 = users.others[users.others.length - 3];
      holder1 = users.others[users.others.length - 4];
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
          expect(titleEscrow.connect(beneficiary).nominate(nominee1.address))
            .to.emit(titleEscrow, "Nomination")
            .withArgs(nominee, nominee1, tokenRegistry, tokenId);
        });
        it("2: should allow holder to transfer beneficiary", async () => {
          const newBeneficiary = nominee1;
          expect(titleEscrow.connect(holder).transferBeneficiary(nominee1.address))
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(beneficiary, newBeneficiary, tokenRegistry, tokenId);
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        //  eslint-disable-next-line no-undef
        before(async () => {
          await titleEscrow.connect(nominee1).nominate(holder.address);
          await titleEscrow.connect(holder).transferBeneficiary(holder.address);
        });
        it("should allow holder to transfer beneficiary", async () => {
          const newBeneficiary = nominee2;
          expect(titleEscrow.connect(holder).transferBeneficiary(newBeneficiary.address))
            .to.emit(titleEscrow, "BeneficiaryTransfer")
            .withArgs(nominee1, newBeneficiary, tokenRegistry, tokenId);
        });
      });
    });
    describe("Transfer Holder", () => {
      it("should not allow  transfer to itself", async () => {
        expect(titleEscrow.connect(holder).transferHolder(holder.address)).to.be.be.revertedWithCustomError(
          titleEscrow,
          "RecipientAlreadyHolder"
        );
      });

      it("should not allow transfer to zero address", async () => {
        await expect(
          titleEscrow.connect(holder).transferHolder(ethers.constants.AddressZero)
        ).to.be.revertedWithCustomError(titleEscrow, "InvalidTransferToZeroAddress");
      });

      it("should allow transfer the new holder", async () => {
        const newHolder = holder1;
        expect(titleEscrow.connect(holder).transferHolder(newHolder.address))
          .to.emit(titleEscrow, "HolderTransfer")
          .withArgs(holder.address, newHolder.address);
        expect(await titleEscrow.holder()).to.equal(newHolder.address);
      });
    });
    describe("Surrender", () => {
      describe("When Holder and Beneficiary are not same", () => {
        it("should revert surrender if caller is not beneficiary", async () => {
          await expect(titleEscrow.connect(holder1).surrender()).to.be.revertedWithCustomError(
            titleEscrow,
            "CallerNotBeneficiary"
          );
        });
        // current beneficiary is nominee2
        it("should revert surrender if the caller is not holder", async () => {
          await expect(titleEscrow.connect(nominee2).surrender()).to.be.revertedWithCustomError(
            titleEscrow,
            "CallerNotHolder"
          );
        });
      });
      describe("When Holder and Beneficiary are same", () => {
        //  eslint-disable-next-line no-undef
        before(async () => {
          //  setting both holder and beneficiary to the same address
          const currBeneficiary = nominee2;
          const newBeneficiary = holder;
          await titleEscrow.connect(currBeneficiary).nominate(newBeneficiary.address);
          await titleEscrow.connect(holder1).transferBeneficiary(newBeneficiary.address);
          await titleEscrow.connect(holder1).transferHolder(holder.address);
        });
        it("should allow surrendering if the contract holds the token", async () => {
          expect(titleEscrow.connect(holder).surrender()).to.emit(titleEscrow, "Surrender");
        });
      });
    });
    describe("After Surrender", () => {
      it("owner of token should be token registry", async () => {
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(tokenRegistry.address);
      });
      it("should not allow nomination", async () => {
        await expect(titleEscrow.connect(holder).nominate(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "TitleEscrowNotHoldingToken"
        );
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(titleEscrow.connect(holder).transferBeneficiary(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "TitleEscrowNotHoldingToken"
        );
      });
      it("should not allow transfer holder", async () => {
        await expect(titleEscrow.connect(holder).transferHolder(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "TitleEscrowNotHoldingToken"
        );
      });
      it("should not allow surrender", async () => {
        await expect(titleEscrow.connect(holder).surrender()).to.be.revertedWithCustomError(
          titleEscrow,
          "TitleEscrowNotHoldingToken"
        );
      });
    });
    describe("Restore", async () => {
      it("should not allow restore if the caller is not the restorer", async () => {
        await expect(tokenRegistry.connect(holder).restore(tokenId)).to.be.revertedWith(
          toAccessControlRevertMessage(holder.address, ethers.utils.id("RESTORER_ROLE"))
        );
      });
      it("should allow restore after surrender", async () => {
        expect(tokenRegistry.connect(restorer).restore(tokenId)).to.emit(titleEscrow, "Restore");
      });
    });
    describe("Burn", () => {
      //  eslint-disable-next-line no-undef
      before(async () => {
        // re-surrender as the token was restore in above test case
        expect(titleEscrow.connect(holder).surrender()).to.emit(titleEscrow, "Surrender");
      });
      it("should not allow burn if the caller is not the accepter", async () => {
        await expect(tokenRegistry.connect(holder).burn(tokenId)).to.be.revertedWith(
          toAccessControlRevertMessage(holder.address, ethers.utils.id("ACCEPTER_ROLE"))
        );
      });
      it("should allow shred after surrender", async () => {
        expect(tokenRegistry.connect(accepter).burn(tokenId))
          .to.emit(titleEscrow, "Shred")
          .withArgs(tokenRegistry, tokenId);
      });
      it("burn address should be new owner of token", async () => {
        expect(await tokenRegistry.ownerOf(tokenId)).to.equal(defaultAddress.Burn);
      });
    });
    describe("After Burn", () => {
      it("should not allow nomination", async () => {
        await expect(titleEscrow.connect(beneficiary).nominate(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "InactiveTitleEscrow"
        );
      });
      it("should not allow transfer beneficiary", async () => {
        await expect(titleEscrow.connect(holder).transferBeneficiary(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "InactiveTitleEscrow"
        );
      });
      it("should not allow transfer holder", async () => {
        await expect(titleEscrow.connect(holder).transferHolder(nominee1.address)).to.be.revertedWithCustomError(
          titleEscrow,
          "InactiveTitleEscrow"
        );
      });
      it("should not allow surrender", async () => {
        await expect(titleEscrow.connect(holder).surrender()).to.be.revertedWithCustomError(
          titleEscrow,
          "InactiveTitleEscrow"
        );
      });
      it("should not allow burn", async () => {
        await expect(tokenRegistry.connect(accepter).burn(tokenId)).to.be.revertedWithCustomError(
          titleEscrow,
          "InactiveTitleEscrow"
        );
      });
    });
  });
});
