(() => {
  const MESSAGE_TYPE = 'JH_BOSS_COMPAT_HTTP';

  function request(details) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: MESSAGE_TYPE, details }, (reply) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        if (!reply?.ok) {
          reject(new Error(reply?.error || 'Job Harness BOSS bridge request failed'));
          return;
        }
        resolve(reply.result);
      });
    });
  }

  globalThis.GM = Object.freeze({ xmlHttpRequest: request });
  globalThis.GM_xmlhttpRequest = (details) => {
    request(details).then(
      (response) => details?.onload?.(response),
      (error) => {
        if (error?.name === 'AbortError') details?.ontimeout?.(error);
        else details?.onerror?.(error);
      },
    );
  };
})();
