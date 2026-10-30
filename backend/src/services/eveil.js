// Offre gratuite de Render : l'API s'endort après 15 minutes sans visite et met plus d'une minute à repartir.
// Elle s'appelle donc elle-même par son adresse publique pendant la journée (Ouagadougou est à l'heure UTC).
// La nuit, elle peut s'endormir : Render offre 750 h par mois, partagées entre les services gratuits du compte.
// /api/sante ne touche pas à la base : ces appels ne consomment pas le quota de Neon.
const INTERVALLE = 10 * 60 * 1000;
const DEBUT = 6, FIN = 23;

const enJournee = (date = new Date()) => date.getUTCHours() >= DEBUT && date.getUTCHours() < FIN;

// RENDER_EXTERNAL_URL est fournie par Render : rien ne tourne en local.
function demarrerEveil(adresse = process.env.RENDER_EXTERNAL_URL) {
  if (!adresse) return null;
  const appeler = () => {
    if (!enJournee()) return;
    fetch(adresse + '/api/sante', { signal: AbortSignal.timeout(30000) }).catch(e => console.error('Éveil :', e.message));
  };
  return setInterval(appeler, INTERVALLE);
}

module.exports = { enJournee, demarrerEveil };
