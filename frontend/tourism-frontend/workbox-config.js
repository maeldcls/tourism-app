module.exports = {
  // Dossier source contenant les fichiers buildés
  globDirectory: 'build/',

  // Fichiers à mettre en cache (tous les fichiers statiques)
  globPatterns: [
    '**/*.{json,ico,html,png,jpg,jpeg,svg,gif,webp,woff,woff2,ttf,eot,css,js}'
  ],

  // Fichier service worker à générer
  swDest: 'build/service-worker.js',

  // Ignorer les fichiers trop gros ou inutiles
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB max

  // Configuration du service worker
  clientsClaim: true,
  skipWaiting: true,

  // Stratégies de cache
  runtimeCaching: [
    {
      // Cache les images avec stratégie Cache First
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
        },
      },
    },
    {
      // Cache les tuiles de carte (OpenStreetMap) avec stratégie Cache First
      urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'map-tiles',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
        },
      },
    },
    {
      // Cache les requêtes API avec stratégie Network First
      // (essaie le réseau d'abord, puis le cache si hors-ligne)
      urlPattern: /^http:\/\/localhost:8000\/api\/.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
      },
    },
  ],
};
