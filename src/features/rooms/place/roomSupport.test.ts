import { describe, expect, it } from "vitest";
import { createDemoSupportWallet, getRoomSupportWallet, parseSupportAmount, splitSupportAmount } from "./roomSupport";

describe("Rooms support amounts", () => {
  it("parses French decimals exactly and rejects invalid monetary inputs", () => {
    expect(parseSupportAmount("10,01")).toBe(1001);
    expect(parseSupportAmount("0.29")).toBe(29);
    for (const value of ["", "-1", "0", "1,234", "1e3", "Infinity", "1.2.3"]) expect(parseSupportAmount(value)).toBeNull();
  });
  it("keeps the exact budget when dividing into five or three throws", () => {
    expect(splitSupportAmount(1000, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(splitSupportAmount(1000, 3)).toEqual([334, 333, 333]);
    expect(splitSupportAmount(1001, 2)).toEqual([501, 500]);
    expect(() => splitSupportAmount(2, 5)).toThrow();
  });
});

describe("Rooms demo support ledger", () => {
  it("never overdraws or repeats a debit when retrying an operation", async () => {
    const wallet = createDemoSupportWallet(200);
    await wallet.send(200, "host", "throw-1");
    await wallet.send(200, "host", "throw-1");
    expect(wallet.getBalance()).toBe(0);
    await expect(wallet.send(1, "host", "throw-2")).rejects.toThrow();
    await expect(wallet.send(200, "other-host", "throw-1")).rejects.toThrow();
    expect(wallet.getBalance()).toBe(0);
  });
  it("credits once, then only debits the throws explicitly requested", async () => {
    const wallet = createDemoSupportWallet(0);
    await wallet.addFunds(1000, "topup");
    await wallet.addFunds(1000, "topup");
    await wallet.send(200, "host", "throw-1");
    expect(wallet.getBalance()).toBe(800);
    await expect(wallet.addFunds(-100, "negative")).rejects.toThrow();
    await expect(wallet.send(NaN, "host", "nan")).rejects.toThrow();
    expect(wallet.getBalance()).toBe(800);
  });
  it("does not expose demo funds or simulate success in a live room", async () => {
    const wallet = getRoomSupportWallet("live", "viewer");
    expect(wallet.getBalance()).toBeNull();
    await expect(wallet.addFunds(1000, "topup")).rejects.toThrow();
    await expect(wallet.send(100, "host", "throw")).rejects.toThrow();
  });
});
