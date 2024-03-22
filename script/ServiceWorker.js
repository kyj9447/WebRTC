const CACHE_NAME = 'WebRTC Cache v0.1';

// cache 목록 (캐싱할 목록 설정.)
const FilesToCache = [ 
    '/favicon.ico', 
    '/views/stream.html',
    '/views/stream-desktop.css',
    '/views/stream-mobile.css',
    '/script/WebRTC.js'
];

// cache 목록 등록, install상태시 cache 목록을 크롬cache에 저장한다. 
self.addEventListener('install', function(event) { 
    event.waitUntil( 
        caches.open(CACHE_NAME)
        .then(function(cache) { 
            //console.log('Opened cache'); 
            return cache.addAll(FilesToCache); 
        }) 
    ); 
});

// keep fetching the requests from the user 
self.addEventListener('fetch', function(event) { 
    event.respondWith( 
        caches.match(event.request) 
        .then(function(response) { 
            // Cache hit - return response 
            if (response) return response; 
            return fetch(event.request); 
        }) 
    ); 
});

self.addEventListener('activate', function(event) { 
    const cacheWhitelist = []; 
    // add cache names which you do not want to delete 
    cacheWhitelist.push(CACHE_NAME); 
    event.waitUntil( 
        caches.keys().then(function(cacheNames) { 
            return Promise.all( 
                cacheNames.map(function(cacheName) { 
                    if (!cacheWhitelist.includes(cacheName)) { 
                        return caches.delete(cacheName); 
                    } 
                }) 
            ); 
        }) 
    ); 
});