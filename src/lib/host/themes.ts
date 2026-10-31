/**
 * Mango's colour themes, in the order its own settings panel offers them, with
 * the background and accent each one paints, for the settings swatches. Their
 * `--viewer-*` tokens live in EditorShell (the editor chrome) and in Mango's
 * ViewerLayout (the stage).
 */
export const THEMES = [
  { id: 'dark', background: '#0f141b', accent: '#2ac7ff' },
  { id: 'light', background: '#f3f5f8', accent: '#53719c' },
  { id: 'sepia', background: '#eee4d2', accent: '#a86f46' },
  { id: 'midnight', background: '#07111f', accent: '#a78bfa' },
  { id: 'ringo', background: '#ffd60a', accent: '#a8232b' },
] as const;

export type Theme = (typeof THEMES)[number]['id'];

export const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && THEMES.some((theme) => theme.id === value);

/* The user's choice outlives the page; the host's config is only the default. */
const STORAGE_KEY = 'mango-annotate:theme';

export const storedTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
};

export const storeTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private windows and blocked storage: the choice lasts for this visit only.
  }
};
