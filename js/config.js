const APP_CONFIG = {
  nombrePanel: "Panel MikroTik / Telegram",
  refrescoAutomaticoMs: 60000,
  maxAlertasPorCliente: 5000,
  storagePrefix: "panel_alertas_v1",

  debugTelegram: true,
  usarOffsetTelegram: false
};

const CLIENTES = [
  {
    id: "cliente_1",
    nombre: "Maria Susana",
    descripcion: "Bot de Telegram de Maria Susana.",
    tipoApi: "telegram",
    token: "8490838498:AAGhUQTryg44ilGyuWkRU_IkMAMaNS-9RrU",
    chatId: "8250809467",
    habilitado: true
  },

  {
    id: "cliente_2",
    nombre: "Montes de OCA",
    descripcion: "Bot de Telegram de Montes de OCA",
    tipoApi: "telegram",
    token: "8478618674:AAH88yCpCOGkBAvv8BrVE7W-m0d1nK9k6CU",
    chatId: "8250809467",
    habilitado: true
  },

  {
    id: "cliente_3",
    nombre: "Cliente 3 - Otro sitio",
    descripcion: "Bot de Telegram del Cliente 3.",
    tipoApi: "telegram",
    token: "PEGAR_TOKEN_CLIENTE_3",
    chatId: "",
    habilitado: true
  },

  {
    id: "cliente_json",
    nombre: "Cliente JSON - Ejemplo futuro",
    descripcion: "Ejemplo para una API propia que devuelva alertas JSON.",
    tipoApi: "json",
    url: "https://tuservidor.com/alertas.json",
    habilitado: false
  }
];