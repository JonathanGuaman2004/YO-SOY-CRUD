// Catálogo de AudioHub.
// Se guarda localmente para que no se pierda al refrescar,
// y también se sincroniza con el Event Manager.
let catalogo = [];
let idCounter = 1;
let editandoId = null;

// LocalStorage
const STORAGE_KEY = 'audiohub_catalogo';
const STORAGE_ID_KEY = 'audiohub_idCounter';

// Referencias al HTML
const form = document.getElementById('audioForm');
const tabla = document.getElementById('tablaAudios');
const btnSubmit = form.querySelector('button[type="submit"]');
const btnActualizar = document.getElementById('btnActualizar');

// URL del Event Manager
const EVENT_MANAGER_URL = 'http://localhost:3000/events';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tryParsePayload(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function truncate(str, max) {
    return String(str || '').substring(0, max);
}

function limpiarTituloEvento(titulo) {
    return String(titulo || '')
        .replace(/^\[(CREATE|UPDATE|DELETE|QUERY)\]\s*/i, '')
        .trim();
}

function obtenerFechaEvento(ev) {
    return ev._eventDate || ev.recorded_at || ev.updated_at || ev.event_date || ev.created_at || '';
}

function guardarLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(catalogo));
        localStorage.setItem(STORAGE_ID_KEY, String(idCounter));
    } catch (error) {
        console.warn('No se pudo guardar en localStorage:', error);
    }
}

function cargarLocal() {
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');

        if (Array.isArray(data)) {
            catalogo = data;
        }

        const savedCounter = Number(localStorage.getItem(STORAGE_ID_KEY));
        if (Number.isFinite(savedCounter) && savedCounter > 0) {
            idCounter = savedCounter;
        }
    } catch (error) {
        console.warn('No se pudo cargar desde localStorage:', error);
        catalogo = [];
        idCounter = 1;
    }
}

function normalizarTipo(valor) {
    const tipo = String(valor || '').toLowerCase();

    if (tipo.includes('podcast')) {
        return 'Podcast';
    }

    return 'Cancion';
}

function construirItemDesdeEvento(ev) {
    const data = tryParsePayload(ev.payload);
    if (!data) return null;

    const id = Number(data.id);
    if (!Number.isFinite(id) || id <= 0) return null;

    const titulo =
        data.titulo ||
        data.name ||
        data.title ||
        limpiarTituloEvento(ev.title) ||
        '';

    const autor =
        data.autor ||
        data.author ||
        data.artist ||
        '';

    const tipo =
        data.tipo ||
        data.type ||
        ev.entity ||
        'Cancion';

    if (!titulo || !autor) return null;

    return {
        id: id,
        tipo: normalizarTipo(tipo),
        titulo: limpiarTituloEvento(titulo),
        autor: autor
    };
}

// ─── Cargar datos al iniciar / refrescar ─────────────────────────────────────

async function cargarDesdeServidor() {
    try {
        const response = await fetch(EVENT_MANAGER_URL);

        if (!response.ok) {
            console.warn('El Event Manager respondió con error:', response.status);
            cargarLocal();
            renderizarTabla();
            return;
        }

        const eventos = await response.json();

        if (!Array.isArray(eventos)) {
            cargarLocal();
            renderizarTabla();
            return;
        }

        const eventosAudioHub = eventos
            .filter(function(ev) {
                return ev.source === 'audiohub-frontend';
            })
            .sort(function(a, b) {
                return new Date(obtenerFechaEvento(a)) - new Date(obtenerFechaEvento(b));
            });

        const estadoPorId = new Map();
        const idsVistos = [];

        eventosAudioHub.forEach(function(ev) {
            const item = construirItemDesdeEvento(ev);
            if (!item) return;

            idsVistos.push(item.id);

            if (ev.action === 'CREATE') {
                estadoPorId.set(item.id, item);
            }

            if (ev.action === 'UPDATE') {
                if (estadoPorId.has(item.id)) {
                    const anterior = estadoPorId.get(item.id);

                    estadoPorId.set(item.id, {
                        id: item.id,
                        tipo: item.tipo || anterior.tipo,
                        titulo: item.titulo || anterior.titulo,
                        autor: item.autor || anterior.autor
                    });
                } else {
                    estadoPorId.set(item.id, item);
                }
            }

            if (ev.action === 'DELETE') {
                estadoPorId.delete(item.id);
            }
        });

        catalogo = Array.from(estadoPorId.values());

        if (idsVistos.length > 0) {
            idCounter = Math.max.apply(null, idsVistos) + 1;
        } else if (catalogo.length > 0) {
            idCounter = Math.max.apply(null, catalogo.map(function(item) {
                return item.id;
            })) + 1;
        } else {
            idCounter = 1;
        }

        guardarLocal();
        renderizarTabla();

        console.log('Catálogo AudioHub reconstruido:', catalogo.length, 'elemento(s). Próximo id:', idCounter);

    } catch (error) {
        console.error('Error al cargar desde el servidor:', error);
        cargarLocal();
        renderizarTabla();
    }
}

// ─── Notificar al Event Manager ──────────────────────────────────────────────

async function notificarEventoEPN(accion, item) {
    const payloadEvento = {
        source: 'audiohub-frontend',
        entity: 'Audio',
        action: accion,
        title: truncate('[' + accion + '] ' + (item.titulo || 'AudioHub'), 120),
        description: truncate(
            'Tipo: ' + (item.tipo || 'Cancion') + ' | Autor: ' + (item.autor || 'Sin autor'),
            500
        ),
        payload: {
            id: String(item.id),
            tipo: item.tipo || 'Cancion',
            type: item.tipo || 'Cancion',
            titulo: item.titulo || '',
            name: item.titulo || '',
            autor: item.autor || '',
            author: item.autor || '',
            status: accion === 'DELETE' ? 'deleted' : 'active'
        }
    };

    console.log('Enviando evento al Event Manager:', payloadEvento);

    try {
        const response = await fetch(EVENT_MANAGER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payloadEvento)
        });

        const respuesta = await response.json().catch(function() {
            return {};
        });

        if (response.ok) {
            console.log('Evento ' + accion + ' guardado en el Event Manager:', respuesta);
        } else {
            console.error('Evento ' + accion + ' rechazado por Event Manager:', response.status, respuesta);
            alert('El Event Manager rechazó el evento. Revisa la consola F12.');
        }
    } catch (error) {
        console.error('No se pudo conectar con el Event Manager:', error);
        alert('No se pudo conectar con el Event Manager. Verifica que esté encendido en localhost:3000.');
    }
}

// ─── Renderizar tabla ────────────────────────────────────────────────────────

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
        const tipoTexto = item.tipo === 'Podcast' ? '🎙️ Podcast' : '🎵 Canción';

        tabla.innerHTML +=
            '<tr>' +
            '<td>' + tipoTexto + '</td>' +
            '<td>' + limpiarTituloEvento(item.titulo) + '</td>' +
            '<td>' + item.autor + '</td>' +
            '<td class="text-end">' +
            '<button class="btn btn-sm btn-warning me-1" onclick="prepararEdicion(' + item.id + ')">Editar</button>' +
            '<button class="btn btn-sm btn-danger" onclick="eliminarAudio(' + item.id + ')">Eliminar</button>' +
            '</td></tr>';
    });
}

// ─── Botón Refrescar ─────────────────────────────────────────────────────────

btnActualizar.addEventListener('click', async function() {
    await cargarDesdeServidor();

    await notificarEventoEPN('QUERY', {
        id: 0,
        tipo: 'Cancion',
        titulo: 'Todo el catalogo',
        autor: 'Usuario'
    });
});

// ─── Preparar edición ────────────────────────────────────────────────────────

window.prepararEdicion = function(id) {
    const item = catalogo.find(function(a) {
        return Number(a.id) === Number(id);
    });

    if (!item) return;

    document.getElementById('tipo').value = item.tipo;
    document.getElementById('titulo').value = limpiarTituloEvento(item.titulo);
    document.getElementById('autor').value = item.autor;

    editandoId = Number(id);

    btnSubmit.textContent = 'Actualizar';
    btnSubmit.classList.remove('btn-neon');
    btnSubmit.classList.add('btn-warning');
};

// ─── Guardar / actualizar ────────────────────────────────────────────────────

form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const tipoActual = document.getElementById('tipo').value;
    const tituloActual = limpiarTituloEvento(document.getElementById('titulo').value.trim());
    const autorActual = document.getElementById('autor').value.trim();

    if (!tituloActual || !autorActual) {
        alert('Título y autor son obligatorios');
        return;
    }

    if (editandoId === null) {
        const nuevoAudio = {
            id: idCounter++,
            tipo: normalizarTipo(tipoActual),
            titulo: tituloActual,
            autor: autorActual
        };

        catalogo.push(nuevoAudio);
        guardarLocal();
        renderizarTabla();

        await notificarEventoEPN('CREATE', nuevoAudio);

    } else {
        const index = catalogo.findIndex(function(a) {
            return Number(a.id) === Number(editandoId);
        });

        if (index !== -1) {
            catalogo[index] = {
                id: catalogo[index].id,
                tipo: normalizarTipo(tipoActual),
                titulo: tituloActual,
                autor: autorActual
            };

            guardarLocal();
            renderizarTabla();

            await notificarEventoEPN('UPDATE', catalogo[index]);
        }

        editandoId = null;

        btnSubmit.textContent = 'Guardar en Biblioteca';
        btnSubmit.classList.remove('btn-warning');
        btnSubmit.classList.add('btn-neon');
    }

    form.reset();
});

// ─── Eliminar ────────────────────────────────────────────────────────────────

window.eliminarAudio = async function(id) {
    const item = catalogo.find(function(a) {
        return Number(a.id) === Number(id);
    });

    if (!item) return;

    if (!confirm('¿Eliminar "' + limpiarTituloEvento(item.titulo) + '"?')) return;

    catalogo = catalogo.filter(function(a) {
        return Number(a.id) !== Number(id);
    });

    guardarLocal();
    renderizarTabla();

    await notificarEventoEPN('DELETE', item);
};

// ─── Inicio ──────────────────────────────────────────────────────────────────

cargarLocal();
renderizarTabla();
cargarDesdeServidor();