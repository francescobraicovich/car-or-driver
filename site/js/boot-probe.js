// Boot probe (plain script on purpose): runs even when ES modules are blocked
// (e.g. opening index.html via file://) and explains a stuck loader.
window.__appBooted = false;
(function () {
  function show(msg) {
    var box = document.getElementById('veilError');
    if (box) {
      box.hidden = false;
      box.textContent = msg;
    }
  }
  window.addEventListener(
    'error',
    function (e) {
      if (window.__appBooted) return;
      var msg = (e && e.message) || 'a resource failed to load';
      show('Something failed while starting: ' + msg + ' If you opened index.html directly, that is the cause — see below.');
    },
    true,
  );
  setTimeout(function () {
    if (window.__appBooted) return;
    show(
      'Still not started after 12 seconds. Most likely causes: (1) you opened index.html by double-clicking it — ES modules need http, so run “python3 -m http.server” in this folder and open http://localhost:8000 instead; (2) an old Safari (15.4+ recommended) — please update; (3) the network blocks the data files — try another network.',
    );
  }, 12000);
})();
