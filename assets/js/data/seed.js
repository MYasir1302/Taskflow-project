(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});

  function ensureSeedData() {
    if (!TaskFlow.storage || typeof TaskFlow.storage.installDatabase !== "function") {
      return null;
    }
    return TaskFlow.storage.installDatabase();
  }

  TaskFlow.seed = {
    ensureSeedData,
  };
})();
