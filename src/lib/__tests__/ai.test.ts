import { describe, it, expect } from "vitest";

import { isLocalOrInsecureEndpoint } from "@/lib/ai";

describe("isLocalOrInsecureEndpoint", () => {
  it("flags any http:// endpoint (mixed content on an https site)", () => {
    expect(isLocalOrInsecureEndpoint("http://example.com/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("http://localhost:11434/v1")).toBe(true);
  });

  it("flags localhost and private-LAN hosts even over https", () => {
    expect(isLocalOrInsecureEndpoint("https://localhost:11434/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("https://127.0.0.1/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("https://192.168.1.50:1234/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("https://10.0.0.5/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("https://172.16.0.9/v1")).toBe(true);
    expect(isLocalOrInsecureEndpoint("https://my-box.local/v1")).toBe(true);
  });

  it("passes cloud https providers", () => {
    expect(isLocalOrInsecureEndpoint("https://generativelanguage.googleapis.com/v1beta/openai")).toBe(false);
    expect(isLocalOrInsecureEndpoint("https://inference-api.nousresearch.com/v1")).toBe(false);
  });

  it("does not flag a public IP that merely starts with 17 but isn't private", () => {
    expect(isLocalOrInsecureEndpoint("https://172.15.0.1/v1")).toBe(false);
    expect(isLocalOrInsecureEndpoint("https://172.32.0.1/v1")).toBe(false);
  });

  it("treats blank/garbage as not-flagged (nothing to warn about yet)", () => {
    expect(isLocalOrInsecureEndpoint("")).toBe(false);
    expect(isLocalOrInsecureEndpoint("not a url")).toBe(false);
  });
});
