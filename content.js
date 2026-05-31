(() => {
  "use strict";

  // ------------------------------------------------------------------
  // Co pomijamy podczas ekstrakcji (UI X-a, przyciski, ikonki itp.)
  // ------------------------------------------------------------------
  const SKIP_TAGS = new Set([
    "script", "style", "svg", "noscript", "video", "audio", "iframe", "button", "input", "textarea"
  ]);
  const SKIP_TESTIDS = new Set([
    "reply", "retweet", "unretweet", "like", "unlike", "bookmark", "unbookmark",
    "share", "caret", "tweetButton", "tweetButtonInline", "app-text-transition-container",
    "User-Name", "UserAvatar-Container", "socialContext"
  ]);
  // tagi blokowe — sterują tym, czy element traktujemy jako kontener (rekurencja)
  // czy jako "liść" akapitowy (X często renderuje akapity jako <div> pełne <span>-ów).
  const BLOCK_TAGS = new Set([
    "p", "div", "section", "article", "header", "footer", "main", "aside",
    "ul", "ol", "li", "blockquote", "figure", "figcaption", "pre",
    "h1", "h2", "h3", "h4", "h5", "h6", "table", "hr"
  ]);
  const HEADINGS = { h1: "# ", h2: "## ", h3: "### ", h4: "#### ", h5: "##### ", h6: "###### " };

  function shouldSkip(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.has(tag)) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    if (el.getAttribute("role") === "button") return true;
    const tid = el.getAttribute("data-testid");
    if (tid && SKIP_TESTIDS.has(tid)) return true;
    return false;
  }

  function abs(href) {
    if (!href) return "";
    try { return href.startsWith("http") ? href : new URL(href, location.origin).href; }
    catch { return href; }
  }

  function imgMd(el) {
    const altText = el.getAttribute("alt") || "";
    const src = el.currentSrc || el.src || el.getAttribute("src") || "";
    if (!src || src.startsWith("data:")) return "";
    return `![${altText}](${src})`;
  }

  // ---- tekst inline (pogrubienia, kursywy, linki, kod) ----
  function inline(node) {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; return; }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (shouldSkip(child)) return;
      const tag = child.tagName.toLowerCase();
      if (tag === "br") { out += "  \n"; return; }
      if (tag === "img") { const m = imgMd(child); if (m) out += m; return; }
      const inner = inline(child);
      switch (tag) {
        case "strong": case "b": out += inner.trim() ? `**${inner}**` : inner; break;
        case "em": case "i": out += inner.trim() ? `*${inner}*` : inner; break;
        case "code": out += `\`${inner}\``; break;
        case "a": {
          const href = abs(child.getAttribute("href"));
          out += (href && inner.trim()) ? `[${inner}](${href})` : inner;
          break;
        }
        default: out += inner;
      }
    });
    return out;
  }

  function hasBlockChild(el) {
    return Array.from(el.children).some(
      (c) => BLOCK_TAGS.has(c.tagName.toLowerCase()) || hasBlockChild(c)
    );
  }

  function listMd(listEl, ordered, depth) {
    depth = depth || 0;
    const lines = [];
    let i = 1;
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName.toLowerCase() !== "li") return;
      const clone = li.cloneNode(true);
      clone.querySelectorAll(":scope > ul, :scope > ol").forEach((n) => n.remove());
      const text = inline(clone).trim();
      const prefix = "  ".repeat(depth) + (ordered ? `${i++}. ` : "- ");
      if (text) lines.push(prefix + text);
      Array.from(li.children).forEach((c) => {
        const ct = c.tagName.toLowerCase();
        if (ct === "ul" || ct === "ol") lines.push(listMd(c, ct === "ol", depth + 1));
      });
    });
    return lines.join("\n");
  }

  // ---- bloki (akapity, nagłówki, listy, cytaty, obrazy) ----
  function blocks(node, out) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) out.push(t + "\n");
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      if (shouldSkip(child)) return;
      const tag = child.tagName.toLowerCase();

      if (HEADINGS[tag]) {
        const t = inline(child).trim();
        if (t) out.push(HEADINGS[tag] + t + "\n");
        return;
      }
      switch (tag) {
        case "p": {
          const t = inline(child).trim();
          if (t) out.push(t + "\n");
          return;
        }
        case "blockquote": {
          const t = inline(child).trim();
          if (t) out.push(t.split("\n").map((l) => "> " + l).join("\n") + "\n");
          return;
        }
        case "ul": case "ol": {
          const t = listMd(child, tag === "ol");
          if (t) out.push(t + "\n");
          return;
        }
        case "pre": {
          out.push("```\n" + child.textContent.replace(/\n+$/, "") + "\n```\n");
          return;
        }
        case "figure": {
          const img = child.querySelector("img");
          if (img) { const m = imgMd(img); if (m) out.push(m + "\n"); }
          const cap = child.querySelector("figcaption");
          if (cap) { const c = inline(cap).trim(); if (c) out.push("*" + c + "*\n"); }
          return;
        }
        case "img": { const m = imgMd(child); if (m) out.push(m + "\n"); return; }
        case "hr": out.push("---\n"); return;
        default: {
          // div/span/section/itp.: jeśli ma blokowe dzieci -> rekurencja,
          // jeśli to "liść" z tekstem -> traktuj jako akapit (typowy układ X-a).
          if (hasBlockChild(child)) {
            blocks(child, out);
          } else {
            const t = inline(child).trim();
            if (t) out.push(t + "\n");
          }
        }
      }
    });
  }

  // ---- wybór korzenia treści ----
  function findRoot() {
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (primary) {
      const arts = Array.from(primary.querySelectorAll("article"));
      if (arts.length) {
        arts.sort((a, b) => (b.innerText || "").length - (a.innerText || "").length);
        return arts[0];
      }
      return primary;
    }
    return document.querySelector("article") || document.querySelector("main") || document.body;
  }

  // ------------------------------------------------------------------
  // Czyszczenie stopki/UI X-a, które wpada do zrzutu
  // (subskrypcja Premium, data posta, liczba wyświetleń, "Wyświetl cytaty"...)
  // ------------------------------------------------------------------
  const JUNK_LINE = [
    /^chcesz opublikować własny artykuł\??$/i,
    /^want to publish your own article\??$/i,
    /^podnieś poziom subskrypcji.*$/i,
    /^(subscribe to|upgrade to|get)\s+premium.*$/i,
    /^\d{1,2}:\d{2}\s*(am|pm)?\s*·/i,                 // 1:16 PM · 31 maj 2026
    /·\s*\d{1,2}\s+\p{L}+\s+\d{4}\s*$/iu,             // ... · 31 maj 2026
    /^[\d.,\s]*(tys\.?|mln|k|m)?\s*wyświetleń$/i,     // "1 234 wyświetleń" / "wyświetleń"
    /^[\d.,\s]*(k|m)?\s*views$/i,
    /^wyświetl cytaty$/i,
    /^view quotes$/i,
    /^show this thread$/i,
    /^pokaż ten wątek$/i,
  ];

  // zamienia [tekst](url) na sam tekst — żeby testy "śmieciowości" łapały linki
  // typu "[1:16 PM · 31 maj 2026](…)" albo "[Wyświetl cytaty](…)"
  function delink(s) {
    return s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  }

  // etykiety języka, które X wstawia jako osobną linię nad blokiem kodu
  const CODE_LANG = /^(bash|sh|shell|zsh|console|js|javascript|ts|typescript|python|py|json|yaml|yml|html|css|scss|sql|go|rust|java|kotlin|swift|c|cpp|tsx|jsx|xml|toml|ini|diff|md|text|plaintext)$/i;

  function isJunk(line) {
    const l = delink(line).trim();
    if (!l) return false;
    return JUNK_LINE.some((re) => re.test(l));
  }

  function cleanup(md) {
    const lines = md.split("\n");
    const drop = new Array(lines.length).fill(false);
    for (let i = 0; i < lines.length; i++) {
      const l = delink(lines[i]).trim();

      // "bash" / "json" itp. tuż przed ``` — etykieta języka, do wycięcia
      if (CODE_LANG.test(l)) {
        let k = i + 1;
        while (k < lines.length && lines[k].trim() === "") k++;
        if (k < lines.length && /^```/.test(lines[k].trim())) { drop[i] = true; continue; }
      }

      if (!isJunk(lines[i])) continue;
      drop[i] = true;
      // jeśli to "… wyświetleń/views", a tuż nad nią jest sama liczba — też wytnij
      if (/wyświetleń$|views$/i.test(l)) {
        let j = i - 1;
        while (j >= 0 && lines[j].trim() === "") j--;
        if (j >= 0 && /^[\d.,\s]+(tys\.?|mln|k|m)?$/i.test(delink(lines[j]).trim())) drop[j] = true;
      }
    }
    return lines
      .filter((_, i) => !drop[i])
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function docTitle() {
    const t = (document.title || "").trim();
    // X: «(N) handle w serwisie X: „TYTUŁ"» / «name on X: "TYTUŁ"» — wyłuskaj z cudzysłowów
    const q = t.match(/[:：]\s*[“„"«](.+?)[”"»]\s*$/);
    if (q) return q[1].trim();
    return t
      .replace(/\s*[\/|]\s*X$/i, "")
      .replace(/\s+on X\b.*$/i, "")
      .replace(/\s+w serwisie X\b.*$/i, "")
      .trim();
  }

  function buildMarkdown() {
    const root = findRoot();
    const out = [];
    blocks(root, out);
    let body = cleanup(out.join("\n").replace(/\n{3,}/g, "\n\n").trim());
    const title = docTitle();
    // jeśli któraś z pierwszych linii dosłownie powtarza tytuł — usuń ją (trafi jako H1)
    if (title) {
      const bl = body.split("\n");
      let seen = 0;
      for (let i = 0; i < bl.length && seen < 8; i++) {
        if (bl[i].trim() === "") continue;
        seen++;
        if (bl[i].trim() === title) {
          bl.splice(i, 1);
          body = bl.join("\n").replace(/\n{3,}/g, "\n\n").trim();
          break;
        }
      }
    }
    const parts = [];
    if (title && !/^#\s/.test(body)) parts.push("# " + title);
    parts.push("> źródło: " + location.href);
    if (body) parts.push(body);
    return parts.join("\n\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  function toast(msg, isErr) {
    let t = document.getElementById("xac-toast");
    if (!t) { t = document.createElement("div"); t.id = "xac-toast"; document.body.appendChild(t); }
    t.className = isErr ? "err" : "";
    t.textContent = msg;
    t.style.display = "block";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.display = "none"; }, 2600);
  }

  async function doCopy() {
    const md = buildMarkdown();
    if (!md || md.replace(/^[#>].*$/gm, "").trim().length < 5) {
      toast("Nie znalazłem treści artykułu na tej stronie", true);
      return;
    }
    const ok = await copyToClipboard(md);
    toast(ok ? `Skopiowano do schowka (${md.length} znaków)` : "Kopiowanie nie powiodło się", !ok);
  }

  // ---- pływający przycisk ----
  function injectButton() {
    if (document.getElementById("xac-btn")) return;
    const btn = document.createElement("button");
    btn.id = "xac-btn";
    btn.type = "button";
    btn.textContent = "📋 Kopiuj artykuł";
    btn.title = "Skopiuj treść jako Markdown";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      doCopy();
    });
    (document.body || document.documentElement).appendChild(btn);
  }

  // komunikacja z popupem / ikoną wtyczki
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "X_ARTICLE_COPY") { doCopy(); return; }
    if (msg.type === "X_ARTICLE_GET") {
      try { sendResponse({ ok: true, md: buildMarkdown(), title: docTitle() }); }
      catch (e) { sendResponse({ ok: false, error: String(e) }); }
      return; // odpowiedź synchroniczna
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton, { once: true });
  } else {
    injectButton();
  }
})();
