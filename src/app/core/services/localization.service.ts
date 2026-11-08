import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ENGLISH_TRANSLATIONS } from '../data/translations.en';

export type AppLanguage = 'es' | 'en';

@Injectable({ providedIn: 'root' })
export class LocalizationService {
  private readonly auth = inject(AuthService);
  private readonly temporaryLanguage = signal<AppLanguage | null>(null);
  readonly language = computed<AppLanguage>(() => this.temporaryLanguage()
    ?? this.auth.currentUser()?.preferredLanguage
    ?? this.readSavedLanguage());
  readonly isEnglish = computed(() => this.language() === 'en');

  async setLanguage(language: AppLanguage): Promise<void> {
    this.saveLanguage(language);
    this.temporaryLanguage.set(language);
    if (this.auth.authUser()) {
      await this.auth.updateLanguagePreference(language);
      this.temporaryLanguage.set(null);
    }
  }

  private readSavedLanguage(): AppLanguage {
    try { return localStorage.getItem('timebank.language') === 'en' ? 'en' : 'es'; }
    catch { return 'es'; }
  }

  private saveLanguage(language: AppLanguage): void {
    try { localStorage.setItem('timebank.language', language); } catch { /* Browser storage may be disabled. */ }
  }
}

// Source strings are Spanish so one catalog is the source of truth for both locales.
const REVIEWED_ENGLISH: Record<string, string> = {
  'Inicio': 'Home', 'Explorar': 'Explore', 'Mis Habilidades': 'My Skills', 'Intercambios': 'Exchanges',
  'Billetera': 'Wallet', 'Administración': 'Admin', 'créditos': 'credits', 'Créditos de tiempo': 'Time credits',
  'Notificaciones': 'Notifications', 'Notificaciones recientes': 'Recent notifications', 'sin leer': 'unread',
  'Marcar leídas': 'Mark all as read', 'Cargando notificaciones…': 'Loading notifications…',
  'Todavía no tienes notificaciones.': 'You have no notifications yet.', 'Iniciar sesión': 'Sign in',
  'Registrarse': 'Sign up', 'Registrarse gratis': 'Sign up free', 'Cerrar sesión': 'Sign out',
  'Explorar Habilidades': 'Explore skills', 'Intercambios y solicitudes': 'Exchanges and requests',
  'Mis sesiones': 'My sessions', 'Billetera e historial': 'Wallet and history', 'Reseñas': 'Reviews',
  'Mi Perfil': 'My Profile', 'Perfil': 'Profile', 'Idioma preferido para notificaciones': 'Application language',
  'Idioma de la aplicación': 'Application language',
  'Mateo': 'Mateo', 'Sofía': 'Sofia', 'Iniciar Sesión': 'Sign in',
  'Crear Cuenta': 'Create account', 'Descubre y Conecta': 'Discover and Connect',
  'Saldo Disponible': 'Available balance',
  'Cambiar contraseña': 'Change password',
  'Confirma tu contraseña actual y elige una nueva de al menos 8 caracteres.': 'Confirm your current password and choose a new one with at least 8 characters.',
  'Contraseña actual': 'Current password',
  'Ingresa tu contraseña actual.': 'Enter your current password.',
  'Confirma la nueva contraseña': 'Confirm the new password',
  'Guardar contraseña': 'Save password',
  '¿No recuerdas tu contraseña?': 'Forgot your password?',
  'Cuenta suspendida': 'Account suspended',
  'Cuenta desactivada': 'Account deactivated',
  'Estado de la cuenta': 'Account status',
  'Motivo': 'Reason',
  'Esta cuenta no puede usar las funciones de TimeBank. Ponte en contacto con un administrador para recibir ayuda.': 'This account cannot use TimeBank features. Contact an administrator for help.',
  'La contraseña actual no es correcta.': 'The current password is incorrect.',
  'No se pudo verificar el correo de esta cuenta.': 'Could not verify the email address for this account.',
  'No se pudo verificar la cuenta actual.': 'Could not verify the current account.',
  'Español': 'Spanish', 'English': 'English', 'País': 'Country', 'Zona horaria': 'Time zone',
  'Idiomas que hablas (máximo 12)': 'Languages you speak (up to 12)', 'Selecciona el país': 'Choose a country',
  'Todos los países': 'All countries', 'Todos los idiomas': 'All languages', 'Idioma:': 'Language:',
  'País:': 'Country:', 'Nueva solicitud de contacto': 'New contact request',
  'Alguien quiere conectar contigo.': 'Someone wants to connect with you.',
  'Te ofrecen enseñar': 'Teaching offer received',
  'Un miembro te ofreció una sesión para aprender una habilidad que buscas.': 'A member offered to teach a skill you want to learn.',
  'Solicitud de contacto aceptada': 'Contact request accepted',
  'Ahora forman parte de los contactos de TimeBank.': 'You are now connected on TimeBank.'
};

const REVIEWED_SPANISH: Record<string, string> = {
  ...Object.fromEntries(Object.entries(REVIEWED_ENGLISH).map(([spanish, english]) => [english, spanish])),
  'Teaching offer received': 'Oferta para enseñar recibida',
  'A member offered to teach a skill you want to learn.': 'Un miembro te ofreció enseñar una habilidad que quieres aprender.',
  'New contact request': 'Nueva solicitud de contacto',
  'Someone wants to connect with you.': 'Alguien quiere conectar contigo.',
  'Contact request accepted': 'Solicitud de contacto aceptada',
  'You are now contacts.': 'Ahora forman parte de tus contactos.',
  'New session request': 'Nueva solicitud de sesión',
  'You received a new session request.': 'Recibiste una nueva solicitud de sesión.',
  'Request accepted': 'Solicitud aceptada',
  'The request was accepted and the session is scheduled.': 'La solicitud fue aceptada y la sesión está programada.',
  'Request declined': 'Solicitud rechazada',
  'The other person is unable to complete this exchange.': 'La otra persona no puede realizar este intercambio.',
  'Request expired': 'Solicitud vencida',
  'The request expired before it received a response.': 'La solicitud venció antes de recibir una respuesta.',
  'Request cancelled': 'Solicitud cancelada',
  'The other person cancelled the request or session.': 'La otra persona canceló la solicitud o la sesión.',
  'Exchange under review': 'Intercambio en revisión',
  'A problem was reported with this exchange.': 'Se reportó un problema con este intercambio.',
  'Session confirmed': 'Sesión confirmada',
  'The other person confirmed that the session took place.': 'La otra persona confirmó que la sesión se realizó.',
  'New review': 'Nueva reseña',
  'You received a review after an exchange.': 'Recibiste una reseña después de un intercambio.',
  'Welcome credits': 'Créditos de bienvenida',
  'Credits were added to your wallet.': 'Se añadieron créditos a tu billetera.',
  'Exchange completed': 'Intercambio completado',
  'The session was completed and your credits were updated.': 'La sesión se completó y tus créditos se actualizaron.',
  'Credits refunded': 'Créditos devueltos',
  'Reserved credits were returned to your wallet.': 'Los créditos reservados se devolvieron a tu billetera.',
  'Donation recorded': 'Donación registrada',
  'Your contribution to the solidarity fund was recorded.': 'Se registró tu aporte al fondo solidario.',
  'Solidarity support received': 'Apoyo solidario recibido',
  'Support credits were added to your wallet.': 'Se añadieron créditos de apoyo a tu billetera.',
  'Credit balance updated': 'Saldo de créditos actualizado',
  'Your wallet balance was updated.': 'Se actualizó el saldo de tu billetera.'
};
const GENERATED_SPANISH = Object.fromEntries(
  Object.entries(ENGLISH_TRANSLATIONS).map(([spanish, english]) => [english, spanish])
);

export function translateText(source: string, language: AppLanguage): string {
  const key = source.trim();
  if (/^[A-Z]{2,3}$/.test(key)) return source;
  if (language === 'en') return REVIEWED_ENGLISH[key] ?? ENGLISH_TRANSLATIONS[key] ?? source;
  return REVIEWED_SPANISH[key] ?? GENERATED_SPANISH[key] ?? source;
}
