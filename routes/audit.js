const express = require('express');
const util = require('util');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const gstate = require(prj.GSTATE_PATH);
const audit = require(prj.LIB_PATH + '/audit');
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const device = require(prj.LIB_PATH + '/device');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;

router.get('/', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    if (!req.session.user.admin) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let MAX_AUDIT_QUERY = await(csid.get('C','MAX_AUDIT_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_AUDIT_QUERY) ? db.escape(req.query.num): MAX_AUDIT_QUERY;
  let filter = 'WHERE `companyId` = \'' + companyId + '\'' + ' ';
  if (req.query.t) {
    filter += 'AND `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    filter += 'AND `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    filter += 'AND `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    filter += 'AND `time` <= \'' + db.escape(req.query.et) + '\'';
  }

  let qStr = '';
  qStr += 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_AUDIT_LOG + '` WHERE `companyId` = ' + companyId + '; ';
  qStr += 'SELECT `time`,`account`,`msgCode`,`message` FROM `' + db.TB_AUDIT_LOG + '` ' + filter + ' ' ;
  qStr += 'ORDER BY `time` DESC LIMIT ' + num + ' OFFSET ' + from + ';';

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (!result.data) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  let total = result.data[0].total;
  result.data.shift(); // remove total
  for(let i = 0; i < result.data.length; i++) {
    if(result.data[i].message !== "") {
      let jObj = utils.toJson(result.data[i].message, {__file, __line});
      if(jObj) {
        result.data[i].message = jObj;
      }
    }
  }
  return res.send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    auditLogs: result.data,
  });
});

router.delete('/', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    if (!req.session.user.admin) {
      return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
    }
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let filter = 'WHERE `companyId` = \'' + companyId + '\' ';
  if (req.query.t) {
    filter += 'AND `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    filter += 'AND `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    filter += 'AND `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    filter += 'AND `time` <= \'' + db.escape(req.query.et) + '\'';
  }
  
  let result = await(db.pr_wquery(dbsIdx, 'DELETE FROM `' + db.TB_AUDIT_LOG  + '` ' + filter + ';'));
  await(audit.log(req.session.user, audit.ADTCODE.CLEAR_AUDIT));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});        
  }
});

module.exports = router;
