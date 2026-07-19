import {
  ObligationEscrow,
  ObligationEscrowFactory,
  ObligationToken,
  ObligationRegistryFactory,
} from "@tradetrust/contracts";
import { TransactionReceipt } from "ethers";
import faker from "faker";
import { ethers } from "hardhat";
import { expect } from ".";
import { defaultAddress, roleHash } from "../src/constants";
import { getEventFromReceipt } from "../src/utils";
import { getTestUsers, txnHexRemarks, TestUsers } from "./helpers";

describe("ObligationRegistryFactory", () => {
  let users: TestUsers;

  // eslint-disable-next-line no-undef
  before(async () => {
    users = await getTestUsers();
  });

  it("should deploy shared infrastructure and produce usable ObligationToken proxies", async () => {
    const factory = (await (await ethers.getContractFactory("ObligationRegistryFactory"))
      .connect(users.carrier)
      .deploy()) as unknown as ObligationRegistryFactory;

    expect(await factory.obligationEscrowFactory()).to.not.equal(defaultAddress.Zero);
    expect(await factory.implementation()).to.not.equal(defaultAddress.Zero);

    const obligationEscrowFactoryAddress = await factory.obligationEscrowFactory();
    const owner = users.carrier.address;

    const tx = await factory.deploy("Obligation Registry", "STR", owner);
    const receipt = (await tx.wait()) as TransactionReceipt;
    const obligationTokenAddress = getEventFromReceipt<any>(receipt, "ObligationRegistryDeployed", factory.interface)
      .args.obligationRegistry;

    await expect(tx)
      .to.emit(factory, "ObligationRegistryDeployed")
      .withArgs(obligationTokenAddress, obligationEscrowFactoryAddress, owner, "Obligation Registry", "STR");

    const obligationToken = (await ethers.getContractFactory("ObligationToken")).attach(
      obligationTokenAddress
    ) as unknown as ObligationToken;

    expect(await obligationToken.owner()).to.equal(owner);
    expect(await obligationToken.hasRole(roleHash.DefaultAdmin, owner)).to.be.true;
    expect(await obligationToken.obligationEscrowFactory()).to.equal(obligationEscrowFactoryAddress);

    const tokenId = faker.datatype.hexaDecimal(64);
    await (
      await obligationToken
        .connect(users.carrier)
        .mint(users.beneficiary.address, users.holder.address, tokenId, txnHexRemarks.mintRemark)
    ).wait();

    const escrowFactory = await ethers.getContractAt("ObligationEscrowFactory", obligationEscrowFactoryAddress);
    const escrowAddress = await escrowFactory.getEscrowAddress(obligationTokenAddress, tokenId);
    const escrow = (await ethers.getContractAt("ObligationEscrow", escrowAddress)) as unknown as ObligationEscrow;

    expect(await escrow.isRegistered()).to.be.true;
    expect(await escrow.status()).to.equal(0);
    expect(await escrow.isHoldingToken()).to.be.true;
    expect(await obligationToken.ownerOf(tokenId)).to.equal(escrowAddress);
  });

  it("should revert deploy with ZeroAddress when owner is the zero address", async () => {
    const factory = (await (await ethers.getContractFactory("ObligationRegistryFactory"))
      .connect(users.carrier)
      .deploy()) as unknown as ObligationRegistryFactory;

    const tx = factory.deploy("Obligation Registry", "STR", defaultAddress.Zero);

    await expect(tx).to.be.revertedWithCustomError(factory, "ZeroAddress");
  });

  it("should share the same ObligationEscrowFactory across every registry deployed from one factory instance", async () => {
    const factory = (await (await ethers.getContractFactory("ObligationRegistryFactory"))
      .connect(users.carrier)
      .deploy()) as unknown as ObligationRegistryFactory;

    const firstTx = await factory.deploy("Registry A", "REGA", users.carrier.address);
    const firstReceipt = (await firstTx.wait()) as TransactionReceipt;
    const firstTokenAddress = getEventFromReceipt<any>(firstReceipt, "ObligationRegistryDeployed", factory.interface)
      .args.obligationRegistry;

    const secondTx = await factory.deploy("Registry B", "REGB", users.beneficiary.address);
    const secondReceipt = (await secondTx.wait()) as TransactionReceipt;
    const secondTokenAddress = getEventFromReceipt<any>(secondReceipt, "ObligationRegistryDeployed", factory.interface)
      .args.obligationRegistry;

    const firstToken = (await ethers.getContractFactory("ObligationToken")).attach(
      firstTokenAddress
    ) as unknown as ObligationToken;
    const secondToken = (await ethers.getContractFactory("ObligationToken")).attach(
      secondTokenAddress
    ) as unknown as ObligationToken;

    expect(firstTokenAddress).to.not.equal(secondTokenAddress);
    expect(await firstToken.obligationEscrowFactory()).to.equal(await factory.obligationEscrowFactory());
    expect(await secondToken.obligationEscrowFactory()).to.equal(await factory.obligationEscrowFactory());
  });

  it("should make the ObligationRegistryFactory deployer (not the factory contract itself) the owner of the shared ObligationEscrowFactory, so its beacon can still be upgraded", async () => {
    const deployerWallet = users.carrier;

    const factory = (await (await ethers.getContractFactory("ObligationRegistryFactory"))
      .connect(deployerWallet)
      .deploy()) as unknown as ObligationRegistryFactory;

    const obligationEscrowFactory = (await ethers.getContractAt(
      "ObligationEscrowFactory",
      await factory.obligationEscrowFactory()
    )) as unknown as ObligationEscrowFactory;

    expect(await obligationEscrowFactory.owner()).to.equal(deployerWallet.address);
    expect(await obligationEscrowFactory.owner()).to.not.equal(await factory.getAddress());

    const newImplementation = await (await ethers.getContractFactory("ObligationEscrow")).deploy();
    const newImplementationAddress = await newImplementation.getAddress();

    await obligationEscrowFactory.connect(deployerWallet).upgradeEscrowImplementation(newImplementationAddress);

    expect(await obligationEscrowFactory.implementation()).to.equal(newImplementationAddress);
  });
});
