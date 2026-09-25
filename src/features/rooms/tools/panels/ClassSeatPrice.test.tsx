import {fireEvent,render,screen,waitFor,cleanup} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import ClassSeatPrice from "./ClassSeatPrice";
afterEach(cleanup);
it("shows the saved price, accepts a decimal comma and saves cents",async()=>{
 const execute=vi.fn(async()=>{});const {rerender}=render(<ClassSeatPrice cents={499} disabled={false} execute={execute}/>);
 const input=screen.getByRole("textbox",{name:"Prix d’une place"});expect(input).toHaveValue("4,99");
 fireEvent.change(input,{target:{value:"8,50"}});fireEvent.blur(input);
 await waitFor(()=>expect(execute).toHaveBeenCalledWith({type:"classe.seat.price",cents:850}));
 rerender(<ClassSeatPrice cents={1200} disabled={false} execute={execute}/>);expect(input).toHaveValue("12,00");
});
