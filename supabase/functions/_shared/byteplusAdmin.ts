import { requiredEnvironment } from "./audioPairing.ts";

const encode = new TextEncoder();
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
async function hash(value: string) { return hex(await crypto.subtle.digest("SHA-256",encode.encode(value))); }
async function hmac(key: Uint8Array, value: string) {
  const imported=await crypto.subtle.importKey("raw",new Uint8Array(key),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",imported,encode.encode(value)));
}

/** RTC OpenAPI uses IAM access keys, never the client RTC AppKey. */
export class BytePlusAdmin {
  readonly appId=requiredEnvironment("BYTEPLUS_RTC_APP_ID");
  private readonly accessKey=requiredEnvironment("BYTEPLUS_ACCESS_KEY_ID");
  private readonly secret=requiredEnvironment("BYTEPLUS_SECRET_ACCESS_KEY");
  private readonly region=requiredEnvironment("BYTEPLUS_RTC_REGION");
  async call(action: "BanRoomUser"|"UpdateBanRoomUserRule"|"LimitTokenPrivilege", value: Record<string,unknown>) {
    const body=JSON.stringify({AppId:this.appId,...value});
    const query=`Action=${action}&Version=2023-11-01`;
    const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,"");
    const day=date.slice(0,8), scope=`${day}/${this.region}/rtc/request`;
    const digest=await hash(body);
    const signed="content-type;host;x-content-sha256;x-date";
    const canonical=`POST\n/\n${query}\ncontent-type:application/json\nhost:open.byteplusapi.com\nx-content-sha256:${digest}\nx-date:${date}\n\n${signed}\n${digest}`;
    let key=await hmac(encode.encode(this.secret),day);
    key=await hmac(key,this.region);key=await hmac(key,"rtc");key=await hmac(key,"request");
    const signature=hex((await hmac(key,`HMAC-SHA256\n${date}\n${scope}\n${await hash(canonical)}`)).buffer as ArrayBuffer);
    const response=await fetch(`https://open.byteplusapi.com/?${query}`,{
      method:"POST",headers:{"Content-Type":"application/json","X-Date":date,"X-Content-Sha256":digest,
        "Authorization":`HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`},
      body, signal:AbortSignal.timeout(15_000),
    });
    const result=await response.json().catch(()=>null);
    if(!response.ok || !result || result.ResponseMetadata?.Error) {
      // Never put tokens, signed requests, credentials or remote bodies in logs.
      const code=String(result?.ResponseMetadata?.Error?.Code ?? response.status).replace(/[^A-Za-z0-9_.-]/g,"").slice(0,80);
      throw Object.assign(new Error(`BytePlus ${action}: ${code}`),{code,status:response.status});
    }
    if (String(result.Result?.Message ?? result.Result?.message ?? "").toLowerCase() !== "success") throw new Error(`BytePlus ${action}: operation_not_confirmed`);
    return result.Result;
  }
  deleteRoom(roomName: string) { return this.call("BanRoomUser",{RoomId:roomName,ForbiddenInterval:150}); }
  removeParticipant(roomName: string,identity:string) { return this.call("BanRoomUser",{RoomId:roomName,UserId:identity,ForbiddenInterval:150}); }
  clearBan(roomName:string,identity:string) { return this.call("UpdateBanRoomUserRule",{RoomId:roomName,UserId:identity,ForbiddenInterval:0}); }
  revokePublication(roomName:string,identity:string,token:string) { return this.call("LimitTokenPrivilege",{RoomId:roomName,UserId:identity,Token:token,ForbiddenInterval:150}); }
}
