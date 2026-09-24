const DEFAULT_ORIGIN = "https://ricosignal.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = env.APP_ORIGIN || DEFAULT_ORIGIN;
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "whispervault-soundgasm", version: 4 }, 200, headers);
      }

      if (url.pathname === "/api/media-discover" && request.method === "GET") {
        const query = String(url.searchParams.get("query") || "").trim();
        if (!query) return json({ error: "Enter a video search term." }, 400, headers);

        const targets = ["SPE", "SPH", "small penis", "small cock", "tiny penis", "prostate"];
        const sourceDomains = ["pornhub.com", "xvideos.com", "xhamster.com", "xnxx.com", "redgifs.com", "spankbang.com", "eporner.com"];
        const siteClause = sourceDomains.map(d => "site:" + d).join(" OR ");
        const searchQuery = '"' + query.replace(/"/g, "") + '" (' + siteClause + ')';
        const searchUrl = "https://html.duckduckgo.com/html/?kp=-2&q=" + encodeURIComponent(searchQuery);

        const searchRes = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; WhisperVault/3.0; +personal discovery indexer)",
            "Accept": "text/html,application/xhtml+xml"
          },
          cf: { cacheTtl: 900, cacheEverything: false }
        });
        if (!searchRes.ok) return json({ error: "Discovery search returned " + searchRes.status }, 502, headers);

        const searchHtml = await searchRes.text();
        const links = extractSearchResultLinks(searchHtml, sourceDomains).slice(0, 12);
        const inheritedTargets = matchTargets(query, targets);
        const items = [];

        for (const link of links) {
          let meta = null;
          try { meta = await fetchPageMetadata(link); } catch {}
          const title = meta && meta.title ? meta.title : link;
          const description = meta && meta.description ? meta.description : "";
          const tags = meta && meta.tags ? meta.tags : [];
          const matchedTargets = uniqueStrings(inheritedTargets.concat(matchTargets([title, description, tags.join(" ")].join(" "), targets)));
          items.push({
            url: meta && meta.sourceUrl ? meta.sourceUrl : link,
            site: meta && meta.site ? meta.site : new URL(link).hostname.replace(/^www\./, ""),
            title,
            description,
            thumbnail: meta && meta.thumbnail ? meta.thumbnail : "",
            tags,
            matchedTargets
          });
        }

        return json({ query, count: items.length, items }, 200, headers);
      }

      if (url.pathname === "/api/video-discover" && request.method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim().slice(0, 120);
        const requested = String(url.searchParams.get("source") || "all").trim().toLowerCase();
        const limit = Math.max(1, Math.min(80, Number(url.searchParams.get("limit") || 50)));
        if (!q) return json({ error: "Enter a search term." }, 400, headers);

        const configs = videoSources();
        const chosen = requested === "all"
          ? Object.keys(configs)
          : (configs[requested] ? [requested] : []);
        if (!chosen.length) return json({ error: "Unsupported video source." }, 400, headers);

        const items = [];
        const sources = [];
        for (const key of chosen) {
          const cfg = configs[key];
          let sourceCount = 0;
          let sourceError = "";
          try {
            const searchUrl = cfg.search(q);
            const res = await fetch(searchUrl, {
              redirect: "follow",
              headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
                "Accept": "text/html,application/xhtml+xml"
              },
              cf: { cacheTtl: 300, cacheEverything: false }
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const html = await res.text();
            const found = extractVideoLinks(html, res.url || searchUrl, cfg, q, Math.max(8, Math.ceil(limit / chosen.length)));
            sourceCount = found.length;
            for (const item of found) {
              if (items.length >= limit) break;
              if (!items.some(x => x.url === item.url)) items.push(item);
            }
          } catch (e) {
            sourceError = e && e.message ? e.message : "blocked";
          }
          sources.push({ key, name: cfg.name, count: sourceCount, error: sourceError || undefined, searchUrl: cfg.search(q) });
          if (items.length >= limit) break;
        }

        return json({ query: q, count: items.length, items, sources }, 200, headers);
      }

      if (url.pathname === "/api/media-meta" && request.method === "GET") {
        const raw = url.searchParams.get("url") || "";
        const pageUrl = normalizePublicPageUrl(raw);
        if (!pageUrl) return json({ error: "Enter a valid public HTTPS page URL." }, 400, headers);

        const res = await fetch(pageUrl, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; WhisperVault/3.0; +personal metadata indexer)",
            "Accept": "text/html,application/xhtml+xml"
          },
          cf: { cacheTtl: 1800, cacheEverything: false }
        });

        if (!res.ok) return json({ error: "Source site returned " + res.status }, res.status, headers);
        const type = res.headers.get("content-type") || "";
        if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
          return json({ error: "That URL did not return an HTML page." }, 415, headers);
        }
        const len = Number(res.headers.get("content-length") || 0);
        if (len && len > 2500000) return json({ error: "Page is too large to read metadata safely." }, 413, headers);

        const html = await res.text();
        const finalUrl = res.url || pageUrl;
        const title = firstMeta(html, ["og:title", "twitter:title"]) || htmlTitle(html) || finalUrl;
        const description = firstMeta(html, ["og:description", "twitter:description", "description"]) || "";
        const rawThumb = firstMeta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) || "";
        const thumbnail = absolutize(rawThumb, finalUrl);
        const keywords = firstMeta(html, ["keywords"]) || "";
        const tags = uniqueStrings(
          bracketTags(title).concat(bracketTags(description)).concat(
            keywords.split(/[,;]+/).map(x => x.trim()).filter(Boolean)
          )
        ).slice(0, 30);
        const site = new URL(finalUrl).hostname.replace(/^www\./, "");

        return json({
          sourceUrl: finalUrl,
          site,
          title: decode(stripTags(title)).replace(/\s+/g, " ").trim(),
          description: decode(stripTags(description)).replace(/\s+/g, " ").trim().slice(0, 1500),
          thumbnail,
          tags
        }, 200, headers);
      }

      if (url.pathname === "/api/scriptbin-saves" && request.method === "POST") {
        let body = {};
        try { body = await request.json(); } catch {}
        const accessKey = String(body.accessKey || "").trim();
        const targets = Array.isArray(body.targets) && body.targets.length
          ? body.targets.map(x => String(x)).slice(0, 20)
          : ["SPE", "SPH", "small penis", "small cock", "tiny penis", "prostate"];

        if (!accessKey) return json({ error: "Missing Scriptbin API access key." }, 400, headers);

        const sb = await fetch("https://scriptbin.works/api/saves", {
          method: "GET",
          headers: {
            "X-AccessKey": accessKey,
            "User-Agent": "WhisperVault/2.0 (+personal metadata indexer)"
          }
        });

        if (!sb.ok) {
          const msg = sb.status === 401
            ? "Scriptbin rejected that access key."
            : "Scriptbin returned " + sb.status;
          return json({ error: msg }, sb.status, headers);
        }

        const data = await sb.json();
        const saves = Array.isArray(data.saves) ? data.saves : [];
        const items = [];

        for (const s of saves) {
          const title = String(s.titleAndTags || "");
          const matchedTargets = matchTargets(title, targets);
          if (!matchedTargets.length) continue;
          items.push({
            writer: String(s.writer || ""),
            title,
            url: String(s.link || ""),
            description: String(s.description || ""),
            reminder: s.reminder || null,
            tags: bracketTags(title),
            matchedTargets
          });
        }

        return json({ count: items.length, items }, 200, headers);
      }

      if (url.pathname === "/api/profile") {
        const raw = url.searchParams.get("url") || url.searchParams.get("user") || "";
        const profileUrl = normalizeProfile(raw);
        if (!profileUrl) return json({ error: "Enter a valid Soundgasm creator profile URL." }, 400, headers);

        const creator = new URL(profileUrl).pathname.split("/").filter(Boolean)[1];
        const res = await fetch(profileUrl, {
          headers: { "User-Agent": "WhisperVault/1.0 (+personal library indexer)" },
          cf: { cacheTtl: 300, cacheEverything: false }
        });
        if (!res.ok) return json({ error: "Soundgasm returned " + res.status }, res.status, headers);

        const html = await res.text();
        const items = collectProfileItems(html, creator);
        return json({ creator, profileUrl, count: items.length, items }, 200, headers);
      }

      if (url.pathname === "/api/recording") {
        const raw = url.searchParams.get("url") || "";
        const recordingUrl = normalizeRecording(raw);
        if (!recordingUrl) return json({ error: "Enter a valid Soundgasm recording URL." }, 400, headers);

        const res = await fetch(recordingUrl, {
          headers: { "User-Agent": "WhisperVault/1.0 (+personal library player)" },
          cf: { cacheTtl: 600, cacheEverything: false }
        });
        if (!res.ok) return json({ error: "Soundgasm returned " + res.status }, res.status, headers);

        const html = await res.text();
        const path = new URL(recordingUrl).pathname.split("/").filter(Boolean);
        const creator = path[1] || "";
        const fallback = prettySlug(path.slice(2).join("/"));
        const title = decode(stripTags((html.match(/class=["'][^"']*jp-title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [,""])[1]).trim()) || fallback;
        const descriptionHtml = (html.match(/class=["'][^"']*jp-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) || [,""])[1];
        const description = decode(stripTags(descriptionHtml).replace(/\s+/g, " ").trim());
        const media = (html.match(/m4a\s*:\s*["']([^"']+)["']/i) || html.match(/mp3\s*:\s*["']([^"']+)["']/i) || [,""])[1];

        return json({
          creator,
          title,
          description,
          sourceUrl: recordingUrl,
          mediaUrl: media || null,
          category: inferCategory(title),
          tags: inferTags(title)
        }, 200, headers);
      }

      return json({ error: "Not found" }, 404, headers);
    } catch (err) {
      return json({ error: err && err.message ? err.message : "Unexpected worker error" }, 500, headers);
    }
  }
};

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers });
}

function isAllowedDiscoveryHost(host, domains) {
  host = String(host || "").toLowerCase();
  return domains.some(d => host === d || host.endsWith("." + d));
}

function extractSearchResultLinks(html, domains) {
  const out = [];
  const seen = new Set();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    let href = decode(m[1]).trim();
    try {
      if (href.startsWith("//")) href = "https:" + href;
      let u = new URL(href, "https://duckduckgo.com");
      if (/duckduckgo\.com$/i.test(u.hostname) && u.pathname.startsWith("/l/")) {
        const uddg = u.searchParams.get("uddg");
        if (uddg) u = new URL(uddg);
      }
      if (u.protocol !== "https:" || !isAllowedDiscoveryHost(u.hostname, domains)) continue;
      u.hash = "";
      const clean = u.toString();
      if (seen.has(clean)) continue;
      seen.add(clean);
      out.push(clean);
    } catch {}
  }
  return out;
}

async function fetchPageMetadata(raw) {
  const pageUrl = normalizePublicPageUrl(raw);
  if (!pageUrl) throw new Error("Invalid public page URL");
  const res = await fetch(pageUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WhisperVault/3.0; +personal metadata indexer)",
      "Accept": "text/html,application/xhtml+xml"
    },
    cf: { cacheTtl: 1800, cacheEverything: false }
  });
  if (!res.ok) throw new Error("Source returned " + res.status);
  const type = res.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("Not an HTML page");
  const len = Number(res.headers.get("content-length") || 0);
  if (len && len > 2500000) throw new Error("Page too large");
  const html = await res.text();
  const finalUrl = res.url || pageUrl;
  const title = firstMeta(html, ["og:title", "twitter:title"]) || htmlTitle(html) || finalUrl;
  const description = firstMeta(html, ["og:description", "twitter:description", "description"]) || "";
  const rawThumb = firstMeta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) || "";
  const keywords = firstMeta(html, ["keywords"]) || "";
  return {
    sourceUrl: finalUrl,
    site: new URL(finalUrl).hostname.replace(/^www\./, ""),
    title: decode(stripTags(title)).replace(/\s+/g, " ").trim(),
    description: decode(stripTags(description)).replace(/\s+/g, " ").trim().slice(0, 1500),
    thumbnail: absolutize(rawThumb, finalUrl),
    tags: uniqueStrings(bracketTags(title).concat(bracketTags(description)).concat(keywords.split(/[,;]+/).map(x => x.trim()).filter(Boolean))).slice(0, 30)
  };
}

function videoSources() {
  return {
    pornhub: {
      name: "Pornhub",
      search: q => "https://www.pornhub.com/video/search?search=" + encodeURIComponent(q).replace(/%20/g, "+"),
      allow: u => /(^|\.)pornhub\.com$/i.test(u.hostname) && /\/view_video\.php/i.test(u.pathname)
    },
    xvideos: {
      name: "XVideos",
      search: q => "https://www.xvideos.com/?k=" + encodeURIComponent(q).replace(/%20/g, "+"),
      allow: u => /(^|\.)xvideos\.com$/i.test(u.hostname) && /^\/video/i.test(u.pathname)
    },
    xnxx: {
      name: "XNXX",
      search: q => "https://www.xnxx.com/search/" + encodeURIComponent(q),
      allow: u => /(^|\.)xnxx\.com$/i.test(u.hostname) && /^\/video/i.test(u.pathname)
    },
    xhamster: {
      name: "xHamster",
      search: q => "https://xhamster.com/search/" + encodeURIComponent(q),
      allow: u => /(^|\.)xhamster\.com$/i.test(u.hostname) && /\/videos\//i.test(u.pathname)
    },
    spankbang: {
      name: "SpankBang",
      search: q => "https://spankbang.com/s/" + encodeURIComponent(q).replace(/%20/g, "+") + "/",
      allow: u => /(^|\.)spankbang\.com$/i.test(u.hostname) && /\/video\//i.test(u.pathname)
    }
  };
}

function attrValue(attrs, names) {
  for (const name of names) {
    const re = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]", "i");
    const m = re.exec(attrs || "");
    if (m && m[1]) return decode(m[1]);
  }
  return "";
}

function extractVideoLinks(html, baseUrl, cfg, query, limit) {
  const out = [];
  const seen = new Set();
  const re = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    let u;
    try { u = new URL(decode(m[2]), baseUrl); } catch { continue; }
    if (!cfg.allow(u)) continue;
    u.hash = "";
    const clean = u.toString();
    if (seen.has(clean)) continue;

    const attrs = String(m[1] || "") + " " + String(m[3] || "");
    const inner = String(m[4] || "");
    const img = /<img\b([^>]*)>/i.exec(inner);
    const imgAttrs = img ? img[1] : "";
    const title =
      attrValue(attrs, ["title", "aria-label"]) ||
      attrValue(imgAttrs, ["alt", "title"]) ||
      decode(stripTags(inner)).replace(/\s+/g, " ").trim();
    let thumb =
      attrValue(imgAttrs, ["data-src", "data-original", "data-thumb_url", "data-thumb", "src"]);
    thumb = absolutize(thumb, baseUrl);

    if (!title && !thumb) continue;
    seen.add(clean);
    out.push({
      url: clean,
      site: cfg.name,
      title: title || query,
      thumbnail: thumb || "",
      description: "",
      tags: [query]
    });
  }
  return out;
}

function normalizePublicPageUrl(raw) {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const p = h.split(".").map(Number);
      if (p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31)) return null;
    }
    if (h.includes(":")) return null;
    u.hash = "";
    return u.toString();
  } catch { return null; }
}

function regexEscape(s) {
  return String(s).replace(/[.*+?^$()|[\]\\]/g, "\\function normalizeProfile(raw) {");
}

function firstMeta(html, names) {
  for (const name of names) {
    const escaped = regexEscape(name);
    const a = new RegExp("<meta\\b[^>]*(?:property|name)=[\\\"']" + escaped + "[\\\"'][^>]*content=[\\\"']([^\\\"']*)[\\\"'][^>]*>", "i").exec(html);
    if (a && a[1]) return decode(a[1]);
    const b = new RegExp("<meta\\b[^>]*content=[\\\"']([^\\\"']*)[\\\"'][^>]*(?:property|name)=[\\\"']" + escaped + "[\\\"'][^>]*>", "i").exec(html);
    if (b && b[1]) return decode(b[1]);
  }
  return "";
}

function htmlTitle(html) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decode(stripTags(m[1])) : "";
}

function absolutize(value, base) {
  if (!value) return "";
  try { return new URL(decode(value), base).toString(); } catch { return ""; }
}

function uniqueStrings(values) {
  return [...new Set(values.map(x => String(x || "").trim()).filter(Boolean))];
}

function normalizeProfile(raw) {
  try {
    if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = "https://soundgasm.net/u/" + raw.replace(/^@/,"");
    const u = new URL(raw);
    if (!/(^|\.)soundgasm\.net$/i.test(u.hostname)) return null;
    const p = u.pathname.split("/").filter(Boolean);
    if (p[0] !== "u" || !p[1]) return null;
    return "https://soundgasm.net/u/" + encodeURIComponent(decodeURIComponent(p[1]));
  } catch { return null; }
}

function normalizeRecording(raw) {
  try {
    const u = new URL(raw);
    if (!/(^|\.)soundgasm\.net$/i.test(u.hostname)) return null;
    const p = u.pathname.split("/").filter(Boolean);
    if (p[0] !== "u" || !p[1] || !p[2]) return null;
    return "https://soundgasm.net/" + p.map(encodeURIComponentSafe).join("/");
  } catch { return null; }
}

function encodeURIComponentSafe(s) {
  try { return encodeURIComponent(decodeURIComponent(s)); } catch { return encodeURIComponent(s); }
}

function collectProfileItems(html, creator) {
  const base = "https://soundgasm.net";
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    let href = decode(m[1]).trim();
    if (href.startsWith("/")) href = base + href;
    if (!/^https:\/\/soundgasm\.net\/u\//i.test(href)) continue;
    let u;
    try { u = new URL(href); } catch { continue; }
    const p = u.pathname.split("/").filter(Boolean);
    if (p[0] !== "u" || p[1] !== creator || !p[2]) continue;
    const clean = "https://soundgasm.net" + u.pathname;
    if (seen.has(clean)) continue;
    seen.add(clean);
    const anchorText = decode(stripTags(m[2]).replace(/\s+/g, " ").trim());
    const title = anchorText || prettySlug(p.slice(2).join("/"));
    out.push({
      url: clean,
      author: creator,
      title,
      category: inferCategory(title),
      tags: inferTags(title)
    });
  }
  return out;
}

function prettySlug(slug) {
  try { slug = decodeURIComponent(slug); } catch {}
  return String(slug || "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function inferCategory(title) {
  const m = String(title || "").match(/\b(F4M|M4F|F4F|M4M|F4A|M4A|A4A)\b/i);
  return m ? m[1].toUpperCase() : "Soundgasm";
}

function inferTags(title) {
  const text = String(title || "");
  const tags = ["Soundgasm"];
  const patterns = [
    ["ASMR", /\basmr\b/i],
    ["Romance", /\bromanc|romantic|girlfriend|boyfriend\b/i],
    ["Comfort", /\bcomfort|reassur|cuddle|sleep\b/i],
    ["Roleplay", /\broleplay|role play\b/i],
    ["Script Fill", /\bscript\s*fill\b/i],
    ["SFX", /\bsfx\b/i]
  ];
  for (const [name, rx] of patterns) if (rx.test(text)) tags.push(name);
  const cat = inferCategory(text);
  if (cat !== "Soundgasm") tags.push(cat);
  return [...new Set(tags)];
}

function normalizeText(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchTargets(text, targets) {
  const n = normalizeText(text);
  return targets.filter(t => n.includes(normalizeText(t)));
}

function bracketTags(text) {
  const out = [];
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(String(text || "")))) {
    const v = String(m[1] || "").trim().replace(/\s+/g, " ");
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

function stripTags(s) {
  return String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ");
}

function decode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/");
}
