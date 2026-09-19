(() => {
  const MESSAGE_TYPE = 'JH_BOSS_COMPAT_HTTP';

  async function request(details) {
    const reply = await chrome.runtime.sendMessage({ type: MESSAGE_TYPE, details });
    if (!reply?.ok) {
      throw new Error(reply?.error || 'Job Harness BOSS bridge request failed');
    }
    return reply.result;
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
