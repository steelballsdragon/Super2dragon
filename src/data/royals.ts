// Royal households on 1 January 1800. Consorts not listed here are generated (or absent where the
// sovereign was unmarried or widowed), and heirs are the sovereign's children unless noted.

export interface ConsortDef {
  name: string;
  born: number;
  /** Polity of birth, when it exists in the game. */
  origin?: string;
  /** House of birth. */
  house?: string;
}

export const CONSORTS_1800: Record<string, ConsortDef> = {
  great_britain: { name: 'Charlotte', born: 1744, house: 'Mecklenburg-Strelitz' },
  hanover: { name: 'Charlotte', born: 1744, house: 'Mecklenburg-Strelitz' },
  austria: { name: 'Maria Theresa', born: 1772, origin: 'naples', house: 'Bourbon' },
  prussia: { name: 'Louise', born: 1776, house: 'Mecklenburg-Strelitz' },
  spain: { name: 'Maria Luisa', born: 1751, origin: 'parma', house: 'Bourbon-Parma' },
  sweden: { name: 'Frederica', born: 1781, origin: 'baden', house: 'Zähringen' },
  kingdom_sardinia: { name: 'Marie Clotilde', born: 1759, house: 'Bourbon' },
  naples: { name: 'Maria Carolina', born: 1752, origin: 'austria', house: 'Habsburg-Lorraine' },
  tuscany: { name: 'Luisa', born: 1773, origin: 'naples', house: 'Bourbon' },
  bavaria: { name: 'Caroline', born: 1776, origin: 'baden', house: 'Zähringen' },
  saxony: { name: 'Amalie', born: 1752, house: 'Zweibrücken-Birkenfeld' },
  wurttemberg: { name: 'Charlotte, Princess Royal', born: 1766, origin: 'great_britain', house: 'Hanover' },
  russia: { name: 'Maria Feodorovna', born: 1759, origin: 'wurttemberg', house: 'Württemberg' },
  parma: { name: 'Maria Amalia', born: 1746, origin: 'austria', house: 'Habsburg-Lorraine' },
  sikh_misls: { name: 'Mehtab Kaur', born: 1782, house: 'Kanhaiya' },
  joseon: { name: 'Queen Hyoui', born: 1754, house: 'Cheongpung Kim' },
  tokugawa: { name: 'Konoe Hiroko', born: 1773, house: 'Shimazu' },
  siam: { name: 'Queen Amarindra', born: 1737 },
  hawaii: { name: 'Kaʻahumanu', born: 1768 },
};

/** Sovereigns with no consort at the start: widowed, divorced, or (the Ottoman sultan) without a lawful wife. */
export const NO_CONSORT_1800 = new Set(['portugal', 'denmark_norway', 'baden', 'ottoman']);

/** Designated heirs who are not the sovereign's own children (Mustafa was Selim III's cousin). */
export const HEIR_NOT_CHILD = new Set(['ottoman', 'kingdom_sardinia']);
