export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'updeck-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}
/** Sets Kumo's `data-mode` on the root so its components and UpDeck's tokens switch together. */
export function applyTheme(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && media().matches);
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
}
export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* Storage can be unavailable; the choice still applies to this view. */
  }
  applyTheme(choice);
}
export function followSystemTheme() {
  const listener = () => {
    if (readTheme() === 'system') applyTheme('system');
  };
  media().addEventListener('change', listener);
  return () => media().removeEventListener('change', listener);
}
