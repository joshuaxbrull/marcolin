// Keep card attribution when someone visits the contact page from the QR finder.
if (new URLSearchParams(location.search).get('entry') === 'card') {
  for (const link of document.querySelectorAll('[data-finder]')) {
    const url = new URL(link.href); url.searchParams.set('entry', 'card'); link.href = url.href;
  }
}
// A single decorative reveal settles into the same layout as the static fallback.
// No scroll handler, hidden content, animation loop, or blocking intro.
const card = document.querySelector('.profile-card');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const connection = navigator.connection;
const constrained = () => reduced.matches || connection?.saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
let seen = false;
try { seen = sessionStorage.getItem('marcolin-card-seen') === '1'; } catch {}
function settle() { card?.classList.remove('reveal'); }
if (card && !seen && !constrained() && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    if (constrained()) return;
    try { sessionStorage.setItem('marcolin-card-seen', '1'); } catch {}
    card.classList.add('reveal');
    card.addEventListener('animationend', settle, {once: true});
  }, {threshold: .2});
  observer.observe(card);
  reduced.addEventListener('change', () => { if (reduced.matches) { observer.disconnect(); settle(); } });
  connection?.addEventListener?.('change', () => { if (constrained()) { observer.disconnect(); settle(); } });
}
