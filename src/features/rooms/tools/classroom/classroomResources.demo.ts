import type { ClassResource } from "../roomTools.types";

/** Only the demo repository imports these examples; live initialization stays empty. */
export function createClassroomDemoResources(): ClassResource[] {
  const addedAt = "2026-09-26T10:00:00Z";
  return [
    { id: "demo-class-guide", kind: "link", name: "La pulsation en quatre temps", description: "Une fiche courte pour préparer votre exercice.", mimeType: "text/html", size: 0, addedAt, mediaUrl: "/demo-resources/classroom-rhythm.html" },
    { id: "demo-class-video", kind: "video", name: "Observer le geste musical", description: "Extrait de démonstration · regardez, puis reprenez le mouvement.", mimeType: "video/mp4", size: 0, addedAt, mediaUrl: "/media/preprofile-demo/female-guitarist.mp4" },
    { id: "demo-class-audio", kind: "audio", name: "Écoute et pratique", description: "Extrait de démonstration à réécouter pendant votre entraînement.", mimeType: "audio/mpeg", size: 0, addedAt, mediaUrl: "/media/profile-demo/guitar-session-audio.mp3" },
  ];
}
