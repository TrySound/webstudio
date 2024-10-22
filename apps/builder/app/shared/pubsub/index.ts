import { createPubsub } from "./create";

export interface PubsubMap {
  command: {
    source: string;
    name: string;
  };
}

export const { initPubSub, publish, useSubscribe, subscribe } =
  createPubsub<PubsubMap>();
export type Publish = typeof publish;
