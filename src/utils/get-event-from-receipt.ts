import { TypedEvent } from "@typechain/ethers-v5/static/common";
import { ContractReceipt, ethers as packedEthers } from "ethers";

const ethers = { ...packedEthers };

if (ethers.version.startsWith("6.")) {
  (ethers as any).utils = {
    Interface: (ethers as any).Interface,
  };
  (ethers as any).ContractReceipt = (ethers as any).TransactionReceipt;
}

export const getEventFromReceipt = <T extends TypedEvent<any>>(
  receipt: ContractReceipt,
  topic: string,
  // @ts-ignore
  iface?: ethers.utils.Interface
) => {
  if (ethers.version.includes("/5")) {
    if (!receipt.events) throw new Error("Events object is undefined");
    const event = receipt.events.find((evt) => evt.topics[0] === topic);
    if (!event) throw new Error(`Cannot find topic ${topic}`);

    if (iface) return iface.parseLog(event) as unknown as T;
    return event as T;
  }
  if (ethers.version.startsWith("6")) {
    const resLog = receipt.logs.find((log: any) => iface.parseLog(log)?.name === topic);
    return iface.parseLog(resLog as any) as T;
  }
  throw new Error("Unsupported ethers version");
};
