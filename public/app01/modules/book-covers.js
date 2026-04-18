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

function bindBookCover(img) {
  const candidates = parseCoverCandidates(img.dataset.coverCandidates);
  const fallbackSrc = String(img.dataset.coverFallback || "/app01/book-covers/default-book.svg").trim();

  let nextIndex = 0;
  const currentSrc = String(img.getAttribute("src") || "").trim();
  const currentIndex = candidates.indexOf(currentSrc);
  if (currentIndex >= 0) {
    nextIndex = currentIndex + 1;
  }

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
    applyFallback();
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
