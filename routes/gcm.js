const express = require('express');
const util = require('util');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const alarm = require(prj.LIB_PATH + '/alarm');
const ALMCODE = alarm.ALMCODE;
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');

router.get('/:gcmId', (req, res) => {
  let gcmId = db.escape(req.params.gcmId);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = (req.query.companyId) ? db.escape(req.query.companyId) : req.session.user.companyId;
  let filter = '';
  if(parseInt(companyId) > 0) {
    filter = ' AND `companyId` = \'' + companyId + '\'';
  }

  let qStr = 'SELECT `id`,`companyId`,`account`, `name` FROM `' + db.TB_USER + '` WHERE `gcmId` = \'' + gcmId + '\'' + filter + ' ;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.status === gstate.OK && result.data.length > 0) {
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      user: result.data[0]
    });
  } else {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
});

router.post('/add', (req, res) => {
  let gcmId = db.escape(req.body.gcmId);
  let account = (req.body.account) ? db.escape(req.body.account) : req.session.user.account;
  let companyId = req.session.user.companyId;
  let dbsIdx = req.session.user.dbsIdx;

  let qStr = 'UPDATE `' + db.TB_USER + '` SET `gcmId` =  \'' + gcmId + '\' WHERE `companyId` = \'' + companyId + '\' AND `account` = \'' + account + '\';';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: result.err});
  }
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

router.post('/send', (req, res) => {
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let subject = (req.body.message) ? db.escape(req.body.message) : 'Cloud Alarm';
  let message = db.escape(req.body.message);
  let account = req.body.account;
  let filter = ' WHERE `companyId` = \'' + companyId + '\' AND `gcmId` != \'\' ';
  filter += (account) ? 'AND `account` = \'' + account + '\'' : '' ;

  let qStr = 'SELECT `account`,`pushType`,`gcmId`,`lang` FROM `'  + db.TB_USER + '` ' + filter + ' ;' ;
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  let pushObjs = [];
  for (let i = 0; i < result.data.length; i++) {
    pushObjs.push({
      account: result.data[i].account,
      type: result.data[i].pushType,
      id: result.data[i].gcmId,
      lang: result.data[i].lang,
    });
  }
  alarm.lcPush({
    dbsIdx: dbsIdx,
    subject: 'Cloud Alarm',
    time: parseInt(Date.now() / 1000),
    companyId: companyId,
    account: req.session.user.account,
    pushObjs: pushObjs,
    type: 0,
    msgCode: ALMCODE.USER_DEFINED,
    message: message,
    extra: null
  }, (err, result) => {
    if(err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? err : gstate.DB_ERROR)});
    } else {
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    }
  });
});

router.post('/remove', (req, res) => {
  let querys = [];
  let gcmId = db.escape(req.body.gcmId);
  let companyId = (req.body.companyId) ? db.escape(req.body.companyId) : req.session.user.companyId;
  let account = (req.body.account) ? db.escape(req.body.account) : req.session.user.account;
  let qStr = 'SELECT `id` FROM `' + db.TB_USER + '` WHERE `companyId` = \'' + companyId + '\' AND `account` = \'' + account + '\' LIMIT 1;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr); // delete it => anywhere
  }
  let results = await(querys); 
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(result.err || result.data.length === 0) {
      continue;
    }
    qStr = 'UPDATE `' + db.TB_USER + '` SET `gcmId` =  \'\' WHERE `companyId` = \'' + companyId + '\' AND `account` = \'' + account + '\' AND `gcmId` = \'' + gcmId + '\';';
    result = await(db.pr_wquery(i, qStr)); // delete it => anywhere
    if(result.err) { dbg(result.err); }
    break;
  }

  // return ok no matter what happened
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
