export function sceneVideoSlug(item: { id: string; title: string }) {
  const titleSlug = item.title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const idSlug = item.id.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${titleSlug || "video"}-${idSlug}`;
}
