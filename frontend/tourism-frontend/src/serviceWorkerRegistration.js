// Ce code est standard pour les Progressive Web Apps (PWA)
// Il permet d'enregistrer un Service Worker pour mettre en cache les fichiers
// et permettre à  l'app de fonctionner hors-ligne

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

export function register(config) {
  // Le Service Worker ne fonctionne qu'en mode production (après npm run build)
  // En développement (npm start), il est désactivé pour ne pas interférer avec le hot-reload
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    const publicUrl = new URL(process.env.PUBLIC_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        // Mode localhost : vérifie si le service worker existe
        checkValidServiceWorker(swUrl, config);

        navigator.serviceWorker.ready.then(() => {
          console.log(
            'Cette application web est servie en mode cache-first par un service ' +
              'worker. Pour en savoir plus : https://cra.link/PWA'
          );
        });
      } else {
        // Mode production : enregistre directement le service worker
        registerValidSW(swUrl, config);
      }
    });
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      // Vérifie les mises à jour toutes les heures
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // Nouvelle version disponible ! Le contenu a été pré-caché.
              // Parfait pour afficher un message "Nouvelle version disponible, rafraîchir ?"
              console.log(
                'Nouveau contenu disponible. Rafraîchissez la page pour voir les changements.'
              );

              // Exécute le callback si fourni
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            } else {
              // Tout est caché pour la première fois !
              console.log('Contenu caché pour utilisation hors-ligne.');

              // Exécute le callback si fourni
              if (config && config.onSuccess) {
                config.onSuccess(registration);
              }
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Erreur lors de l\'enregistrement du service worker:', error);
    });
}

function checkValidServiceWorker(swUrl, config) {
  // Vérifie si le service worker existe réellement
  fetch(swUrl, {
    headers: { 'Service-Worker': 'script' },
  })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf('javascript') === -1)
      ) {
        // Service worker introuvable. Probablement une app différente. Recharge la page.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        // Service worker trouvé. Procède normalement.
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('Pas de connexion Internet. L\'app fonctionne en mode hors-ligne.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
