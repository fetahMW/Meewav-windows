import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RoomGoldenLikeReactions from "./RoomGoldenLikeReactions";
Object.defineProperty(HTMLDialogElement.prototype, "showModal", {configurable:true,writable:true,value:function(this:HTMLDialogElement){this.setAttribute("open", "");}});
Object.defineProperty(HTMLDialogElement.prototype, "close", {configurable:true,writable:true,value:function(this:HTMLDialogElement){this.removeAttribute("open");}});

beforeEach(()=>{
  vi.spyOn(HTMLDialogElement.prototype,"showModal").mockImplementation(function(this:HTMLDialogElement){this.setAttribute("open","");});
  vi.spyOn(HTMLDialogElement.prototype,"close").mockImplementation(function(this:HTMLDialogElement){this.removeAttribute("open");});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const base={variant:"compact" as const,artistName:"Naya",likeCount:12,goldenLikeCount:4,liked:false,goldenGiven:false,goldenUnavailable:false};
describe("Golden Like room confirmation",()=>{
 it("requires confirmation, supports cancellation and shows the existing burst only after successful send",async()=>{
  let resolve!:(sent:boolean)=>void;
  const send=vi.fn(()=>new Promise<boolean>((done)=>{resolve=done;}));
  const {container}=render(<RoomGoldenLikeReactions {...base} onGiveGoldenLike={send}/>);
  fireEvent.click(screen.getByRole("button",{name:/Offrir un Golden Like/}));
  expect(screen.getByRole("dialog")).toBeVisible();expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Annuler"}));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:/Offrir un Golden Like/}));
  fireEvent.click(screen.getByRole("button",{name:"Offrir mon Golden Like"}));
  expect(send).toHaveBeenCalledOnce();expect(screen.getByRole("button",{name:"Envoi…"})).toBeDisabled();
  expect(container.querySelector(".live-action-burst--golden")).toBeNull();
  resolve(true);
  await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(container.querySelector(".live-action-burst--golden")).not.toBeNull();
 });
 it("keeps confirmation open on rejection, never celebrates failure, and permits retry",async()=>{
  const send=vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const {container}=render(<RoomGoldenLikeReactions {...base} onGiveGoldenLike={send}/>);
  fireEvent.click(screen.getByRole("button",{name:/Offrir un Golden Like/}));
  fireEvent.click(screen.getByRole("button",{name:"Offrir mon Golden Like"}));
  await waitFor(()=>expect(screen.getByRole("alert")).toBeVisible());
  expect(container.querySelector(".live-action-burst--golden")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Offrir mon Golden Like"}));
  await waitFor(()=>expect(container.querySelector(".live-action-burst--golden")).not.toBeNull());
 });
 it("respects the daily unavailable state",()=>{
  const send=vi.fn();render(<RoomGoldenLikeReactions {...base} goldenUnavailable onGiveGoldenLike={send}/>);
  expect(screen.getByRole("button",{name:/Golden Like/})).toBeDisabled();expect(send).not.toHaveBeenCalled();
 });
});
