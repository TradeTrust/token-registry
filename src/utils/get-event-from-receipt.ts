import { TransactionReceipt, Interface } from "ethers";

export const getEventFromReceipt = <T extends any>(receipt: TransactionReceipt, topic: string, iface: Interface) => {
  const resLog = receipt.logs.find((log) => iface.parseLog(log)?.name === topic);
  return iface.parseLog(resLog as any) as T;
};
