import type { ReactNode } from "react";
import type { RoomPerson } from "../roomTools.types";

export function ToolPanelHeader({ eyebrow, title, description, status, icon }: { eyebrow: string; title: string; description: string; status?: string; icon?: ReactNode }) {
  return <header className={`room-tool-panel__header${icon ? " has-glyph" : ""}`}>{icon ? <span className="room-tool-panel__glyph" aria-hidden="true">{icon}</span> : null}<span className="room-tool-panel__copy"><small>{eyebrow}</small><strong>{title}</strong><em>{description}</em></span>{status ? <b><i />{status}</b> : null}</header>;
}

export function ToolSection({ title, action, children, className = "" }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`room-tool-section ${className}`}><header><strong>{title}</strong>{action}</header>{children}</section>;
}

export function PersonChip({ person, detail }: { person: RoomPerson; detail?: string }) {
  return <span className="room-tool-person"><img src={person.avatarUrl} alt="" loading="lazy" /><span><strong>{person.name}</strong><small>{detail ?? person.role}</small></span></span>;
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <p className="room-tool-empty"><strong>{title}</strong><span>{children}</span></p>;
}

export function ToolNotice({ tone = "info", children }: { tone?: "info" | "warning" | "success"; children: ReactNode }) {
  return <p className={`room-tool-notice is-${tone}`}>{children}</p>;
}
