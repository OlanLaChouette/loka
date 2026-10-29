// Outils d'animation communs aux vidéos de campagne : une timeline GSAP en pause, pilotée image par image
// par video/render.mjs (window.seek). T vient de donnees.js (scènes minutées sur la voix off).
gsap.config({ force3D: false });   // sans calques 3D : les ombres ne sont plus découpées en rectangles
const tl = gsap.timeline({ paused: true });
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = T.scenes;
const E = 'power3.out';

// Scène i : apparaît en fondu par-dessus la précédente, qui disparaît une fois recouverte.
function scene(i, el) {
  const s = S[i], fin = s.debut + s.duree;
  el.style.zIndex = 10 + i;
  if (i === 0) tl.set(el, { opacity: 1 }, 0);
  else tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: .4, ease: 'power1.inOut' }, s.debut - .2);
  if (i < S.length - 1) tl.set(el, { opacity: 0 }, fin + .3);
  return s;
}
// Mouvement de caméra lent sur une photo plein cadre.
function camera(el, t, d, de, vers) {
  tl.fromTo(el, { scale: de.s, xPercent: de.x || 0, yPercent: de.y || 0 }, { scale: vers.s, xPercent: vers.x || 0, yPercent: vers.y || 0, duration: d, ease: 'none' }, t);
}
// Titre découpé en lignes (.ligne > span) qui montent de leur masque.
function lignes(el, t, ecart = .12, d = .7) {
  tl.fromTo($$('.ligne > span', el), { yPercent: 115 }, { yPercent: 0, duration: d, ease: 'power4.out', stagger: ecart }, t);
  tl.set(el, { opacity: 1 }, t);
}
function sortir(el, t, d = .35) { tl.to(el, { opacity: 0, y: -30, duration: d, ease: 'power2.in' }, t); }
// Élément qui surgit (puce, carte, notification).
function surgir(el, t, de = { y: 60, scale: .85 }, d = .6) {
  tl.fromTo(el, { opacity: 0, ...de }, { opacity: 1, x: 0, y: 0, scale: 1, rotation: el.dataset.r || 0, duration: d, ease: 'back.out(1.6)' }, t);
}
// Écrans d'un téléphone : n° k visible à l'instant t, glissé comme un défilement (sens 1 = vers le haut).
function ecran(tel, k, t, sens = 1) {
  const imgs = $$('.ecran img', tel);
  imgs.forEach((im, j) => {
    if (j === k) tl.fromTo(im, { opacity: j ? 0 : 1, yPercent: j ? 18 * sens : 0 }, { opacity: 1, yPercent: 0, duration: .55, ease: E }, t);
    else if (j < k) tl.to(im, { opacity: 0, yPercent: -12 * sens, duration: .45, ease: 'power2.in' }, t);
  });
}
// Appui du doigt au point (x, y) en % de l'écran du téléphone.
function appui(tel, x, y, t) {
  const d = $('.doigt', tel), o = $('.onde', tel);
  tl.set(d, { left: x + '%', top: y + '%', xPercent: -33, yPercent: -8, transformOrigin: '33% 8%' }, 0);
  tl.set(o, { left: x + '%', top: y + '%' }, 0);
  tl.fromTo(d, { opacity: 0, x: 140, y: 220, scale: 1 }, { opacity: 1, x: 0, y: 0, duration: .55, ease: E }, t - .65);
  tl.to(d, { scale: .86, duration: .1, yoyo: true, repeat: 1 }, t - .05);
  tl.fromTo(o, { opacity: .95, scale: .3 }, { opacity: 0, scale: 1.7, duration: .6, ease: 'power2.out' }, t);
  tl.to(d, { opacity: 0, x: 120, y: 160, duration: .4, ease: 'power2.in' }, t + .45);
}
function finir() {
  window.DUREE = T.duree;
  window.TAILLE = window.TAILLE || { largeur: 1080, hauteur: 1920 };
  window.seek = (t) => { tl.seek(t, false); };
  tl.seek(0);
}
