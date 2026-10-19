// The Privacy and About pages: the text (legal-content.js) with the site's identity filled in (site-identity.js).
import { SITE } from './site-identity.js';
import { ABOUT_HTML, PRIVACY_HTML } from './legal-content.js';
import { forgetTheme } from './theme.js';

const $ = (id) => document.getElementById(id);

const values = {
  name: SITE.name,
  operatorName: SITE.operatorName,
  operatorCountry: SITE.operatorCountry,
  lastUpdated: SITE.lastUpdated,
  dataLicenceName: SITE.dataLicence.name,
  dataLicenceUrl: SITE.dataLicence.url,
  repositoryUrl: SITE.repositoryUrl,
};
const fill = (html) => html.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);

/** The address is put together here rather than written in the page source, which keeps it away from the simplest address harvesters. */
function fillContact(root) {
  for (const link of root.querySelectorAll('[data-contact-email]')) {
    if (SITE.contactEmail) {
      link.textContent = SITE.contactEmail;
      link.href = `mailto:${SITE.contactEmail}`;
    } else {
      link.textContent = '(contact address to be added before publication)';
    }
  }
}

let started = false;

/** Fills both pages; the first of them to open does it, once. */
export function initLegal() {
  if (started) return;
  started = true;
  $('privacyBody').innerHTML = fill(PRIVACY_HTML);
  $('aboutBody').innerHTML = fill(ABOUT_HTML);
  for (const id of ['privacyBody', 'aboutBody']) fillContact($(id));
  $('citationAddress').textContent = new URL('./', location.href).href.replace(/site\/$/, '');
  $('forgetTheme').addEventListener('click', () => {
    $('forgetThemeResult').textContent = forgetTheme() ? 'Removed. The site now follows your device setting.' : 'Nothing was stored.';
  });
}
