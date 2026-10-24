# Base de datos de TimeBank

Esta migración de la base de datos de Supabase constituye la base de datos en ingles para la propuesta de TimeBank. Crea el esquema de PostgreSQL, las restricciones, los índices, las políticas de seguridad a nivel de fila (RLS), los flujos de trabajo de créditos del lado del servidor y los buckets de Storage.

## Aplicar el esquema

1. En Windows, instala Supabase CLI con Scoop. Después ejecuta `scoop bucket add supabase https://github.com/supabase/scoop-bucket.git` y `scoop install supabase`. Verifica con `supabase --version`.
2. Desde la raíz del repositorio, inicializa la configuración con `supabase init`. La carpeta `supabase/migrations/` ya existe; la inicialización añade allí `supabase/config.toml`.
3. Inicia sesión con `supabase login` y vincula el proyecto hospedado con `supabase link --project-ref TU_PROJECT_REF`.
4. Aplica la migración con `supabase db push`.
5. En Supabase Auth, habilita el inicio de sesión mediante correo electrónico y contraseña, así como mediante Google. Configura las URL de redirección permitidas para la PWA y el enlace profundo de Capacitor, y exige la confirmación del correo electrónico.
6. Después de crear la primera cuenta, asigna el rol de administrador de confianza desde el Editor SQL de Supabase:

   ```sql
   insert into public.user_roles (user_id, role)
   values ('YOUR_AUTH_USER_UUID', 'admin');
   ```

   Para los cambios posteriores de roles, utiliza `public.set_user_role(...)` para que queden registrados en el historial de auditoría.

## Contrato de integración de la aplicación

- El registro debe proporcionar `birth_date`, `accepted_terms_at` y `accepted_privacy_at` en los metadatos del usuario de Supabase Auth. Los usuarios también pueden actualizar sus campos privados del perfil después del registro. La edad mínima es de 18 años por defecto.
- La aplicación debe utilizar funciones RPC para las solicitudes de sesiones, la aceptación, la cancelación, la confirmación de sesiones, las disputas, las donaciones de créditos, las aprobaciones de solidaridad, los ajustes administrativos, los cambios de estado de las cuentas y las decisiones de verificación. Nunca debe modificar directamente los saldos ni los registros del libro mayor.
- Los usuarios pueden desactivar temporalmente su cuenta mediante `public.deactivate_my_account()` después de resolver las solicitudes y sesiones pendientes. La eliminación permanente de un usuario de Auth debe realizarse en el servidor mediante la API de administración de Supabase Auth, después de gestionar cualquier saldo de créditos restante.
- Las cantidades de créditos son valores numéricos, donde un crédito representa una hora. La duración de las sesiones debe utilizar incrementos de 15 minutos.
- Sube los avatares al bucket público `profile-avatars`, dentro de una carpeta de primer nivel cuyo nombre sea el UUID del usuario autenticado. Sube los documentos de identidad al bucket privado `identity-documents`, utilizando la misma convención de carpetas. Guarda la ruta del objeto resultante en `profiles.avatar_path` o `identity_verifications.document_path`.
- Las URL de Jitsi se generan cuando se acepta una sesión y solo son visibles para los participantes de la sesión y los administradores mediante RLS.
- Se puede habilitar Realtime para `messages` y `notifications` en la publicación Realtime de Supabase. Las políticas de la base de datos siguen aplicándose a las suscripciones.
- Programa la ejecución periódica de `public.expire_session_requests()` y `public.mark_unconfirmed_sessions_disputed()`, por ejemplo, cada hora mediante Supabase Cron o una Edge Function programada que utilice el rol de servicio. La primera función caduca las solicitudes sin respuesta; la segunda mueve a la cola de disputas las sesiones vencidas con confirmación de una sola parte.
- Utiliza los flujos integrados de confirmación de correo electrónico y recuperación de contraseñas de Supabase Auth. La entrega de notificaciones por correo electrónico y notificaciones push requiere integraciones del lado de la aplicación o mediante Edge Functions. El almacenamiento de tokens y las notificaciones dentro de la aplicación ya están incluidos.

## Módulos incluidos

Perfiles y roles, idiomas, categorías, habilidades ofrecidas y solicitadas, disponibilidad recurrente, solicitudes de sesiones y sesiones, prevención de solapamientos, cuentas de monedero, historial inmutable de transacciones y del libro mayor, reseñas y reputación, verificación de identidad, solicitudes de solidaridad y donaciones, chat privado, bloqueos de usuarios, reportes, notificaciones dentro de la aplicación, tokens de dispositivos para notificaciones push, historial de auditoría, indicadores de abuso, configuración de la aplicación, resumen público del fondo de solidaridad y políticas de Storage.

## Consideraciones de seguridad

- Los perfiles exponen únicamente los campos públicos. La fecha de nacimiento, la aceptación de políticas y el estado de la cuenta se almacenan en `profile_private`.
- Todas las tablas de la aplicación tienen habilitada la seguridad a nivel de fila (RLS). Los usuarios anónimos solo pueden consultar las habilidades activas y los perfiles públicos.
- Los saldos de los monederos solo pueden modificarse dentro de funciones del lado del servidor. Los registros del libro mayor y de las transacciones no pueden actualizarse ni eliminarse.
- Los documentos de identidad se almacenan en un bucket privado de Storage. Solo su propietario y los administradores pueden leerlos.
- Asigna roles de administrador únicamente a cuentas de confianza. La asignación inicial del rol se realiza desde el Editor SQL; los cambios posteriores deben efectuarse mediante la función RPC auditada.
