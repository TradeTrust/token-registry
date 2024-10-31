import { TransactionReceipt, ethers } from "ethers";
// import { TypedEvent } from '@typechain/ethers-v6/static/common';

export const getEventFromReceipt = <T extends any>(
  receipt: TransactionReceipt,
  topic: string,
  iface: ethers.Interface,
) => {
  const log = receipt.logs.find((log) => iface.parseLog(log)?.name === topic);
  return iface.parseLog(log as any) as T;
};

// const result = receipt.wait();

// if (!(receipt as any).events) throw new Error("Events object is undefined");
// const filter = deployerContract.filters.Deployment;
// const events = await deployerContract.queryFilter(filter, -1);
// const event = events[0];
// const args = event.args;

// const logs = receipt.logs;

// const event = (receipt as any).events.find((evt: { topics: string[] }) => evt.topics[0] === topic);
// if (!event) throw new Error(`Cannot find topic ${topic}`);

// if (iface) return iface.parseLog(event) as unknown as T;
// return event as T;
