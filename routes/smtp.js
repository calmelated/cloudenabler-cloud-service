const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const nodemailer = require('nodemailer');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const csid = require(prj.LIB_PATH + '/csid');
const PRODUCT_NAME = csid.mget('C', 'PRODUCT_NAME');

router.get('/', (req, res) => {
  if (!req.session.trustable && !req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  // configs from db
  let [_host, _port, _user, _pswd, _receiver] = await([
    csid.get('C','SMTP_HOST'),
    csid.get('C','SMTP_PORT','int'),
    csid.get('C','SMTP_USER'),
    csid.get('C','SMTP_PSWD'),
    csid.get('C','BAKLOG_EMAIL_RECEIVER'),
  ]);

  // configs from query
  let host = (req.query.host) ? db.escape(req.query.host) : _host;
  let port = (req.query.port) ? parseInt(db.escape(req.query.port)) : _port; 
  let serv = (req.query.serv) ? db.escape(req.query.serv) : '' ;
  let user = (req.query.user) ? db.escape(req.query.user) : _user; 
  let pswd = (req.query.pswd) ? db.escape(req.query.pswd) : _pswd; 

  if(!req.query.to) {
    req.query.to = _receiver; 
    if(!req.query.to) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: 'No mail receivers!!'});
    }
  }

  let attachments = [];
  let attachs = req.query.attach;
  if(attachs) {
    if(Array.isArray(attachs)) {
      for(let i = 0; i < attachs.length; i++) {
        if (!fs.existsSync(attachs[i])) {
          return res.status(gstate.RC_BAD_REQUEST).send({
            desc: gstate.NO_FILE,
            attach: attachs[i],
          });
        } else {
          attachments.push({path: attachs[i]});
        }
      }
    } else if(typeof attachs === 'string') {
      if (!fs.existsSync(attachs)) {
        return res.status(gstate.RC_BAD_REQUEST).send({
          desc: gstate.NO_FILE,
          attach: attachs,
        });
      } else {
        attachments.push({path: attachs});
      }
    }
  }

  let transporter = {
    host: host,
    port: port,
    service: (serv) ? serv : null,
    secureConnection: false,
    connectionTimeout: prj.SMTP_CONN_TIMEOUT,
    //debug: true,
    //logger: true,
  };
  if(user && pswd) {
    transporter.auth = {
      user: user,
      pass: pswd,
    };
  }
  transporter = nodemailer.createTransport(transporter);

  let noreply = '<br/><br/>____________________________________________________________<br/>Please do not reply this email. Any message sent to this address will not be read.';
  let from = PRODUCT_NAME + ' Message <' + ((user) ? user.split('@')[0] : 'noreply') + '@' + host + '>' ;
  let mailOptions = {
    from: from, // sender address
    to: db.escape(req.query.to), // list of receivers
    subject: db.escape(req.query.subject), // Subject line
    html: db.escape(req.query.content) + noreply, // html body
    attachments: attachments,
  };
  //ddbg(mailOptions);

  // send mail with defined transport object
  transporter.sendMail(mailOptions, (error, info) => {
    if(error){
      dbg(error);
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? error : gstate.DB_ERROR)});
    } else {
      return res.status(gstate.RC_OK).send({
        desc: gstate.OK,
        extraMsg: info.response,
      });
    }
  });
});

module.exports = router;
