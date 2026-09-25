type DemoMessage={id:string;senderId:string;recipientId:string;body:string};
const eventName="meewav:classe:private-message";
const key=(roomId:string)=>`meewav:classe:messages:${roomId}`;
export function readClassroomDemoMessages(roomId:string):DemoMessage[]{try{return JSON.parse(localStorage.getItem(key(roomId))??"[]");}catch{return [];}}
export function appendClassroomDemoMessage(roomId:string,senderId:string,recipientId:string,body:string){
  const messages=readClassroomDemoMessages(roomId);
  messages.push({id:crypto.randomUUID(),senderId,recipientId,body});
  localStorage.setItem(key(roomId),JSON.stringify(messages.slice(-80)));
  window.dispatchEvent(new Event(eventName));
}
export function subscribeClassroomDemoMessages(listener:()=>void){window.addEventListener(eventName,listener);window.addEventListener("storage",listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener("storage",listener);};}
