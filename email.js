"use strict";
const nodemailer = require('nodemailer');


let transporter = nodemailer.createTransport({
    sendmail: true,
    newline: 'unix',
    path: '/usr/sbin/sendmail',
});

let MAILING_LIST, SENDER_EMAIL;

if (process.env.NODE_ENV == 'production') {
  MAILING_LIST = "plh@w3.org";
  SENDER_EMAIL = "plh@w3.org";
} else {
  MAILING_LIST = "plh@w3.org";
  SENDER_EMAIL = "plh@w3.org";
}

function email(logs) {
  const reducer = (accumulator, currentValue) => accumulator + "\n" + currentValue;
  let mailOptions = {
    from: "Horizontal issue tracker <" + SENDER_EMAIL + ">",
    to: MAILING_LIST,
    subject: "Horizontal issue tracker output",
    text: logs.reduce(reducer) + "\n\nProduced by https://github.com/w3c/horizontal-issue-tracker"
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      sendError(error); // notify plh
      return console.error(error);
    }
    console.log('Message sent: %s', info.messageId);
  });

}

function sendError(error) {
  // if things go wrong, please call the maintainer
  let mailOptions = {
    from: "Notifier <" + SENDER_EMAIL + ">",
    to: "plh@w3.org",
    subject: "We've got an error on the horizontal tracker issue email",
    text: "You might want to look at " + JSON.stringify(error)
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        return console.error(JSON.stringify(error));
    }
    console.log('Error message sent: %s', info.messageId);
  });

}

module.exports = email;
