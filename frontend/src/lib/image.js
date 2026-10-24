// Réduit une photo avant l'envoi : moins de données mobiles pour le gérant et une base plus légère.
// Une photo de reçu de 4 Mo passe à ~150 Ko, toujours lisible.
export async function compresserImage(fichier, { cote = 1400, qualite = 0.7, type = 'image/jpeg' } = {}) {
  if (!fichier || !fichier.type.startsWith('image/')) return fichier;
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const echelle = Math.min(1, cote / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * echelle);
    canvas.height = Math.round(img.naturalHeight * echelle);
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok) => canvas.toBlob(ok, type, qualite));
    if (!blob || blob.size >= fichier.size) return fichier;
    const nom = fichier.name.replace(/\.\w+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], nom, { type });
  } catch {
    return fichier;
  } finally {
    URL.revokeObjectURL(url);
  }
}
