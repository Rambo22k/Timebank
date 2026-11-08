import { Component, inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonIcon } from '@ionic/angular/ion-icon';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, peopleOutline, timeOutline, heartOutline, shieldCheckmarkOutline, refreshOutline, searchOutline, settingsOutline, listOutline, pricetagOutline, walletOutline, eyeOutline, closeCircleOutline } from 'ionicons/icons';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { FooterComponent } from '../../shared/components/footer/footer.component';
import { AdminCategoryRow, AdminService, AdminUserRow } from '../../core/services/admin.service';

@Component({
  selector: 'app-admin', standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe, FormsModule, RouterModule, IonIcon, NavbarComponent, FooterComponent],
  templateUrl: './admin.page.html', styleUrls: ['./admin.page.scss']
})
export class AdminPage {
  admin = inject(AdminService);

  activeSection = 'overview';
  search = '';
  selectedUserId = '';
  adjustmentAmount = 1;
  adjustmentReason = '';
  newCategory: Partial<AdminCategoryRow> = { name: '', slug: '', description: '', icon: 'pricetag', sort_order: 0, is_active: true };
  editingCategoryId = '';
  notes: Record<string, string> = {};
  settingDrafts: Record<string, number> = {};

  constructor() {
    addIcons({ alertCircleOutline, checkmarkCircleOutline, peopleOutline, timeOutline, heartOutline, shieldCheckmarkOutline, refreshOutline, searchOutline, settingsOutline, listOutline, pricetagOutline, walletOutline, eyeOutline, closeCircleOutline });
    void this.admin.load();
  }

  users(): AdminUserRow[] {
    const term = this.search.trim().toLocaleLowerCase();
    return this.admin.users().filter(user => !term || user.display_name.toLocaleLowerCase().includes(term) || user.id.toLowerCase().includes(term));
  }

  go(section: string): void { this.activeSection = section; }

  saveCategory(): void {
    if (!this.newCategory.name?.trim()) return;
    this.newCategory.slug = this.newCategory.slug?.trim() || this.newCategory.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    void this.admin.saveCategory(this.newCategory);
    this.newCategory = { name: '', slug: '', description: '', icon: 'pricetag', sort_order: 0, is_active: true };
    this.editingCategoryId = '';
  }

  editCategory(category: AdminCategoryRow): void {
    this.newCategory = { ...category };
    this.editingCategoryId = category.id;
    this.go('categories');
  }

  cancelCategoryEdit(): void {
    this.newCategory = { name: '', slug: '', description: '', icon: 'pricetag', sort_order: 0, is_active: true };
    this.editingCategoryId = '';
  }

  saveSetting(key: string): void {
    const setting = this.admin.settings().find(row => row.key === key);
    if (setting) void this.admin.saveSetting(key, this.settingDrafts[key] ?? setting.value);
  }

  selectUser(userId: string): void {
    this.selectedUserId = userId;
    void this.admin.loadTransactions(userId);
  }

  adjustCredits(): void {
    if (!this.selectedUserId || this.adjustmentAmount === 0 || this.adjustmentReason.trim().length < 5) return;
    void this.admin.adjustCredits(this.selectedUserId, this.adjustmentAmount, this.adjustmentReason);
    this.adjustmentReason = '';
  }

  suspend(user: AdminUserRow): void {
    const note = this.notes[user.id]?.trim() ?? '';
    if (note.length < 5) return;
    void this.admin.setUserStatus(user, 'suspended', note);
  }
}
