// The head of every page: the tyre at the top left, and the links to the sections. On the front page the tyre is alone (the title below it says
// the name of the site); on any other page it turns and lets out the name, "Car or Driver", and on the way back to the front page it turns the
// other way and the name folds back behind it. On a phone the links are behind a button of three lines, which opens them as a list.
// The same head is on the front page (site/index.html, where moving between pages changes no document) and on the document pages
// (tools/page-template.mjs, where each page is a document of its own: there the movement plays as the page opens, unless the visitor came from
// another page that already showed the name).

/** The visitor came from a page of this site other than the front page: the name was already out. */
function cameFromAnotherPage() {
  try {
    const from = new URL(document.referrer);
    return from.origin === location.origin && (from.pathname.replace(/\/+$/, '') || '/') !== '/';
  } catch {
    return false; // no referrer: a visit from elsewhere, or a typed address
  }
}

/** Sets the state of the tyre and the name at once, without their movement. */
function setStill(head, state) {
  head.classList.add('site-head-still');
  head.dataset.brand = state;
  head.getBoundingClientRect(); // (applied before the movement is allowed again)
  head.classList.remove('site-head-still');
}

/**
 * @param {HTMLElement} head the element holding the tyre (.site-brand), the menu button (.site-menu-button) and the links (.site-links)
 * @returns {(home: boolean) => void} shows the front page's state of the tyre (folded) or any other page's (released), with the movement
 */
export function initSiteHead(head) {
  const button = head.querySelector('.site-menu-button');
  const links = head.querySelector('.site-links');
  const setOpen = (open) => {
    head.dataset.menu = open ? 'open' : '';
    button.setAttribute('aria-expanded', String(open));
  };
  button.addEventListener('click', () => setOpen(head.dataset.menu !== 'open'));
  links.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false); // a section was chosen
  });
  document.addEventListener('pointerdown', (event) => {
    if (head.dataset.menu === 'open' && !head.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && head.dataset.menu === 'open') {
      setOpen(false);
      button.focus();
      event.preventDefault(); // (the Escape closes the list, not the page under it)
    }
  });

  let first = true;
  return (home) => {
    const state = home ? 'folded' : 'released';
    if (first) {
      first = false;
      // as the page opens: the movement from the page the visitor came from (the front page had the name folded, any other page had it out)
      const before = cameFromAnotherPage() ? 'released' : 'folded';
      setStill(head, before);
      if (before !== state) requestAnimationFrame(() => requestAnimationFrame(() => (head.dataset.brand = state)));
      return;
    }
    head.dataset.brand = state;
  };
}
