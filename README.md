# TimeBank — Plataforma de Intercambio de Tiempo y Habilidades

> **Responsabilidad de Desarrollo:** Frontend Only  
> **Desarrollador & Diseñador UI/UX:** Enyel Reyes  
> **Framework:** Angular 22 & Ionic 9 (Standalone Components, TypeScript, SCSS Modular)  
> **Regla de Valor:** **1 hora de ayuda = 1 crédito de tiempo**

---

## 1. Concepto y Visión

**TimeBank** es una plataforma colaborativa y solidaria donde las personas intercambian habilidades, conocimientos y servicios utilizando el **tiempo humano como unidad de valor**, sin necesidad de intercambiar dinero en efectivo.

- Si enseñas una hora de programación frontend, recibes **1 crédito de tiempo**.
- Con ese crédito, puedes recibir una hora de francés, música, diseño o cálculo de cualquier otro miembro de la comunidad.
- El intercambio es multilateral y circular (A ayuda a B, B ayuda a C, C ayuda a A), eliminando deudas directas o intermediarios comerciales.

---

## 2. Identidad Visual Oficial

Inspirado en la marca oficial de TimeBank (el reloj abstracto, las manos entrelazadas y la tipografía moderna):

| Elemento | Variable SCSS | Color Hex | Uso |
| :--- | :--- | :--- | :--- |
| **Teal Principal** | `$tb-teal` | `#087B76` | Color primario de marca, botones principales, enlaces |
| **Teal Oscuro** | `$tb-teal-dark` | `#075B58` | Contrastes profundos, encabezados, fondos destacados |
| **Naranja Acento** | `$tb-orange` | `#F59A00` | Acentos estratégicos, insignias de tiempo, acciones clave |
| **Fondo Claro** | `$tb-bg` | `#F7F8F5` | Fondo editorial suave y descansado |
| **Blanco Superficie**| `$tb-white` | `#FFFFFF` | Tarjetas, modales y elementos elevados |
| **Texto Primario** | `$tb-text-primary` | `#142927` | Títulos y textos principales de alta legibilidad |
| **Texto Secundario**| `$tb-text-secondary`| `#687773` | Descripciones, párrafos y metadatos |
| **Bordes Sutiles** | `$tb-border` | `#E4E9E5` | Divisiones arquitectónicas limpias |

---

## 3. Módulos y Funcionalidades Frontend Implementadas

### A. Landing Page (`/`)
- **Navegación Dinámica:** Navbar con logo oficial, selector de rutas, pill de créditos de tiempo en vivo, avatar y menú lateral animado (*drawer*) para dispositivos móviles.
- **Hero Asimétrico y Memorables:** Titular editorial de alto impacto con el convertidor interactivo de tiempo en vivo (*1 hora de Programación = 1 hora de Francés = 1 crédito*).
- **Gráfico Temporal Artístico (`<app-time-orbit>`):** Órbitas SVG con manecillas de reloj giratorias, nodos conectados (Elena, Carlos, Sofía, Mateo) y pulsos armónicos respetuosos con `prefers-reduced-motion`.
- **Cómo Funciona:** 4 etapas metodológicas numeradas con geometría limpia.
- **El Valor del Tiempo:** Filosofía de equidad y diagrama interactivo del flujo circular multilateral sin dinero.
- **Descubrimiento de Habilidades:** Tarjetas por categorías (Tecnología, Idiomas, Diseño, Música, Apoyo Académico, Negocios, Bienestar) y carrusel de publicaciones destacadas interactivas.
- **Manifiesto de Comunidad:** Declaración editorial de valor e impacto social.
- **Preguntas Frecuentes (FAQ):** Acordeón interactivo con respuestas precisas.
- **CTA Final & Footer:** Cierre con acceso rápido y créditos de autoría.

### B. Registro, Inicio de Sesión y Recuperación (`/auth/*`)
- **Inicio de Sesión (`/auth/login`):** Autenticación real por correo y contraseña o Google, restauración de sesión persistente y protección de rutas privadas.
- **Registro (`/auth/register`):** Nombre, correo, fecha de nacimiento (mínimo 18 años), contraseña y aceptación explícita de términos y privacidad. Usa la confirmación de correo de Supabase.
- **Recuperación (`/auth/forgot-password` y `/auth/update-password`):** Enlace real por correo y formulario para guardar una contraseña nueva.
- **Confirmación y alta (`/auth/callback`, `/auth/complete-profile`):** Procesa el retorno de Auth y solicita los datos privados pendientes para cuentas que llegan desde Google.

### C. Perfiles de Usuario (`/profile` y `/profile/:id`)
- **Presentación Personal:** Portada, avatar con indicador de estado activo, nombre, titular profesional, ubicación y fecha de ingreso.
- **Widget de Saldo de Banco de Tiempo:** 
  - Saldo de créditos disponibles en vivo.
  - Horas compartidas impartiendo sesiones.
  - Horas recibidas aprendiendo de otros miembros.
  - Total de intercambios exitosos y calificación comunitaria con estrellas.
- **Pestañas de Habilidades:** Separador entre *Habilidades que Ofrezco* y *Habilidades que Busco Aprender*.
- **Selector de Perspectiva:** Barra para alternar instantáneamente la vista entre los diferentes miembros de la comunidad demo (Enyel, Elena, Carlos, Sofía, Mateo, Claudia).
- **Modal de Edición de Perfil (`<app-edit-profile-modal>`):** Formulario para actualizar titular, bio, ubicación y selector de avatares fotográficos, reflejado inmediatamente en memoria.

### D. Gestión de Habilidades (`/skills`)
- **Panel CRUD Completo en Memoria:**
  - **Listar:** Visualización de todas las habilidades del usuario activo.
  - **Filtrar:** Filtros rápidos por *Todas*, *Ofrezco* y *Busco* con contadores en tiempo real.
  - **Crear (`<app-skill-form-modal>`):** Formulario con validación para registrar título, categoría, nivel de dominio, modalidad (Online/Presencial), disponibilidad y descripción.
  - **Consultar Detalle (`<app-skill-detail-modal>`):** Vista modal completa de la habilidad.
  - **Editar:** Modificación reactiva de los datos existentes.
  - **Eliminar (`<app-confirmation-modal>`):** Diálogo modal de confirmación antes de eliminar permanentemente del estado local.

### E. Búsqueda y Descubrimiento (`/explore`)
- **Buscador Reactivo en Tiempo Real:** Filtra sobre el título, descripción, autor o etiquetas (`#Python`, `#Figma`, etc.).
- **Filtros por Categoría:** Carrusel de botones de categorías con conteo de publicaciones activas.
- **Filtros Adicionales:** Segmento de tipo (*Todas*, *Ofrecidas*, *Buscadas*), selector de modalidad (*Online*, *Presencial*, *Híbrido*) y ordenamiento (*Más recientes*, *Mejor calificación*, *Alfabético*).
- **Feedback & Estados Vacíos:** Contador en vivo de resultados encontrados, botón para limpiar filtros y `<app-empty-state>` personalizado.
- **Modal de Propuesta de Intercambio (`<app-exchange-modal>`):** Permite proponer una fecha, una duración en bloques de 15 minutos y un mensaje. La solicitud demo se muestra en el módulo de Intercambios.

### F. Intercambios y créditos (módulo demo de Ernesto)
- **Solicitudes (`/exchanges/requests`):** Vistas de solicitudes recibidas y enviadas, con acciones para aceptar, rechazar, cancelar o proponer y aceptar otro horario.
- **Sesiones (`/exchanges/sessions`):** Próximas sesiones e historial, confirmación de finalización por ambas partes y apertura de disputas demo.
- **Billetera (`/wallet`):** Saldo disponible e historial demo de créditos de bienvenida, reservas, créditos ganados, gastos y devoluciones.
- **Reseñas (`/exchanges/reviews`):** Reseñas pendientes y recibidas; permite publicar una calificación de 1 a 5 estrellas tras completar una sesión.
- Las interacciones de este módulo usan estado en memoria. Se conectarán a Supabase después de integrar Auth.

### G. Sistema Visual Compartido & Componentes
- `NavbarComponent`: Navegación sticky responsive y drawer móvil.
- `FooterComponent`: Pie de página editorial con arquitectura e información.
- `SkillCardComponent`: Tarjeta de habilidad con tags, modalidad, valor de tiempo y autor.
- `TimeOrbitComponent`: Gráfico temporal geométrico y nodos enlazados.
- `ConfirmationModalComponent`: Diálogo modal accesible para confirmaciones y borrados.
- `EmptyStateComponent`: Estados visuales ante filtros vacíos o listas sin elementos.
- `ToastComponent` & `ToastService`: Notificaciones flotantes no invasivas (*success*, *warning*, *info*, *danger*).

---

## 4. Estructura del Proyecto

```
Timebank/
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── mock-data/       # Datos ficticios coherentes (usuarios, habilidades, categorías)
│   │   │   ├── models/          # Interfaces TypeScript (user, skill, category)
│   │   │   └── services/        # Servicios reactivos en memoria (auth, skills, toast)
│   │   ├── features/
│   │   │   ├── auth/            # Login, Register, Forgot Password
│   │   │   ├── discovery/       # Búsqueda interactiva y modal de intercambio
│   │   │   ├── exchanges/       # Solicitudes, sesiones, billetera e historial de reseñas
│   │   │   ├── landing/         # Landing page pública editorial
│   │   │   ├── profile/         # Perfil de usuario y modal de edición
│   │   │   └── skills/          # Gestión CRUD de habilidades y modales
│   │   ├── shared/
│   │   │   └── components/      # Navbar, Footer, SkillCard, TimeOrbit, Modals, Toast, EmptyState
│   │   ├── app.component.*
│   │   └── app.routes.ts        # Enrutamiento Angular SPA
│   ├── assets/
│   │   └── images/
│   │       └── logo.png         # Logo oficial TimeBank (Reloj y manos)
│   ├── theme/
│   │   └── variables.scss       # Tokens de diseño oficiales
│   ├── global.scss              # Tipografía, botones, utilidades y accesibilidad
│   └── index.html               # Fuentes Plus Jakarta Sans & Space Grotesk
├── angular.json
├── package.json
└── tsconfig.json
```

---

## 5. Instrucciones para Ejecutar el Frontend

### Requisitos Previos
- **Node.js** (v18, v20 o v22 LTS)
- **NPM**

### Paso 1: Clonar o Situarse en la Carpeta
```bash
cd c:\Users\Rambo\Documents\Timebank
```

### Paso 2: Instalar Dependencias (si es necesario)
```bash
npm install
```

El cliente de Supabase se configura en `src/environments/environment.ts` y `src/environments/environment.prod.ts` mediante la URL del proyecto y su clave pública `anon`/publishable. Nunca uses una clave `service_role` o `secret` en la aplicación web.

En Supabase Auth, habilita Email y Google. En **Authentication → URL Configuration**, permite `http://localhost:4200/auth/callback` y `http://localhost:4200/auth/update-password`, además de las rutas equivalentes del dominio publicado. La URL de sitio local para desarrollo es `http://localhost:4200`.

### Paso 3: Iniciar el Servidor de Desarrollo
Puedes iniciar la aplicación usando Angular CLI o Ionic CLI:

```bash
# Opción 1 (Estándar):
npm start

# Opción 2 (Ionic):
npx ionic serve
```

### Paso 4: Abrir en el Navegador
Abre [http://localhost:4200](http://localhost:4200) (o el puerto indicado en la terminal) para interactuar con toda la experiencia visual de TimeBank.

---

## 6. Delimitación de Responsabilidad (Frontend demo; Supabase pendiente)

Conforme a las especificaciones del encargo:
- **La aplicación todavía no está conectada al backend de Supabase.** El esquema SQL vive en `supabase/migrations/`, pero los servicios Angular usan datos de demostración en memoria.
- Todo el ciclo de vida, autenticación, creación de habilidades, edición de perfiles, solicitudes, sesiones, movimientos demo de créditos y filtros funcionan de manera interactiva **en memoria mediante estado local y servicios reactivos de Angular**.
- Las pantallas de solicitudes, sesiones, billetera, historial, disputas y reseñas ya están implementadas como demo. Sus operaciones reales dependen de Supabase Auth y de las funciones RPC descritas en `supabase/README.md`.
- El saldo de bienvenida de la experiencia demo es de **5 créditos**. La migración incremental de Supabase actualiza la configuración para que las cuentas nuevas reciban 5 créditos cuando se aplique al proyecto remoto.
