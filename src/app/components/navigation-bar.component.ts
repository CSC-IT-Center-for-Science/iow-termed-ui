import { Component } from '@angular/core';
import { TranslateService } from 'ng2-translate';

@Component({
  selector: 'navigation-bar',
  styleUrls: ['./navigation-bar.component.scss'],
  template: `
    <nav class="navbar navbar-toggleable-md fixed-top navbar-inverse bg-primary">

      <a class="navbar-brand" href="/"><span>IOW-TERMED</span></a>
    
      <div class="collapse navbar-collapse">
        <ul class="navbar-nav ml-auto">
          <li class="nav-item" *ngFor="let language of languages">
            <a class="nav-link" (click)="setLanguage(language.code)">{{language.name}}</a>
          </li>
        </ul>
      </div>
    </nav>
  `
})
export class NavigationBarComponent {

  languages = [
    { code: 'fi', name: 'Suomeksi' },
    { code: 'en', name: 'In english' }
  ];

  constructor(private translate: TranslateService) {
  }

  setLanguage(lang: string) {
    this.translate.use(lang);
  }
}