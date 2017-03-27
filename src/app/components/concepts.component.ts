import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer } from '@angular/platform-browser';
import { ConceptViewModelService } from '../services/concept.view.service';
import { SessionService } from '../services/session.service';

@Component({
  selector: 'concepts',
  styleUrls: ['./concepts.component.scss'],
  providers: [ConceptViewModelService],
  template: `
    <div class="container-fluid">

      <ajax-loading-indicator *ngIf="loading"></ajax-loading-indicator>

      <div [hidden]="loading">

        <div class="row">
          <div class="col-12">
            <vocabulary></vocabulary>
          </div>
        </div>
  
        <div class="bottom">
        
          <div class="panel-left">
            <div float>
              <ngb-tabset>
                <ngb-tab>
                  <template ngbTabTitle>
                    <i class="fa fa-sort-alpha-asc"></i>
                    <p>{{'Alphabetic' | translate}}</p>
                  </template>
                  <template ngbTabContent><concept-list></concept-list></template>
                </ngb-tab>
                <ngb-tab>
                  <template ngbTabTitle>
                    <i class="fa fa-sitemap"></i>
                    <p>{{'Hierarchical' | translate}}</p>
                  </template>
                  <template ngbTabContent><concept-hierarchy></concept-hierarchy></template>
                </ngb-tab>
              </ngb-tabset>
            </div>
          </div>

          <div class="panel-right">
            
            <div class="pull-left" [style.width]="selectionWidth">
              <router-outlet></router-outlet>
            </div>
            
            <div float>
              <concept-network class="pull-right" [style.width]="visualizationWidth"></concept-network>
              <divider class="pull-right"></divider>
            </div>
            
          </div>

        </div>
      
      </div>
      
    </div>
  `
})
export class ConceptsComponent implements OnInit {

  constructor(private route: ActivatedRoute,
              private viewModel: ConceptViewModelService,
              private sessionService: SessionService,
              private domSanitizer: DomSanitizer) {
  }

  get loading() {
    return this.viewModel.loadingConceptScheme || this.viewModel.loadingConcepts;
  }

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.viewModel.initializeConceptScheme(params['graphId']);
    });
  }

  get selectionWidth() {
    return this.sessionService.selectionWidth + 'px';
  }

  get visualizationWidth() {
    return this.domSanitizer.bypassSecurityTrustStyle(
      `calc(100% - ${this.sessionService.selectionWidth + 10}px)`
    );
  }
}

