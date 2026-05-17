// Empezamos vacío, los datos se cargarán desde el servidor NestJS
let catalogo = [];
let idCounter = 1;
let editandoId = null;

// Referencias al HTML
const form = document.getElementById('audioForm');
const tabla = document.getElementById('tablaAudios');
const btnSubmit = form.querySelector('button[type="submit"]');
const btnActualizar = document.getElementById('btnActualizar'); // 🚀 REFERENCIA AL NUEVO BOTÓN

// URL de tu EPN Event Manager
const EVENT_MANAGER_URL = 'http://localhost:3000/events';

// Cargar datos desde el servidor al iniciar
async function cargarDesdeServidor() {
    try {
        const response = await fetch(EVENT_MANAGER_URL);
        if (response.ok) {
            const eventos = await response.json();
            
            // Filtramos solo los eventos de creación de nuestro frontend
            catalogo = eventos
                .filter(ev => ev._table === 'create_events' && ev.source === 'audiohub-frontend')
                .map(ev => {
                    const data = JSON.parse(ev.payload);
                    return {
                        id: data.id, 
                        tipo: ev.entity,
                        titulo: data.titulo,
                        autor: data.autor
                    };
                });
            
            if (catalogo.length > 0) {
                idCounter = Math.max(...catalogo.map(a => a.id)) + 1;
            }
            
            renderizarTabla();
            console.log("✅ Datos recuperados desde el servidor NestJS");
        }
    } catch (error) {
        console.error("❌ No se pudo conectar con el servidor para recuperar datos", error);
    }
}

// Enviar eventos al Backend (CREATE, UPDATE, DELETE, QUERY)
async function notificarEventoEPN(accion, item) {
    const payloadEvento = {
        source: "audiohub-frontend",
        entity: item.tipo,
        action: accion,
        title: `Se ejecutó ${accion} en el catálogo`,
        description: `El usuario realizó una acción de ${accion} sobre el título: ${item.titulo}`,
        payload: item 
    };

    try {
        const response = await fetch(EVENT_MANAGER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadEvento)
        });
        if(response.ok) {
            console.log(`✅ Evento ${accion} notificado con éxito.`);
        }
    } catch (error) {
        console.error('❌ Error de conexión.', error);
    }
}

// Renderizar la tabla (READ)
function renderizarTabla() {
    tabla.innerHTML = '';
    catalogo.forEach(item => {
        tabla.innerHTML += `
            <tr>
                <td>${item.tipo === 'Cancion' ? '🎵 Canción' : '🎙️ Podcast'}</td>
                <td>${item.titulo}</td>
                <td>${item.autor}</td>
                <td>
                    <button class="btn btn-sm btn-warning me-1" onclick="prepararEdicion(${item.id})">Editar</button>
                    <button class="btn btn-sm btn-danger" onclick="eliminarAudio(${item.id})">Eliminar</button>
                </td>
            </tr>
        `;
    });
}

// 🚀 NUEVO: Lógica del botón "Actualizar Lista" (Evento QUERY)
btnActualizar.addEventListener('click', async () => {
    // 1. Recargamos los datos desde la base
    await cargarDesdeServidor();
    
    // 2. Notificamos al servidor que hicimos una consulta general
    notificarEventoEPN('QUERY', { 
        tipo: 'ConsultaGeneral', 
        titulo: 'Todo el catálogo', 
        autor: 'Usuario Local' 
    });
});

// Preparar el formulario para Editar (UPDATE)
window.prepararEdicion = function(id) {
    const item = catalogo.find(a => a.id === id);
    
    document.getElementById('tipo').value = item.tipo;
    document.getElementById('titulo').value = item.titulo;
    document.getElementById('autor').value = item.autor;
    
    editandoId = id;
    btnSubmit.textContent = 'Actualizar';
    btnSubmit.classList.replace('btn-primary', 'btn-warning');
};

// Guardar o Actualizar registro (CREATE / UPDATE)
form.addEventListener('submit', (e) => {
    e.preventDefault();

    const tipoActual = document.getElementById('tipo').value;
    const tituloActual = document.getElementById('titulo').value;
    const autorActual = document.getElementById('autor').value;

    if (editandoId === null) {
        // MODO CREATE
        const nuevoAudio = {
            id: idCounter++,
            tipo: tipoActual,
            titulo: tituloActual,
            autor: autorActual
        };
        catalogo.push(nuevoAudio);
        notificarEventoEPN('CREATE', nuevoAudio);
    } else {
        // MODO UPDATE
        const index = catalogo.findIndex(a => a.id === editandoId);
        catalogo[index].tipo = tipoActual;
        catalogo[index].titulo = tituloActual;
        catalogo[index].autor = autorActual;
        
        notificarEventoEPN('UPDATE', catalogo[index]);
        
        editandoId = null;
        btnSubmit.textContent = 'Guardar';
        btnSubmit.classList.replace('btn-warning', 'btn-primary');
    }

    renderizarTabla();
    form.reset(); 
});

// Eliminar registro (DELETE)
window.eliminarAudio = function(id) {
    const itemEliminado = catalogo.find(a => a.id === id);
    catalogo = catalogo.filter(a => a.id !== id);
    renderizarTabla();
    notificarEventoEPN('DELETE', itemEliminado);
};

// LLAMADA INICIAL: Recuperar datos automáticamente al abrir la web (sin enviar evento QUERY)
cargarDesdeServidor();