import mwSignatureUrl from "../../../assets/signature-mw.svg";

export type SceneTvMarkProps = {
  variant?: "bug" | "ident" | "compact";
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/**
 * A single on-air signature for the persistent watermark, station IDs and
 * transition cards. It deliberately reuses MeeWav's canonical MW artwork.
 */
export function SceneTvMark({
  variant = "bug",
  className,
}: SceneTvMarkProps) {
  return (
    <span
      className={cx("scene-tv-mark", `scene-tv-mark--${variant}`, className)}
      aria-hidden="true"
    >
      <img src={mwSignatureUrl} alt="" width="31" height="19" />
      <b>TV</b>
    </span>
  );
}

