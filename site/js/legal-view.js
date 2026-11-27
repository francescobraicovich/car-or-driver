// About and Privacy, displayed as one continuous document.
import { SITE } from './site-identity.js';
import { ABOUT_HTML, PRIVACY_HTML } from './legal-content.js';
import { goTo } from './address.js';

const values = {
  name: SITE.name,
  operatorName: SITE.operatorName,
  operatorCountry: SITE.operatorCountry,
  lastUpdated: SITE.lastUpdated,
  dataLicenceName: SITE.dataLicence.name,
  dataLicenceUrl: SITE.dataLicence.url,
  repositoryUrl: SITE.repositoryUrl,
};

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/** About and the privacy notice as one document, with the details of who runs the site filled in (also the text of the page /about). */
export const legalDocumentHtml = () =>
  `${ABOUT_HTML}<h3 id="privacy-notice" class="legal-section">Privacy and cookies</h3>${PRIVACY_HTML}`.replace(
    /\{\{(\w+)\}\}/g,
    (_, key) => values[key] ?? `{{${key}}}`,
  );

function createDocument(page, title, html) {
  const card = document.createElement('section');
  card.id = `${page}Card`;
  card.className = 'deck-card legal-document';
  card.dataset.deck = page;
  card.tabIndex = -1;
  card.setAttribute('aria-label', title);
  card.innerHTML = `<header class="deck-head"><h2 class="deck-title">${title}</h2><button type="button" class="deck-close" aria-label="Close ${title}">×</button></header>
    <div class="deck-text legal-document-body" role="region" aria-label="${title} text" tabindex="0">${html}</div>`;
  const body = card.querySelector('.legal-document-body');
  for (const heading of body.querySelectorAll('h3')) {
    heading.dataset.legalSlide =
      heading.id === 'about-data'
        ? 'credits'
        : heading.id === 'privacy-notice'
          ? 'privacy'
          : slug(heading.textContent.replace(/^\d+\.\s*/, ''));
  }
  for (const link of card.querySelectorAll('[data-contact-email]')) {
    if (SITE.contactEmail) {
      link.textContent = SITE.contactEmail;
      link.href = `mailto:${SITE.contactEmail}`;
    } else link.textContent = '(contact address to be added before publication)';
  }
  document.getElementById('stage').append(card);
  window.dispatchEvent(new CustomEvent('f1:deck-made', { detail: { card } }));
  card.querySelector('.deck-close').addEventListener('click', () => goTo('/'));
  let wasOpen = false;
  let previousSection = null;
  window.addEventListener('f1:workspace-changed', (event) => {
    const open = document.body.dataset.page === page;
    card.toggleAttribute('data-open', open);
    if (!open) {
      wasOpen = false;
      return;
    }
    const section = event.detail.slide; // (the old address of the privacy notice, /privacy, names its section)
    if (!wasOpen || section !== previousSection) {
      body.scrollTop = 0;
      const heading = [...body.querySelectorAll('h3')].find((item) => item.dataset.legalSlide === section);
      if (heading) body.scrollTop = heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
    }
    previousSection = section;
    if (!wasOpen) card.focus({ preventScroll: true });
    wasOpen = true;
  });
  window.addEventListener('keydown', (event) => {
    if (document.body.dataset.page === page && event.key === 'Escape' && !event.defaultPrevented) goTo('/');
  });
  return card;
}

let started = false;

export function initLegal() {
  if (started) return;
  started = true;
  const about = createDocument('about', 'About & privacy', legalDocumentHtml());
  about.querySelector('#citationAddress').textContent = `${location.origin}/`;
}
