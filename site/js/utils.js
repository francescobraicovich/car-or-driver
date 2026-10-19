// DOM helpers: escaping and the status line.
// Pure numeric helpers (clamp, pct, last, csv) live in packages/core.
export function esc(s) {
  return String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c],
  );
}

export function setStatus(elm, s, cls = '') {
  elm.textContent = s;
  elm.className = 'status ' + cls;
  // Mirror progress into the loading veil while it is still up.
  var vm = document.getElementById('veilMsg');
  if (vm && !document.getElementById('veil')?.classList.contains('gone')) vm.textContent = s;
}
