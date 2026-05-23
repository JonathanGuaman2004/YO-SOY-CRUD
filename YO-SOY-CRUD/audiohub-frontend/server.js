// 'use strict';

// const express = require('express');
// const path    = require('path');

// const app  = express();
// const PORT = process.env.PORT ?? 4003;

// // Sirve index.html y app.js como archivos estáticos
// app.use(express.static(path.join(__dirname, 'public')));

// // Ruta raíz por si alguien abre /
// app.get('/', (_req, res) => {
//   res.sendFile(path.join(__dirname, 'public', 'index.html'));
// });

// app.listen(PORT, () => {
//   console.log(`✅ AudioHub Frontend corriendo en http://localhost:${PORT}`);
//   console.log(`   Conectando al Event Manager en http://localhost:3000/events`);
// });
const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 4003;
const EVENT_MANAGER_URL = 'http://localhost:3000/events';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', function(req, res) {
    res.json({
        status: 'ok',
        service: 'audiohub-frontend',
        port: PORT,
        eventManager: EVENT_MANAGER_URL
    });
});

app.listen(PORT, function() {
    console.log('✅ AudioHub Frontend corriendo en http://localhost:' + PORT);
    console.log('   Conectando al Event Manager en ' + EVENT_MANAGER_URL);
});