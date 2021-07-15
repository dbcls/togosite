import App from './App';
import DefaultEventEmitter from './DefaultEventEmitter';
import ConditionBuilder from './ConditionBuilder';
import Records from './Records';
import * as event from '../events';
import axiosRetry from 'axios-retry';

const LIMIT = 100;
const downloadUrls = new Map();
const timeOutError = 'ECONNABORTED';
/**
 * @typedef {Object} Mode
 * @property {string} label
 * @property {string} icon
 * @property {string} dataButton
 */
const dataButtonModes = new Map([
  [
    'edit',
    {
      label: 'Edit',
      icon: 'edit',
      dataButton: 'edit',
    },
  ],
  [
    'resume',
    {
      label: 'Resume',
      icon: 'play_arrow',
      dataButton: 'resume',
    },
  ],
  [
    'pause',
    {
      label: 'Pause',
      icon: 'pause',
      dataButton: 'pause',
    },
  ],
  [
    'tsv',
    {
      label: 'TSV',
      icon: 'download',
      dataButton: 'download-tsv',
    },
  ],
  [
    'json',
    {
      label: 'JSON',
      icon: 'download',
      dataButton: 'download-json',
    },
  ],
  [
    'retry',
    {
      label: 'Retry',
      icon: 'refresh',
      dataButton: 'retry',
    },
  ],
  [
    'empty',
    {
      label: '',
      icon: '',
      dataButton: '',
    },
  ],
]);

export default class TableData {
  #condition;
  #serializedHeader;
  #queryIds;
  #rows;
  #source;
  #isLoading;
  #isCompleted;
  #startTime;
  #ROOT;
  #STATUS;
  #INDICATOR_TEXT_AMOUNT;
  #INDICATOR_TEXT_TIME;
  #INDICATOR_BAR;
  #CONTROLLER;
  #BUTTON_LEFT;
  #BUTTON_RIGHT;

  constructor(condition, elm) {
    // axios settings
    axios.defaults.timeout = 600000;
    axiosRetry(axios, {
      retries: 2,
      shouldResetTimeout: true,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: error => {
        return (error.code === timeOutError) | (error.response?.status === 500);
      },
    });

    const CancelToken = axios.CancelToken;
    this.#source = CancelToken.source();

    this.#isLoading = false;
    this.#isCompleted = false;
    this.#condition = condition;
    this.#serializedHeader = [
      ...condition.attributes.map(property => property.query.propertyId),
      ...condition.properties.map(property => property.query.propertyId),
    ];
    this.#queryIds = [];
    this.#rows = [];

    // view
    elm.classList.add('table-data-controller-view');
    elm.dataset.status = 'load ids';

    elm.innerHTML = `
    <div class="close-button-view"></div>
    <div class="conditions">
      <div class="condition">
        <p title="${condition.togoKey}">${Records.getLabelFromTogoKey(
      condition.togoKey
    )}</p>
      </div>
      ${condition.attributes
        .map(
          property => `<div class="condition _subject-background-color" data-subject-id="${property.subject.subjectId}">
        <p title="${property.property.label}">${property.property.label}</p>
      </div>`
        )
        .join('')}
      ${condition.properties
        .map(property => {
          const label = property.parentCategoryId
            ? Records.getValue(
                property.query.propertyId,
                property.parentCategoryId
              ).label
            : property.property.label;
          return `<div class="condition _subject-color" data-subject-id="${property.subject.subjectId}">
          <p title="${label}">${label}</p>
        </div>`;
        })
        .join('')}
    </div>
    <div class="status">
      <p>Getting ID list</p>
      <span class="material-icons-outlined">autorenew</span>
    </div>
    <div class="indicator">
      <div class="text">
        <div class="amount-of-data"></div>
        <div class="remaining-time"></div>
      </div>
      <div class="progress">
        <div class="bar"></div>
      </div>
    </div>
    <div class="controller">
    </div>
    `;

    // reference
    this.#ROOT = elm;
    this.#STATUS = elm.querySelector(':scope > .status > p');
    const INDICATOR = elm.querySelector(':scope > .indicator');
    this.#INDICATOR_TEXT_AMOUNT = INDICATOR.querySelector(
      ':scope > .text > .amount-of-data'
    );
    this.#INDICATOR_TEXT_TIME = INDICATOR.querySelector(
      ':scope > .text > .remaining-time'
    );
    this.#INDICATOR_BAR = INDICATOR.querySelector(':scope > .progress > .bar');

    this.#CONTROLLER = elm.querySelector(':scope > .controller');
    this.#CONTROLLER.appendChild(this.#makeDataButton('left'));
    this.#CONTROLLER.appendChild(
      this.#makeDataButton('right', dataButtonModes.get('edit'))
    );
    this.#BUTTON_LEFT = elm.querySelector(
      ':scope > .controller > .button.left'
    );
    this.#BUTTON_RIGHT = elm.querySelector(
      ':scope > .controller > .button.right'
    );

    // events
    elm.addEventListener('click', () => {
      if (elm.classList.contains('-current')) return;
      this.select();
    });

    // delete
    this.#ROOT
      .querySelector(':scope > .close-button-view')
      .addEventListener('click', e => {
        this.#deleteCondition(e);
      });

    ConditionBuilder.finish();
    this.select();
    this.#toggleInProgressDisplay()
    this.#getQueryIds();
  }

  /* private methods */

  #deleteCondition(e) {
    e.stopPropagation();
    const customEvent = new CustomEvent(event.deleteTableData, {
      detail: this,
    });
    DefaultEventEmitter.dispatchEvent(customEvent);
    // abort fetch
    this.#source.cancel('user cancel');
    // delete element
    this.#ROOT.parentNode.removeChild(this.#ROOT);
    // transition
    document.querySelector('body').dataset.display = 'properties';
  }

  // *** Responsive Buttons based on dataButtonModes ***
  /**
   * @param {string} className
   * @param {Mode} mode
   */
  #makeDataButton(className, mode = undefined) {
    const button = document.createElement('div');
    button.innerHTML = `
      <a>
        <span class="material-icons-outlined"></span>
        <span class="label"></span>
      </a>`;
    button.classList.add('button', className);

    if (mode) this.#updateDataButton(button, mode);

    button.addEventListener('click', e => {
      this.#dataButtonEvent(e);
    });

    return button;
  }

  /**
   * @param {HTMLElement} target
   * @param {Mode} mode
   * @param {string} urlType
   */
  #updateDataButton(target, mode, urlType) {
    target.dataset.button = mode.dataButton;
    const anchor = target.querySelector(':scope > a');
    anchor.querySelector(':scope > .material-icons-outlined').innerText =
      mode.icon;
    anchor.querySelector(':scope > .label').innerText = mode.label;
    if (urlType) {
      const url = downloadUrls.get(urlType);
      anchor.setAttribute('href', url);
      anchor.setAttribute('download', `sample.${urlType}`);
    }
  }

  /**
   * @param {MouseEvent} e
   */
  #dataButtonPauseOrResume(e) {
    e.stopPropagation();
    this.#toggleInProgressDisplay();
    this.#STATUS.classList.toggle('-flickering');

    const modeToChangeTo = this.#isLoading ? 'resume' : 'pause';
    this.#updateDataButton(
      e.currentTarget,
      dataButtonModes.get(modeToChangeTo)
    );
    this.#isLoading = !this.#isLoading;
    this.#STATUS.textContent = this.#isLoading ? 'Getting Data' : 'Awaiting';

    if (this.#isLoading) this.#getProperties();
  }

  #toggleInProgressDisplay() {
    const iconSpan = this.#ROOT.querySelector(
      ':scope > .status > .material-icons-outlined'
    );
    this.#ROOT.classList.toggle('-fetching');
    iconSpan.classList.toggle('-rotating');
  }
  /**
   * @param {MouseEvent} e
   */
  #dataButtonEdit(e) {
    e.stopPropagation();
    // property (attribute)
    ConditionBuilder.setProperties(
      this.#condition.properties.map(property => {
        return {
          propertyId: property.query.propertyId,
          parentCategoryId: property.parentCategoryId,
        };
      }),
      false
    );
    // attribute (classification/distribution)
    Records.properties.forEach(({propertyId}) => {
      const attribute = this.#condition.attributes.find(
        attribute => attribute.property.propertyId === propertyId
      );
      const categoryIds = [];
      if (attribute) categoryIds.push(...attribute.query.categoryIds);
      ConditionBuilder.setPropertyValues(propertyId, categoryIds, false);
    });
  }

  #dataButtonRetry() {
    this.#toggleInProgressDisplay();
    this.#STATUS.classList.remove('-error');
    this.#updateDataButton(this.#BUTTON_LEFT, dataButtonModes.get('empty'));

    if (this.#queryIds.length > 0) {
      this.#getProperties();
      this.#STATUS.textContent = 'Getting Data';
      return;
    }
    this.#STATUS.textContent = 'Getting ID list';
    this.#getQueryIds();
  }
  /**
   * @param { mouseEvent } e
   */
  #dataButtonEvent(e) {
    const button = e.currentTarget;
    const mode = button.dataset.button;
    switch (mode) {
      case 'edit':
        this.#dataButtonEdit(e);
        break;

      case 'resume':
      case 'pause':
        this.#dataButtonPauseOrResume(e);
        break;

      case 'retry':
        this.#dataButtonRetry();
        break;
    }
  }

  #setDownloadButtons() {
    this.#setTsvUrl();
    this.#updateDataButton(
      this.#BUTTON_LEFT,
      dataButtonModes.get('tsv'),
      'tsv'
    );

    this.#setJsonUrl();
    const middleButton = this.#makeDataButton('middle', 'json');
    this.#updateDataButton(middleButton, dataButtonModes.get('json'), 'json');
    this.#CONTROLLER.insertBefore(middleButton, this.#BUTTON_RIGHT);
  }
  // Setters for downloadUrls
  #setJsonUrl() {
    const jsonBlob = new Blob([JSON.stringify(this.#rows, null, 2)], {
      type: 'application/json',
    });
    downloadUrls.set('json', URL.createObjectURL(jsonBlob));
  }

  #setTsvUrl() {
    const temporaryArray = [];
    this.#rows.forEach(row => {
      row.properties.forEach(property => {
        property.attributes.forEach(attribute => {
          const singleItem = [
            this.#condition.togoKey, // togoKey
            row.id, // togoKeyId
            row.label, // togoKeyLabel
            property.propertyId, // attribute
            property.propertyKey, // attributeKey
            attribute.id, // attributeKeyId
            attribute.attribute.label, // attributeValue
          ];
          temporaryArray.push(singleItem);
        });
      });
    });
    const tsvArray = temporaryArray.map(item => {
      return item.join('\t');
    });
    if (tsvArray.length !== 0) {
      const tsvHeader = [
        'togoKey',
        'togoKeyId',
        'togoKeyLabel',
        'attribute',
        'attributeKey',
        'attributeKeyId',
        'attributeValue',
      ];
      tsvArray.unshift(tsvHeader.join('\t'));
    }
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const tsvBlob = new Blob([bom, tsvArray.join('\n')], {type: 'text/plain'});
    const tsvUrl = URL.createObjectURL(tsvBlob);
    downloadUrls.set('tsv', tsvUrl);
  }
  // *** Properties & Loading ***
  /**
   * @param { Error } err - first check userCancel, then server error, timeout err part of else
   */
  #handleError(err) {
    let message, errCode;
    if (axios.isCancel && err.message === 'user cancel') {
      return;
    } else if ((err.response?.status === 500) | (err.code === timeOutError)) {
      this.#updateDataButton(this.#BUTTON_LEFT, dataButtonModes.get('retry'));
    } else {
      this.#BUTTON_LEFT.remove();
    }
    errCode = err.response ? err.response.status : err.code;
    message = err.response
      ? err.response.statusText
      : err.code === timeOutError
      ? 'Timeout'
      : err.message;
    this.#displayError(message, errCode);
  }
  /**
   * @param { string } message - errorMessage
   * @param { number } code - errorCode na in case of timeout or other
   */
  #displayError(message, code) {
    this.#STATUS.classList.add('-error');
    this.#STATUS.textContent = code ? `${message} (${code})` : message;
    this.#toggleInProgressDisplay();

    const customEvent = new CustomEvent(event.failedFetchTableDataIds, {
      detail: this,
    });
    DefaultEventEmitter.dispatchEvent(customEvent);
  }

  #getQueryIdsPayload() {
    return `?togoKey=${this.#condition.togoKey}&properties=${encodeURIComponent(
      JSON.stringify(this.#condition.attributes.map(property => property.query))
    )}${
      ConditionBuilder.userIds?.length > 0
        ? `&inputIds=${encodeURIComponent(
            JSON.stringify(ConditionBuilder.userIds)
          )}`
        : ''
    }`;
  }

  #getQueryIds() {
    axios
      .post(App.aggregatePrimaryKeys, this.#getQueryIdsPayload(), {
        cancelToken: this.#source.token,
      })
      .then(response => {
        this.#queryIds = response.data;

        if (this.#queryIds.length <= 0) {
          this.#complete(false);
          return;
        }
        this.#ROOT.dataset.status = 'load rows';
        this.#STATUS.textContent = 'Getting Data';
        this.#INDICATOR_TEXT_AMOUNT.innerHTML = `${this.offset.toLocaleString()} / ${this.#queryIds.length.toLocaleString()}`;
        this.#startTime = Date.now();
        this.#updateDataButton(this.#BUTTON_LEFT, dataButtonModes.get('pause'));
        this.#getProperties();
      })
      .catch(error => {
        this.#handleError(error);
      });
  }

  #getPropertiesFetch() {
    return `${App.aggregateRows}?togoKey=${
      this.#condition.togoKey
    }&properties=${encodeURIComponent(
      JSON.stringify(
        this.#condition.attributes
          .map(property => property.query)
          .concat(this.#condition.properties.map(property => property.query))
      )
    )}&queryIds=${encodeURIComponent(
      JSON.stringify(this.#queryIds.slice(this.offset, this.offset + LIMIT))
    )}`;
  }

  #getProperties() {
    this.#isLoading = true;
    axios
      .get(this.#getPropertiesFetch(), {cancelToken: this.#source.token})
      .then(response => {
        this.#rows.push(...response.data);
        this.#isCompleted = this.offset >= this.#queryIds.length;
        this.#INDICATOR_TEXT_AMOUNT.innerHTML = `${this.offset.toLocaleString()} / ${this.#queryIds.length.toLocaleString()}`;
        this.#INDICATOR_BAR.style.width = `${
          (this.offset / this.#queryIds.length) * 100
        }%`;
        this.#updateRemainingTime();
        // dispatch event
        const customEvent = new CustomEvent(event.addNextRows, {
          detail: {
            tableData: this,
            rows: response.data,
            done: this.#isCompleted,
          },
        });
        DefaultEventEmitter.dispatchEvent(customEvent);
        // turn off after finished
        if (this.#isCompleted) {
          this.#complete();
        } else if (this.#isLoading) {
          this.#getProperties();
        }
      })
      .catch(error => {
        this.#handleError(error);
      });
  }

  #updateRemainingTime() {
    let singleTime = (Date.now() - this.#startTime) / this.offset;
    let remainingTime;
    if (this.offset == 0) {
      remainingTime = '';
    } else if (this.offset >= this.#queryIds.length) {
      remainingTime = 0;
    } else {
      remainingTime =
        (singleTime *
          this.#queryIds.length *
          (this.#queryIds.length - this.offset)) /
        this.#queryIds.length /
        1000;
    }
    if (remainingTime >= 3600) {
      this.#INDICATOR_TEXT_TIME.innerHTML = `${Math.round(
        remainingTime / 3600
      )} hr.`;
    } else if (remainingTime >= 60) {
      this.#INDICATOR_TEXT_TIME.innerHTML = `${Math.round(
        remainingTime / 60
      )} min.`;
    } else if (remainingTime >= 0) {
      this.#INDICATOR_TEXT_TIME.innerHTML = `${Math.floor(remainingTime)} sec.`;
    } else {
      this.#INDICATOR_TEXT_TIME.innerHTML = ``;
    }
  }
  /**
   * @param { boolean } withData
   */
  #complete(withData = true) {
    this.#ROOT.dataset.status = 'complete';
    this.#STATUS.textContent = withData ? 'Complete' : 'No Data found';
    this.#toggleInProgressDisplay();

    if (withData) this.#setDownloadButtons();
  }

  /* public methods */
  select() {
    this.#ROOT.classList.add('-current');
    // dispatch event
    const customEvent1 = new CustomEvent(event.selectTableData, {detail: this});
    DefaultEventEmitter.dispatchEvent(customEvent1);
    // send rows
    if (this.#ROOT.dataset.status !== 'load ids') {
      const done = this.offset >= this.#queryIds.length;
      const customEvent2 = new CustomEvent(event.addNextRows, {
        detail: {
          tableData: this,
          rows: this.#rows,
          done,
        },
      });
      DefaultEventEmitter.dispatchEvent(customEvent2);
    }
  }

  deselect() {
    this.#ROOT.classList.remove('-current');
  }

  /* public accessors */

  get offset() {
    return this.#rows.length;
  }
  get togoKey() {
    return this.condition.togoKey;
  }
  get subjectId() {
    return this.condition.subjectId;
  }
  get condition() {
    return this.#condition;
  }
  get serializedHeader() {
    return this.#serializedHeader;
  }
  get data() {
    return this.#rows;
  }
  get rateOfProgress() {
    return this.#rows.length / this.#queryIds.length;
  }
}
