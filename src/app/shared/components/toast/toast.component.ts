import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  informationCircleOutline,
  warningOutline,
  closeCircleOutline,
  closeOutline
} from 'ionicons/icons';
import { ToastService } from '../../../core/services/toast.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [
    TranslatePipe,CommonModule, IonIcon],
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss']
})
export class ToastComponent {
  toastService = inject(ToastService);

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      informationCircleOutline,
      warningOutline,
      closeCircleOutline,
      closeOutline
    });
  }

  getIconName(type: string): string {
    switch (type) {
      case 'success':
        return 'checkmark-circle-outline';
      case 'warning':
        return 'warning-outline';
      case 'danger':
        return 'close-circle-outline';
      default:
        return 'information-circle-outline';
    }
  }
}
