// The small "i" beside a label or a figure on the panel: what explains it is not on the page until it is wanted. Pointing at the "i" (or focusing it
// with the keyboard, or tapping it) opens a note beside it, in the panel's own metal; moving away, pressing elsewhere, scrolling, a new page or Escape
// closes it. The "i" is a real button whose accessible name is the note itself, so a screen reader reads it without any of this. One note is shared by
// all the icons and lives on the stage (a note inside the panel would be cut off by the panel's edge), placed from the icon's rectangle and kept
// inside the stage. No storage, no requests.
import { esc } from './utils.js';

/** The markup of an icon that says `text` (for the views that draw with innerHTML). */
export const infoHtml = (text) => `<button type="button" class="info" aria-label="${esc(text)}" data-info="${esc(text)}">i</button>`;

/** An icon that says `text`, as an element. */
export function infoButton(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'info';
  button.textContent = 'i';
  setInfo(button, text);
  return button;
}

/** Changes what an icon says (an empty text takes the icon away). */
export function setInfo(button, text) {
  button.hidden = !text;
  button.dataset.info = text;
  button.setAttribute('aria-label', text);
}

const MARGIN = 8;
const GAP = 6;
let tip = null;
let current = null;

function note() {
  if (tip) return tip;
  tip = document.createElement('div');
  tip.id = 'infoTip';
  tip.className = 'info-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.getElementById('stage').append(tip);
  return tip;
}

export function hideInfoTip() {
  if (!tip || tip.hidden) return;
  tip.hidden = true;
  current?.removeAttribute('aria-describedby');
  current = null;
}

function showInfoTip(button) {
  if (!button.dataset.info || !button.isConnected) return;
  const stage = document.getElementById('stage');
  const element = note();
  if (current && current !== button) current.removeAttribute('aria-describedby');
  current = button;
  button.setAttribute('aria-describedby', element.id);
  element.textContent = button.dataset.info;
  element.hidden = false;
  const box = stage.getBoundingClientRect();
  const at = button.getBoundingClientRect();
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  const left = Math.max(MARGIN, Math.min(at.left + at.width / 2 - box.left - width / 2, box.width - width - MARGIN));
  const below = at.bottom - box.top + GAP;
  const top = below + height > box.height - MARGIN ? Math.max(MARGIN, at.top - box.top - height - GAP) : below; // above the icon near the bottom
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}

export function initInfoTips() {
  const iconOf = (event) => (event.target instanceof Element ? event.target.closest('.info') : null);
  document.addEventListener('pointerover', (event) => {
    const icon = iconOf(event);
    if (icon && event.pointerType !== 'touch') showInfoTip(icon);
  });
  document.addEventListener('pointerout', (event) => {
    const icon = iconOf(event);
    if (icon && event.pointerType !== 'touch' && !icon.matches(':focus-visible')) hideInfoTip();
  });
  document.addEventListener('focusin', (event) => {
    const icon = iconOf(event);
    if (icon && icon.matches(':focus-visible')) showInfoTip(icon);
  });
  document.addEventListener('focusout', (event) => {
    if (iconOf(event)) hideInfoTip();
  });
  document.addEventListener('click', (event) => {
    const icon = iconOf(event);
    if (icon) showInfoTip(icon); // a tap on a touch screen, or Enter
  });
  document.addEventListener('pointerdown', (event) => {
    if (!iconOf(event)) hideInfoTip();
  });
  // Escape closes the note and nothing else: the panel's own Escape (back to the ratings) is for the next one
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !tip || tip.hidden) return;
      hideInfoTip();
      event.preventDefault();
    },
    true,
  );
  document.addEventListener('scroll', hideInfoTip, true);
  window.addEventListener('f1:workspace-changed', hideInfoTip);
}
