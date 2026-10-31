export const fixturesDir: string;
export const manifestsDir: string;
export function relocate(text: string, base: string): string;
export function writeManifests(base: string): void;
export function deployBase(): string;
export function fixturePath(pathname: string): string | null;
