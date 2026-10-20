import { Injectable, signal, computed } from '@angular/core';
import { UserProfile } from '../models/user.model';
import { MOCK_USERS } from '../mock-data/users.mock';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersSignal = signal<UserProfile[]>([...MOCK_USERS]);
  // Default to Enyel Reyes for immediate interactive demonstration
  private currentUserSignal = signal<UserProfile | null>(MOCK_USERS[0]);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly allUsers = this.usersSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  constructor(private toastService: ToastService) {}

  login(email: string, _password: string): Promise<boolean> {
    return new Promise(resolve => {
      // Simulate client-side authentication latency
      setTimeout(() => {
        const found = this.usersSignal().find(
          u => u.email.toLowerCase() === email.trim().toLowerCase()
        );

        if (found) {
          this.currentUserSignal.set(found);
          this.toastService.success(`¡Bienvenido de vuelta, ${found.name}!`);
          resolve(true);
        } else {
          // If not in the pre-defined list, create a demo session for the email entered
          const demoUser: UserProfile = {
            id: 'user-' + Date.now(),
            name: email.split('@')[0],
            email: email,
            headline: 'Miembro de la Comunidad TimeBank',
            bio: 'Nuevo usuario explorando el intercambio de habilidades.',
            avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
            location: 'Comunidad Global',
            timeCredits: 5, // Bienvenida con 5 créditos de tiempo
            hoursGiven: 0,
            hoursReceived: 0,
            completedExchanges: 0,
            memberSince: 'Octubre 2026',
            rating: 5.0,
            reviewsCount: 0,
            badges: ['Nuevo Miembro', '5 Créditos de Bienvenida']
          };

          this.usersSignal.update(users => [demoUser, ...users]);
          this.currentUserSignal.set(demoUser);
          this.toastService.success(`Sesión iniciada con éxito para ${demoUser.name}`);
          resolve(true);
        }
      }, 500);
    });
  }

  register(userData: { name: string; email: string; password?: string }): Promise<boolean> {
    return new Promise(resolve => {
      setTimeout(() => {
        const newUser: UserProfile = {
          id: 'user-' + Date.now(),
          name: userData.name,
          email: userData.email,
          headline: 'Nuevo Miembro de TimeBank',
          bio: 'Listo para compartir conocimientos y aprender nuevas habilidades con la comunidad.',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
          location: 'República Dominicana / Online',
          timeCredits: 5, // Bonificación inicial de 5 créditos
          hoursGiven: 0,
          hoursReceived: 0,
          completedExchanges: 0,
          memberSince: 'Octubre 2026',
          rating: 5.0,
          reviewsCount: 0,
          badges: ['Pionero 2026', 'Crédito Inicial Otorgado']
        };

        this.usersSignal.update(users => [newUser, ...users]);
        this.currentUserSignal.set(newUser);
        this.toastService.success(`¡Cuenta creada con éxito! Has recibido 5 créditos de bienvenida.`);
        resolve(true);
      }, 600);
    });
  }

  logout(): void {
    this.currentUserSignal.set(null);
    this.toastService.info('Has cerrado sesión en modo demostración.');
  }

  switchUser(userId: string): void {
    const user = this.usersSignal().find(u => u.id === userId);
    if (user) {
      this.currentUserSignal.set(user);
      this.toastService.info(`Cambiado a perfil: ${user.name}`);
    }
  }

  updateCurrentUserProfile(updates: Partial<UserProfile>): void {
    const current = this.currentUserSignal();
    if (!current) return;

    const updated = { ...current, ...updates };
    this.currentUserSignal.set(updated);
    this.usersSignal.update(users =>
      users.map(u => (u.id === current.id ? updated : u))
    );
    this.toastService.success('Perfil actualizado correctamente en memoria.');
  }
}
