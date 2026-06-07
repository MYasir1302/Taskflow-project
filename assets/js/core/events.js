(function () {
  const TaskFlow = (window.TaskFlow = window.TaskFlow || {});
  const listeners = {};

  function on(eventName, handler) {
    listeners[eventName] = listeners[eventName] || [];
    listeners[eventName].push(handler);
    return function unsubscribe() {
      listeners[eventName] = (listeners[eventName] || []).filter(
        (item) => item !== handler
      );
    };
  }

  function emit(eventName, payload) {
    (listeners[eventName] || []).forEach((handler) => {
      handler(payload);
    });
  }

  TaskFlow.events = {
    on,
    emit,
  };
})();
