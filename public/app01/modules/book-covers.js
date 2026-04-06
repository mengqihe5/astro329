const coverLookupCache = new Map();

function parseCoverCandidates(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const rows = [];
    for (const item of parsed) {
      const value = String(item || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      rows.push(value);
    }
    return rows;
  } catch {
    return [];
  }
}

async function resolveOnlineCover(lookupUrl) {
  const key = String(lookupUrl || "").trim();
  if (!key) return "";
  if (coverLookupCache.has(key)) return coverLookupCache.get(key);

  try {
    const response = await fetch(key, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      coverLookupCache.set(key, "");
      return "";
    }
    const payload = await response.json();
    const imageUrl = String(payload?.imageUrl || "").trim();
    coverLookupCache.set(key, imageUrl);
    return imageUrl;
  } catch {
    coverLookupCache.set(key, "");
    return "";
  }
}

function bindBookCover(img) {
  const candidates = parseCoverCandidates(img.dataset.coverCandidates);
  const fallbackSrc = String(img.dataset.coverFallback || "/app01/book-covers/default-book.svg").trim();
  const lookupUrl = String(img.dataset.coverLookupUrl || "").trim();

  let nextIndex = 0;
  const currentSrc = String(img.getAttribute("src") || "").trim();
  const currentIndex = candidates.indexOf(currentSrc);
  if (currentIndex >= 0) {
    nextIndex = currentIndex + 1;
  }

  let resolvingOnline = false;
  const applyFallback = () => {
    if (!fallbackSrc) return;
    if (img.getAttribute("src") === fallbackSrc) return;
    img.src = fallbackSrc;
  };

  const handleError = () => {
    if (nextIndex < candidates.length) {
      const nextSrc = candidates[nextIndex];
      nextIndex += 1;
      if (nextSrc) {
        img.src = nextSrc;
        return;
      }
    }

    if (img.dataset.onlineTried === "1") {
      applyFallback();
      return;
    }

    if (resolvingOnline) return;
    resolvingOnline = true;

    resolveOnlineCover(lookupUrl)
      .then((onlineUrl) => {
        img.dataset.onlineTried = "1";
        if (onlineUrl) {
          img.src = onlineUrl;
          return;
        }
        applyFallback();
      })
      .catch(() => {
        img.dataset.onlineTried = "1";
        applyFallback();
      })
      .finally(() => {
        resolvingOnline = false;
      });
  };

  img.addEventListener("error", handleError);
  if (img.complete && img.naturalWidth === 0) {
    handleError();
  }
}

export function initBookCoverFallback() {
  const images = document.querySelectorAll("img[data-book-cover='1']");
  for (const image of images) {
    if (!(image instanceof HTMLImageElement)) continue;
    if (image.dataset.coverBound === "1") continue;
    image.dataset.coverBound = "1";
    bindBookCover(image);
  }
}
