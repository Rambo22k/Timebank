import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  timeOutline,
  arrowForwardOutline,
  swapHorizontalOutline,
  peopleOutline,
  schoolOutline,
  chevronDownOutline,
  chevronUpOutline,
  checkmarkCircleOutline,
  heartOutline,
  shieldCheckmarkOutline,
  globeOutline,
  codeSlashOutline,
  colorPaletteOutline,
  musicalNotesOutline,
  flashOutline,
  infiniteOutline
} from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { TimeOrbitComponent } from '../../shared/components/time-orbit/time-orbit.component';
import { SkillCardComponent } from '../../shared/components/skill-card/skill-card.component';
import { SkillDetailModalComponent } from '../skills/skill-detail-modal/skill-detail-modal.component';
import { ExchangeModalComponent } from '../discovery/exchange-modal/exchange-modal.component';
import { SkillsService } from '../../core/services/skills.service';
import { AuthService } from '../../core/services/auth.service';
import { Skill } from '../../core/models/skill.model';

interface FaqItem {
  question: string;
  answer: string;
  isOpen: boolean;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonIcon,
    NavbarComponent,
    FooterComponent,
    TimeOrbitComponent,
    SkillCardComponent,
    SkillDetailModalComponent,
    ExchangeModalComponent
  ],
  templateUrl: './landing.page.html',
  styleUrls: ['./landing.page.scss']
})
export class LandingPage {
  selectedSkillForDetail: Skill | null = null;
  detailModalOpen = false;

  selectedSkillForExchange: Skill | null = null;
  exchangeModalOpen = false;

  // Interactive Live Time-Converter Preview in Hero
  selectedSkillA = signal('Programación Frontend');
  selectedSkillB = signal('Conversación en Francés');

  sampleSkillsList = [
    'Programación Frontend',
    'Conversación en Francés',
    'Guitarra Acústica',
    'Design Systems en Figma',
    'Cálculo Diferencial',
    'Producción de Audio'
  ];

  faqs: FaqItem[] = [
    {
      question: '¿Qué es un crédito de tiempo y cómo se calcula?',
      answer: 'En TimeBank la regla fundamental es simple y justa: 1 hora de ayuda equivale a 1 crédito de tiempo. No importa si enseñas física cuántica o conversación básica: el tiempo de cada persona tiene exactamente el mismo valor universal.',
      isOpen: true
    },
    {
      question: '¿Hay dinero de por medio o suscripciones ocultas?',
      answer: 'Ninguno. TimeBank es una red comunitaria basada en la reciprocidad y el valor del tiempo humano. Todos los intercambios se realizan mediante créditos de tiempo, sin dinero ni comisiones.',
      isOpen: false
    },
    {
      question: '¿Tengo que devolverle la hora a la misma persona que me ayudó?',
      answer: 'No. El sistema es multilateral y circular: tú puedes enseñarle 1 hora de guitarra a Carlos, recibir 1 crédito, y usar ese crédito para que Elena te enseñe 1 hora de Python. La comunidad funciona como un banco cooperativo de tiempo.',
      isOpen: false
    },
    {
      question: '¿Qué pasa si apenas estoy empezando y no soy experto?',
      answer: '¡Todas las habilidades son bienvenidas! Mucha gente busca iniciarse desde cero en un tema y prefiere aprender con alguien cercano. Además, también puedes publicar lo que deseas aprender para que un mentor te contacte.',
      isOpen: false
    },
    {
      question: '¿Cómo funciona la modalidad de los intercambios?',
      answer: 'Las sesiones pueden acordarse de forma 100% online (videollamada, compartir pantalla) o de manera presencial en tu localidad, según lo especifiquen los perfiles en cada publicación.',
      isOpen: false
    }
  ];

  constructor(
    public skillsService: SkillsService,
    public authService: AuthService
  ) {
    addIcons({
      sparklesOutline,
      timeOutline,
      arrowForwardOutline,
      swapHorizontalOutline,
      peopleOutline,
      schoolOutline,
      chevronDownOutline,
      chevronUpOutline,
      checkmarkCircleOutline,
      heartOutline,
      shieldCheckmarkOutline,
      globeOutline,
      codeSlashOutline,
      colorPaletteOutline,
      musicalNotesOutline,
      flashOutline,
      infiniteOutline
    });
  }

  get featuredSkills(): Skill[] {
    return this.skillsService.skills().filter(s => s.featured).slice(0, 4);
  }

  toggleFaq(index: number): void {
    this.faqs[index].isOpen = !this.faqs[index].isOpen;
  }

  onViewDetail(skill: Skill): void {
    this.selectedSkillForDetail = skill;
    this.detailModalOpen = true;
  }

  onCloseDetail(): void {
    this.detailModalOpen = false;
    this.selectedSkillForDetail = null;
  }

  onExchange(skill: Skill): void {
    this.selectedSkillForExchange = skill;
    this.exchangeModalOpen = true;
  }

  onCloseExchange(): void {
    this.exchangeModalOpen = false;
    this.selectedSkillForExchange = null;
  }

  setSkillA(skillName: string): void {
    this.selectedSkillA.set(skillName);
  }

  setSkillB(skillName: string): void {
    this.selectedSkillB.set(skillName);
  }
}
