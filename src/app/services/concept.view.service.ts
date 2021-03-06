import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { LocationService } from './location.service';
import { TermedService } from './termed.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { CollectionNode, ConceptNode, VocabularyNode } from '../entities/node';
import { comparingLocalizable } from '../utils/comparator';
import { LanguageService } from './language.service';
import { MetaModelService } from './meta-model.service';
import {
  Action, createEditAction, createNoSelection, createRemoveAction, createSelectAction, EditAction, isEdit, isRemove,
  isSelect,
  RemoveAction,
  SelectAction
} from './action';
import { ElasticSearchService, IndexedConcept } from './elasticsearch.service';
import {
  ContentExtractor, filterAndSortSearchResults, labelComparator, scoreComparator,
  TextAnalysis
} from '../utils/text-analyzer';
import { isDefined, requireDefined } from '../utils/object';
import { Subject } from 'rxjs/Subject';
import { removeMatching, replaceMatching } from '../utils/array';
import { FormNode } from './form-state';
import { MetaModel } from '../entities/meta';
import { TranslateService } from 'ng2-translate';

function onlySelect<T>(action: Observable<Action<T>>): Observable<T> {
  const selectAction: Observable<SelectAction<T>> = action.filter(isSelect);
  return selectAction.map(a => a.item);
}

function onlyEdit<T>(action: Observable<Action<T>>): Observable<T> {
  const editAction: Observable<EditAction<T>> = action.filter(isEdit);
  return editAction.map(a => a.item);
}

function onlyRemove<T>(action: Observable<Action<T>>): Observable<T> {
  const removeAction: Observable<RemoveAction<T>> = action.filter(isRemove);
  return removeAction.map(a => a.item);
}

function updateOrRemoveItem<T extends { id: string }>(subject: BehaviorSubject<T[]>, id: string, newItem: T|null) {

  if (newItem) {
    return updateItem(subject, id, newItem);
  } else {
    return removeItem(subject, id);
  }
}

function updateItem<T extends { id: string }>(subject: BehaviorSubject<T[]>, id: string, newItem: T) {

  const previousCopy = subject.getValue().slice();

  if (replaceMatching(previousCopy, item => item.id === id, newItem)) {
    subject.next(previousCopy);
    return true;
  } else {
    return false;
  }
}

function removeItem<T extends { id: string }>(subject: BehaviorSubject<T[]>, id: string) {

  const previousCopy = subject.getValue().slice();

  if (removeMatching(previousCopy, item => item.id === id)) {
    subject.next(previousCopy);
    return true;
  } else {
    return false;
  }
}

export class ConceptListModel {

  search$ = new BehaviorSubject('');
  sortByTime$ = new BehaviorSubject<boolean>(false);
  onlyStatus$ = new BehaviorSubject<string|null>(null);
  searchResults$ = new BehaviorSubject<IndexedConcept[]>([]);
  loading = false;

  private graphId: string;
  private initializing$ = new Subject<boolean>();

  private loaded = 0;
  private canLoadMore = true;

  constructor(private elasticSearchService: ElasticSearchService) {

    const initialSearch = this.search$.take(1);
    const debouncedSearch = this.search$.skip(1).debounceTime(500);
    const search = initialSearch.concat(debouncedSearch);
    const conditionChange = Observable.combineLatest(search, this.sortByTime$, this.onlyStatus$);

    this.initializing$.switchMap(initializing => initializing ? Observable.never() : conditionChange)
      .subscribe(() => this.loadConcepts(true));
  }

  loadConcepts(reset = false) {

    const batchSize = 100;

    if (reset) {
      this.loaded = 0;
      this.canLoadMore = true;
    }

    if (this.canLoadMore) {

      this.loading = true;

      this.elasticSearchService.getAllConceptsForVocabulary(this.graphId, this.search, this.sortByTime, this.onlyStatus, this.loaded, batchSize)
        .subscribe(concepts => {

          if (concepts.length < batchSize) {
            this.canLoadMore = false;
          }

          this.loaded += concepts.length;

          this.searchResults$.next(reset ? concepts : [...this.searchResults, ...concepts]);
          this.loading = false;
        });
    }
  }

  refresh(conceptId: string, remove: boolean) {
    if (remove) {
      removeItem(this.searchResults$, conceptId);
    } else {
      this.elasticSearchService.findSingleConceptForVocabulary(this.graphId, conceptId, this.search, this.sortByTime, this.onlyStatus)
        .subscribe(indexedConcept => {
          if (!updateOrRemoveItem(this.searchResults$, conceptId, indexedConcept)) {
            this.loadConcepts(true);
          }
        });
    }
  }

  initializeGraph(graphId: string) {
    this.initializing$.next(true);
    this.graphId = graphId;
    this.search$.next('');
    this.sortByTime$.next(false);
    this.onlyStatus$.next(null);
    this.initializing$.next(false);
  }

  get searchResults() {
    return this.searchResults$.getValue();
  }

  get search() {
    return this.search$.getValue();
  }

  set search(value: string) {
    this.search$.next(value);
  }

  get sortByTime() {
    return this.sortByTime$.getValue();
  }

  set sortByTime(value: boolean) {
    this.sortByTime$.next(value);
  }

  get onlyStatus() {
    return this.onlyStatus$.getValue();
  }

  set onlyStatus(value: string|null) {
    this.onlyStatus$.next(value);
  }
}

export class ConceptHierarchyModel {

  topConcepts$ = new BehaviorSubject<IndexedConcept[]>([]);
  nodes = new Map<string, { expanded: boolean, narrowerConcepts: BehaviorSubject<IndexedConcept[]> } >();
  loading = false;

  private graphId: string;
  private loaded = 0;
  private canLoadMore = true;

  constructor(private elasticSearchService: ElasticSearchService) {
  }

  initializeGraph(graphId: string) {

    this.graphId = graphId;
    this.loading = true;
    this.loadConcepts(true);
  }

  loadConcepts(reset = false) {

    const batchSize = 100;

    if (reset) {
      this.loaded = 0;
      this.canLoadMore = true;
      this.nodes.clear();
    }

    if (this.canLoadMore) {

      this.loading = true;

      this.elasticSearchService.getTopConceptsForVocabulary(this.graphId, this.loaded, batchSize)
        .subscribe(concepts => {

          if (concepts.length < batchSize) {
            this.canLoadMore = false;
          }

          this.loaded += concepts.length;

          this.topConcepts$.next(reset ? concepts : [...this.topConcepts, ...concepts]);
          this.loading = false;
        });
    }
  }

  refresh(conceptId: string, remove: boolean) {

    if (remove) {

      removeItem(this.topConcepts$, conceptId);

      for (const {narrowerConcepts} of Array.from(this.nodes.values())) {
        removeItem(narrowerConcepts, conceptId);
      }
    } else {

      this.elasticSearchService.findSingleConceptForVocabulary(this.graphId, conceptId, '', false, null)
        .subscribe(indexedConcept => {

          let updated = false;

          updated = updated || updateOrRemoveItem(this.topConcepts$, conceptId, indexedConcept);

          for (const {narrowerConcepts} of Array.from(this.nodes.values())) {
            updated = updated || updateOrRemoveItem(narrowerConcepts, conceptId, indexedConcept);
          }

          if (!updated) {
            this.loadConcepts(true);
          }
        });
    }
  }

  get topConcepts() {
    return this.topConcepts$.getValue();
  }

  getNarrowerConcepts(concept: IndexedConcept): Observable<IndexedConcept[]> {
    return this.nodes.get(concept.id)!.narrowerConcepts;
  }

  collapse(concept: IndexedConcept) {
    this.nodes.get(concept.id)!.expanded = false;
  }

  expand(concept: IndexedConcept) {

    if (!this.nodes.has(concept.id)) {
      const subject = new BehaviorSubject<IndexedConcept[]>([]);
      this.nodes.set(concept.id, { expanded: true, narrowerConcepts: subject });

      this.elasticSearchService.getNarrowerConcepts(concept.vocabulary.id, concept.id)
        .subscribe(concepts => subject.next(concepts));
    } else {
      this.nodes.get(concept.id)!.expanded = true;
    }
  }

  isExpanded(concept: IndexedConcept) {
    const node = this.nodes.get(concept.id);
    return !!node && node.expanded;
  }
}

export class CollectionListModel {

  search$ = new BehaviorSubject('');
  debouncedSearch = this.search$.getValue();
  searchResults: Observable<CollectionNode[]>;
  allCollections$ = new BehaviorSubject<CollectionNode[]>([]);
  loading = false;
  graphId: string;

  constructor(private termedService: TermedService, private languageService: LanguageService) {

    const initialSearch$ = this.search$.take(1);
    const debouncedSearch$ = this.search$.skip(1).debounceTime(500);
    const search$ = initialSearch$.concat(debouncedSearch$);

    this.searchResults = Observable.combineLatest([this.allCollections$, search$], (collections: CollectionNode[], search: string) => {

      this.debouncedSearch = search;
      const scoreFilter = (item: TextAnalysis<CollectionNode>) => !search || isDefined(item.matchScore) || item.score < 2;
      const labelExtractor: ContentExtractor<CollectionNode> = collection => collection.label;
      const scoreAndLabelComparator = scoreComparator().andThen(labelComparator(languageService));

      return filterAndSortSearchResults(collections, search, [labelExtractor], [scoreFilter], scoreAndLabelComparator);
    });
  }

  initializeGraph(graphId: string) {

    this.graphId = graphId;
    this.loading = true;

    this.termedService.getCollectionList(graphId).subscribe(collections => {
      const sortedCollections = collections.sort(comparingLocalizable<CollectionNode>(this.languageService, collection => collection.label));
      this.allCollections$.next(sortedCollections);
      this.loading = false;
    });
  }

  refresh(collectionId: string, remove: boolean) {
    if (remove) {
      removeItem(this.allCollections$, collectionId);
    } else {
      this.termedService.getCollection(this.graphId, collectionId)
        .subscribe(collection => {
          if (!updateItem(this.allCollections$, collectionId, collection)) {
            this.initializeGraph(this.graphId);
          }
        });
    }
  }
}

@Injectable()
export class ConceptViewModelService {

  vocabularyForm: FormNode;
  vocabularyAction$ = new BehaviorSubject<Action<VocabularyNode>>(createNoSelection());
  vocabularySelect$ = onlySelect(this.vocabularyAction$);
  vocabularyEdit$ = onlyEdit(this.vocabularyAction$);
  vocabularyRemove$ = onlyRemove(this.vocabularyAction$);

  conceptForm: FormNode|null;
  conceptAction$ = new BehaviorSubject<Action<ConceptNode>>(createNoSelection());
  conceptSelect$ = onlySelect(this.conceptAction$);
  conceptEdit$ = onlyEdit(this.conceptAction$);
  conceptRemove$ = onlyRemove(this.conceptAction$);

  collectionForm: FormNode|null;
  collectionAction$ = new BehaviorSubject<Action<CollectionNode>>(createNoSelection());
  collectionSelect$ = onlySelect(this.collectionAction$);
  collectionEdit$ = onlyEdit(this.collectionAction$);
  collectionRemove$ = onlyRemove(this.collectionAction$);

  action$ = Observable.merge(this.conceptAction$, this.collectionAction$);

  graphId: string;
  conceptId: string|null;
  collectionId: string|null;

  conceptList = new ConceptListModel(this.elasticSearchService);
  conceptHierarchy = new ConceptHierarchyModel(this.elasticSearchService);
  collectionList = new CollectionListModel(this.termedService, this.languageService);

  loadingVocabulary = true;
  loadingConcept = true;
  loadingCollection = true;

  metaModel: Observable<MetaModel>;

  constructor(private router: Router,
              private termedService: TermedService,
              private elasticSearchService: ElasticSearchService,
              private metaModelService: MetaModelService,
              private locationService: LocationService,
              private languageService: LanguageService,
              private translateService: TranslateService) {

    this.action$.subscribe(action => {
      switch (action.type) {
        case 'edit':
        case 'remove':
          const remove = action.type === 'remove';

          if (action.item.type === 'Concept') {
            this.conceptList.refresh(action.item.id, remove);
            this.conceptHierarchy.refresh(action.item.id, remove);
          } else {
            this.collectionList.refresh(action.item.id, remove)
          }
      }
    });

    Observable.merge(this.vocabularySelect$, this.vocabularyEdit$).subscribe(vocabulary => {
      if (languageService.filterLanguage && !vocabulary.languages.includes(languageService.filterLanguage)) {
        languageService.filterLanguage = '';
      }
    });
  }

  get languages(): string[] {
    return requireDefined(this.vocabulary).languages;
  }

  get vocabulary(): VocabularyNode|null {

    const action = this.vocabularyAction$.getValue();

    if (action.type === 'noselect' || action.type === 'remove') {
      return null;
    }

    return action.item;
  }

  get concept(): ConceptNode|null {

    const action = this.conceptAction$.getValue();

    if (action.type === 'noselect' || action.type === 'remove') {
      return null;
    }

    return action.item;
  }

  get collection(): CollectionNode|null {

    const action = this.collectionAction$.getValue();

    if (action.type === 'noselect' || action.type === 'remove') {
      return null;
    }

    return action.item;
  }

  get selection() {
    return this.concept || this.collection;
  }

  initializeVocabulary(graphId: string) {

    this.graphId = graphId;
    this.metaModel = this.metaModelService.getMeta(graphId);
    this.loadingVocabulary = true;

    this.termedService.getVocabulary(graphId).subscribe(vocabulary => {
      this.locationService.atVocabulary(vocabulary);
      this.vocabularyAction$.next(createSelectAction(vocabulary));
      this.vocabularyForm = new FormNode(vocabulary, () => vocabulary.languages);
      this.loadingVocabulary = false;
    });

    this.conceptList.initializeGraph(graphId);
    this.conceptHierarchy.initializeGraph(graphId);
    this.collectionList.initializeGraph(graphId);
  }

  initializeConcept(conceptId: string|null) {

    const init = (concept: ConceptNode|null) => {

      if (this.collection) {
        this.initializeCollection(null);
      }

      this.vocabularySelect$.subscribe(vocabulary => {
        if (concept) {
          this.locationService.atConcept(vocabulary, concept);
        } else {
          this.locationService.atVocabulary(vocabulary);
        }
        this.conceptAction$.next(concept ? createSelectAction(concept) : createNoSelection());
        this.conceptForm = concept ? new FormNode(concept, () => this.languages) : null;
        this.loadingConcept = false;
      });
    };

    this.loadingConcept = true;
    this.conceptId = conceptId;

    if (!conceptId) {
      init(null);
    } else {
      this.vocabularySelect$.subscribe(vocabulary => {
        this.termedService.findConcept(vocabulary.graphId, conceptId).subscribe(concept => {
          if (concept) {
            init(concept);
          } else {
            this.createEmptyConcept(requireDefined(this.vocabulary), conceptId).subscribe(init);
          }
        });
      });
    }
  }

  initializeCollection(collectionId: string|null) {

    const init = (collection: CollectionNode|null) => {

      if (this.concept) {
        this.initializeConcept(null);
      }

      this.vocabularySelect$.subscribe(vocabulary => {
        if (collection) {
          this.locationService.atCollection(vocabulary, collection);
        } else {
          this.locationService.atVocabulary(vocabulary);
        }
        this.collectionAction$.next(collection ? createSelectAction(collection) : createNoSelection());
        this.collectionForm = collection ? new FormNode(collection, () => this.languages) : null;
        this.loadingCollection = false;
      });
    };

    this.loadingCollection = true;
    this.collectionId = collectionId;

    if (!collectionId) {
      init(null);
    } else {
      this.vocabularySelect$.subscribe(vocabulary => {
        this.termedService.findCollection(vocabulary.graphId, collectionId).subscribe(collection => {
          if (collection) {
            init(collection);
          } else {
            this.createEmptyCollection(requireDefined(this.vocabulary), collectionId).subscribe(init);
          }
        });
      });
    }
  }

  saveConcept(): Promise<any> {

    if (!this.concept || !this.conceptForm) {
      throw new Error('Cannot save when there is no concept');
    }

    const that = this;
    const concept = this.concept.clone();
    this.conceptForm.assignChanges(concept);

    return new Promise((resolve, reject) => {
      this.termedService.updateNode(concept, this.concept)
        .flatMap(() => this.termedService.getConcept(this.graphId, concept.id))
        .subscribe({
          next(persistentConcept: ConceptNode) {
            that.conceptAction$.next(createEditAction(persistentConcept.clone()));
            that.conceptForm = new FormNode(persistentConcept, () => that.languages);
            resolve();
          },
          error(err: any) {
            reject(err);
          }
        });
    });
  }

  removeConcept(): Promise<any> {
    if (!this.concept) {
      throw new Error('Cannot remove when there is no concept');
    }

    const that = this;
    const concept = this.concept;

    return new Promise((resolve, reject) => {
      this.termedService.removeNode(concept).subscribe({
        next() {
          that.conceptAction$.next(createRemoveAction(concept));
          that.router.navigate(['/concepts', that.graphId]);
          resolve();
        },
        error(err: any) {
          reject(err);
        }
      });
    });
  }

  resetConcept() {
    if (!this.concept) {
      throw new Error('Cannot reset when there is no concept');
    }

    if (!this.concept.persistent) {
      this.router.navigate(['/concepts', this.graphId]);
    } else {
      this.conceptForm = new FormNode(this.concept, () => this.languages);
    }
  }

  saveCollection(): Promise<any> {

    if (!this.collection || !this.collectionForm) {
      throw new Error('Cannot save when there is no collection');
    }

    const that = this;
    const collection = this.collection.clone();
    this.collectionForm.assignChanges(collection);

    return new Promise((resolve, reject) => {
      this.termedService.updateNode(collection, this.collection)
        .flatMap(() => this.termedService.getCollection(this.graphId, collection.id))
        .subscribe({
          next(persistentCollection: CollectionNode) {
            that.collectionAction$.next(createEditAction(persistentCollection.clone()));
            that.collectionForm = new FormNode(persistentCollection, () => that.languages);
            resolve();
          },
          error(err: any) {
            reject(err);
          }
        });
    });
  }

  removeCollection(): Promise<any> {
    if (!this.collection) {
      throw new Error('Cannot remove when there is no collection');
    }

    const that = this;
    const collection = this.collection;

    return new Promise((resolve, reject) => {
      this.termedService.removeNode(collection).subscribe({
        next() {
          that.collectionAction$.next(createRemoveAction(collection));
          that.router.navigate(['/concepts', that.graphId]);
          resolve();
        },
        error(err: any) {
          reject(err);
        }
      });
    });
  }

  resetCollection() {
    if (!this.collection) {
      throw new Error('Cannot reset when there is no collection');
    }

    if (!this.collection.persistent) {
      this.router.navigate(['/concepts', this.graphId]);
    } else {
      this.collectionForm = new FormNode(this.collection, () => this.languages);
    }
  }

  saveVocabulary(): Promise<any> {

    if (!this.vocabulary) {
      throw new Error('Cannot save when there is no vocabulary');
    }

    const that = this;

    const vocabulary = this.vocabulary.clone();
    this.vocabularyForm.assignChanges(vocabulary);

    return new Promise((resolve, reject) => {
      this.termedService.updateNode(vocabulary, this.vocabulary)
        .flatMap(() => this.termedService.getVocabulary(this.graphId))
        .subscribe({
          next(persistentVocabulary: VocabularyNode) {
            that.vocabularyAction$.next(createEditAction(persistentVocabulary.clone()));
            that.vocabularyForm = new FormNode(persistentVocabulary, () => that.languages);
            resolve();
          },
          error(err: any) {
            reject(err);
          }
        });
    });
  }

  removeVocabulary() {

    if (!this.vocabulary) {
      throw new Error('Cannot remove when there is no vocabulary');
    }

    const that = this;
    const vocabulary = this.vocabulary;

    return new Promise((resolve, reject) => {
      this.termedService.removeVocabulary(vocabulary).subscribe({
        next() {
          that.router.navigate(['/']);
          resolve();
        },
        error(err: any) {
          reject(err);
        }
      });
    });
  }

  resetVocabulary() {

    if (!this.vocabulary) {
      throw new Error('Cannot reset when there is no vocabulary');
    }

    this.vocabularyForm = new FormNode(this.vocabulary, () => this.languages);
  }

  createEmptyConcept(vocabulary: VocabularyNode, nodeId: string): Observable<ConceptNode> {

    const label$ = this.translateService.get('New concept');

    return Observable.zip(label$, this.metaModel).map(([newConceptLabel, meta]) => {
      return meta.createEmptyConcept(vocabulary, nodeId, newConceptLabel, this.languageService.language);
    });
  }

  createEmptyCollection(vocabulary: VocabularyNode, nodeId: string): Observable<CollectionNode> {

    const label$ = this.translateService.get('New collection');

    return Observable.zip(label$, this.metaModel).map(([newCollectionLabel, meta]) => {
      return meta.createEmptyCollection(vocabulary, nodeId, newCollectionLabel, this.languageService.language);
    });
  }
}
