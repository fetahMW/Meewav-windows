import React, { useRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatHeaderScroll } from './chatHeaderScroll';
import { useChatHeaderScroll } from './useChatHeaderScroll';

describe('chat header direction', () => {
  const sample = (top: number, userIntent = true) => ({ top, maximum: 900, viewport: 500, userIntent });
  it('hides after a deliberate downward scroll, reveals sooner on reverse', () => {
    const detector = createChatHeaderScroll();
    expect(detector.update(sample(100))).toBe(false);
    expect(detector.update(sample(111))).toBe(false);
    expect(detector.update(sample(125))).toBe(true);
    expect(detector.update(sample(120))).toBe(true);
    expect(detector.update(sample(112))).toBe(false);
  });
  it('does not accumulate small alternating movements into a toggle', () => {
    const detector = createChatHeaderScroll();
    detector.update(sample(100));
    for (const top of [108, 105, 110, 106, 116, 110]) expect(detector.update(sample(top))).toBe(false);
  });
  it('ignores initial/programmatic positioning and incoming message layout changes', () => {
    const detector = createChatHeaderScroll();
    expect(detector.update(sample(0, false))).toBe(false);
    expect(detector.update(sample(500, false))).toBe(false);
    expect(detector.update(sample(530))).toBe(true);
    expect(detector.update({ ...sample(610), maximum: 980 })).toBe(false);
  });
  it('reveals for keyboard/viewport changes, focus and top overscroll', () => {
    const detector = createChatHeaderScroll();
    detector.update(sample(100));
    expect(detector.update(sample(130))).toBe(true);
    expect(detector.update({ ...sample(130), viewport: 300 })).toBe(false);
    detector.reset(); detector.update(sample(100)); detector.update(sample(130));
    expect(detector.update({ ...sample(140), forceVisible: true })).toBe(false);
    detector.update(sample(170));
    expect(detector.update(sample(-20))).toBe(false);
  });
  it('never hides for a short conversation', () => {
    const detector = createChatHeaderScroll();
    detector.update({ ...sample(10), maximum: 80 });
    expect(detector.update({ ...sample(80), maximum: 80 })).toBe(false);
  });
});

function Chat({ kind = 'direct', open = true }: { kind?: 'direct' | 'project' | 'group'; open?: boolean }) {
  const surface = useRef<HTMLDivElement>(null);
  useChatHeaderScroll(surface, true, 'conversation');
  const timeline = open && <section className="mw-chat-scene"><div className="mw-chat-timeline" style={{ overflowY: 'auto' }}><div className="mw-chat-timeline__inner">Messages</div></div><input aria-label="Message" /></section>;
  return <div ref={surface}>
    {kind === 'direct' ? <section className="mw-workspace"><header className="mw-chat-header"><div className="mw-chat-header__identity"><button>Retour</button></div></header>{timeline}</section>
      : <section className={kind === 'project' ? 'mw-project-detail mwp-project-detail' : 'agw-panel'} data-project-tab={open ? 'chat' : 'info'}><header className="mw-mobile-workspace-header"><button>Retour</button><nav>Chat | Membres</nav></header><div className={kind === 'project' ? 'mwp-project-detail__content' : 'agw-panel__body'}>{timeline || <p>Informations</p>}</div></section>}
  </div>;
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function prepare(container: HTMLElement) {
  const timeline = container.querySelector<HTMLElement>('.mw-chat-timeline')!;
  const header = container.querySelector<HTMLElement>('[data-auto-chat-chrome]')!;
  Object.defineProperties(timeline, { scrollHeight: { configurable: true, value: 1500 }, clientHeight: { configurable: true, value: 500 } });
  timeline.scrollTop = 100;
  fireEvent.scroll(timeline);
  return { timeline, header };
}
function scroll(timeline: HTMLElement, top: number) {
  fireEvent.wheel(timeline, { deltaY: top - timeline.scrollTop });
  timeline.scrollTop = top;
  fireEvent.scroll(timeline);
}

describe('mobile header integration', () => {
  it.each(['direct', 'project', 'group'] as const)('binds %s chat, hides controls accessibly and restores them on reverse', kind => {
    const { container } = render(<Chat kind={kind} />);
    const { timeline, header } = prepare(container);
    expect(header).toBeTruthy();
    scroll(timeline, 135);
    expect(header).toHaveAttribute('data-chat-header-hidden');
    expect(header.inert).toBe(true);
    expect(header).toHaveAttribute('aria-hidden', 'true');
    scroll(timeline, 119);
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
    expect(header.inert).toBe(false);
    expect(header).not.toHaveAttribute('aria-hidden');
    scroll(timeline, 155);
    fireEvent.focusIn(container.querySelector('input')!);
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
  });
  it('does not hide after tapping a message then programmatic positioning', () => {
    const { container } = render(<Chat />);
    const { timeline, header } = prepare(container);
    fireEvent.pointerDown(timeline, { pointerId: 1, clientY: 100 });
    fireEvent.pointerUp(timeline, { pointerId: 1, clientY: 100 });
    timeline.scrollTop = 700;
    fireEvent.scroll(timeline);
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
  });
  it('accumulates gentle wheel movements within one scrolling gesture', () => {
    const { container } = render(<Chat />);
    const { timeline, header } = prepare(container);
    scroll(timeline, 108); scroll(timeline, 116);
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
    scroll(timeline, 126);
    expect(header).toHaveAttribute('data-chat-header-hidden');
  });
  it('reveals the header and keeps it connected when leaving a project chat tab', async () => {
    const view = render(<Chat kind="project" />);
    const { timeline, header } = prepare(view.container);
    scroll(timeline, 140);
    expect(header.inert).toBe(true);
    view.rerender(<Chat kind="project" open={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(header).toHaveAttribute('data-auto-chat-chrome');
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
    expect(header.inert).not.toBe(true);
    expect(view.container.querySelector('[data-auto-chat-header-content]')).not.toBeNull();
  });
});

function WorkspaceTab({ kind, tab }: { kind: 'project' | 'group'; tab: string }) {
  const surface = useRef<HTMLDivElement>(null);
  useChatHeaderScroll(surface, true, kind);
  return <div ref={surface}><section className={kind === 'project' ? 'mw-project-detail mwp-project-detail' : 'agw-panel agw-panel--' + tab} data-project-tab={tab}>
    <header className="mw-mobile-workspace-header"><button>Retour</button><nav>Onglets</nav></header>
    {kind === 'project' ? <div className="mw-project-detail__body"><div className="mwp-project-detail__content" style={{ overflowY: 'auto' }}>
      <section className={'mwp-project-' + tab} style={{ overflowY: tab === 'info' ? 'visible' : 'auto' }}><span data-testid="content">Contenu</span></section>
    </div></div> : <div className="agw-panel__layout"><div className="agw-panel__body" style={{ overflowY: 'auto' }}><span data-testid="content">Contenu</span></div></div>}
  </section></div>;
}

function prepareTab(container: HTMLElement, kind: 'project' | 'group', tab: string) {
  const selector = kind === 'group' ? '.agw-panel__body' : tab === 'info' ? '.mwp-project-detail__content' : '.mwp-project-' + tab;
  const scroller = container.querySelector<HTMLElement>(selector)!;
  Object.defineProperties(scroller, { scrollHeight: { configurable: true, value: 1500 }, clientHeight: { configurable: true, value: 500 } });
  scroller.scrollTop = 100;
  fireEvent.scroll(scroller);
  return { scroller, header: container.querySelector<HTMLElement>('[data-auto-chat-chrome]')! };
}

describe('workspace tab headers', () => {
  it.each([
    ['project', 'tasks'], ['project', 'stems'], ['project', 'info'],
    ['group', 'members'], ['group', 'decisions'], ['group', 'files'],
  ] as const)('collapses and restores the %s %s header using its actual scrolling container', (kind, tab) => {
    const { container } = render(<WorkspaceTab kind={kind} tab={tab} />);
    const { scroller, header } = prepareTab(container, kind, tab);
    fireEvent.wheel(container.querySelector('[data-testid="content"]')!, { deltaY: 35 });
    scroller.scrollTop = 135;
    fireEvent.scroll(scroller);
    expect(header).toHaveAttribute('data-chat-header-hidden');
    expect(header.inert).toBe(true);
    scroll(scroller, 119);
    expect(header).not.toHaveAttribute('data-chat-header-hidden');
    expect(header.inert).toBe(false);
  });

  it('reveals on tab change and starts a new gesture on the replacement scroller', async () => {
    const view = render(<WorkspaceTab kind="project" tab="tasks" />);
    const first = prepareTab(view.container, 'project', 'tasks');
    scroll(first.scroller, 140);
    expect(first.header).toHaveAttribute('data-chat-header-hidden');
    view.rerender(<WorkspaceTab kind="project" tab="info" />);
    await act(async () => { await Promise.resolve(); });
    expect(first.header).not.toHaveAttribute('data-chat-header-hidden');
    const next = prepareTab(view.container, 'project', 'info');
    scroll(next.scroller, 140);
    expect(next.header).toHaveAttribute('data-chat-header-hidden');
    view.unmount();
    expect(next.header).not.toHaveAttribute('data-auto-chat-chrome');
    expect(next.header.inert).toBe(false);
  });
});
