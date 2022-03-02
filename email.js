"use strict";
const nodemailer = require('nodemailer');

const TOOL_NAME = "horizontal-issue-tracker";


let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
});

let MAILING_LIST, SENDER_EMAIL;

if (process.env.NODE_ENV == 'production') {
  MAILING_LIST = ["plh@w3.org", "w3t-archive@w3.org"];
  SENDER_EMAIL = "sysbot+notifier@w3.org";
} else {
  MAILING_LIST = "plh@w3.org";
  SENDER_EMAIL = "plh@w3.org";
}

function email(logs) {
  const reducer = (accumulator, currentValue) => accumulator + "\n" + currentValue;
  let mailOptions = {
    from: `${TOOLNAME} <${SENDER_EMAIL}>`,
    to: MAILING_LIST,
    subject: `[tool] ${TOOLNAME}: logs`,
    text: logs.reduce(reducer) + "\n\nProduced by https://github.com/w3c/horizontal-issue-tracker"
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      return sendError(error); // notify plh
    }
    console.log('Message sent: %s', info.messageId);
  });

}

function sendError(error) {
  // if things go wrong, please call the maintainer
  let mailOptions = {
    from: `${TOOLNAME} <${SENDER_EMAIL}>`,
    to: "plh@w3.org",
    subject: `[tool] ${TOOLNAME}: ${error} (error)`,
    text: "You might want to look at this JSON object:\n" + JSON.stringify(error, null, " ")
  };

  return transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        return console.error(JSON.stringify(error));
    }
    console.log('Error message sent: %s', info.messageId);
  });

}

module.exports = email;
