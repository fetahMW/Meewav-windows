export function normalizeFrenchQuery(input: string) {
  return input
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, " ")
    .replace(/[-_/.,;:()[\]{}]/g, " ")
    .replace(/\bste\b/g, "sainte")
    .replace(/\bst\b/g, "saint")
    .replace(/\s+/g, " ")
    .trim();
}

export function getFrenchQueryVariants(input: string) {
  const normalized = normalizeFrenchQuery(input);
  const variants = new Set<string>();

  if (normalized) {
    variants.add(normalized);
    variants.add(normalized.replace(/\bsaint\b/g, "st"));
    variants.add(normalized.replace(/\bsainte\b/g, "ste"));
    variants.add(normalized.replace(/\bst\b/g, "saint"));
    variants.add(normalized.replace(/\bste\b/g, "sainte"));
  }

  return [...variants].filter(Boolean);
}
