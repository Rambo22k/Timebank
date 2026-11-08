import { Injectable, signal, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ToastService } from './toast.service';

export type IdentityVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface IdentityVerificationRecord {
  id: string;
  status: IdentityVerificationStatus;
  submitted_at: string;
  review_note: string | null;
}

@Injectable({ providedIn: 'root' })
export class IdentityVerificationService {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly record = signal<IdentityVerificationRecord | null>(null);
  readonly loading = signal(false);
  readonly uploading = signal(false);

  async load(): Promise<void> {
    const userId = this.auth.authUser()?.id;
    if (!userId || !this.supabase.client) {
      this.record.set(null);
      return;
    }

    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.requireClient()
        .from('identity_verifications')
        .select('id,status,submitted_at,review_note')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      this.record.set(data as IdentityVerificationRecord | null);
    } catch {
      this.toast.danger('No se pudo consultar el estado de tu verificación.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(file: File): Promise<boolean> {
    const userId = this.auth.authUser()?.id;
    if (!userId) {
      this.toast.warning('Inicia sesión para solicitar la verificación.');
      return false;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      this.toast.warning('Sube un JPG, PNG, WebP o PDF de hasta 10 MB.');
      return false;
    }
    const currentRecord = this.record();
    if (currentRecord?.status === 'approved') {
      this.toast.info('Tu identidad ya está verificada.');
      return false;
    }

    const extensionByType: Record<string, string> = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf'
    };
    const documentPath = `${userId}/${crypto.randomUUID()}.${extensionByType[file.type]}`;
    const client = this.supabase.requireClient();
    this.uploading.set(true);
    try {
      const { error: uploadError } = await client.storage.from('identity-documents').upload(documentPath, file, {
        cacheControl: '3600', contentType: file.type, upsert: false
      });
      if (uploadError) throw uploadError;

      if (currentRecord?.status === 'pending') {
        const { data: oldPath, error: replaceError } = await client.rpc('replace_pending_identity_document', {
          p_verification_id: currentRecord.id,
          p_document_path: documentPath
        });
        if (replaceError) {
          await client.storage.from('identity-documents').remove([documentPath]);
          throw replaceError;
        }
        if (oldPath && oldPath !== documentPath) {
          const { error: cleanupError } = await client.storage.from('identity-documents').remove([oldPath as string]);
          if (cleanupError) this.toast.warning('El documento se reemplazó, pero no se pudo limpiar el archivo anterior.');
        }
      } else {
        const { error: insertError } = await client.from('identity_verifications').insert({
          user_id: userId,
          document_path: documentPath,
          status: 'pending'
        });
        if (insertError) {
          await client.storage.from('identity-documents').remove([documentPath]);
          throw insertError;
        }
      }

      this.toast.success(currentRecord?.status === 'pending'
        ? 'Documento reemplazado. El equipo revisará el archivo actualizado.'
        : 'Documento enviado. El equipo revisará tu solicitud.');
      await this.load();
      return true;
    } catch (error) {
      this.toast.danger(this.messageFor(error));
      return false;
    } finally {
      this.uploading.set(false);
    }
  }

  private messageFor(error: unknown): string {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('one_pending_verification_per_user') || message.includes('duplicate key')) {
      return 'Ya tienes una verificación pendiente de revisión.';
    }
    if (message.includes('row-level security') || message.includes('permission')) {
      return 'No tienes permiso para enviar este documento. Comprueba que tu cuenta siga activa.';
    }
    return 'No se pudo enviar el documento. Inténtalo de nuevo.';
  }
}
