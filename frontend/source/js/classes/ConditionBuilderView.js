import ConditionBuilder from "./ConditionBuilder";
import DefaultEventEmitter from "./DefaultEventEmitter";
import StackingConditionView from "./StackingConditionView";
import * as event from '../events';

const POLLING_DURATION = 100;

export default class ConditionBuilderView {

  #properties;
  #propertyValues;
  #isDefined;
  #placeHolders;
  #TOGO_KEYS;
  #USER_IDS;
  #PROPERTIES_CONDITIONS_CONTAINER;
  #ATTRIBUTES_CONDITIONS_CONTAINER;
  #EXEC_BUTTON;

  constructor(elm) {

    this.#properties = [];
    this.#propertyValues = [];
    this.#isDefined = false;
  
    // references
    const conditionsContainer = elm.querySelector(':scope > .conditions');
    this.#TOGO_KEYS = conditionsContainer.querySelector('#ConditionTogoKey > .inner > select');
    this.#USER_IDS = elm.querySelector('#UploadUserIDsView > textarea');
    this.#PROPERTIES_CONDITIONS_CONTAINER = document.querySelector('#ConditionValues > .inner > .conditions');
    this.#ATTRIBUTES_CONDITIONS_CONTAINER = document.querySelector('#ConditionKeys > .inner > .conditions');
    this.#EXEC_BUTTON = elm.querySelector(':scope > footer > button.exec');

    // attach event
    document.querySelector('#ConditionKeys').addEventListener('click', () => document.body.dataset.condition = 'keys');
    document.querySelector('#ConditionValues').addEventListener('click', () => document.body.dataset.condition = 'values');
    this.#EXEC_BUTTON.addEventListener('click', () => {
      document.body.dataset.display = 'results';
      ConditionBuilder.makeQueryParameter();
    });
    elm.querySelector(':scope > footer > button.return').addEventListener('click', () => {
      document.body.dataset.display = 'properties';
    });
    elm.querySelector(':scope > header > button.rounded-button-view').addEventListener('click', () => {
      console.log(123)
      const customEvent = new CustomEvent(event.clearCondition);
      DefaultEventEmitter.dispatchEvent(customEvent);
    });

    // event listeners
    DefaultEventEmitter.addEventListener(event.mutatePropertyCondition, e => {
      switch (e.detail.action) {
        case 'add':
          this.#addProperty(e.detail.propertyId, e.detail.parentCategoryId);
          break;
        case 'remove':
          this.#removeProperty(e.detail.propertyId, e.detail.parentCategoryId);
          break;
      }
    });
    DefaultEventEmitter.addEventListener(event.mutatePropertyValueCondition, e => {
      switch (e.detail.action) {
        case 'add':
          this.#addPropertyValue(e.detail.propertyId, e.detail.categoryId);
          break;
        case 'remove':
          this.#removePropertyValue(e.detail.propertyId, e.detail.categoryId);
          break;
      }
    });
    DefaultEventEmitter.addEventListener(event.defineTogoKey, e => {
      this.#defineTogoKeys(e.detail);
    });
    DefaultEventEmitter.addEventListener(event.mutateEstablishConditions, e => {
      this.#EXEC_BUTTON.disabled = !e.detail;
    });
    DefaultEventEmitter.addEventListener(event.restoreParameters, e => {
      this.#restoreParameters(e.detail);
    });

  }
  

  // private methods

  #restoreParameters(parameters) {
    if (parameters.togoKey) {
      if (this.#isDefined) {
        this.#TOGO_KEYS.value = parameters.togoKey;
      } else {
        setTimeout(() => {
          this.#restoreParameters(parameters);
        }, POLLING_DURATION);
      }
    }
  }

  #defineTogoKeys(subjects) {
    this.#isDefined = true;
    this.#placeHolders = Object.fromEntries(subjects.filter(subject => subject.togoKey).map(subject => [subject.togoKey, subject.togoKeyExamples]));
    // make options
    this.#TOGO_KEYS.innerHTML = subjects.map(subject => {
      let option = '';
      if (subject.togoKey) option = `<option value="${subject.togoKey}" data-subject-id="${subjects.subjectId}">${subject.keyLabel}</option>`;
      return option;
    }).join('');
    this.#TOGO_KEYS.disabled = false;
    // attach event
    this.#TOGO_KEYS.addEventListener('change', e => {
      const subject = subjects.find(subject => subject.togoKey === e.target.value);
      ConditionBuilder.setSubject(e.target.value, subject.subjectId);
      this.#USER_IDS.placeholder = this.#placeHolders[e.target.value].join(', ');
    });
    this.#TOGO_KEYS.dispatchEvent(new Event('change'));
  }

  #addProperty(propertyId, parentCategoryId) {
    // modifier
    this.#PROPERTIES_CONDITIONS_CONTAINER.classList.remove('-empty');
    // make view
    this.#properties.push(new StackingConditionView(this.#PROPERTIES_CONDITIONS_CONTAINER, 'property', {propertyId, parentCategoryId}));
  }
  
  #removeProperty(propertyId, parentCategoryId) {
    // remove from array
    const index = this.#properties.findIndex(stackingConditionView => stackingConditionView.removeProperty(propertyId, parentCategoryId));
    this.#properties.splice(index, 1);
    // modifier
    if (this.#properties.length === 0) this.#PROPERTIES_CONDITIONS_CONTAINER.classList.add('-empty');
  }

  #addPropertyValue(propertyId, categoryId) {
    // modifier
    this.#ATTRIBUTES_CONDITIONS_CONTAINER.classList.remove('-empty');
    // find a condition view has same property id
    const stackingConditionView = this.#propertyValues.find(stackingConditionView => stackingConditionView.sameProperty(propertyId));
    if (stackingConditionView) {
      // if it exists, add new categoryId
      stackingConditionView.addValue(categoryId);
    } else {
      // otherwise, make new condition view
      this.#propertyValues.push(new StackingConditionView(this.#ATTRIBUTES_CONDITIONS_CONTAINER, 'value', {propertyId, categoryId}));
    }
  }

  #removePropertyValue(propertyId, categoryId) {
    // remove from array
    const index = this.#propertyValues.findIndex(stackingConditionView => stackingConditionView.removePropertyValue(propertyId, categoryId));
    if (index !== -1) this.#propertyValues.splice(index, 1);
    // modifier
    if (this.#propertyValues.length === 0) this.#ATTRIBUTES_CONDITIONS_CONTAINER.classList.add('-empty');
  }

}