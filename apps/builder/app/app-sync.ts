const startLocking = (name: string, subscribe: (locked: boolean) => void) => {
  const controller = new AbortController();
  const aborted = new Promise((resolve) => {
    controller.signal.onabort = resolve;
  });
  navigator.locks.request(name, { ifAvailable: true }, (lock) => {
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

const startProject = (projectId: string) => {
  // track new project
  const abortLastLock = startLocking(projectId, (locked) => {
    if (locked) {
      // already connected do nothing
      // otherwise load data
    } else {
      // connect
    }
    //
  });
  const stopProject = () => {
    abortLastLock();
  };
  return stopProject;
};

export const createApp = () => {
  let currentProjectId: undefined | string;
  let stopLastProject: undefined | (() => void);
  const trackProject = (projectId: string) => {
    if (currentProjectId === projectId) {
      return;
    }
    currentProjectId = projectId;
    stopLastProject?.();
    stopLastProject = startProject(projectId);
  };
  return {
    trackProject,
  };
};
