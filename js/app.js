const STATE = {
  clienteActual: null,
  alertas: [],
  autoActivo: false,
  autoTimer: null
};

document.addEventListener("DOMContentLoaded", iniciarApp);

function iniciarApp() {
  cargarClientesEnSelector();
  vincularEventos();
  seleccionarPrimerCliente();
  renderizarTodo();
}

function cargarClientesEnSelector() {
  const select = document.getElementById("clienteSelect");

  const clientesHabilitados = CLIENTES.filter(cliente => cliente.habilitado !== false);

  select.innerHTML = clientesHabilitados
    .map(cliente => {
      return `<option value="${cliente.id}">${cliente.nombre}</option>`;
    })
    .join("");
}

function vincularEventos() {
  document.getElementById("clienteSelect").addEventListener("change", cambiarCliente);
  document.getElementById("btnActualizar").addEventListener("click", actualizarAlertas);
  document.getElementById("btnAuto").addEventListener("click", alternarAuto);
  document.getElementById("btnDemo").addEventListener("click", agregarAlertaPrueba);
  document.getElementById("btnExportarCSV").addEventListener("click", exportarCSV);
  document.getElementById("btnExportarJSON").addEventListener("click", exportarJSON);
  document.getElementById("btnLimpiar").addEventListener("click", limpiarHistorialLocal);

  document.getElementById("inputBuscar").addEventListener("input", renderizarTodo);
  document.getElementById("filtroEstado").addEventListener("change", renderizarTodo);
  document.getElementById("filtroDesde").addEventListener("change", renderizarTodo);
  document.getElementById("filtroHasta").addEventListener("change", renderizarTodo);
}

function seleccionarPrimerCliente() {
  const select = document.getElementById("clienteSelect");

  const cliente = CLIENTES.find(item => item.id === select.value);

  seleccionarCliente(cliente);
}

function cambiarCliente(evento) {
  const idCliente = evento.target.value;

  const cliente = CLIENTES.find(item => item.id === idCliente);

  seleccionarCliente(cliente);
}

function seleccionarCliente(cliente) {
  STATE.clienteActual = cliente;

  if (!cliente) {
    STATE.alertas = [];
    document.getElementById("clienteDescripcion").textContent = "Sin cliente seleccionado.";
    return;
  }

  STATE.alertas = cargarAlertasLocales(cliente.id);

  document.getElementById("clienteDescripcion").textContent =
    cliente.descripcion || cliente.nombre;

  setEstado(`Cliente seleccionado: ${cliente.nombre}`, "");
  renderizarTodo();
}

async function actualizarAlertas() {
  if (!STATE.clienteActual) {
    setEstado("Seleccioná un cliente.", "error");
    return;
  }

  bloquearActualizar(true);
  setEstado("Consultando API...", "loading");

  try {
    const nuevasAlertas = await obtenerAlertasDesdeApi(STATE.clienteActual);

    const cantidadAnterior = STATE.alertas.length;

    STATE.alertas = fusionarAlertasLocales(
      STATE.clienteActual.id,
      nuevasAlertas
    );

    const nuevas = Math.max(STATE.alertas.length - cantidadAnterior, 0);

    document.getElementById("ultimaActualizacion").textContent =
      `Última actualización: ${new Date().toLocaleString("es-AR")}`;

    setEstado(
      `Actualizado. Nuevas: ${nuevas}. Total local: ${STATE.alertas.length}.`,
      "ok"
    );

    renderizarTodo();
  } catch (error) {
    console.error(error);
    setEstado(error.message || "Error al actualizar.", "error");
  } finally {
    bloquearActualizar(false);
  }
}

async function obtenerAlertasDesdeApi(cliente) {
  if (cliente.tipoApi === "telegram") {
    return obtenerAlertasTelegram(cliente);
  }

  if (cliente.tipoApi === "json") {
    return obtenerAlertasJson(cliente);
  }

  throw new Error(`Tipo de API no soportado: ${cliente.tipoApi}`);
}

async function obtenerAlertasTelegram(cliente) {
  if (
    !cliente.token ||
    cliente.token.includes("PEGAR_TOKEN") ||
    cliente.token.includes("TOKEN_CLIENTE")
  ) {
    throw new Error(`Falta configurar el token de ${cliente.nombre} en js/config.js`);
  }

  const parametros = new URLSearchParams({
    limit: "100",
    timeout: "0",
    allowed_updates: JSON.stringify([
      "message",
      "channel_post",
      "edited_message"
    ])
  });

  const url =
    `https://api.telegram.org/bot${cliente.token}/getUpdates?${parametros.toString()}`;

  const respuesta = await fetch(url);
  const datos = await respuesta.json();

  if (!datos.ok) {
    throw new Error(datos.description || "Telegram devolvió un error.");
  }

  return normalizarTelegram(cliente, datos.result || []);
}

async function obtenerAlertasJson(cliente) {
  if (!cliente.url) {
    throw new Error(`Falta configurar la URL JSON de ${cliente.nombre}`);
  }

  const respuesta = await fetch(cliente.url);

  if (!respuesta.ok) {
    throw new Error(`La API JSON respondió HTTP ${respuesta.status}`);
  }

  const datos = await respuesta.json();

  return normalizarJson(cliente, datos);
}

function normalizarTelegram(cliente, updates) {
  return updates
    .map(update => convertirUpdateEnAlerta(cliente, update))
    .filter(Boolean)
    .sort((a, b) => b.timestamp - a.timestamp);
}

function convertirUpdateEnAlerta(cliente, update) {
  const mensaje =
    update.message ||
    update.channel_post ||
    update.edited_message;

  if (!mensaje) {
    return null;
  }

  const texto = mensaje.text || mensaje.caption || "";

  if (!texto.trim()) {
    return null;
  }

  if (
    cliente.chatId &&
    mensaje.chat &&
    String(mensaje.chat.id) !== String(cliente.chatId)
  ) {
    return null;
  }

  const fecha = mensaje.date
    ? new Date(mensaje.date * 1000)
    : new Date();

  const analisis = analizarTextoAlerta(texto);

  return {
    id: `tg-${cliente.id}-${update.update_id}-${mensaje.message_id || "0"}`,
    clienteId: cliente.id,
    clienteNombre: cliente.nombre,
    origen: "Telegram",
    fechaISO: fecha.toISOString(),
    fechaTexto: formatearFecha(fecha),
    timestamp: fecha.getTime(),
    equipo: analisis.equipo,
    ip: analisis.ip,
    estado: analisis.estado,
    mensaje: texto
  };
}

function normalizarJson(cliente, datos) {
  let lista = [];

  if (Array.isArray(datos)) {
    lista = datos;
  } else if (Array.isArray(datos.alertas)) {
    lista = datos.alertas;
  } else if (Array.isArray(datos.result)) {
    lista = datos.result;
  }

  return lista
    .map((item, index) => {
      let fecha = item.fecha ? new Date(item.fecha) : new Date();

      if (Number.isNaN(fecha.getTime())) {
        fecha = new Date();
      }

      const texto =
        item.mensaje ||
        item.message ||
        item.texto ||
        JSON.stringify(item);

      const analisis = analizarTextoAlerta(texto);

      return {
        id: item.id || `json-${cliente.id}-${fecha.getTime()}-${index}`,
        clienteId: cliente.id,
        clienteNombre: cliente.nombre,
        origen: "JSON",
        fechaISO: fecha.toISOString(),
        fechaTexto: formatearFecha(fecha),
        timestamp: fecha.getTime(),
        equipo: item.equipo || analisis.equipo,
        ip: item.ip || analisis.ip,
        estado: item.estado || analisis.estado,
        mensaje: texto
      };
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function analizarTextoAlerta(textoOriginal) {
  const texto = textoOriginal || "";
  const textoPlano = quitarAcentos(texto).toUpperCase();

  const ipMatch = texto.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  const ip = ipMatch ? ipMatch[0] : "";

  let estado = "INFO";

  const esDown =
    /\b(CAIDO|CAIDA|DOWN|OFFLINE|DESCONECTADO|DESCONECTADA|FALLA|SIN CONEXION|PERDIDA)\b/.test(textoPlano);

  const esUp =
    /\b(UP|OK|ONLINE|RECUPERADO|RECUPERADA|LEVANTADO|LEVANTADA|ACTIVO|ACTIVA)\b/.test(textoPlano);

  if (esDown) {
    estado = "DOWN";
  } else if (esUp) {
    estado = "UP";
  }

  const equipo = extraerEquipo(texto, ip, estado);

  return {
    ip,
    estado,
    equipo
  };
}

function extraerEquipo(texto, ip, estado) {
  let limpio = texto || "";

  if (ip) {
    limpio = limpio.replace(ip, " ");
  }

  limpio = limpio
    .replace(/\b(CAIDO|CAIDA|DOWN|OFFLINE|DESCONECTADO|DESCONECTADA|FALLA|SIN CONEXION|PERDIDA)\b/ig, " ")
    .replace(/\b(UP|OK|ONLINE|RECUPERADO|RECUPERADA|LEVANTADO|LEVANTADA|ACTIVO|ACTIVA)\b/ig, " ")
    .replace(/[\[\]\(\)\{\}:;|,_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!limpio) {
    if (estado === "DOWN") {
      return "Equipo caído";
    }

    if (estado === "UP") {
      return "Equipo recuperado";
    }

    return "Sin equipo";
  }

  return limpio.slice(0, 80);
}

function cargarAlertasLocales(clienteId) {
  try {
    const texto = localStorage.getItem(getStorageKey(clienteId));

    if (!texto) {
      return [];
    }

    const datos = JSON.parse(texto);

    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    console.warn("No se pudo leer localStorage", error);
    return [];
  }
}

function guardarAlertasLocales(clienteId, alertas) {
  const ordenadas = [...alertas]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, APP_CONFIG.maxAlertasPorCliente);

  localStorage.setItem(
    getStorageKey(clienteId),
    JSON.stringify(ordenadas)
  );

  return ordenadas;
}

function fusionarAlertasLocales(clienteId, nuevasAlertas) {
  const actuales = cargarAlertasLocales(clienteId);
  const mapa = new Map();

  [...nuevasAlertas, ...actuales].forEach(alerta => {
    if (!alerta || !alerta.id) {
      return;
    }

    mapa.set(alerta.id, alerta);
  });

  return guardarAlertasLocales(clienteId, Array.from(mapa.values()));
}

function limpiarHistorialLocal() {
  if (!STATE.clienteActual) {
    return;
  }

  const confirmado = confirm(
    `¿Borrar el historial local de ${STATE.clienteActual.nombre}?`
  );

  if (!confirmado) {
    return;
  }

  localStorage.removeItem(getStorageKey(STATE.clienteActual.id));

  STATE.alertas = [];

  setEstado("Historial local eliminado.", "ok");
  renderizarTodo();
}

function getStorageKey(clienteId) {
  return `${APP_CONFIG.storagePrefix}_${clienteId}`;
}

function renderizarTodo() {
  const alertasFiltradas = obtenerAlertasFiltradas();

  renderizarContadores(alertasFiltradas);
  renderizarTabla(alertasFiltradas);
}

function obtenerAlertasFiltradas() {
  const busqueda = document
    .getElementById("inputBuscar")
    .value
    .trim()
    .toLowerCase();

  const filtroEstado = document.getElementById("filtroEstado").value;
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;

  return STATE.alertas
    .filter(alerta => {
      if (filtroEstado !== "TODOS" && alerta.estado !== filtroEstado) {
        return false;
      }

      if (desde) {
        const inicio = new Date(`${desde}T00:00:00`).getTime();

        if (alerta.timestamp < inicio) {
          return false;
        }
      }

      if (hasta) {
        const fin = new Date(`${hasta}T23:59:59`).getTime();

        if (alerta.timestamp > fin) {
          return false;
        }
      }

      if (busqueda) {
        const texto = `
          ${alerta.clienteNombre}
          ${alerta.equipo}
          ${alerta.ip}
          ${alerta.estado}
          ${alerta.mensaje}
        `.toLowerCase();

        if (!texto.includes(busqueda)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);
}

function renderizarContadores(alertas) {
  const total = alertas.length;
  const down = alertas.filter(a => a.estado === "DOWN").length;
  const up = alertas.filter(a => a.estado === "UP").length;
  const hoy = alertas.filter(esAlertaDeHoy).length;

  document.getElementById("contadorTotal").textContent = total;
  document.getElementById("contadorDown").textContent = down;
  document.getElementById("contadorUp").textContent = up;
  document.getElementById("contadorHoy").textContent = hoy;
}

function renderizarTabla(alertas) {
  const tbody = document.getElementById("tablaBody");

  if (!alertas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          No hay alertas para mostrar.
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = alertas
    .map(alerta => {
      return `
        <tr>
          <td>${escaparHTML(alerta.fechaTexto)}</td>
          <td>${escaparHTML(alerta.clienteNombre)}</td>
          <td>${escaparHTML(alerta.equipo || "-")}</td>
          <td>${escaparHTML(alerta.ip || "-")}</td>
          <td>${renderizarBadgeEstado(alerta.estado)}</td>
          <td class="message-cell">${escaparHTML(alerta.mensaje || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

function renderizarBadgeEstado(estado) {
  if (estado === "DOWN") {
    return `<span class="badge down">🔴 CAÍDO</span>`;
  }

  if (estado === "UP") {
    return `<span class="badge up">🟢 UP</span>`;
  }

  return `<span class="badge info">🟡 INFO</span>`;
}

function exportarCSV() {
  const alertas = obtenerAlertasFiltradas();

  if (!alertas.length) {
    setEstado("No hay alertas para exportar.", "error");
    return;
  }

  const encabezado = [
    "Fecha",
    "Cliente",
    "Equipo",
    "IP",
    "Estado",
    "Mensaje",
    "Origen"
  ];

  const filas = alertas.map(alerta => [
    alerta.fechaTexto,
    alerta.clienteNombre,
    alerta.equipo,
    alerta.ip,
    alerta.estado,
    alerta.mensaje,
    alerta.origen
  ]);

  const csv = [encabezado, ...filas]
    .map(fila => fila.map(celdaCSV).join(";"))
    .join("\n");

  descargarArchivo(
    `alertas_${STATE.clienteActual.id}.csv`,
    "text/csv;charset=utf-8",
    `\uFEFF${csv}`
  );

  setEstado("CSV descargado.", "ok");
}

function exportarJSON() {
  const alertas = obtenerAlertasFiltradas();

  if (!alertas.length) {
    setEstado("No hay alertas para exportar.", "error");
    return;
  }

  descargarArchivo(
    `alertas_${STATE.clienteActual.id}.json`,
    "application/json;charset=utf-8",
    JSON.stringify(alertas, null, 2)
  );

  setEstado("JSON descargado.", "ok");
}

function descargarArchivo(nombre, tipo, contenido) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.download = nombre;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function celdaCSV(valor) {
  const texto = String(valor ?? "").replace(/"/g, '""');

  return `"${texto}"`;
}

function agregarAlertaPrueba() {
  if (!STATE.clienteActual) {
    return;
  }

  const mensajes = [
    "CAIDO Camara Patio 172.16.10.10",
    "UP NVR Principal 172.16.10.5",
    "CAIDO Enlace Oficina 192.168.88.2",
    "RECUPERADO Router Cliente 10.0.0.1"
  ];

  const mensaje = mensajes[Math.floor(Math.random() * mensajes.length)];
  const ahora = new Date();
  const analisis = analizarTextoAlerta(mensaje);

  const alerta = {
    id: `demo-${STATE.clienteActual.id}-${Date.now()}`,
    clienteId: STATE.clienteActual.id,
    clienteNombre: STATE.clienteActual.nombre,
    origen: "Prueba manual",
    fechaISO: ahora.toISOString(),
    fechaTexto: formatearFecha(ahora),
    timestamp: ahora.getTime(),
    equipo: analisis.equipo,
    ip: analisis.ip,
    estado: analisis.estado,
    mensaje
  };

  STATE.alertas = fusionarAlertasLocales(STATE.clienteActual.id, [alerta]);

  setEstado("Alerta de prueba agregada.", "ok");
  renderizarTodo();
}

function alternarAuto() {
  STATE.autoActivo = !STATE.autoActivo;

  const boton = document.getElementById("btnAuto");

  if (STATE.autoActivo) {
    boton.textContent = "Auto: ON";

    setEstado(
      `Auto actualización cada ${APP_CONFIG.refrescoAutomaticoMs / 1000}s.`,
      "ok"
    );

    actualizarAlertas();

    STATE.autoTimer = setInterval(
      actualizarAlertas,
      APP_CONFIG.refrescoAutomaticoMs
    );
  } else {
    boton.textContent = "Auto: OFF";

    clearInterval(STATE.autoTimer);

    STATE.autoTimer = null;

    setEstado("Auto actualización desactivada.", "");
  }
}

function esAlertaDeHoy(alerta) {
  const fecha = new Date(alerta.timestamp);
  const hoy = new Date();

  return (
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate()
  );
}

function formatearFecha(fecha) {
  return fecha.toLocaleString("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function quitarAcentos(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setEstado(texto, tipo = "") {
  const estadoPanel = document.getElementById("estadoPanel");

  estadoPanel.textContent = texto;
  estadoPanel.className = `status ${tipo}`.trim();
}

function bloquearActualizar(bloqueado) {
  document.getElementById("btnActualizar").disabled = bloqueado;
}