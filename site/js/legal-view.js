// The Privacy notice and the About page: each a card of slides (slide-deck.js), one slide for each section of the text (legal-content.js), with the
// site's identity filled in (site-identity.js). The first slide is the contents (for the Privacy notice, with its summary above the sections).
import { SITE } from './site-identity.js';
import { ABOUT_HTML, PRIVACY_HTML } from './legal-content.js';
import { createDeck } from './slide-deck.js';

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

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The text cut into sections at its headings: what comes before the first heading goes above the contents, and each section (heading and what follows
 * it) is a slide, with the short name from `labels` (in order).
 */
function sections(html, labels) {
  const text = document.createElement('div');
  text.innerHTML = fill(html);
  const preface = [];
  const found = [];
  for (const node of [...text.children]) {
    if (node.tagName === 'H3') found.push({ heading: node, nodes: [] });
    else (found.at(-1)?.nodes ?? preface).push(node);
  }
  if (found.length !== labels.length) throw new Error(`the text has ${found.length} sections and ${labels.length} short names`);
  return {
    before: preface.map((node) => node.outerHTML).join(''),
    slides: found.map(({ heading, nodes }, index) => {
      const title = heading.textContent.replace(/^\d+\.\s*/, '');
      return {
        id: heading.id === 'about-data' ? 'credits' : slug(title).slice(0, 40),
        label: labels[index],
        title,
        html: `<div class="deck-text">${heading.outerHTML}${nodes.map((node) => node.outerHTML).join('')}</div>`,
      };
    }),
  };
}

const PRIVACY_LABELS = [
  'Who is responsible',
  'When you visit',
  'Cookies and storage',
  'What it does not do',
  'Information about drivers',
  'Links to other sites',
  'If you write to me',
  'Your rights',
  'Children',
  'Changes',
];
const ABOUT_LABELS = [
  'Who runs this site',
  'Not affiliated',
  'What the numbers are',
  'Credits and data sources',
  'Licence of what is published',
  'Software and fonts',
  'References',
  'Corrections',
  'Accessibility',
];

let started = false;

/** Makes both cards (the first of the two pages to open does it, once). */
export function initLegal() {
  if (started) return;
  started = true;
  const privacy = sections(PRIVACY_HTML, PRIVACY_LABELS);
  createDeck({
    page: 'privacy',
    title: 'Privacy',
    before: `<div class="deck-text">${privacy.before}</div>`,
    groups: [{ slides: privacy.slides }],
  });
  const about = sections(ABOUT_HTML, ABOUT_LABELS);
  createDeck({
    page: 'about',
    title: 'About and credits',
    before: `<div class="deck-text">${about.before}</div>`,
    groups: [{ slides: about.slides }],
  });
  for (const id of ['privacyCard', 'aboutCard']) fillContact($(id));
  $('citationAddress').textContent = new URL('./', location.href).href.replace(/site\/$/, '');
}
