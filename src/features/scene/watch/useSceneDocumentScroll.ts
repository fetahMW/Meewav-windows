import { useLayoutEffect } from "react";
import { scenePrivateKey } from "../scenePrivateStorage";
type Position = { y: number; anchor?: string; offset?: number; focus?: string };
const positions = new Map<string, Position>();
/** One restoration authority per history entry, with a visible-card anchor. */
export function useSceneDocumentScroll(entryKey: string, enabled: boolean) {
 useLayoutEffect(() => {
  if (!enabled) return;
  const key = scenePrivateKey(`meewav:scene:scroll:${entryKey}`);
  const previous = history.scrollRestoration; history.scrollRestoration = "manual";
  const save = (event?: Event) => {
   const cards = [...document.querySelectorAll<HTMLAnchorElement>('.scene-video-card__media-hit, .scene-featured-card')];
   const top = document.querySelector('.scene-context-bar')?.getBoundingClientRect().bottom ?? 0;
   const anchor = cards.find((card) => card.getBoundingClientRect().bottom > top);
   const trigger = event?.target instanceof Element ? event.target.closest("a[href]") : null;
   const active = trigger?.getAttribute("href") ?? (document.activeElement instanceof HTMLAnchorElement ? document.activeElement.getAttribute("href") ?? undefined : undefined);
   const position = { y: window.scrollY, anchor: anchor?.getAttribute('href') ?? undefined, offset: anchor?.getBoundingClientRect().top, focus: active };
   positions.set(key, position); try { sessionStorage.setItem(key, JSON.stringify(position)); } catch { /* In-memory fallback. */ }
  };
  const frame = requestAnimationFrame(() => {
   let position = positions.get(key) ?? { y: 0 };
   try { const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (stored && typeof stored.y === 'number') position = stored; } catch { /* In-memory fallback. */ }
   const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href]')];
   const anchor = links.find((link) => link.getAttribute('href') === position.anchor);
   const y = anchor && position.offset !== undefined ? window.scrollY + anchor.getBoundingClientRect().top - position.offset : position.y;
   window.scrollTo({ top: y, behavior: 'instant' });
   if (position.focus) links.find((link) => link.getAttribute('href') === position.focus)?.focus({ preventScroll: true });
  });
  window.addEventListener('scroll', save, { passive: true }); document.addEventListener('pointerdown', save, true);
  return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', save); document.removeEventListener('pointerdown', save, true); history.scrollRestoration = previous; };
 }, [entryKey, enabled]);
}
