// Catálogo en memoria; se reconstruye desde el Event Manager al cargar
let catalogo = [];
let idCounter = 1;
let editandoId = null;

// Referencias al HTML
const form = document.getElementById('audioForm');
const tabla = document.getElementById('tablaAudios');
const btnSubmit = form.querySelector('button[type="submit"]');
const btnActualizar = document.getElementById('btnActualizar');

// URL base del Event Manager
const EVENT_MANAGER_URL = 'http://localhost:3000/events';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryParsePayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return null; }
}

function truncate(str, max) {
    return String(str ?? '').substring(0, max);
}

// ─── Cargar datos al iniciar / refrescar ─────────────────────────────────────

async function cargarDesdeServidor() {
    try {
        const response = await fetch(EVENT_MANAGER_URL);
        if (!response.ok) {
            console.warn('El Event Manager respondió con error:', response.status);
            return;
        }

        const eventos = await response.json();
        if (!Array.isArray(eventos)) return;

        // 1. CREATEs del audiohub
        const creados = eventos
            .filter(ev => ev._table === 'create_events' && ev.source === 'audiohub-frontend')
            .map(ev => {
                const data = tryParsePayload(ev.payload);
                if (!data) return null;
                const id = Number(data.id);
                if (!Number.isFinite(id)) return null;
                const titulo = data.titulo || data.title || '';
                const autor  = data.autor  || data.author || '';
                const tipo   = data.tipo   || ev.entity   || 'Cancion';
                if (!titulo || !autor) return null;
                return { id, tipo, titulo, autor };
            })
            .filter(Boolean);

        // 2. IDs eliminados
        const eliminados = new Set(
            eventos
                .filter(ev => ev._table === 'delete_events' && ev.source === 'audiohub-frontend')
                .map(ev => {
                    const data = tryParsePayload(ev.payload);
                    return data ? Number(data.id) : NaN;
                })
                .filter(Number.isFinite)
        );

        // 3. UPDATEs más recientes por id (los eventos vienen ordenados desc por fecha)
        const actualizaciones = new Map();
        eventos
            .filter(ev => ev._table === 'update_events' && ev.source === 'audiohub-frontend')
            .forEach(ev => {
                const data = tryParsePayload(ev.payload);
                if (!data) return;
                const id = Number(data.id);
                if (!Number.isFinite(id) || actualizaciones.has(id)) return;
                actualizaciones.set(id, data);
            });

        // 4. Catálogo final: CREATE - DELETE + apply UPDATE
        catalogo = creados
            .filter(item => !eliminados.has(item.id))
            .map(item => {
                const upd = actualizaciones.get(item.id);
                if (!upd) return item;
                return {
                    id: item.id,
                    tipo:   upd.tipo   || upd.entity  || item.tipo,
                    titulo: upd.titulo || upd.title   || item.titulo,
                    autor:  upd.autor  || upd.author  || item.autor,
                };
            });

        // 5. idCounter seguro basado en TODOS los ids vistos
        const todosLosIds = eventos
            .filter(ev => ev.source === 'audiohub-frontend')
            .map(ev => { const d = tryParsePayload(ev.payload); return d ? Number(d.id) : NaN; })
            .filter(Number.isFinite);

        idCounter = todosLosIds.length > 0 ? Math.max(...todosLosIds) + 1 : 1;

        renderizarTabla();
        console.log('Catálogo reconstruido:', catalogo.length, 'elemento(s). Próximo id:', idCounter);

    } catch (error) {
        console.error('Error al cargar desde el servidor:', error);
    }
}

// ─── Notificar al Event Manager ──────────────────────────────────────────────

async function notificarEventoEPN(accion, item) {
    const payloadEvento = {
        source:      'audiohub-frontend',
        entity:      truncate(item.tipo || 'Audio', 60),
        action:      accion,
        title:       truncate('[' + accion + '] ' + (item.titulo || ''), 120),
        description: truncate('Accion ' + accion + ' sobre: ' + (item.titulo || '') + ' - ' + (item.autor || ''), 500),
        payload: {
            id:     item.id,
            tipo:   item.tipo   || 'Cancion',
            titulo: item.titulo || '',
            autor:  item.autor  || '',
        },
    };

    try {
        const response = await fetch(EVENT_MANAGER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadEvento),
        });

        if (response.ok) {
            console.log('Evento ' + accion + ' guardado en el Event Manager.');
        } else {
            const err = await response.json().catch(() => ({}));
            console.warn('Evento ' + accion + ' rechazado (' + response.status + '):', err);
        }
    } catch (error) {
        console.error('No se pudo conectar con el Event Manager:', error);
    }
}

// ─── Renderizar tabla ─────────────────────────────────────────────────────────

function renderizarTabla() {
    tabla.innerHTML = '';

    if (catalogo.length === 0) {
        tabla.innerHTML =
            '<tr><td colspan="4" class="text-center py-5">' +
            '<div class="d-inline-flex align-items-center justify-content-center rounded-circle mb-4 empty-state-icon">' +
            '<i class="bi bi-music-note-list text-white-50" style="font-size:2.5rem;"></i></div>' +
            '<h5 class="text-white fw-bold">Tu biblioteca está vacía</h5>' +
            '<p class="text-white-50 mb-0">Añade tu primera canción o podcast desde el panel lateral.</p>' +
            '</td></tr>';
        return;
    }

    catalogo.forEach(function(item) {
        tabla.innerHTML +=
            '<tr>' +
            '<td>' + (item.tipo === 'Cancion' ? '🎵 Canción' : '🎙️ Podcast') + '</td>' +
            '<td>' + item.titulo + '</td>' +
            '<td>' + item.autor + '</td>' +
            '<td class="text-end">' +
            '<button class="btn btn-sm btn-warning me-1" onclick="prepararEdicion(' + item.id + ')">Editar</button>' +
            '<button class="btn btn-sm btn-danger" onclick="eliminarAudio(' + item.id + ')">Eliminar</button>' +
            '</td></tr>';
    });
}

// ─── Botón Refrescar ──────────────────────────────────────────────────────────

btnActualizar.addEventListener('click', async function() {
    await cargarDesdeServidor();
    notificarEventoEPN('QUERY', { id: 0, tipo: 'Cancion', titulo: 'Todo el catalogo', autor: 'Usuario' });
});

// ─── Preparar edición ─────────────────────────────────────────────────────────

window.prepararEdicion = function(id) {
    var item = catalogo.find(function(a) { return a.id === id; });
    if (!item) return;

    document.getElementById('tipo').value   = item.tipo;
    document.getElementById('titulo').value = item.titulo;
    document.getElementById('autor').value  = item.autor;

    editandoId = id;
    btnSubmit.textContent = 'Actualizar';
    btnSubmit.classList.remove('btn-neon');
    btnSubmit.classList.add('btn-warning');
};

// ─── Guardar / actualizar ─────────────────────────────────────────────────────

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    var tipoActual   = document.getElementById('tipo').value;
    var tituloActual = document.getElementById('titulo').value.trim();
    var autorActual  = document.getElementById('autor').value.trim();

    if (!tituloActual || !autorActual) {
        alert('Título y autor son obligatorios');
        return;
    }

    if (editandoId === null) {
        var nuevoAudio = { id: idCounter++, tipo: tipoActual, titulo: tituloActual, autor: autorActual };
        catalogo.push(nuevoAudio);
        await notificarEventoEPN('CREATE', nuevoAudio);
    } else {
        var index = catalogo.findIndex(function(a) { return a.id === editandoId; });
        if (index !== -1) {
            catalogo[index] = { id: catalogo[index].id, tipo: tipoActual, titulo: tituloActual, autor: autorActual };
            await notificarEventoEPN('UPDATE', catalogo[index]);
        }
        editandoId = null;
        btnSubmit.textContent = 'Guardar en Biblioteca';
        btnSubmit.classList.remove('btn-warning');
        btnSubmit.classList.add('btn-neon');
    }

    renderizarTabla();
    form.reset();
});

// ─── Eliminar ─────────────────────────────────────────────────────────────────

window.eliminarAudio = function(id) {
    var item = catalogo.find(function(a) { return a.id === id; });
    if (!item) return;
    if (!confirm('¿Eliminar "' + item.titulo + '"?')) return;
    catalogo = catalogo.filter(function(a) { return a.id !== id; });
    renderizarTabla();
    notificarEventoEPN('DELETE', item);
};

// ─── Inicio ───────────────────────────────────────────────────────────────────
cargarDesdeServidor();