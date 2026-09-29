import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import Dialog from "./PortraitPreProfileDialog";

vi.mock("../../features/auth/AuthContext", () => ({useAuth: () => ({user:{id:"owner-id"}})}));
vi.mock("../../features/globe/components/PreProfileFrame", () => ({PreProfileFrame: ({children}: any) => <div>{children}</div>}));
vi.mock("../../features/globe/components/preProfile/HoverPreProfileContent", () => ({default: ({artist,isOwner,onOpenProfile,onContact}: any) => <div>
  <span>{isOwner ? "Propriétaire" : "Visiteur"}</span>
  <button disabled={!onOpenProfile} onClick={() => onOpenProfile?.(artist.id)}>Voir profil</button>
  <button onClick={() => onContact?.(artist.id)}>Contacter</button>
</div>}));
vi.mock("../../features/globe/api/preProfile.api", () => ({isCanonicalProfileId: (id: string) => /^[a-f0-9-]{36}$/i.test(id)}));
afterEach(cleanup);
const id="58272811-7735-4971-bc69-c74211f6b5cb";
function Route(){const location=useLocation();return <output>{location.pathname+location.search}</output>;}
function mount(profileId=id){const close=vi.fn();render(<MemoryRouter initialEntries={['/rooms']}><Dialog person={{id:profileId,name:"Maya",avatarUrl:"/maya.png"}} trigger={null} onClose={close}/><Route/></MemoryRouter>);return close;}
describe("Preprofile actions",()=>{
 it("opens the full public profile with the canonical identity",()=>{const close=mount();fireEvent.click(screen.getByRole('button',{name:'Voir profil'}));expect(screen.getByRole('status')).toHaveTextContent(`/profile/view/${id}`);expect(close).toHaveBeenCalledOnce();});
 it("opens a real DM with a profile ID rather than a mock identity",()=>{mount();fireEvent.click(screen.getByRole('button',{name:'Contacter'}));const route=screen.getByRole('status').textContent!;expect(route).toContain('mode=real');expect(route).toContain(`profileId=${id}`);expect(route).not.toContain('mockArtistId=');});
 it("identifies the owner instead of showing a follow-self action",()=>{mount('owner-id');expect(screen.getByText('Propriétaire')).toBeInTheDocument();});
 it("closes on Escape and restores the previous scroll policy",()=>{document.body.style.overflow='auto';const close=mount();expect(document.body.style.overflow).toBe('hidden');fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});expect(close).toHaveBeenCalledOnce();cleanup();expect(document.body.style.overflow).toBe('auto');document.body.style.overflow='';});
});
