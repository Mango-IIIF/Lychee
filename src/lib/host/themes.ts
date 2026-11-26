import {
  VIEWER_THEMES,
  isViewerTheme,
  type ViewerTheme,
} from '@mango-iiif/iiif-viewer/core';

/**
 * Mango's colour themes, sourced directly from `@mango-iiif/iiif-viewer/core`
 * so the editor and viewer share one canonical theme list and palette.
 */
export const THEMES = VIEWER_THEMES;

export type Theme = ViewerTheme;

export const isTheme = (value: unknown): value is Theme => isViewerTheme(value);

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
