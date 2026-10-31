import type { Annotation } from '../annotations/types';

export interface Card {
  annotation: Annotation;
  title: string;
  text: string;
  eyebrow: string;
  /** Show (a shape) or jump (a time) is available. */
  locate?: 'show' | 'jump';
}
