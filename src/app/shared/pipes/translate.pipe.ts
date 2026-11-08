import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocalizationService, translateText } from '../../core/services/localization.service';

@Pipe({ name: 't', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly localization = inject(LocalizationService);

  transform(value: string | null | undefined): string {
    if (!value) return value ?? '';
    return translateText(value, this.localization.language());
  }
}
