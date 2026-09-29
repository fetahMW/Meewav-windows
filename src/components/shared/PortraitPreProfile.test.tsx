import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { portraitProps, PORTRAIT_EVENT } from "./portraitPreProfile";
import Host from "./PortraitPreProfileHost";
import { mapConversationRowToViewModel } from "../../features/messaging/messaging.adapters";

vi.mock("./PortraitPreProfileDialog", () => ({default: ({person,onClose}: any) => <div role="dialog" aria-label={person.id}><button onClick={onClose}>Fermer</button></div>}));
afterEach(cleanup);
const person={id:"58272811-7735-4971-bc69-c74211f6b5cb",name:"Maya",avatarUrl:"/maya.png"};

describe("Round portrait navigation",()=>{
 it("opens the person's preprofile without selecting the surrounding contact",async()=>{
  const select=vi.fn();render(<MemoryRouter><Host/><button onClick={select}><span {...portraitProps(person)}>Portrait</span><span>Conversation</span></button></MemoryRouter>);
  fireEvent.click(screen.getByText("Portrait"));
  expect(await screen.findByRole("dialog",{name:person.id})).toBeInTheDocument();expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Fermer"));fireEvent.click(screen.getByText("Conversation"));expect(select).toHaveBeenCalledTimes(1);
 });
 it.each(["Enter"," "])("supports keyboard %s without triggering the row",async key=>{
  const select=vi.fn();render(<MemoryRouter><Host/><div onKeyDown={select}><span {...portraitProps(person)}>Portrait</span></div></MemoryRouter>);
  fireEvent.keyDown(screen.getByText("Portrait"),{key});expect(await screen.findByRole("dialog")).toBeInTheDocument();expect(select).not.toHaveBeenCalled();
 });
 it("leaves the Volumes module exempt",()=>{
  const open=vi.fn();window.addEventListener(PORTRAIT_EVENT,open);
  render(<section data-preprofile-exempt="volumes"><span {...portraitProps(person)}>Volume portrait</span></section>);
  fireEvent.click(screen.getByText("Volume portrait"));expect(open).not.toHaveBeenCalled();window.removeEventListener(PORTRAIT_EVENT,open);
 });
 it("does not invent an identity for a missing or deleted account",()=>{expect(portraitProps(null)).toEqual({});expect(portraitProps({id:""})).toEqual({});});
 it("dismisses an open preprofile when navigating away",async()=>{
  function Navigation(){const navigate=useNavigate();return <button onClick={()=>navigate('/elsewhere')}>Navigate</button>;}
  render(<MemoryRouter><Host/><Navigation/><span {...portraitProps(person)}>Portrait</span></MemoryRouter>);
  fireEvent.click(screen.getByText('Portrait'));await screen.findByRole('dialog');fireEvent.click(screen.getByText('Navigate'));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 });
 it("carries the counterpart profile, never the conversation UUID or a group",()=>{
  const row={conversation_id:"cf3819b6-6b5e-42d5-a1a3-634735949a28",kind:"direct",counterpart_profile_id:person.id,counterpart_display_name:person.name,member_count:2} as any;
  expect(mapConversationRowToViewModel(row).profileId).toBe(person.id);
  expect(mapConversationRowToViewModel({...row,kind:"group"}).profileId).toBeNull();
  expect(mapConversationRowToViewModel({...row,counterpart_profile_id:null}).profileId).toBeNull();
 });
});
