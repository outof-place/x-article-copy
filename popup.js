const $ = (id) => document.getElementById(id);
const preview = $("preview");
const copyBtn = $("copy");
const saveBtn = $("save");

let docTitle = "";

function setStatus(msg, kind) {
  const s = $("status");
  s.textContent = msg;
  s.className = kind || "";
}

function setEnabled(on) {
  copyBtn.disabled = !on;
  saveBtn.disabled = !on;
}

function slug(text) {
  return (text || "x-article")
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "x-article";
}

function filenameFromContent() {
  const m = preview.value.match(/^#\s+(.+)$/m);
  return slug(m ? m[1] : docTitle) + ".md";
}

async function load() {
  setEnabled(false);
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    setStatus("Nie mogę odczytać aktywnej karty", "err");
    return;
  }
  if (!tab || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) {
    setStatus("Otwórz stronę x.com / twitter.com", "err");
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "X_ARTICLE_GET" });
    if (!res || !res.ok) throw new Error((res && res.error) || "brak treści");
    docTitle = res.title || "";
    preview.value = res.md || "";
    setEnabled(!!res.md);
    setStatus(`Gotowe — ${preview.value.length} znaków (możesz edytować)`, "ok");
  } catch {
    setStatus("Odśwież stronę X i otwórz wtyczkę ponownie", "err");
  }
}

async function copy() {
  const text = preview.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Skopiowano do schowka ✓", "ok");
  } catch {
    preview.focus();
    preview.select();
    const ok = document.execCommand("copy");
    setStatus(ok ? "Skopiowano do schowka ✓" : "Kopiowanie nie powiodło się", ok ? "ok" : "err");
  }
}

function save() {
  const text = preview.value;
  if (!text) return;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameFromContent();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Zapisano: ${a.download} ✓`, "ok");
}

copyBtn.addEventListener("click", copy);
saveBtn.addEventListener("click", save);
load();
