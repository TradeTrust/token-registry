import { ethers } from "ethers";

if (ethers.version.includes("/5")) {
  ethers.Interface = (ethers as any).utils.Interface;
  ethers.TransactionReceipt = (ethers as any).ContractReceipt;
}

export const getEventFromReceipt = <T extends any>(receipt: ethers.TransactionReceipt, topic: string, iface: ethers.Interface) => {
  if (ethers.version.includes("/5")) {
    if (!(receipt as any).events) throw new Error("Events object is undefined");
    const event = (receipt as any).events.find((evt: any) => evt.topics[0] === topic);
    if (!event) throw new Error(`Cannot find topic ${topic}`);

    if (iface) return iface.parseLog(event) as unknown as T;
    return event as T;
  } else if (ethers.version.startsWith("6")) {
    const resLog = receipt.logs.find((log: any) => iface.parseLog(log)?.name === topic);
    return iface.parseLog(resLog as any) as T;
  }
  throw new Error("Unsupported ethers version");
};
