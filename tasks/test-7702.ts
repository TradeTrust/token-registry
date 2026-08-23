import { task } from "hardhat/config";
import { HttpNetworkUserConfig } from "hardhat/types";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseAbi,
  type Address,
  type Chain,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployContract } from "./helpers";
import { TASK_TEST_7702 } from "./task-names";

const XRPL_EVM_TESTNET_ID = 1_449_000;
const noopAbi = parseAbi(["function ping() external"]);

task(TASK_TEST_7702)
  .setDescription("Tests EIP-7702 authorization (EOA code delegation)")
  .addOptionalParam("target", "Delegation target contract address (deploys Noop if omitted)")
  .setAction(async ({ target }, hre) => {
    const networkConfig = hre.network.config as HttpNetworkUserConfig;
    const rpcUrl = networkConfig.url;
    if (!rpcUrl) {
      throw new Error("Current network has no RPC URL. Run with --network xrplEvmTestnet");
    }

    const privateKey = process.env.DEPLOYER_PK ?? process.env.TEST_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("DEPLOYER_PK (or TEST_PRIVATE_KEY) is not set");
    }

    const account = privateKeyToAccount((privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex);

    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const chainId = await publicClient.getChainId();

    let dummyTarget = target as Address | undefined;
    if (!dummyTarget) {
      console.log("[Status] No --target provided; deploying Noop as the delegation target");
      const noop = await deployContract({ params: [], contractName: "Noop", hre });
      dummyTarget = noop.target as Address;
    }

    const chain: Chain = {
      id: chainId,
      name: hre.network.name,
      nativeCurrency:
        chainId === XRPL_EVM_TESTNET_ID
          ? { name: "XRP", symbol: "XRP", decimals: 18 }
          : { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    };

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });

    console.log(`[Account] ${account.address}`);
    console.log(`[Network] ${hre.network.name} (chainId ${chainId})`);
    console.log(`[Target]  ${dummyTarget}`);

    // Do not pass nonce here: viem sequences the self-authorization increment via executor: "self".
    const authorization = await walletClient.signAuthorization({
      contractAddress: dummyTarget,
      executor: "self",
    });
    console.log(
      `[Authorization] chainId=${authorization.chainId} nonce=${authorization.nonce} address=${authorization.address}`
    );

    const gasPrice = await publicClient.getGasPrice();
    const maxFeePerGas = gasPrice * 2n;
    const maxPriorityFeePerGas = gasPrice > 1n ? gasPrice / 2n : 1n;

    // Explicit gas skips viem's client-side eth_estimateGas so the type-4 tx is actually broadcast.
    const hash = await walletClient.sendTransaction({
      authorizationList: [authorization],
      to: account.address,
      data: encodeFunctionData({ abi: noopAbi, functionName: "ping" }),
      value: 0n,
      gas: 200_000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    console.log(`[Broadcast] ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Status] ${receipt.status}`);
    console.log(`[Logs] ${receipt.logs.length} event(s)`);

    // Delegation designation is applied independently of whether the inner call succeeds.
    const code = await publicClient.getCode({ address: account.address });
    const expectedDesignation = `0xef0100${dummyTarget.slice(2).toLowerCase()}`;
    console.log(`[Expected] ${expectedDesignation}`);
    console.log(`[Code]     ${code ?? "0x"}`);

    if ((code ?? "0x").toLowerCase() === expectedDesignation) {
      console.log("[Result] Delegation designation landed (EIP-7702 accepted)");
      if (receipt.status === "reverted") {
        console.log("[Note] Inner call reverted, but that is separate from 7702 acceptance");
      }
    } else if (receipt.status === "reverted") {
      console.log("[Result] Tx reverted with no designation — may be a chain-level 7702 gap");
    } else {
      console.log("[Result] Tx succeeded but EOA code is not the expected designation");
    }
  });
