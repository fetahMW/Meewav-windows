import React from "react";

interface PillarCardProps {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export default function PillarCard({ title, description, icon: Icon }: PillarCardProps) {
  const titleSlug = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return (
    <div className="pillar-card-wrapper">
      <article className="pillar-card">
        <div className="pillar-content">
          <div className="pillar-icon-wrapper" aria-hidden="true">
            <Icon size={28} className="pillar-icon" />
          </div>
          <div className="pillar-info">
            <h3>{title}</h3>
          </div>
        </div>
        <p className={`pillar-description pillar-desc-${titleSlug}`}>{description}</p>
      </article>
    </div>
  );
}
