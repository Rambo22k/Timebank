import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { AuthService } from '../../../core/services/auth.service';
import {
  timeOutline,
  sparklesOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule, IonIcon],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent {
  currentYear = new Date().getFullYear();

  constructor(public authService: AuthService) {
    addIcons({
      timeOutline,
      sparklesOutline
    });
  }
}
