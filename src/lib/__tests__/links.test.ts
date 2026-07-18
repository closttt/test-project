import { describe, it, expect } from "vitest";
import { extractLinks, prettyDomain } from "@/lib/links";

describe("prettyDomain", () => {
  it("strips protocol and www, drops the path", () => {
    expect(prettyDomain("https://www.example.com/a/b?c=1")).toBe("example.com");
  });
  it("keeps subdomains other than www", () => {
    expect(prettyDomain("https://t.me/some_channel/123")).toBe("t.me");
    expect(prettyDomain("https://docs.google.com/x")).toBe("docs.google.com");
  });
  it("degrades gracefully on a non-URL string", () => {
    expect(prettyDomain("not a url")).toBe("not a url");
  });
});

describe("extractLinks", () => {
  it("returns [] for empty/undefined text", () => {
    expect(extractLinks(undefined)).toEqual([]);
    expect(extractLinks("")).toEqual([]);
    expect(extractLinks("no links here")).toEqual([]);
  });

  it("pulls every distinct http(s) link in first-seen order", () => {
    const text = "See https://a.com and http://b.org/path then https://a.com again";
    expect(extractLinks(text)).toEqual([
      { url: "https://a.com", domain: "a.com" },
      { url: "http://b.org/path", domain: "b.org" },
    ]);
  });

  it("trims trailing sentence/markdown punctuation off the URL", () => {
    expect(extractLinks("visit https://example.com.")[0].url).toBe("https://example.com");
    expect(extractLinks("(https://example.com/x)")[0].url).toBe("https://example.com/x");
    expect(extractLinks("тут ссылка https://t.me/foo, дальше текст")[0].url).toBe("https://t.me/foo");
  });

  it("does not treat a bare domain (no protocol) as a link", () => {
    expect(extractLinks("just example.com without protocol")).toEqual([]);
  });
});
