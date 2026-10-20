import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { searchOutline, layersOutline, sparklesOutline, refreshOutline } from 'ionicons/icons';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './empty-state.component.html',
  styleUrls: ['./empty-state.component.scss']
})
export class EmptyStateComponent {
  @Input() icon = 'search-outline';
  @Input() title = 'No se encontraron resultados';
  @Input() message = 'Intenta ajustar tus filtros o buscar con otras palabras clave.';
  @Input() actionText?: string;
  @Input() actionIcon = 'refresh-outline';

  @Output() action = new EventEmitter<void>();

  constructor() {
    addIcons({ searchOutline, layersOutline, sparklesOutline, refreshOutline });
  }

  onAction(): void {
    this.action.emit();
  }
}
