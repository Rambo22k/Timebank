import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { timeOutline, swapHorizontalOutline, codeSlashOutline, musicalNotesOutline, globeOutline, colorPaletteOutline } from 'ionicons/icons';

@Component({
  selector: 'app-time-orbit',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './time-orbit.component.html',
  styleUrls: ['./time-orbit.component.scss']
})
export class TimeOrbitComponent {
  constructor() {
    addIcons({
      timeOutline,
      swapHorizontalOutline,
      codeSlashOutline,
      musicalNotesOutline,
      globeOutline,
      colorPaletteOutline
    });
  }
}
