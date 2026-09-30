import { useLayoutEffect, type RefObject } from 'react';
import { createChatHeaderScroll } from './chatHeaderScroll';

const scrollSelector = '.mw-chat-timeline, .mwp-project-stems, .mwp-project-tasks, .mwp-project-info, .mwp-project-detail__content, .agw-panel__body';
const headerSelector = '.mw-mobile-workspace-header, .mw-project-subbar, .agw-panel__bar.has-toolbar, .mw-chat-header:has(.mw-chat-header__identity)';
const editable = 'input, textarea, select, [contenteditable="true"]';

/** A workspace keeps one detector even when its tab or nested scroller changes.
 * Only a finger/wheel gesture hides its header; layout changes and new messages do not. */
export function useChatHeaderScroll(surfaceRef: RefObject<HTMLElement | null>, enabled: boolean, routeKey: string) {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled) return;
    type Context = {
      owner: HTMLElement; header: HTMLElement; content: HTMLElement | null; scenes: Set<HTMLElement>;
      active: HTMLElement | null; detector: ReturnType<typeof createChatHeaderScroll>;
      until: number; hidden: boolean; route: string; originalHidden: string | null; originalInert: boolean;
    };
    const contexts = new Map<HTMLElement, Context>();
    let pointer: { context: Context; id: number; y: number; moved: boolean } | null = null;
    const setHidden = (context: Context, hidden: boolean) => {
      if (context.hidden === hidden && context.header.hasAttribute('data-chat-header-hidden') === hidden) return;
      context.hidden = hidden;
      context.header.toggleAttribute('data-chat-header-hidden', hidden);
      context.header.inert = hidden || context.originalInert;
      if (hidden) context.header.setAttribute('aria-hidden', 'true');
      else if (context.originalHidden === null) context.header.removeAttribute('aria-hidden');
      else context.header.setAttribute('aria-hidden', context.originalHidden);
    };
    const sample = (context: Context, userIntent = false, forceVisible = false) => {
      const scroller = context.active;
      if (!scroller) { setHidden(context, false); return; }
      setHidden(context, context.detector.update({ top: scroller.scrollTop,
        maximum: Math.max(0, scroller.scrollHeight - scroller.clientHeight), viewport: scroller.clientHeight,
        userIntent, forceVisible }));
    };
    const reset = (context: Context) => {
      context.until = 0; context.detector.reset(); sample(context, false, true);
    };
    const reveal = () => {
      pointer = null;
      for (const context of contexts.values()) reset(context);
    };
    const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
      for (const entry of entries) {
        const header = entry.target as HTMLElement;
        const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? header.offsetHeight);
        if (!height) continue;
        for (const context of contexts.values()) if (context.header === header) {
          context.owner.style.setProperty('--auto-chat-header-height', `${height}px`);
          for (const scene of context.scenes) scene.style.setProperty('--auto-chat-header-height', `${height}px`);
          reset(context);
        }
      }
    }) : null;
    const detach = (context: Context) => {
      sizes?.unobserve(context.header);
      setHidden(context, false);
      context.header.inert = context.originalInert;
      context.header.removeAttribute('data-auto-chat-chrome');
      context.owner.removeAttribute('data-auto-chat-header-owner');
      context.owner.style.removeProperty('--auto-chat-header-height');
      context.content?.removeAttribute('data-auto-chat-header-content');
      for (const scene of context.scenes) {
        scene.removeAttribute('data-auto-chat-header-scene');
        scene.style.removeProperty('--auto-chat-header-height');
      }
      contexts.delete(context.owner);
    };
    const connect = () => {
      for (const context of [...contexts.values()]) if (!surface.contains(context.owner) || !surface.contains(context.header)) detach(context);
      surface.querySelectorAll<HTMLElement>(headerSelector).forEach(header => {
        const owner = header.parentElement;
        if (!owner || !owner.matches('.mw-workspace, .mw-project-detail, .agw-panel') || !owner.querySelector(scrollSelector)) return;
        const route = `${owner.getAttribute('data-project-tab') ?? ''}:${owner.getAttribute('aria-label') ?? ''}:${owner.className}`;
        let context = contexts.get(owner);
        if (!context) {
          const content = owner.querySelector<HTMLElement>('.mwp-project-detail__content, .agw-panel__body');
          context = { owner, header, content, scenes: new Set(), active: null, detector: createChatHeaderScroll(),
            until: 0, hidden: false, route, originalHidden: header.getAttribute('aria-hidden'), originalInert: Boolean(header.inert) };
          contexts.set(owner, context);
          owner.setAttribute('data-auto-chat-header-owner', '');
          header.setAttribute('data-auto-chat-chrome', '');
          content?.setAttribute('data-auto-chat-header-content', '');
          owner.style.setProperty('--auto-chat-header-height', `${header.offsetHeight || (header.matches('.mw-mobile-workspace-header') ? 112 : 64)}px`);
          sizes?.observe(header, { box: 'border-box' });
        }
        for (const scene of [...context.scenes]) if (!owner.contains(scene)) {
          scene.removeAttribute('data-auto-chat-header-scene');
          scene.style.removeProperty('--auto-chat-header-height');
          context.scenes.delete(scene);
        }
        owner.querySelectorAll<HTMLElement>('.mw-chat-scene:has(> .mw-chat-timeline)').forEach(scene => {
          context!.scenes.add(scene);
          scene.setAttribute('data-auto-chat-header-scene', '');
          scene.style.setProperty('--auto-chat-header-height', owner.style.getPropertyValue('--auto-chat-header-height'));
        });
        if (context.route !== route || (context.active && !owner.contains(context.active))) {
          context.route = route; context.active = null; reset(context);
        }
      });
    };
    const contextFrom = (target: EventTarget | null) => {
      const element = target instanceof Element ? target : null;
      const owner = element?.closest<HTMLElement>('[data-auto-chat-header-owner]');
      return owner ? contexts.get(owner) : undefined;
    };
    const activate = (context: Context, scroller: HTMLElement) => {
      if (context.active === scroller) return;
      context.active = scroller; reset(context);
    };
    const scrollerFrom = (target: EventTarget | null, context: Context) => {
      let element = target instanceof Element ? target : null;
      while (element && element !== context.owner) {
        if (element instanceof HTMLElement && element.matches(scrollSelector)
          && element.scrollHeight > element.clientHeight + 1
          && /auto|scroll/.test(getComputedStyle(element).overflowY)) return element;
        element = element.parentElement;
      }
      return null;
    };
    const onScroll = (event: Event) => {
      const context = contextFrom(event.target);
      const scroller = event.target;
      if (!context || !(scroller instanceof HTMLElement) || !scroller.matches(scrollSelector)) return;
      activate(context, scroller);
      const now = performance.now();
      const intent = context.until > now;
      if (intent) context.until = now + 700;
      sample(context, intent, surface.contains(document.activeElement) && Boolean(document.activeElement?.matches(editable)));
    };
    const onDown = (event: PointerEvent) => {
      const context = contextFrom(event.target);
      if (!context) return;
      const scroller = scrollerFrom(event.target, context);
      if (!scroller) return;
      activate(context, scroller); sample(context);
      pointer = { context, id: event.pointerId, y: event.clientY, moved: false };
    };
    const onMove = (event: PointerEvent) => {
      if (pointer && pointer.id === event.pointerId && Math.abs(event.clientY - pointer.y) > 4) {
        pointer.moved = true; pointer.context.until = performance.now() + 700;
      }
    };
    const onUp = (event: PointerEvent) => {
      if (pointer?.id !== event.pointerId) return;
      if (pointer.moved) pointer.context.until = performance.now() + 700;
      pointer = null;
    };
    const onWheel = (event: WheelEvent) => {
      const context = contextFrom(event.target);
      if (!context || !event.deltaY) return;
      const scroller = scrollerFrom(event.target, context);
      if (!scroller) return;
      activate(context, scroller);
      const now = performance.now();
      if (context.until <= now) sample(context);
      context.until = now + 700;
    };
    const onKey = () => reveal();
    const onFocus = (event: FocusEvent) => { if (event.target instanceof Element && event.target.matches(editable)) reveal(); };
    connect();
    const mounts = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes'
        ? record.target instanceof Element && record.target.matches(`.mw-workspace, .mw-project-detail, .agw-panel, ${headerSelector}`)
        : [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element
          && (node.matches(`${scrollSelector}, ${headerSelector}`) || node.querySelector(`${scrollSelector}, ${headerSelector}`))))) connect();
    });
    mounts.observe(surface, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-project-tab', 'aria-label', 'class'] });
    surface.addEventListener('scroll', onScroll, { capture: true, passive: true });
    surface.addEventListener('pointerdown', onDown, { passive: true });
    surface.addEventListener('pointermove', onMove, { passive: true });
    surface.addEventListener('pointerup', onUp, { passive: true });
    surface.addEventListener('pointercancel', onUp, { passive: true });
    surface.addEventListener('wheel', onWheel, { passive: true });
    surface.addEventListener('keydown', onKey);
    surface.addEventListener('focusin', onFocus);
    window.addEventListener('resize', reveal);
    window.visualViewport?.addEventListener('resize', reveal);
    window.addEventListener('meewav:messaging-detail', reveal);
    return () => {
      mounts.disconnect();
      for (const context of [...contexts.values()]) detach(context);
      sizes?.disconnect();
      surface.removeEventListener('scroll', onScroll, true);
      surface.removeEventListener('pointerdown', onDown);
      surface.removeEventListener('pointermove', onMove);
      surface.removeEventListener('pointerup', onUp);
      surface.removeEventListener('pointercancel', onUp);
      surface.removeEventListener('wheel', onWheel);
      surface.removeEventListener('keydown', onKey);
      surface.removeEventListener('focusin', onFocus);
      window.removeEventListener('resize', reveal);
      window.visualViewport?.removeEventListener('resize', reveal);
      window.removeEventListener('meewav:messaging-detail', reveal);
    };
  }, [surfaceRef, enabled, routeKey]);
}
