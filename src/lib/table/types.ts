export interface TableRow {
  id: string;
  title: string;
  text: string;
  motivation: string;
  /** Where it points, already worded: "Area · Image 3", "00:01:12", "Whole item". */
  where: string;
  /** The user's own, or the manifest's. */
  origin: 'mine' | 'source';
}
