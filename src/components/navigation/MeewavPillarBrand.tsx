import "./meewav-pillar-brand.css";

type MeewavPillarBrandProps = {
  pillar: "Messagerie" | "Profil" | "Marketplace" | "Rooms" | "Tremplin" | "La Scène" | "La Place" | "La Loge" | "La Wave" | "La Cage" | "La Classe";
};

export default function MeewavPillarBrand({ pillar }: MeewavPillarBrandProps) {
  const pillarMark = pillar === "La Loge" ? (
    <strong
      className="meewav-pillar-brand__pillar meewav-pillar-brand__pillar--loge"
      aria-label="La Loge"
    >
      <span className="meewav-pillar-brand__loge-word" aria-hidden="true">
        <span className="meewav-pillar-brand__loge-copy" data-text="La Loge">La Loge</span>
      </span>
    </strong>
  ) : (
    <strong className="meewav-pillar-brand__pillar">{pillar}</strong>
  );

  return (
    <span className="meewav-pillar-brand" aria-label={`MEEWAV / ${pillar}`}>
      <span className="meewav-pillar-brand__app">MEEWAV</span>
      <span className="meewav-pillar-brand__separator" aria-hidden="true">/</span>
      {pillarMark}
    </span>
  );
}
