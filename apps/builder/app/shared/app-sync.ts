import type { WebstudioData } from "@webstudio-is/sdk";
import * as idb from "idb-keyval";
import { getWebstudioData, setWebstudioData } from "./instance-utils";
import type { loader } from "~/routes/rest.data.$projectId";

const dataStore = idb.createStore("webstudio", "data");

type SyncMessage = { type: "connect" } | { type: "data" };

const loadData = async (projectId: string) => {
  const response = await fetch(`/rest/data/${projectId}`);
  if (response.ok) {
    const data: Awaited<ReturnType<typeof loader>> = await response.json();
    const { assets, build } = data;
    return {
      assets: new Map(assets.map((asset) => [asset.id, asset])),
      instances: new Map(build.instances),
      dataSources: new Map(build.dataSources),
      resources: new Map(build.resources),
      props: new Map(build.props),
      pages: build.pages,
      styleSources: new Map(build.styleSources),
      styleSourceSelections: new Map(build.styleSourceSelections),
      breakpoints: new Map(build.breakpoints),
      styles: new Map(build.styles),
      marketplaceProduct: build.marketplaceProduct,
    } satisfies WebstudioData;
  }
  throw Error("Unable to load builder data");
};

const startLocking = (name: string, subscribe: (locked: boolean) => void) => {
  const controller = new AbortController();
  const aborted = new Promise((resolve) => {
    controller.signal.onabort = () => {
      resolve(undefined);
    };
  });
  navigator.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (controller.signal.aborted) {
      return;
    }
    if (lock) {
      subscribe(true);
      return aborted;
    } else {
      subscribe(false);
      navigator.locks.request(name, () => {
        subscribe(true);
        return aborted;
      });
    }
  });
  return () => {
    controller.abort();
  };
};

export const connectPlugin = (projectId: string) => {
  const projectKey = `builder:${projectId}`;
  const channel = new BroadcastChannel(projectKey);
  channel.onmessage = async (event: MessageEvent<SyncMessage>) => {
    if (event.data.type === "data") {
      channel.onmessage = null;
      const data = await idb.get(projectKey, dataStore);
      setWebstudioData(data);
    }
  };
  channel.postMessage({ type: "connect" } satisfies SyncMessage);
  return () => {
    channel.close();
  };
};

export const startAppSync = (projectId: string) => {
  const projectKey = `builder:${projectId}`;
  const channel = new BroadcastChannel(projectKey);
  let connected = false;
  const abortLocking = startLocking(projectKey, async (locked) => {
    if (locked) {
      // avoid loading data again if was connected to other tab
      // before locking current one.
      if (connected === false) {
        await idb.clear(dataStore);
        const data = await loadData(projectId);
        await idb.set(projectKey, data, dataStore);
        channel.postMessage({ type: "data" } satisfies SyncMessage);
        setWebstudioData(data);
      }
      channel.onmessage = async (event: MessageEvent<SyncMessage>) => {
        if (event.data.type === "connect") {
          const data = getWebstudioData();
          await idb.set(projectKey, data, dataStore);
          channel.postMessage({ type: "data" } satisfies SyncMessage);
        }
      };
    } else {
      channel.onmessage = async (event: MessageEvent<SyncMessage>) => {
        if (event.data.type === "data") {
          channel.onmessage = null;
          const data = await idb.get(projectKey, dataStore);
          setWebstudioData(data);
          connected = true;
        }
      };
      channel.postMessage({ type: "connect" } satisfies SyncMessage);
    }
  });
  return () => {
    channel.close();
    abortLocking();
  };
};
