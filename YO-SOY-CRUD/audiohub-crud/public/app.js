// ─── API base (mismo origen, sin CORS) ───────────────────────────────────────
const API = '/audios';

// ─── Referencias al DOM ───────────────────────────────────────────────────────
const tabla       = document.getElementById('tablaAudios');
const btnSubmit   = document.getElementById('btnSubmit');
const btnCancel   = document.getElementById('btnCancel');
const btnRefresh  = document.getElementById('btnActualizar');

// ─── Toast ────────────────────────────────────────────────────────────────────

function toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

// ─── Health check ─────────────────────────────────────────────────────────────

async function checkHealth() {
    try {
        const r    = await fetch('/health');
        const data = await r.json();
        const dot  = document.getElementById('hubDot');
        const lbl  = document.getElementById('hubLabel');

        if (data.hub === 'connected') {
            dot.className    = 'hub-dot online';
            lbl.textContent  = 'Event Manager conectado';
        } else {
            dot.className    = 'hub-dot offline';
            lbl.textContent  = 'Event Manager offline';
        }
    } catch {
        document.getElementById('hubDot').className   = 'hub-dot offline';
        document.getElementById('hubLabel').textContent = 'Sin conexión';
    }
}

// ─── Cargar y renderizar ──────────────────────────────────────────────────────

async function cargarAudios() {
    try {
        const r    = await fetch(API);
        const list = await r.json();
        renderizarTabla(list);
    } catch (err) {
        console.error('Error al cargar audios:', err);
        toast('Error al cargar la biblioteca', 'error');
    }
}

function renderizarTabla(list) {
    tabla.innerHTML = '';

    if (!list || list.length === 0) {
        tabla.innerHTML =
            '<tr><td colspan="4" class="text-center py-5">' +
            '<div class="d-inline-flex align-items-center justify-content-center rounded-circle mb-4 empty-state-icon">' +
            '<i class="bi bi-music-note-list text-white-50" style="font-size:2.5rem;"></i></div>' +
            '<h5 class="text-white fw-bold">Tu biblioteca está vacía</h5>' +
            '<p class="text-white-50 mb-0">Añade tu primera canción o podcast desde el panel lateral.</p>' +
            '</td></tr>';
        return;
    }

    list.forEach(function(item) {
        const tipoTexto = item.tipo === 'podcast' ? '🎙️ Podcast' : '🎵 Canción';
        tabla.innerHTML +=
            '<tr>' +
            '<td>' + tipoTexto + '</td>' +
            '<td>' + item.titulo + '</td>' +
            '<td>' + item.autor + '</td>' +
            '<td class="text-end">' +
            '<button class="btn btn-sm btn-warning me-1" onclick="prepararEdicion(\'' + item.id + '\')">Editar</button>' +
            '<button class="btn btn-sm btn-danger" onclick="eliminarAudio(\'' + item.id + '\')">Eliminar</button>' +
            '</td></tr>';
    });
}

// ─── Formulario ───────────────────────────────────────────────────────────────

async function submitForm() {
    const editId = document.getElementById('editId').value;
    const titulo = document.getElementById('titulo').value.trim();
    const autor  = document.getElementById('autor').value.trim();
    const tipo   = document.getElementById('tipo').value;

    if (!titulo || !autor) {
        toast('Título y autor son obligatorios', 'error');
        return;
    }

    const body = { titulo, autor, tipo };

    try {
        let r;

        if (!editId) {
            // CREATE
            r = await fetch(API, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
        } else {
            // UPDATE
            r = await fetch(`${API}/${editId}`, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
        }

        const data = await r.json();

        if (!r.ok) {
            toast(data.error || 'Error en la solicitud', 'error');
            return;
        }

        toast(editId ? `"${data.titulo}" actualizado ✔` : `"${data.titulo}" añadido 🎵`);
        resetForm();
        await cargarAudios();

    } catch (err) {
        console.error('Error al guardar audio:', err);
        toast('Error de conexión con el servidor', 'error');
    }
}

function resetForm() {
    document.getElementById('editId').value  = '';
    document.getElementById('titulo').value  = '';
    document.getElementById('autor').value   = '';
    document.getElementById('tipo').value    = 'cancion';
    document.getElementById('formTitle').textContent = 'Añadir a la librería';
    btnSubmit.innerHTML = '<i class="bi bi-collection-play-fill me-2"></i> Guardar en Biblioteca';
    btnSubmit.classList.remove('btn-warning');
    btnSubmit.classList.add('btn-neon');
    btnCancel.style.display = 'none';
}

function cancelEdit() {
    resetForm();
}

// ─── Editar ───────────────────────────────────────────────────────────────────

window.prepararEdicion = async function(id) {
    try {
        const r    = await fetch(`${API}/${id}`);
        const data = await r.json();

        if (!r.ok) { toast('Audio no encontrado', 'error'); return; }

        document.getElementById('editId').value  = data.id;
        document.getElementById('titulo').value  = data.titulo;
        document.getElementById('autor').value   = data.autor;
        document.getElementById('tipo').value    = data.tipo;
        document.getElementById('formTitle').textContent = 'Editar audio';

        btnSubmit.innerHTML = '✔ Guardar cambios';
        btnSubmit.classList.remove('btn-neon');
        btnSubmit.classList.add('btn-warning');
        btnCancel.style.display = 'inline-block';

        document.querySelector('.glass-card').scrollIntoView({ behavior: 'smooth' });

    } catch (err) {
        toast('Error al cargar el audio', 'error');
    }
};

// ─── Eliminar ─────────────────────────────────────────────────────────────────

window.eliminarAudio = async function(id) {
    if (!confirm('¿Eliminar este audio?')) return;

    try {
        const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
        if (!r.ok) {
            const data = await r.json();
            toast(data.error || 'Error al eliminar', 'error');
            return;
        }
        toast('Audio eliminado 🗑');
        await cargarAudios();
    } catch (err) {
        toast('Error de conexión', 'error');
    }
};

// ─── Botón Refrescar ──────────────────────────────────────────────────────────

btnRefresh.addEventListener('click', async function() {
    await cargarAudios();
    toast('Biblioteca actualizada ↺');
});

// ─── Inicio ───────────────────────────────────────────────────────────────────

(async function init() {
    await Promise.all([checkHealth(), cargarAudios()]);
    setInterval(checkHealth, 30_000);
})();
