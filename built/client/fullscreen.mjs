const toggle = document.getElementById('fullscreenToggle');
let ownsNativeFullscreen = false;
let savedScrollY = 0;
const active = () => document.body.classList.contains('portfolio-fullscreen');

function setView(enabled) {
  if (active() === enabled) return;
  if (enabled) savedScrollY = window.scrollY;
  document.body.classList.toggle('portfolio-fullscreen', enabled);
  toggle.textContent = enabled ? 'Exit full screen' : 'Full screen';
  toggle.setAttribute('aria-pressed', String(enabled));
  if (!enabled) {
    window.scrollTo({ top: savedScrollY, behavior: 'instant' });
    toggle.focus({ preventScroll: true });
  }
}

toggle.addEventListener('click', async () => {
  toggle.disabled = true;
  try {
    if (active()) {
      if (ownsNativeFullscreen && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch { /* Restore the page view below. */ }
      }
      ownsNativeFullscreen = false;
      setView(false);
    } else {
      setView(true);
      // Fullscreen the document so application detail and comparison dialogs remain visible.
      // The viewport-sized layout also works where native fullscreen is unavailable.
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        try {
          await document.documentElement.requestFullscreen();
          ownsNativeFullscreen = document.fullscreenElement === document.documentElement;
        } catch { /* Keep the expanded viewport layout. */ }
      }
    }
  } finally {
    toggle.disabled = false;
  }
});

document.addEventListener('fullscreenchange', () => {
  if (ownsNativeFullscreen && !document.fullscreenElement) {
    ownsNativeFullscreen = false;
    setView(false);
  }
});

async function exitForNavigation() {
  if (!active()) return;
  if (ownsNativeFullscreen && document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch { /* Restore the page view below. */ }
  }
  ownsNativeFullscreen = false;
  setView(false);
}

document.getElementById('workspaceNav').addEventListener('click', event => {
  if (event.target.closest('button')) void exitForNavigation();
});
window.addEventListener('popstate', () => void exitForNavigation());

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && active() && !document.fullscreenElement && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    setView(false);
  }
});
