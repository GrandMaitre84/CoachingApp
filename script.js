(function initClient(){
  try {
    const params = new URLSearchParams(location.search);

    // ✅ On ne lit PLUS jamais dans localStorage pour choisir le client
    const idRaw = params.get('id') || '';
    const id = (idRaw || '').trim();

    if (id) {
      const key = id.toLowerCase();

      // Si un jour tu veux remapper vers un autre onglet pour un client précis :
      // SHEET_TAB = CLIENT_SHEETS[key] || SHEET_TAB;

      // On peut encore le stocker, mais juste pour info (log, debug, etc.)
      localStorage.setItem('client_id', id);
    }

    // Si pas d'id => pas de client, on reste sur la config par défaut
    window.__CLIENT_ID__ = id || '';
    const tag = document.getElementById('clientTag');
    if (tag) tag.textContent = window.__CLIENT_ID__ || '—';
  } catch(e) {
    console.warn('initClient error', e);
  }
})();
