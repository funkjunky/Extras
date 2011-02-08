//NOTES//
//TODO: pass parentElement or something, so we can void all dependencies of a question if it is no longer visible.
//TODO: fix templates. Currently rules try to apply right away, stop them form doing this, and then ensure they get updated appropriately. This was only a problem for cross template stuff.
//TODO: make a queue, so I don't initiate events more than once. So for example by clicking a radio button updateVisibility is called because you set a dependent choice, and because you unset a dependent choice. This is unnecessary however, because it is contained it is not at all dangerous.

/********preinstantiation code*********/

//this is used as the cookie cutter for Survey Elements. It is built in the beginning and represents a DOM element, not an instance.
function SurveyOriginalElement(oIDNumber_, type_, qType_, oTemplate_IDNumber_
                                , arrOtherOptions_, defaultDisplay_, oParentID_)
{
  this.oIDNumber = ((oIDNumber_===undefined)?null:oIDNumber_);
  this.type = ((type_===undefined)?null:type_);
  this.qType = ((qType_===undefined)?null:qType_);
  this.oTemplate_IDNumber = ((oTemplate_IDNumber_===undefined)
                              ?null :oTemplate_IDNumber_);
  this.arrOtherOptions = ((arrOtherOptions_===undefined)?[]:arrOtherOptions_);
  // Next line breaks FF so it is set to the empty string...
  this.defaultDisplay = ""; //((defaultDisplay_===undefined)?null:defaultDisplay_);
  this.oParentID = ((oParentID_===undefined)?null:oParentID_);

  this.contextualID = function(template_id, template_num) {
    return ( (this.oTemplate_IDNumber===null)
                  ? this.oIDNumber
                  : SurveyElementRegistry.getIDWithTemplate
                      (this.oIDNumber, template_id, template_num));
  };
}

var IDType = 
{
  choice: "_choice_",
  question: "_question_",
  template: "_template_"
};

//TODO: If memory is too much we could take out arrDependedOnBy, and compute it in real time instead.
/// @brief A node to represent a rule in a dependency graph.
function RuleNode(IDNumber_, arrDependsOn_, arrDependedOnBy_)
{
  //functions & anything else considered compile-time-like.

  //constructor stuff...
  this.IDNumber = ((IDNumber_===undefined)?null:IDNumber_);
  this.arrDependsOn = ((arrDependsOn_===undefined)?[]:arrDependsOn_);
  this.arrDependedOnBy = ((arrDependedOnBy_===undefined)?[]:arrDependedOnBy_);
}

/// @brief the graph of rule nodes. Used to see if a question is dependent on another question.
/// @param surveyRulesObj A JSON object returned from PHP of all survey rules.
function RuleGraph(surveyRulesObj)
{
  this.__setDependedOnBy = function(key) {
      for(key2 in this.arrRuleNodes[key].arrDependsOn)
      {
        var dependsID = this.arrRuleNodes[key].arrDependsOn[key2];
        if(this.arrRuleNodes[dependsID] === undefined)
          this.arrRuleNodes[dependsID] = new RuleNode(dependsID, [], [key]);
        else
          this.arrRuleNodes[dependsID]["arrDependedOnBy"].push(key);
      }
  };

  this.refreshDependedOnBy = function() {
    for(key in this.arrRuleNodes)
      this.__setDependedOnBy(key);
  };

  this.arrRuleNodes = {};
  if(surveyRulesObj !== undefined){
    for(key in surveyRulesObj)
      this.arrRuleNodes[key] = new RuleNode(key
                                  , surveyRulesObj[key]["arrDependsOn"]);
    //this function sets up the DependedOnBy array, (avoid runtime compilation)
    this.refreshDependedOnBy();  
  }
}

/**************************************/

/***********Instance Code**************/

/// @brief an instance of a survey element, which could be a question, choice or template.
function SurveyElement(IDNumber_, type_, arrDependedOnBy_
                          , arrDependsOn_, visible_, defaultDisplay_
                          , otherOptions_, assocQuestionID_)
{
  this.IDNumber = ((IDNumber_===undefined)?null:IDNumber_);
  //this.type is an IDType (choice, question, template)
  this.type = ((type_===undefined)?null:type_);
  this.arrDependedOnBy = ((arrDependedOnBy_===undefined)?[]:arrDependedOnBy_);
  this.arrDependsOn = ((arrDependsOn_===undefined)?[]:arrDependsOn_);
  this.visible = ((visible_===undefined)?true:visible_);
  this.defaultDisplay = ((defaultDisplay_===undefined)?null:defaultDisplay_);
  this.chosen = false;
  otherOptions_ = new OtherOptions(otherOptions_);
  this.otherOptions = ((otherOptions_===undefined)?null:otherOptions_);
  this.assocQuestionID = ((assocQuestionID_===undefined)?null:assocQuestionID_);

  this.setChosen = function() {
    if(!this.chosen)
      this.toggleChosen();
  };

  this.unsetChosen = function() {
    if(this.chosen)
      this.toggleChosen();
  };

  this.toggleChosen = function() {
    this.chosen = !this.chosen;
    this.arrDependedOnBy
          .forEach(function(elem) {
            SurveyElementRegistry.arrElements[elem].updateVisibility();
          });
  };

  /// @brief updates the visibility of this element depending on whether it should be shown according to the rule graph.
  this.updateVisibility = function() {
    //This stuff is to stop redundent updates.
    
    var newLock = false;
    if(SurveyElement.uvcLock == 0)
    {
      SurveyElement.uvcLock = this.IDNumber;
      newLock = true;
    }

    if(SurveyElement.updateVisibilityCache.indexOf(this.IDNumber) == -1)
    {
      SurveyElement.updateVisibilityCache
        [SurveyElement.updateVisibilityCache.length]
          = this.IDNumber;

    /////
    
      var previousVisibility = this.visible;
      this.visible 
        = (this.arrDependsOn.length == 0) 
            || this.arrDependsOn.some(function(elem) {
                  //if the element isn't visible, then it can't be relied upon.
                  return SurveyElementRegistry.arrElements[elem].chosen
                          && SurveyElementRegistry.arrElements[elem].visible;
                });
      //if thie element is a choice, then it also depends on it's question being visible. If the question isn't visible, then the choice will not be visible, and all elements that depend on the choice, will then not be visible.
      if(this.type === IDType.choice)
        this.visible = this.visible
          && SurveyElementRegistry.arrElements[this.assocQuestionID].visible;
  
      //code only necessary if visibility changed.
      if(this.previousVisibility != this.visible)
      {
        //update other visibilities, if they depend on this element.
        if(this.type === IDType.question)
          this.otherOptions.arrOtherOptions.forEach(function(elem) {
              SurveyElementRegistry.arrElements[elem].updateVisibility();
          }, this);

        this.arrDependedOnBy.forEach(function(elem) {
            SurveyElementRegistry.arrElements[elem].updateVisibility();
        }, this);
  
        DOM.get(this.IDNumber).style.display = ((this.visible)
                   ? this.defaultDisplay : "none");
      }
    }
    //else
    //  alert("already checked cache");

    //reset the lock and cache for updateVisibility.
    //The lock is necessary to know this was the first updateVisibility call 
    //in a chain. if we merely used the uvcLock, we would end up resetting the 
    //cache, as soon as a cycle occured... the opposite of what we want.

    if(newLock && SurveyElement.uvcLock == this.IDNumber)
    {
      SurveyElement.uvcLock = 0;
      SurveyElement.updateVisibilityCache = [];
    }

    ///////
  };
}
SurveyElement.updateVisibilityCache = [];
SurveyElement.uvcLock = 0;


//class for static functions for events
function OtherOptions(arrOtherOptions_)
{
  if(arrOtherOptions_ === undefined)
    throw "You need to provide an array while creating a new changeEvent Object. If their are no other options, provide a blank array";
  
  //an array of the IDNumber of the elements that are also involved with this 
  //change event.
  //For radio buttons this needs to also be the id. So the id and value should
  //be the same.
  this.arrOtherOptions = arrOtherOptions_;

  this.unsetIfSet = function() {
    //iterate through arrOtherOptions and if chosen is set to true, then call 
    //unsetChosen on that obj.
      this.arrOtherOptions
            .filter(function(elem) {  
                return SurveyElementRegistry.arrElements[elem].chosen;  
            })
            .forEach(function(elem) { 
                return SurveyElementRegistry.arrElements[elem].unsetChosen();  
            });
  };
}

var ChangeEvent = 
{
  attachEvent: function(id, qType, parent_id) {
    if(qType === "4")
    {
      //only if some event does not exist for the select box.
      if(!Event.map_.some(function(elem) { return elem[0].id === parent_id }))
        Event.add(DOM.get(document.getElementById(parent_id).getElementsByTagName("select")[0]), "change", this.changeEventFnc);
    }
    else if(qType === "1")
      Event.add(DOM.get(id), "click", this.changeEventFnc);
    else
      alert("rules are not implemented for the question type '" + qType + "' yet");
  },
  changeEventFnc: function() {
    var value = this.value;
    //special case because of our crappy "xx" value for unselected choices.
    //this won't be necessary if we make the id and value match for those.
    //so make the value qID.0
    if(this.tagName === "SELECT")
      value = this.options[this.selectedIndex].id;
    ///////
    SurveyElementRegistry.arrElements[value].setChosen();
    SurveyElementRegistry.arrElements[value].otherOptions.unsetIfSet();
    //The below comment may be untrue... I think what I have here is enough.
    //
    //this is where the code goes to do everything when the event is triggered.
    //actually this will choose either the select or the radio version.
    //remember to use the call function, to pass the "this" object.
  }
};

/// @brief Main global registry for elements, element templates, and the rule graph.
var SurveyElementRegistry = 
{
  arrOriginalElements: {},
  ruleGraph: null,
  arrElements: {},
  prepareElements: function(surveyQs) {
    //create new originalSurveyElements and append them to arrOriginalElement.
    for(key in surveyQs)
    {
      this.arrOriginalElements[key] = 
        new SurveyOriginalElement(key, IDType.question
              , surveyQs[key]["type"], surveyQs[key]["tID"], surveyQs[key]["choices"], "block");
      if(surveyQs[key]["choices"] !== undefined)
        //NOTE: key2 MUST be the full id!
        for(index in surveyQs[key]["choices"])
          this.arrOriginalElements[surveyQs[key]["choices"][index]] = 
            new SurveyOriginalElement(surveyQs[key]["choices"][index]
                                      , IDType.choice
                                      , surveyQs[key]["type"]
                                      , surveyQs[key]["tID"]
                                      //all choices, but current choice.
                                      , RemoveFrom(surveyQs[key]["choices"], index)
                                      , "inline"
                                      , key);
    }
  },
  createRuleGraph: function(rulesObj) {
    this.ruleGraph = new RuleGraph(rulesObj);
  },
  initiateElements: function(templatesObj) {
    //Initiate non-template question elements
    var nonTQuestions = Filter(this.arrOriginalElements, function(elem){
        return elem.oTemplate_IDNumber === null;
    });
    for(key in nonTQuestions)
      this.instantiateElement(nonTQuestions[key]);

    //Initiate any template questions that should show up by default, because their minimum is greater than 0. Do this by calling addTemplate()/
    for(key in templatesObj)
    {
      if(templatesObj[key]["min"] > 0)
      {
        var TQuestions = Filter(this.arrOriginalElements, function(elem){
            return elem.oTemplate_IDNumber === key;
        });
        for(var i=0; i!=templatesObj[key]["min"]; ++i)
          for(key2 in TQuestions)
            this.instantiateElement(TQuestions[key2], templatesObj[key][tID],i);
      }
    }
  },
  addTemplate: function(id, template_num) {
    //if(this.arrElements[id].type !== IDType.template)
    //  throw "you can't add a survey element that is not a template";

    //add all elements associated to the oTemplate_idnumber using arrOriginalElements.
    ForEach(
      Filter(this.arrOriginalElements, 
          function(elem){ return id === elem.oTemplate_IDNumber; })
      , function(elem){
          SurveyElementRegistry.instantiateElement(elem, id, template_num);
        });
    
    //just incase a dependency is fulfilled in the global space.
    ForEach(this.arrElements
      , function(elem) { elem.updateVisibility(); });
  },
  instantiateElement: function(originalElement, template_id, template_num) {
      var contextualizeID = 
        function(elem) {
          return SurveyElementRegistry.arrOriginalElements[elem]
                  .contextualID(template_id, template_num);
        };
    var id = originalElement.oIDNumber;
    //note: rules can only be within the same template OR an item inside a template can depend on something not in ANY template.
    var arrDependsOn = [];
    var arrDependedOnBy = [];

    //make a copy of the otherOptions array. We DO NOT want the original.
    var otherOptions = originalElement.arrOtherOptions.slice(0);

    if(this.ruleGraph.arrRuleNodes[id] !== undefined)
    {
      arrDependsOn 
        = this.ruleGraph.arrRuleNodes[id].arrDependsOn.map(contextualizeID);
    //Now we add the prefix for the dependencies... contextualID will add the prefix if the dependancy is a template. If it is a global dependent, then it will be without the prefix =).
      arrDependedOnBy 
        = this.ruleGraph.arrRuleNodes[id].arrDependedOnBy.map(contextualizeID);
    }
      var id = contextualizeID(originalElement.oIDNumber);
     otherOptions = otherOptions.map(contextualizeID);

    //attach the event if anything depends on this question.
    //if(Length(arrDependedOnBy) > 0)
    var qID = ((originalElement.oParentID === null)
                  ?id  :originalElement.oParentID);
    if(originalElement.type === IDType.choice)
      ChangeEvent.attachEvent(id, originalElement.qType
                        , this.arrOriginalElements[qID]
                            .contextualID(template_id, template_num));

    var assocQuestionID = (originalElement.type === IDType.choice)
          ? this.arrOriginalElements[originalElement.oParentID]
              .contextualID(template_id, template_num)
          : originalElement.oParentID;

    //create the instance.
    this.arrElements[id] = new SurveyElement( id, originalElement.type
                                , arrDependedOnBy, arrDependsOn
                                , (!(arrDependsOn.length))
                                , originalElement.defaultDisplay
                                , otherOptions
                                , assocQuestionID);
  },
  getIDWithTemplate: function(elem, template_id, template_num) {
      //currently the template id is required in the question ID.
      //therefore it is always incorporated with the question ID.
      //return template_id + "." + elem + "." + template_num;
      return elem + "." + template_num;
  }
}

/// @brief sets up the survey registry. The function that starts it all.
function prepareGlobalRegistries(surveyObj)
{
  SurveyElementRegistry.prepareElements(surveyObj["questions"]);
  
  SurveyElementRegistry.createRuleGraph(surveyObj["rules"]);
  
  SurveyElementRegistry.initiateElements(surveyObj["templates"]);

  for(key in SurveyElementRegistry.arrElements)
    if(SurveyElementRegistry.arrElements[key].type === IDType.question)
      SurveyElementRegistry.arrElements[key].updateVisibility(); 
}

