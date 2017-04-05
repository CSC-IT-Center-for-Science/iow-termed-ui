import { Component, OnDestroy } from '@angular/core';
import { EditableService } from '../services/editable.service';
import { ConceptViewModelService } from '../services/concept.view.service';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DeleteConfirmationModalService } from './delete-confirmation.modal';
import { requireDefined } from '../utils/object';

@Component({
  selector: 'collection',
  styleUrls: ['./collection.component.scss'],
  providers: [EditableService],
  template: `
    <div class="component" *ngIf="collection">

      <div class="component-header">
        <h3>{{collection.label | translateValue}}</h3>
      </div>

      <form class="component-content">

        <div class="row">
          <div class="col-md-12">
            <editable-buttons [canRemove]="true"></editable-buttons>
          </div>
        </div>

        <property class="col-md-12"
                  [class.col-xl-6]="!property.meta.area"
                  [value]="property"
                  *ngFor="let property of collectionInEdit | properties: showEmpty"></property>

        <reference class="col-md-12"
                   [value]="reference"
                   [conceptsProvider]="conceptsProvider"
                   *ngFor="let reference of collectionInEdit | references: showEmpty"></reference>
      </form>

    </div>

    <ajax-loading-indicator *ngIf="!collection"></ajax-loading-indicator>
  `
})
export class CollectionComponent implements OnDestroy {

  private subscriptionToClean: Subscription[] = [];

  constructor(private route: ActivatedRoute,
              private conceptViewModel: ConceptViewModelService,
              deleteConfirmationModal: DeleteConfirmationModalService,
              editableService: EditableService) {

    route.params.subscribe(params => conceptViewModel.initializeCollection(params['collectionId']));
    editableService.onSave = () => this.conceptViewModel.saveCollection();
    editableService.onCanceled = () => this.conceptViewModel.resetCollection();
    editableService.onRemove = () =>
      deleteConfirmationModal.open(requireDefined(this.collection))
        .then(() => this.conceptViewModel.removeCollection());

    this.subscriptionToClean.push(this.conceptViewModel.collection$.subscribe(collection => {
      if (collection) {
        if (!collection.persistent && !editableService.editing) {
          editableService.edit();
        } else if (editableService.editing) {
          editableService.cancel();
        }
      }
    }));
  }

  ngOnDestroy() {
    for (const subscription of this.subscriptionToClean) {
      subscription.unsubscribe();
    }
  }

  get conceptsProvider() {
    return () => this.conceptViewModel.allConcepts$.getValue();
  }

  get collection() {
    return this.conceptViewModel.collection;
  }

  get collectionInEdit() {
    return this.conceptViewModel.collectionInEdit;
  }
}
