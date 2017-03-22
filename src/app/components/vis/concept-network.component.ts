import {Component, OnInit, OnDestroy, ElementRef} from '@angular/core';
import {Node} from '../../entities/node';
import { stripMarkdown } from '../../utils/markdown';
import { Router } from '@angular/router';

import {
  VisNodes,
  VisEdges,
  VisNetworkService,
  VisNetworkData,
  VisNetworkOptions } from 'ng2-vis';
import {LanguageService} from "../../services/language.service";
import {TermedService} from "../../services/termed.service";
import {ConceptViewModelService} from "../../services/concept.view.service";

class ConceptNetworkData implements VisNetworkData {
  public nodes: VisNodes;
  public edges: VisEdges;
}

@Component({
  selector: 'concept-network',
  styleUrls: ['./concept-network.component.scss'],
  template: `
    <h2>Concept Network</h2>
    <div class="network-canvas" [visNetworkPatched]="conceptNetwork" [visNetworkData]="conceptNetworkData" [visNetworkOptions]="conceptNetworkOptions" (initialized)="networkInitialized()" (mouseleave)="hidePopup()"></div>
  `
})
export class ConceptNetworkComponent implements OnInit, OnDestroy {

  public conceptNetwork: string = 'conceptNetwork';
  public conceptNetworkData: ConceptNetworkData;
  public conceptNetworkOptions: VisNetworkOptions;

  private rootConceptId: string;
  private skipNextConcept = false;

  public constructor( private visNetworkService: VisNetworkService,
                      private languageService: LanguageService,
                      private termedService: TermedService,
                      private router: Router,
                      private conceptViewModel: ConceptViewModelService,
                      private elRef: ElementRef) { }


  private hidePopup(): void {
    let tooltip = this.elRef.nativeElement.querySelector('.vis-tooltip');
    if(tooltip !== null) {
      tooltip.style.visibility = 'hidden';
    }
  }

  private networkInitialized(): void {
    this.visNetworkService.on(this.conceptNetwork, 'click');
    this.visNetworkService.on(this.conceptNetwork, 'dragStart');

    // Distinguish between single click and double click
    var DELAY: number = 600, clicks: number = 0, timer: any;

    // If user starts dragging, reset click timer
    // NOTE: If user clicks the node and does not move cursor within 600ms, it will be interpreted as a click
    // leading to changing the concept
    this.visNetworkService.dragStart.subscribe((eventData: any[]) => {
      if (eventData[0] === this.conceptNetwork) {
        clearTimeout(timer);
        clicks = 0;
      }
    });

    this.visNetworkService.click
        .subscribe((eventData: any[]) => {
          if (eventData[0] === this.conceptNetwork && eventData[1] && eventData[1].nodes.length > 0) {
            clicks++;
            if (clicks === 1) {
              timer = setTimeout(() => {
                let conceptId = eventData[1].nodes[0];
                this.skipNextConcept = true;
                this.router.navigate(['/concepts', this.conceptViewModel.concept.graphId, 'concept', conceptId]);
                clicks = 0;
              }, DELAY);
            } else {
              clearTimeout(timer);
              let rootId = eventData[1].nodes[0];
              // Fetch data for the double-clicked node and then add the edge nodes for it
              let rootConcept$ = this.termedService.getConcept(this.conceptViewModel.concept.graphId, rootId, this.conceptViewModel.languages);
              rootConcept$.subscribe(concept => {
                this.addEdgeNodesForConcept(concept);
              });
              clicks = 0;
            }
          }
        });
  }

  /*
  Initialize network with root node, set network options and finally add edge nodes
   */
  public ngOnInit(): void {
    this.conceptViewModel.concept$.subscribe(rootConcept => {
      if (rootConcept && !this.skipNextConcept) {
        this.rootConceptId = rootConcept.id;
        let rootVisNode = {
          id: this.rootConceptId,
          label: this.languageService.translate(rootConcept.label),
          title: stripMarkdown(this.languageService.translate(rootConcept.definition)),
          group: 'rootGroup',
          color: 'blue',
          physics: false,
          fixed: false
        };

        this.conceptNetworkData = {
          nodes: new VisNodes([rootVisNode]),
          edges: new VisEdges()
        }

        this.conceptNetworkOptions = {
          nodes: {
            shape: 'ellipse',
            fixed: false
          },
          groups: {
            rootGroup: {font: {color: 'black'}},
            relatedGroup: {font: {color: 'black'}},
            broaderGroup: {font: {color: 'black'}},
            isPartOfGroup: {font: {color: 'black'}}
          },
          layout: {
            hierarchical: {
              enabled: false,
              direction: 'DU',
              sortMethod: 'hubsize',
              parentCentralization: true,
              nodeSpacing: 250,
              levelSeparation: 100,
            },
            improvedLayout: true
          },
          edges: {
            smooth: {
              enabled: true,
              type: 'cubicBezier', // 'continuous', 'discrete', 'diagonalCross', 'straightCross', 'horizontal', 'vertical', 'curvedCW', 'curvedCCW', 'cubicBezier'
              roundness: 0.25
            },
            length: 250,
            hoverWidth: 3,
            color: {
              color: 'black',
              hover: 'blue'
            }
          },
          interaction: {
            hideEdgesOnDrag: false,
            hideNodesOnDrag: false,
            navigationButtons: true,
            hover: true,
            selectable: true,
            hoverConnectedEdges: true,
            selectConnectedEdges: false
          },
          physics: {
            enabled: true,
            solver: 'forceAtlas2Based', // hierarchicalRepulsion, repulsion, forceAtlas2Based, barnesHut
            forceAtlas2Based: {
              gravitationalConstant: -2000,
              centralGravity: 0.01,
              springConstant: 3,
              springLength: 100,
              damping: 1.5,
              avoidOverlap: 0
            },
            stabilization: {
              enabled: false,
              fit: true,
              iterations: 1
            },
            timestep: 0.4
          }
        };

        this.addEdgeNodesForConcept(rootConcept);
      }

      this.skipNextConcept = false;
    });
  }

  private addEdgeNodesForConcept(rootConcept: Node<'Concept'>) {
    if(rootConcept) {
      let rootConceptId = rootConcept.id;
      let relatedConcepts: Node<'Concept'>[] = rootConcept.references['related']['values'];
      let broaderConcepts: Node<'Concept'>[] = rootConcept.referrers['broader'];
      let isPartOfConcepts: Node<'Concept'>[] = rootConcept.referrers['isPartOf'];

      if(relatedConcepts) {
        relatedConcepts.forEach(relConcept => {
          let relNode = {
            id: relConcept.id,
            label: this.languageService.translate(relConcept.label),
            title: stripMarkdown(this.languageService.translate(relConcept.definition)),
            group: 'relatedGroup',
            color: {
              background: '#4ce9ff',
              highlight: {
                background: 'white',
                border: 'black'
              },
              hover: {
                background: 'white',
                border: 'black'
              }
            },
            shadow: true
          };

          if(!this.conceptNetworkData.nodes.getById(relNode.id)) {
            this.conceptNetworkData.nodes.add(relNode);
          }

          let relEdge = {
            from: rootConceptId,
            to: relNode.id,
            arrows: {
              to: {
                enabled: true,
                scaleFactor: 0.7,
                type: 'arrow'
              }
            },
            id: rootConceptId + relNode.id,
            title: this.languageService.translate(rootConcept.label) + ' - ' + relNode.label
          };

          if(!this.conceptNetworkData.edges.getById(relEdge.id)) {
            this.conceptNetworkData.edges.add(relEdge);
          }
        });
      }

      if(broaderConcepts) {
        broaderConcepts.forEach(broaderConcept => {
          let broaderNode = {
            id: broaderConcept.id,
            label: this.languageService.translate(broaderConcept.label),
            title: stripMarkdown(this.languageService.translate(broaderConcept.definition)),
            group: 'broaderGroup',
            color: {
              background: '#59a3ff',
              highlight: {
                background: 'white',
                border: 'black'
              },
              hover: {
                background: 'white',
                border: 'black'
              }
            }
          };

          if(!this.conceptNetworkData.nodes.getById(broaderConcept.id)) {
            this.conceptNetworkData.nodes.add(broaderNode);
          }

          let broaderEdge = {
            from: rootConceptId,
            to: broaderNode.id,
            id: rootConceptId + broaderNode.id,
            title: this.languageService.translate(rootConcept.label) + ' - ' + broaderNode.label
          };

          if(!this.conceptNetworkData.edges.getById(broaderEdge.id)) {
            this.conceptNetworkData.edges.add(broaderEdge);
          }
        });
      }

      if(isPartOfConcepts) {
        isPartOfConcepts.forEach(isPartOfConcept => {
          let isPartOfNode = {
            id: isPartOfConcept.id,
            label: this.languageService.translate(isPartOfConcept.label),
            title: stripMarkdown(this.languageService.translate(isPartOfConcept.definition)),
            group: 'isPartOfGroup',
            color: {
              background: '#00ffcc',
              highlight: {
                background: 'white',
                border: 'black'
              },
              hover: {
                background: 'white',
                border: 'black'
              }

            },

          };

          if(!this.conceptNetworkData.nodes.getById(isPartOfNode.id)) {
            this.conceptNetworkData.nodes.add(isPartOfNode);
          }

          let isPartOfEdge = {
            from: rootConceptId,
            to: isPartOfNode.id,
            dashes: true,
            id: rootConceptId + isPartOfNode.id,
            title: this.languageService.translate(rootConcept.label) + ' - ' + isPartOfNode.label
          };

          if(!this.conceptNetworkData.edges.getById(isPartOfEdge.id)) {
            this.conceptNetworkData.edges.add(isPartOfEdge);
          }
        });
      }
    };
  }

  public ngOnDestroy(): void {
    this.visNetworkService.off(this.conceptNetwork, 'click');
    this.visNetworkService.off(this.conceptNetwork, 'dragStart');
  }
}
