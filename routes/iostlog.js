const express = require('express');
const util = require('util');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const iostlog = require(prj.LIB_PATH + '/iostlog');
const audit = require(prj.LIB_PATH + '/audit');
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;

router.get('/', (req, res) => {
  let dbsIdx, companyId, userId = -1;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
    userId = req.session.user.id;
  }

  let MAX_IOSTLOG_QUERY = await(csid.get('C','MAX_IOSTLOG_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_IOSTLOG_QUERY) ? db.escape(req.query.num): MAX_IOSTLOG_QUERY;
  let filter = 'WHERE `companyId` = \'' + companyId + '\'';
  filter += (req.query.sn)   ? ' AND `sn` = UNHEX(\'' + mac2hex(db.escape(req.query.sn)) + '\')' : '' ;
  filter += (req.query.addr) ? ' AND `addr` = \'' + db.escape(req.query.addr) + '\'' : '' ;
  
  let tfilter = '';
  if (req.query.t) {
    tfilter = ' AND `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    tfilter = ' AND `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    tfilter = ' AND `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    tfilter = ' AND `time` <= \'' + db.escape(req.query.et) + '\'';
  }        

  let qStr, result, snFilter = '';
  if(!req.session.user.admin) {
    qStr = 'SELECT `deviceId` FROM `' + db.TB_DEVICE_AUTH + '` WHERE `memberId` = ' + userId + ' AND (`enControl` = 1 OR `enMonitor` = 1) AND `companyId` = ' + companyId + ';';
    result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      return res.send({
        desc: gstate.OK,
        total: 0,
        from: ((from) ? from : 0),
        iostLogs: [],
      });              
    }

    let devIdStr = ''; 
    for(let i = 0; i < result.data.length; i++) {
      devIdStr += (i > 0) ? ',' : '';
      devIdStr += '\'' + result.data[i].deviceId + '\'';
    }
    qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `id` IN (' + devIdStr + ');';
    result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } 

    let snStr = '';
    for(let i = 0; i < result.data.length; i++) {
      snStr += (i > 0) ? ',' : '';
      snStr += 'UNHEX(\'' + result.data[i].sn + '\')';
    }
    snFilter = (snStr) ? ' AND `sn` IN (' + snStr + ')' : '' ;
  }
  qStr  = 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_IOSTAT_LOG + '` ' + filter + snFilter + ';';
  qStr += 'SELECT `time`,`account`,`regName`,`msgCode`,`accNum`,`accTime` FROM `' + db.TB_IOSTAT_LOG + '` ' + filter + snFilter+ tfilter;
  qStr += 'ORDER BY `time` DESC LIMIT ' + num + ' OFFSET ' + from + ';';
  
  result = await(db.pr_query(dbsIdx, qStr));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: result.err});
  }

  let total = result.data[0].total;
  result.data.shift(); // remove total
  if (result.data) {
    return res.send({
      desc: gstate.OK,
      total: total,
      from: ((from) ? from : 0),
      iostLogs: result.data,
    });
  } else { // No record
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
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

  let filter = 'WHERE `companyId` = \'' + companyId + '\'';
  filter += (req.query.sn)   ? ' AND `sn` = UNHEX(\'' + mac2hex(db.escape(req.query.sn)) + '\')' : '' ;
  filter += (req.query.addr) ? ' AND `addr` = \'' + db.escape(req.query.addr) + '\'' : '' ;
  
  let tfilter = '';
  if (req.query.t) {
    tfilter = ' AND `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    tfilter = ' AND `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    tfilter = ' AND `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    tfilter = ' AND `time` <= \'' + db.escape(req.query.et) + '\'';
  }

  let qStr = 'DELETE FROM `' + db.TB_IOSTAT_LOG  + '` ' + filter + tfilter + ';';
  let result = await(db.pr_wquery(dbsIdx, qStr)); 
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: result.err});
  }

  await(audit.log(req.session.user, audit.ADTCODE.CLEAR_IOSTLOG));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
