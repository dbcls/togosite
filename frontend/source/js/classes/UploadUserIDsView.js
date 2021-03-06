import DefaultEventEmitter from './DefaultEventEmitter';
import ConditionBuilder from './ConditionBuilder';
import Records from './Records';
import * as event from '../events';

export default class UploadUserIDsView {

  #path;
  #BODY;
  #USER_IDS;

  constructor(elm) {

    this.#BODY = document.querySelector('body');
    this.#USER_IDS = elm.querySelector(':scope > textarea');

    // atache events
    const buttons = elm.querySelector(':scope > .buttons');
    buttons.querySelector(':scope > button:nth-child(1)').addEventListener('click', e => {
      e.stopPropagation();
      this.#fetch();
      return false;
    });
    buttons.querySelector(':scope > button:nth-child(2)').addEventListener('click', e => {
      e.stopPropagation();
      this.#clear();
      return false;
    });

    // event listeners
    this.#USER_IDS.addEventListener('change', () => {
      ConditionBuilder.setUserIds(this.#USER_IDS.value);
    });
    // this.#USER_IDS.addEventListener('keyup', e => {
    //   if (e.keyCode === 13) this.#fetch();
    // });
    // DefaultEventEmitter.addEventListener(event.restoreParameters, this.#restoreParameters.bind(this));
    DefaultEventEmitter.addEventListener(event.clearCondition, this.#clear.bind(this));

  }


  // public methods
  
  definePath(path) {
    this.#path = path;
  }


  // private methods

  // #restoreParameters({detail}) {
  //   this.#USER_IDS.value = detail.userIds;
  // }

  #fetch() {
    if (this.#USER_IDS.value === '') return;

    const queryTemplate = `${this.#path.url}?sparqlet=@@sparqlet@@&primaryKey=@@primaryKey@@&categoryIds=&userKey=${ConditionBuilder.currentTogoKey}&userIds=${encodeURIComponent(this.#USER_IDS.value.replace(/,/g," ").split(/\s+/).join(','))}`;

    Records.properties.forEach(property => {
      const propertyId = property.propertyId;
      fetch(queryTemplate
        .replace('@@sparqlet@@', encodeURIComponent(property.data))
        .replace('@@primaryKey@@', encodeURIComponent(property.primaryKey)))
      .then(responce => responce.json())
      .then(values => {
        console.log(values)
        this.#BODY.classList.add('-showuserids');
        // dispatch event
        const customEvent = new CustomEvent(event.setUserValues, {detail: {
          propertyId,
          values
        }});
        DefaultEventEmitter.dispatchEvent(customEvent);
      });
    });

  }

  #clear() {
    this.#BODY.classList.remove('-showuserids');
    this.#USER_IDS.value = '';
    const customEvent = new CustomEvent(event.clearUserValues);
    DefaultEventEmitter.dispatchEvent(customEvent);
  }

}
