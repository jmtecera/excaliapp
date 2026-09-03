import { createMemo, createSignal } from "solid-js";

export type Locale = "en" | "es";

const LOCALE_STORAGE_KEY = "excalidrawLocale";

const [locale, setLocaleSignal] = createSignal<Locale>(readLocale());

export { locale };

export function setLocale(nextLocale: Locale): void {
  setLocaleSignal(nextLocale);

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  } catch {
    // Preferences are best-effort when storage is unavailable.
  }
}

const en = {
  appName: "Excaliapp Rooms",
  defaultRoomName: "Untitled room",
  landing: {
    tagline: "Shared boards with a simple room code",
    seoTitle: "Shared Excalidraw rooms | Excaliapp Rooms",
    seoDescription:
      "Create and share Excalidraw rooms with a short code. Collaborate on boards with shared presence and a synchronized Pomodoro timer.",
    heroLead: "A room for every",
    heroAccent: "great idea.",
    description:
      "Create and share Excalidraw boards with a memorable room code. Nothing to configure, nothing in the way.",
    enterTitle: "Enter a room",
    enterDescription: "Use a shared code or start a new room.",
    name: "Your name",
    roomCode: "Room code",
    enterRoom: "Enter room",
    or: "or",
    generate: "Generate a new room",
    generating: "Generating room",
    recent: "Recent rooms",
    footer: "Proudly Made in Argentina",
    contact: "Tecera Software",
  },
  room: {
    leave: "Leave room",
    saveName: "Save room name",
    cancel: "Cancel",
    refresh: "Refresh room",
    newBoard: "New board",
    question: "What are we drawing?",
    boardName: "Board name",
    createBoard: "Create board",
    addExisting: "Add an existing Excalidraw link",
    addLink: "Add link",
    details: "Room details",
    shareHint: "Anyone with the code can join.",
    copyInvite: "Copy invite link",
    synced: "Synced",
    offline: "Offline",
    roomCode: "Room code",
    updated: "Updated",
    waitingSync: "Waiting for the first sync.",
    profile: "Your profile",
    email: "Email for Gravatar (optional)",
    saveProfile: "Save profile",
    settings: "Room settings",
    settingsDescription: "Manage the shared room name, focus timer, and optional PIN.",
    openSettings: "Open",
    roomName: "Room name",
    roomNameDescription: "Visible to everyone sharing this room.",
    pinProtection: "PIN protection",
    pinDescription: "Require a 4-digit PIN when someone joins on a new device.",
    pinEnabled: "PIN enabled",
    pinDisabled: "No PIN",
    pinPlaceholder: "4-digit PIN",
    enablePin: "Enable PIN",
    changePin: "Change PIN",
    disablePin: "Disable PIN",
    latestBoard: "Latest board",
    latestBoardHint: "The board opened most recently in this room.",
    active: "Active",
    archived: "Archived",
    importCsv: "Import CSV",
    exportCsv: "Export CSV",
    imported: (boards: number, errors: number) =>
      `${boards} board${boards === 1 ? "" : "s"} imported${
        errors > 0 ? `, ${errors} row${errors === 1 ? "" : "s"} skipped` : ""
      }.`,
    row: "Row",
    moreInvalid: (count: number) => `And ${count} more invalid rows.`,
  },
  boards: {
    noArchived: "No archived boards",
    noBoards: "No boards yet",
    archivedHint: "Archived boards will appear here.",
    emptyHint: "Create the first board for this room.",
    board: "Board",
    updated: "Updated",
    actions: "Actions",
    archived: "Archived",
    saveName: "Save name",
    cancel: "Cancel",
    copy: "Copy link",
    rename: "Rename",
    restore: "Restore",
    archive: "Archive",
    open: "Open board",
    openPrimary: "Open",
  },
  participant: {
    you: "you",
  },
  preferences: {
    open: "Open preferences",
    language: "Language",
    english: "English",
    spanish: "Español",
    theme: "Theme",
    dark: "Dark",
    light: "Light",
    system: "System",
  },
  time: {
    never: "never",
    now: "now",
    minutesAgo: (value: number) => `${value}m ago`,
    hoursAgo: (value: number) => `${value}h ago`,
    daysAgo: (value: number) => `${value}d ago`,
  },
  toast: {
    roomCreated: "Room created",
    roomJoined: "Room joined",
    profileUpdated: "Profile updated",
    boardCreated: "Board created",
    boardAdded: "Board link added",
    boardRestored: "Board restored",
    boardArchived: "Board archived",
    roomRefreshed: "Room refreshed",
    roomCodeCopied: "Room code copied",
    inviteCopied: "Invite link copied",
    boardLinkCopied: "Board link copied",
    pinEnabled: "PIN protection enabled",
    pinChanged: "Room PIN changed",
    pinDisabled: "PIN protection disabled",
    enterNameToSync: "Enter your name before syncing",
    pomodoroComplete: "Pomodoro complete",
  },
  error: {
    createRoom: "Could not create a room",
    joinRoom: "Could not join that room",
    renameRoom: "Could not rename the room",
    updateProfile: "Could not update your profile",
    createBoard: "Could not create the board",
    addBoard: "Could not add the board",
    sync: "Sync failed",
    timerUpdate: "Could not update the shared timer",
    pinUpdate: "Could not update the room PIN",
    pinFormat: "PIN must be exactly 4 digits.",
    nameRequired: "Enter your name first.",
    codeFormat: "Enter a room code in the format ABC-123.",
    roomNameRequired: "Room name cannot be empty.",
    boardLinkRequired: "Enter an Excalidraw board link.",
    invalidBoardLink: "That does not look like a valid Excalidraw board link.",
    invalidBoardData: "Invalid Excalidraw room id or key.",
    boardKey: "Could not generate a valid Excalidraw room key.",
  },
  csv: {
    empty: "The CSV file is empty.",
    missingColumns: (columns: string[]) =>
      `Missing column${columns.length > 1 ? "s" : ""}: ${columns.join(", ")}.`,
    nameRequired: "board_name is required.",
    archivedBoolean: "archived must be true or false.",
    invalidUrl: "Invalid Excalidraw URL.",
  },
  pin: {
    title: "This room is protected",
    description: "Enter the 4-digit room PIN to continue.",
    label: "Room PIN",
    submit: "Enter room",
    cancel: "Cancel",
    invalid: "Enter exactly 4 digits.",
  },
  pomodoro: {
    title: "Team focus",
    description: (minutes: number) =>
      `A shared ${minutes}-minute Pomodoro for everyone in the room.`,
    ready: "Ready",
    focusing: "Focusing",
    paused: "Paused",
    complete: "Complete",
    start: "Start",
    pause: "Pause",
    reset: "Reset timer",
    settingsTitle: "Focus timer",
    settingsDescription: "Set the shared countdown length. Saving resets the current countdown.",
    duration: "Pomodoro duration in minutes",
    durationRange: "From 1 to 120 minutes",
    saveDuration: "Save",
    totalWorked: "Total focused",
    resetTotal: "Reset total",
  },
} as const;

type Widen<Template> = Template extends (...args: infer Arguments) => infer Result
  ? (...args: Arguments) => Result
  : Template extends string
    ? string
    : Template extends object
      ? { [Key in keyof Template]: Widen<Template[Key]> }
      : Template;

type Messages = Widen<typeof en>;

const es: Messages = {
  appName: "Excaliapp Rooms",
  defaultRoomName: "Sala sin nombre",
  landing: {
    tagline: "Pizarras compartidas con un código simple",
    seoTitle: "Salas compartidas de Excalidraw | Excaliapp Rooms",
    seoDescription:
      "Creá y compartí salas de Excalidraw con un código corto. Pizarras colaborativas y un temporizador Pomodoro sincronizado, sin configuración.",
    heroLead: "Una sala para cada",
    heroAccent: "gran idea.",
    description:
      "Creá y compartí pizarras de Excalidraw con un código fácil de recordar. Sin configurar nada, sin estorbarte.",
    enterTitle: "Entrá a una sala",
    enterDescription: "Usá un código compartido o empezá una sala nueva.",
    name: "Tu nombre",
    roomCode: "Código de sala",
    enterRoom: "Entrar a la sala",
    or: "o",
    generate: "Generar una sala nueva",
    generating: "Generando sala",
    recent: "Salas recientes",
    footer: "Hecho con orgullo en Argentina",
    contact: "Tecera Software",
  },
  room: {
    leave: "Salir de la sala",
    saveName: "Guardar nombre de sala",
    cancel: "Cancelar",
    refresh: "Actualizar sala",
    newBoard: "Nueva pizarra",
    question: "¿Qué vamos a dibujar?",
    boardName: "Nombre de la pizarra",
    createBoard: "Crear pizarra",
    addExisting: "Agregar un enlace de Excalidraw existente",
    addLink: "Agregar enlace",
    details: "Detalles de la sala",
    shareHint: "Cualquiera con el código puede entrar.",
    copyInvite: "Copiar enlace de invitación",
    synced: "Sincronizada",
    offline: "Sin conexión",
    roomCode: "Código de sala",
    updated: "Actualizada",
    waitingSync: "Esperando la primera sincronización.",
    profile: "Tu perfil",
    email: "Email para Gravatar (opcional)",
    saveProfile: "Guardar perfil",
    settings: "Configuración de la sala",
    settingsDescription: "Administrá el nombre, el temporizador y el PIN opcional.",
    openSettings: "Abrir",
    roomName: "Nombre de la sala",
    roomNameDescription: "Lo ve todo el mundo que comparte esta sala.",
    pinProtection: "Protección con PIN",
    pinDescription: "Pedí un PIN de 4 dígitos cuando alguien entra desde un dispositivo nuevo.",
    pinEnabled: "PIN activado",
    pinDisabled: "Sin PIN",
    pinPlaceholder: "PIN de 4 dígitos",
    enablePin: "Activar PIN",
    changePin: "Cambiar PIN",
    disablePin: "Desactivar PIN",
    latestBoard: "Última pizarra",
    latestBoardHint: "La pizarra abierta más recientemente en esta sala.",
    active: "Activas",
    archived: "Archivadas",
    importCsv: "Importar CSV",
    exportCsv: "Exportar CSV",
    imported: (boards: number, errors: number) =>
      `Se importaron ${boards} pizarra${boards === 1 ? "" : "s"}${
        errors > 0 ? `; se omitieron ${errors} fila${errors === 1 ? "" : "s"}` : ""
      }.`,
    row: "Fila",
    moreInvalid: (count: number) => `Y ${count} filas inválidas más.`,
  },
  boards: {
    noArchived: "No hay pizarras archivadas",
    noBoards: "Todavía no hay pizarras",
    archivedHint: "Las pizarras archivadas van a aparecer acá.",
    emptyHint: "Creá la primera pizarra de esta sala.",
    board: "Pizarra",
    updated: "Actualizada",
    actions: "Acciones",
    archived: "Archivada",
    saveName: "Guardar nombre",
    cancel: "Cancelar",
    copy: "Copiar enlace",
    rename: "Renombrar",
    restore: "Restaurar",
    archive: "Archivar",
    open: "Abrir pizarra",
    openPrimary: "Abrir",
  },
  participant: {
    you: "vos",
  },
  preferences: {
    open: "Abrir preferencias",
    language: "Idioma",
    english: "English",
    spanish: "Español",
    theme: "Tema",
    dark: "Oscuro",
    light: "Claro",
    system: "Sistema",
  },
  time: {
    never: "nunca",
    now: "ahora",
    minutesAgo: (value: number) => `hace ${value} min`,
    hoursAgo: (value: number) => `hace ${value} h`,
    daysAgo: (value: number) => `hace ${value} d`,
  },
  toast: {
    roomCreated: "Sala creada",
    roomJoined: "Entraste a la sala",
    profileUpdated: "Perfil actualizado",
    boardCreated: "Pizarra creada",
    boardAdded: "Enlace de pizarra agregado",
    boardRestored: "Pizarra restaurada",
    boardArchived: "Pizarra archivada",
    roomRefreshed: "Sala actualizada",
    roomCodeCopied: "Código de sala copiado",
    inviteCopied: "Enlace de invitación copiado",
    boardLinkCopied: "Enlace de pizarra copiado",
    pinEnabled: "Protección con PIN activada",
    pinChanged: "PIN de sala cambiado",
    pinDisabled: "Protección con PIN desactivada",
    enterNameToSync: "Ingresá tu nombre antes de sincronizar",
    pomodoroComplete: "Pomodoro terminado",
  },
  error: {
    createRoom: "No se pudo crear la sala",
    joinRoom: "No se pudo entrar a esa sala",
    renameRoom: "No se pudo cambiar el nombre de la sala",
    updateProfile: "No se pudo actualizar tu perfil",
    createBoard: "No se pudo crear la pizarra",
    addBoard: "No se pudo agregar la pizarra",
    sync: "Falló la sincronización",
    timerUpdate: "No se pudo actualizar el temporizador compartido",
    pinUpdate: "No se pudo actualizar el PIN de la sala",
    pinFormat: "El PIN debe tener exactamente 4 dígitos.",
    nameRequired: "Primero ingresá tu nombre.",
    codeFormat: "Ingresá un código con el formato ABC-123.",
    roomNameRequired: "El nombre de la sala no puede estar vacío.",
    boardLinkRequired: "Ingresá un enlace de pizarra de Excalidraw.",
    invalidBoardLink: "El enlace no parece ser una pizarra válida de Excalidraw.",
    invalidBoardData: "El identificador o la clave de Excalidraw no son válidos.",
    boardKey: "No se pudo generar una clave válida para Excalidraw.",
  },
  csv: {
    empty: "El archivo CSV está vacío.",
    missingColumns: (columns: string[]) =>
      `Falta${columns.length > 1 ? "n" : ""} la${columns.length > 1 ? "s" : ""} columna${columns.length > 1 ? "s" : ""}: ${columns.join(", ")}.`,
    nameRequired: "board_name es obligatorio.",
    archivedBoolean: "archived debe ser true o false.",
    invalidUrl: "El enlace de Excalidraw no es válido.",
  },
  pin: {
    title: "Esta sala está protegida",
    description: "Ingresá el PIN de 4 dígitos para continuar.",
    label: "PIN de sala",
    submit: "Entrar a la sala",
    cancel: "Cancelar",
    invalid: "Ingresá exactamente 4 dígitos.",
  },
  pomodoro: {
    title: "Enfoque del equipo",
    description: (minutes: number) =>
      `Un Pomodoro compartido de ${minutes} minutos para toda la sala.`,
    ready: "Listo",
    focusing: "En curso",
    paused: "Pausado",
    complete: "Terminado",
    start: "Iniciar",
    pause: "Pausar",
    reset: "Reiniciar temporizador",
    settingsTitle: "Temporizador de enfoque",
    settingsDescription: "Definí la duración. Al guardar se reinicia la cuenta regresiva.",
    duration: "Duración del Pomodoro en minutos",
    durationRange: "De 1 a 120 minutos",
    saveDuration: "Guardar",
    totalWorked: "Enfoque acumulado",
    resetTotal: "Reiniciar total",
  },
};

const dictionaries: Record<Locale, Messages> = { en, es };

export const text = createMemo(() => dictionaries[locale()]);

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === "en" || stored === "es") {
      return stored;
    }
  } catch {
    // Browser language detection still works when storage is unavailable.
  }

  return detectBrowserLocale();
}

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return "es";
  }

  const candidates = [...(navigator.languages || []), navigator.language];

  for (const candidate of candidates) {
    const language = candidate?.toLowerCase().split("-")[0];

    if (language === "es" || language === "en") {
      return language;
    }
  }

  return "es";
}
