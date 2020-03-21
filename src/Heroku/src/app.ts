import { Request, Response, NextFunction } from "express";
import fetch from "node-fetch";
import express = require("express");
import bodyParser = require("body-parser");
import * as Constants from "./constants";
import * as Enums from "./enums";
import * as Types from "./interfaces";
import { handleInOut } from "./io";
import { handleAnnounce } from "./announce";
import { getSlashCommand } from "./text";

const app = express();
let port = process.env.PORT as unknown;
if (port == null || port == "") {
  port = 8000;
}
app.listen(port, () => console.log(`Listening on port ${port}`));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(bodyParser.text());
app.use((req: Request, res: Response, next: NextFunction) => {
  // send acknowledgement response, before message info
  console.log(`Acknowledging request ${req.query}`);
  // res.status(200).send("");
});

app.get("/", (_, res: Response) => {
  res.status(200).send("This is just a Slack app. Nothing here!");
});

app.post("/slash", (req: Request, res: Response) => {
  console.log("Got slash req: ", JSON.stringify(req.body, undefined, 2));
  const response = handleSlashCommandPost(req.body);
  res.status(200).send(response);
});

app.post("/interactive", (req: Request, res: Response) => {
  console.log("Got interactive req: ", JSON.stringify(req.body, undefined, 2));
  res.status(200).send("");
});

// credit to https://davidwalsh.name/using-slack-slash-commands-to-send-data-from-slack-into-google-sheets
/**
 * This method is called any time a POST request from a slash command is sent to this script's URL.
 * It handles the post request and sends the appropriate response to the user.
 *
 * @param body parameters from post request
 */
function handleSlashCommandPost(body: Types.SlackSlashCommandInfo): void {
  // data to fetch from command, to pass to spreadsheet handlers
  const context: Types.ResponseContext = {
    username: body.user_name,
    text: body.text,
    command: getSlashCommand(body.command)
  };
  const responseInfo: Types.ResponseCustomization = {
    toUrl: body.response_url,
    userId: body.user_id
  };
  console.log(
    "Slash command context after processing: " +
      JSON.stringify(context, undefined, 2)
  );
  if (
    context.command === Enums.SlashCommand.in ||
    context.command === Enums.SlashCommand.out
  ) {
    handleInOut(context, responseInfo, function() {}).then(() => {
      console.log("Handled in/out");
    });
  } else if (context.command === Enums.SlashCommand.announce) {
    handleAnnounce(context, responseInfo).then(() => {
      console.log("Handled announce");
    });
  } else if (context.command === Enums.SlashCommand.help) {
    sendResponse(Constants.HELP_TEXT, responseInfo);
  } else {
    sendResponse(
      Constants.FAILURE_RESPONSE + "unsupported command",
      responseInfo
    );
  }
}

/**
 * This method is called any time a POST request from an interactive event is sent to this script's URL.
 * It handles the post request and sends the appropriate response to the user.
 *
 * @param body parameters from post request
 */
// function handleInteractivePost(body: Types.SlackSlashCommandInfo): void {

//   // data to fetch from command, to pass to spreadsheet handlers
//   let context: Types.ResponseContext = {
//     username: "",
//     text: "",
//     command: Enums.SlashCommand.none
//   };
//   let responseInfo: Types.ResponseCustomization = {
//     toUrl: "",
//     userId: ""
//   };
//   let updateInfo: Types.AnnouncementUpdateInfo = undefined;
//   // from button click or modal response
//   console.log("Response to button click");
//   let payload = body.payload;
//   let json: SlackMessagePayload = JSON.parse(payload);
//   if (json.type === "block_actions") {
//     updateInfo = {
//       eventInfo: JSON.parse(json.actions[0].value),
//       userId: json.user.id,
//       messageTimestamp: json.container.message_ts,
//       addUser: true
//     };
//     // clicked button in message
//     // simulate slash command request
//     if (json.actions[0].text.text === "In") {
//       // in button clicked
//       // user in
//       console.log("User clicked in");
//       context = {
//         username: json.user.username,
//         text: updateInfo.eventInfo.dateForColumnLocator, // date
//         command: Enums.SlashCommand.in
//       };
//       responseInfo.toUrl = json.response_url;
//     } else {
//       // user out
//       console.log("User clicked out");
//       // set up modal, exit
//       updateInfo.addUser = false;
//       let trigger = json.trigger_id;
//       openModal(trigger, updateInfo, sheet);
//       return;
//     }
//   } else if (json.type === "view_submission") {
//     // modal submission; start by getting details
//     console.log("User submitted modal response");
//     // create out response
//     let response: string =
//       json.view.state.values[Constants.REASON_BLOCK_ID][
//         Constants.REASON_ACTION_ID
//       ].value;
//     let parsedUpdateInfo = JSON.parse(
//       json.view.private_metadata
//     ) as Types.AnnouncementUpdateInfo;
//     context = {
//       username: json.user.username,
//       text: `${parsedUpdateInfo.eventInfo.dateForColumnLocator} ${response}`,
//       command: Enums.SlashCommand.out
//     };
//     responseInfo = {
//       toUrl: Constants.SLACK_SEND_EPHEMERAL_URL,
//       userId: json.user.id
//     };
//     updateInfo = parsedUpdateInfo;
//   }
// }

/**
 * Sends a response with the given text as an ephemeral message to that URL
 * (this would be to avoid sending a public response to an event).
 * @param text content of message to send to user
 * @param responseInfo contains URL to send message to (if applicable) and user ID to send to (if applicable).
 */
export function sendResponse(
  text: string,
  responseInfo: Types.ResponseCustomization
): void {
  let payload: Types.SlackMessageSendInfo = {
    text: text,
    response_type: "ephemeral",
    user: responseInfo.userId, // will be specified when necessary
    channel: Constants.ANNOUNCE_CHANNEL_ID,
    replace_original: false
  };
  fetch(responseInfo.toUrl, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      Authorization: Constants.API_TOKEN,
      ...Constants.JSON_CONTENT_HEADERS
    }
  }).then(() => {
    console.log("Posted response message");
  });
}
