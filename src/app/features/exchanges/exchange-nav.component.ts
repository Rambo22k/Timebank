import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { mailOutline, calendarOutline, walletOutline, starOutline, chatbubbleEllipsesOutline } from 'ionicons/icons';

@Component({
  selector: 'app-exchange-nav', standalone: true, imports: [RouterModule, IonIcon],
  template: `<nav class="exchange-nav" aria-label="Mi actividad">
    <a routerLink="/exchanges/requests" routerLinkActive="active"><ion-icon name="mail-outline"></ion-icon>Solicitudes</a>
    <a routerLink="/exchanges/messages" routerLinkActive="active"><ion-icon name="chatbubble-ellipses-outline"></ion-icon>Mensajes</a>
    <a routerLink="/exchanges/sessions" routerLinkActive="active"><ion-icon name="calendar-outline"></ion-icon>Sesiones</a>
    <a routerLink="/wallet" routerLinkActive="active"><ion-icon name="wallet-outline"></ion-icon>Billetera</a>
    <a routerLink="/exchanges/reviews" routerLinkActive="active"><ion-icon name="star-outline"></ion-icon>Reseñas</a>
  </nav>`,
  styles: [`:host{display:block}.exchange-nav{display:flex;gap:8px;overflow-x:auto;padding:7px;background:#eef2ef;border:1px solid var(--tb-border);border-radius:12px;margin:0 0 28px}.exchange-nav a{display:inline-flex;align-items:center;gap:8px;padding:11px 15px;color:var(--tb-text-secondary);font-size:.88rem;font-weight:650;white-space:nowrap;border-radius:8px;transition:.18s}.exchange-nav a:hover{color:var(--tb-teal-dark);background:#fff}.exchange-nav a.active{background:#fff;color:var(--tb-teal-dark);box-shadow:var(--tb-shadow-sm)}.exchange-nav ion-icon{font-size:1.1rem}@media(max-width:520px){.exchange-nav{margin-bottom:20px}.exchange-nav a{padding:10px 12px;font-size:.82rem}}`]
})
export class ExchangeNavComponent {
  constructor() { addIcons({ mailOutline, calendarOutline, walletOutline, starOutline, chatbubbleEllipsesOutline }); }
}
