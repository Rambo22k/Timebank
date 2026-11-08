import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, locationOutline, peopleOutline, searchOutline, shieldCheckmarkOutline, personAddOutline, closeCircleOutline, checkmarkOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { ContactsService, MemberSummary, UserContact } from '../../core/services/contacts.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-members-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent],
  templateUrl: './members.page.html',
  styleUrls: ['./members.page.scss']
})
export class MembersPage {
  community = inject(ContactsService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  query = '';
  activeTab: 'discover' | 'requests' | 'contacts' = 'discover';
  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    addIcons({ checkmarkCircleOutline, locationOutline, peopleOutline, searchOutline, shieldCheckmarkOutline, personAddOutline, closeCircleOutline, checkmarkOutline });
    this.route.queryParamMap.subscribe(params => {
      if (params.get('tab') === 'requests') this.activeTab = 'requests';
    });
    void this.community.load();
  }

  searchChanged(value: string): void {
    this.query = value;
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.community.load(this.query), 250);
  }

  requests(): UserContact[] { return this.community.incomingRequests(); }
  contacts(): UserContact[] { return this.community.acceptedContacts(); }
  memberFor(contact: UserContact): MemberSummary | undefined {
    const peerId = contact.requester_id === this.auth.authUser()?.id ? contact.recipient_id : contact.requester_id;
    return this.community.member(peerId);
  }

  isIncoming(member: MemberSummary): boolean {
    const row = this.community.relationship(member.id);
    return row?.status === 'pending' && row.recipient_id === this.auth.authUser()?.id;
  }

  isSent(member: MemberSummary): boolean {
    const row = this.community.relationship(member.id);
    return row?.status === 'pending' && row.requester_id === this.auth.authUser()?.id;
  }

  isContact(member: MemberSummary): boolean { return this.community.relationship(member.id)?.status === 'accepted'; }

  async act(member: MemberSummary): Promise<void> {
    const relation = this.community.relationship(member.id);
    if (relation?.status === 'pending' && relation.recipient_id === this.auth.authUser()?.id) {
      await this.community.respond(relation.id, true);
    } else if (!relation || relation.status === 'rejected') {
      await this.community.sendRequest(member.id);
    }
  }
}
