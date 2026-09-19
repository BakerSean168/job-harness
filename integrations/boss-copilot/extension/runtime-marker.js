(() => {
  const root = document.documentElement;
  if (!root) return;
  root.dataset.jobHarnessBossCopilot = 'compat-1.0.0';
  console.info('[Job Harness] BOSS Copilot compatibility runtime loaded');
})();
