import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly isConfigured: boolean;
  readonly client: SupabaseClient | null;

  constructor() {
    const url = environment.supabaseUrl.trim();
    const key = environment.supabasePublishableKey.trim();
    this.isConfigured = /^https:\/\/[\w.-]+\.supabase\.co$/.test(url) && key.length > 20;
    this.client = this.isConfigured
      ? createClient(url, key, {
          auth: {
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
            persistSession: true
          }
        })
      : null;
  }

  requireClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('El servicio de acceso no está disponible. Inténtalo de nuevo más tarde.');
    }
    return this.client;
  }
}
