import type { ClassResource } from "../roomTools.types";

export function createClassroomDemoResources(): ClassResource[] {
  const addedAt = "2026-09-26T10:00:00Z";
  return [
    { id: "demo-class-guide", kind: "link", name: "La pulsation en quatre temps", description: "Fiche de cours · à conserver pour votre pratique.", mimeType: "text/html", size: 0, addedAt, mediaUrl: "/demo-resources/classroom-rhythm.html" },
    { id: "demo-class-practice", kind: "link", name: "Mon carnet de pratique", description: "Une fiche à compléter après chaque séance.", mimeType: "text/plain", size: 0, addedAt, mediaUrl: "/demo-resources/classroom-practice.txt" },
  ];
}
