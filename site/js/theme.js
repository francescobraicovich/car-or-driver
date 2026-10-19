// The light/dark theme. It follows the device setting until the visitor presses the button; only then is the choice stored in this browser
// (localStorage key `f1-theme`), because remembering it is the function the visitor asked for. Nothing is stored before that, nothing is sent
// anywhere, and the privacy page offers a button that removes it again (forgetTheme).
const STORAGE_KEY = 'f1-theme';

const deviceTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function storedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null; // storage blocked: the device setting applies
  }
}

function apply(value, button) {
  document.documentElement.dataset.theme = value;
  if (!button) return;
  button.textContent = value === 'dark' ? 'Light' : 'Dark';
  button.setAttribute('aria-label', `Use ${value === 'dark' ? 'light' : 'dark'} theme`);
}

let themeButton = null;

/** The header button. The theme starts as the stored choice, if the visitor made one, and otherwise as the device setting. */
export function createThemeButton() {
  themeButton = document.createElement('button');
  themeButton.id = 'themeToggle';
  themeButton.type = 'button';
  apply(storedTheme() ?? deviceTheme(), themeButton);
  themeButton.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next, themeButton);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice lasts until the page is closed */
    }
  });
  return themeButton;
}

/** Removes the stored choice and goes back to the device setting. Returns whether anything was stored. */
export function forgetTheme() {
  const had = storedTheme() !== null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to remove */
  }
  apply(deviceTheme(), themeButton);
  return had;
}
