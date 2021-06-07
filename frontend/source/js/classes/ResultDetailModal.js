import DefaultEventEmitter from './DefaultEventEmitter';
import Records from './Records';
import StanzaManager from './StanzaManager';
import {createPopupEvent} from '../functions/util';
import dragView from '../functions/dragView';
import * as event from '../events';

export default class ResultDetailModal {
  #ROOT;
  #RESULTS_TABLE;
  #RESULT_MODAL;
  #exit_button;
  #popup_top;
  #popup_left;

  constructor() {
    this.#ROOT = document.createElement('section');
    this.#ROOT.id = 'ResultDetailModal';
    document
      .querySelector('body')
      .insertAdjacentElement('beforeend', this.#ROOT);

    // references
    this.#RESULTS_TABLE = document.querySelector('#ResultsTable');
    this.#RESULT_MODAL = document.querySelector('#ResultDetailModal');
    this.#exit_button = document.createElement('div');
    this.#exit_button.className = 'close-button-view';
    this.#popup_top = '';
    this.#popup_left = '';


    // attach event
    this.#exit_button.addEventListener('click', () => {
      this.#hidePopUp();
    });

    DefaultEventEmitter.addEventListener(event.showPopup, e => {
      this.#showPopUp(e);
    });

    DefaultEventEmitter.addEventListener(event.movePopup, e => {
      this.#hidePopUp();
      this.#showPopUp(e);
    });

    DefaultEventEmitter.addEventListener(event.hidePopUp, () => {
      this.#hidePopUp();
    });

    this.#RESULT_MODAL.addEventListener('click', e => {
      if (e.target !== e.currentTarget) return;
      this.#hidePopUp();
    });
  }
  // bind this on handleKeydown so it will keep listening to same event during the whole popup
  #showPopUp(e) {
    if (this.#RESULT_MODAL.innerHTML === '') {
      this.#setHighlight(
        e.detail.properties.dataX,
        e.detail.properties.dataY,
        e.detail.properties.dataSubOrder
      );
      this.#handleKeydown = this.#handleKeydown.bind(this);
      document.addEventListener('keydown', this.#handleKeydown);

      this.#RESULT_MODAL.appendChild(this.#popup(e.detail));
      this.#RESULT_MODAL.classList.add('backdrop');
    }
  }
  // HTML elements
  #popup(detail) {
    const popup = document.createElement('div');
    popup.className = 'popup';
    popup.appendChild(this.#header(detail.keys, detail.properties));
    popup.appendChild(this.#container(detail.keys, detail.properties));
    popup.style.left = this.#popup_left;
    popup.style.top = this.#popup_top;

    return popup;
  }

  #header(keys, props) {
    const subject = Records.getSubject(keys.subjectId);
    const isPrimaryKey = props.isPrimaryKey;
    const mainCategory = isPrimaryKey
      ? ''
      : Records.getProperty(keys.mainCategoryId);
    const subCategory = isPrimaryKey
      ? ''
      : Records.getValue(keys.mainCategoryId, keys.subCategoryId);
    const path = isPrimaryKey
      ? keys.dataKey
      : `<span class='path'>${subject.subject} / ${subCategory.label}</span>`;
    const header = document.createElement('header');
    header.innerHTML = `
      <div class='label'>
        <strong>${
          isPrimaryKey ? keys.uniqueEntryId : mainCategory.label
        } </strong>
        ${path}
      </div>
      <div>
        <a class='report-page-button-view' href='${
          props.reportLink
        }' target='_blank'><span class='material-icons-outlined'>open_in_new</span></a>
    `;
    header.style.backgroundColor = subject.colorCSSValue;
    header.lastChild.appendChild(this.#exit_button);
    header.addEventListener('mousedown', e => {
      const customEvent = new CustomEvent(event.dragPopup, {
        detail: {
          x: e.clientX,
          y: e.clientY,
          container : header.parentElement,
          dragableElement : header
        },
      });
      DefaultEventEmitter.dispatchEvent(customEvent);
    });

    return header;
  }

  #container(keys, props) {
    const container = document.createElement('div');
    container.className = 'container';
    ['Up', 'Right', 'Down', 'Left'].forEach(direction => {
      container.appendChild(this.#arrow(direction, props));
    });
    container.appendChild(
      this.#stanzas(keys.subjectId, keys.uniqueEntryId, keys.dataKey)
    );

    return container;
  }

  #stanzas(subjectId, uniqueEntryId, dataKey) {
    const stanzas = document.createElement('div');
    stanzas.className = 'stanzas';
    stanzas.innerHTML += StanzaManager.draw(subjectId, uniqueEntryId, dataKey);

    return stanzas;
  }

  #arrow(direction, props) {
    const arrow = document.createElement('div');
    arrow.classList.add('arrow', `-${direction.toLowerCase()}`);
    arrow.addEventListener('click', e => {
      const arrowMovement = {
        dir: direction,
        curX: parseInt(props.dataX),
        curY: parseInt(props.dataY),
        curInternalIndex: parseInt(props.dataSubOrder),
        getTargetAxes: this.#arrowFuncs.get('Arrow' + direction),
      };
      this.#setMovementArrow(arrowMovement);
    });

    return arrow;
  }

  // Events, functions
  #setHighlight(x, y, subOrder) {
    const entry = this.#entriesByAxes(x, y, subOrder);
    const tr = entry.closest('tr');
    entry.classList.add('-selected');
    tr.classList.add('-selected');

    const customEvent = new CustomEvent(event.highlightCol, {
      detail: x,
    });
    DefaultEventEmitter.dispatchEvent(customEvent);
  }

  #handleKeydown = e => {
    if (e.key == 'Escape') {
      this.#hidePopUp();
    } else if (this.#arrowFuncs.has(e.key)) {
      e.preventDefault();
      this.#RESULT_MODAL
        .querySelector(`.arrow.-${e.key.replace('Arrow', '').toLowerCase()}`)
        .click();
    }
  };

  #arrowFuncs = new Map([
    [
      'ArrowLeft',
      function (x, y) {
        return [x - 1, y];
      },
    ],
    [
      'ArrowRight',
      function (x, y) {
        return [x + 1, y];
      },
    ],
    [
      'ArrowUp',
      function (x, y = x) {
        return [x, y - 1];
      },
    ],
    [
      'ArrowDown',
      function (x, y = x) {
        return [x, y + 1];
      },
    ],
  ]);

  #setMovementArrow(movement) {
    try {
      const targetEntry = this.#getTargetEntry(movement);
      const targetTr = targetEntry.closest('tr');
      const reportLink = targetTr.querySelector(
        ':scope > th > .inner > .report-page-button-view'
      ).href;

      targetEntry.scrollIntoView({block: 'center'});
      createPopupEvent(targetEntry, reportLink, event.movePopup);
    } catch (error) {
      console.log('Out of bounds');
    }
  }

  #getTargetEntry(move) {
    // Check if there are multiple entries in the current cell when going up or down
    if (['Down', 'Up'].includes(move.dir)) {
      const allCurEntries = this.#entriesByAxes(move.curX, move.curY);
      const targetInternalIndex = move.getTargetAxes(move.curInternalIndex)[1];
      // movement inside cell
      if (allCurEntries[targetInternalIndex]) {
        return allCurEntries[targetInternalIndex];
      }
    }
    // default: target outside of current cell
    const [targetX, targetY] = move.getTargetAxes(move.curX, move.curY);
    const allTargetEntries = this.#entriesByAxes(targetX, targetY);
    const targetIndex = move.dir === 'Up' ? allTargetEntries.length - 1 : 0;

    return allTargetEntries[targetIndex];
  }

  #entriesByAxes(x, y, subOrder) {
    if (subOrder === undefined) {
      return this.#RESULTS_TABLE.querySelectorAll(`[data-order = '${x},${y}']`);
    }
    return this.#RESULTS_TABLE.querySelector(
      `[data-order = '${x},${y}'][data-sub-order = '${subOrder}']`
    );
  }

  #hidePopUp() {
    const popupStyle = this.#RESULT_MODAL.querySelector('.popup').style
    this.#popup_top = popupStyle.top
    this.#popup_left = popupStyle.left

    this.#RESULT_MODAL.classList.remove('backdrop');
    this.#RESULT_MODAL.innerHTML = '';
    this.#RESULTS_TABLE
      .querySelectorAll('.-selected')
      .forEach(entry => entry.classList.remove('-selected'));
    document.removeEventListener('keydown', this.#handleKeydown);
  }
}
