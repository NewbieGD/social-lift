// A stub of VK Bridge that records calls and lets the test decide the outcome of the order box.
export default {
  send: (m, p) => { window.__calls = (window.__calls || []).concat([[m, p]]);
    if (m === 'VKWebAppShowOrderBox') { return window.__orderResult ? Promise.resolve({ success: true }) : Promise.reject({ error_type: 'client_error', error_data: { error_code: 4, error_reason: 'User denied' } }); }
    // Ads: available when the test says so; the call records whether the page was in full screen.
    if (m === 'VKWebAppCheckNativeAds') return Promise.resolve({ result: !!window.__adAvailable });
    if (m === 'VKWebAppShowNativeAds') {
      window.__adLog = (window.__adLog || []).concat([{ fullscreen: !!document.fullscreenElement }]);
      return new Promise((r) => setTimeout(() => r({ result: true }), 500));
    }
    return Promise.resolve({ result: true }); },
  subscribe: () => {},
  supportsAsync: () => Promise.resolve(true),
};
