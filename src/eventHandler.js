const fs = require("fs").promises;
const uuidv4 = require("uuid/v4");
const chalk = require("chalk");

var child_process = require('child_process');

const eventFolder = "events";

const directiveEventMapping = {
  "Alexa.Discovery.Discover": "discovery-MacOs",
  // "Alexa.ReportState": "stateReport",
  // "Alexa.ChangeReport": "changeReport",
  // "Alexa.PowerController.TurnOn": "turnOn",
  // "Alexa.PowerController.TurnOff": "turnOff",
  "successResponse": "successResponse"
};

//storing device state here, not intended for production use :)
const TOGGLE_VALUE_ON = "ON";
const TOGGLE_VALUE_OFF = "OFF";
let SCREENSAVER_TOGGLEVALUE = TOGGLE_VALUE_OFF; //just a default value
let BRIGHTNESS_RANGEVALUE = 5; //just a default value


// Public interface
module.exports = {
  getEvent: getEvent,
  directiveResponder: createResponse
};

// Get Event Message by Event name (e.g. "Alexa.Discovery.Discover")
async function getEvent(eventName) {
  let response = await readEventMessage(eventName);
  response.event.header.messageId = uuidv4();
  return response;
}

// Directive hd
async function createResponse(directiveMessage) {
  // Destruct directive
  const {
    directive: {
      header: { name, namespace }
    }
  } = directiveMessage;

  // Log to console
  console.log(chalk.bold.green("\n\n Incoming Directive:", name, namespace));
  console.log(chalk.green(JSON.stringify(directiveMessage)));

  //UPDATED FOR TECH TALKS LOGIC
  let response = await readEventMessage('successResponse');

  console.log("event message read");

  let responseHeaderName = "Response";

  switch (namespace) {
    case "Alexa":
      if (name === "ReportState") {
        responseHeaderName = "StateReport";

        //Populate Toggle Control Values: check if screen saver is running
        //TODO in the future :)

        try {
          //Populate Brightness Values: retrieve brightness from terminal - only supports one mac os screen
          let cmd = 'brightness -l | grep "brightness" | grep -v "error"';
          let brightnessCommandResult = child_process.execSync(cmd) + "";

          console.log('brightness command result', brightnessCommandResult);
          if (brightnessCommandResult) { // sample output: 'display 0: brightness 0.671875'
            let brightnessValue = brightnessCommandResult.split(' ')[3];
            BRIGHTNESS_RANGEVALUE = Math.round(brightnessValue * 10);
          };

        } catch (e) {
          console.log("Exception Received", e);
          BRIGHTNESS_RANGEVALUE = "";
        }
      }

      break;

    case "Alexa.ToggleController":
      if (name === "TurnOn") {
        SCREENSAVER_TOGGLEVALUE = TOGGLE_VALUE_ON;
        //perform logic here

        let cmd = 'open -a ScreenSaverEngine';
        child_process.exec(cmd, function (error, stdout, stderr) {
          // command output is in stdout
        });
      } else {
        SCREENSAVER_TOGGLEVALUE = TOGGLE_VALUE_OFF;
      }
      break;

    case "Alexa.RangeController":
      if (name === "AdjustRangeValue") {
        let rangeDelta = directiveMessage.directive.payload.rangeValueDelta;
        BRIGHTNESS_RANGEVALUE += rangeDelta;
      } else { // "SetRangeValue"
        let rangeValue = directiveMessage.directive.payload.rangeValue;
        BRIGHTNESS_RANGEVALUE = rangeValue;
      }
      let cmd = 'brightness ' + BRIGHTNESS_RANGEVALUE / 10;
      child_process.exec(cmd, function (error, stdout, stderr) {
        // command output is in stdout
      });

      break;
  }

  console.log("namespace", namespace);

  // let response = await readEventMessage(`${namespace}.${name}`);
  // Update Endpoint ID
  response.event.endpoint.endpointId =
    directiveMessage.directive.endpoint.endpointId;

  // Update response name to match
  response.event.header.name = responseHeaderName;

  // Update Correlation Token
  response.event.header.correlationToken =
    directiveMessage.directive.header.correlationToken;

  // Update Message ID
  response.event.header.messageId = uuidv4();

  // Set time stamps to Now
  response.context.properties.forEach(property => {
    property.timeOfSample = new Date().toISOString();
  });


  //Toggle Controller Values - ON or OFF
  response.context.properties[0].value = SCREENSAVER_TOGGLEVALUE;
  //Range Controller Values - ON or OFF
  response.context.properties[1].value = BRIGHTNESS_RANGEVALUE;

  console.log(chalk.bold.yellow("\n Sending Response Event:"));
  return response;
}

async function readEventMessage(name) {
  const fileName = directiveEventMapping[name];
  return fs
    .readFile(`./src/${eventFolder}/${fileName}.json`, "utf-8")
    .then(eventMessage => JSON.parse(eventMessage))
    .catch(() => {
      throw new Error("No mapping file");
    });
}
