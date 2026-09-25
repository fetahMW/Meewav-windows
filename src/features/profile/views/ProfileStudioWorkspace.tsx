import ProfileCageWorkspace from "./ProfileCageWorkspace";
import ProfileGiftsWorkspace from "./ProfileGiftsWorkspace";
import ProfileSetlistWorkspace from "./ProfileSetlistWorkspace";

export type StudioMode = "cage" | "setlist" | "gifts";

type ProfileStudioWorkspaceProps = {
  mode: StudioMode;
  storageScope: string | null;
  onBack: () => void;
  onDone: (message: string) => void;
};

export default function ProfileStudioWorkspace({ mode, storageScope, onBack, onDone }: ProfileStudioWorkspaceProps) {
  if (mode === "cage") return <ProfileCageWorkspace storageScope={storageScope} onBack={onBack} onDone={onDone} />;
  if (mode === "setlist") return <ProfileSetlistWorkspace storageScope={storageScope} onBack={onBack} onDone={onDone} />;
  return <ProfileGiftsWorkspace storageScope={storageScope} onBack={onBack} onDone={onDone} />;
}
