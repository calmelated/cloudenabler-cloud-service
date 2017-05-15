const express = require('express');
const util = require('util');
const router = express.Router();
const formidable = require('formidable');
const prj = require('../project');
const db = require(prj.DB_PATH);
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const audit = require(prj.LIB_PATH + '/audit');
const gstate = require(prj.GSTATE_PATH);
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const jobQueue = require(prj.LIB_PATH + '/job-queue');
const worker = require(prj.LIB_PATH + '/worker');
const alarm = require(prj.LIB_PATH + '/alarm');
const ALMCODE = alarm.ALMCODE;

const getTitleById = (dbsIdx, companyId, time) => {
  let qStr = 'SELECT SUBSTRING(`message`, 1, 7) AS `message` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `time` = \'' + time + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  let message = result.data[0].message;
  return {data: ((message.length > 6) ? (message.substr(0, 6) + "...") : message)};
};

router.get('/', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let MAX_ANNOUNCE_QUERY = await(csid.get('C','MAX_ANNOUNCE_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_ANNOUNCE_QUERY) ? db.escape(req.query.num): MAX_ANNOUNCE_QUERY;
  let qStr = 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `companyId` = ' + companyId + '; ';
  qStr += 'SELECT `time`, SUBSTRING(`message`, 1, 32) AS `message` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `companyId` = \'' + companyId + '\' ';
  qStr += 'ORDER BY `time` DESC LIMIT ' + num + ' OFFSET ' + from + ';';    

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let total = result.data[0].total;
  result.data.shift();
  return res.send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    announces: result.data,
  });
});

router.get('/:time', (req, res) => {
  let time = db.escape(req.params.time);
  if(!time) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let qStr = 'SELECT `time`,`message` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `companyId` = \'' + companyId + '\' AND `time` = \'' + time + '\' LIMIT 1;' ;
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  return res.send({desc: gstate.OK, announce: result.data[0]});
});

router.get('/unread/:time', (req, res) => {
  let time = db.escape(req.params.time);
  if(!time) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT COUNT(`time`) AS `num` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `companyId` = ' + companyId + ' AND `time` > ' + time + ' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.send({desc: gstate.OK, num: 0});
  }
  return res.send({desc: gstate.OK, num: result.data[0].num});
});

router.put('/:time', (req, res) => {
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
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let time = db.escape(req.params.time);
  let result = await(getTitleById(dbsIdx, companyId, time));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  let title = result.data;
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let message = db.escape(fields.message);
    if(message.length > 256) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
    let qStr = 'UPDATE `' + db.TB_ANNOUNCE_LIST + '` SET `message` = \'' + message + '\' WHERE `time` = \'' + time + '\' AND `companyId` = \'' + companyId + '\';';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (!result.err) {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_ANNOUNCE, {'title': title}));
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
  }));
});

router.post('/', (req, res) => {
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
  if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.staus(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let MAX_ANNOUNCE = await(csid.get('C','MAX_ANNOUNCE','int'));
  let qStr = 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_ANNOUNCE_LIST + '` WHERE `companyId` = ' + companyId + ';' ;
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(parseInt(result.data[0].total) >= MAX_ANNOUNCE) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_ANNOUNCE});
  }

  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let message = db.escape(fields.message);
    if(message.length > 256) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
    let now = parseInt(Date.now() / 1000);
    let toAllSubsidiary = db.escape(fields.toAllSubsidiary); 
    if(toAllSubsidiary === "1") {
      let querys = [];
      for(let i = 0; i < prj.DBS.length; i++) {
        qStr = 'SELECT ' + i + ' AS `dbsIdx`,`id`,`company` FROM `' + db.TB_COMPANY + '` WHERE `parentId` = ' + companyId + ';';
        querys.push(db.pr_query(i, qStr));
      }
      let qStrs = {};
      let companyList = [];
      let results = await(querys);
      for(let i = 0; i < results.length; i++) {
        if(!results[i] || results[i].err || results[i].data.length === 0) {
          continue;
        }
        for(let j = 0; j < results[i].data.length ; j++) {
          let dbsIdx = results[i].data[j].dbsIdx;
          let companyId = results[i].data[j].id;
          if(!qStrs[dbsIdx]) { qStrs[dbsIdx] = ''; }
          qStrs[i] += 'INSERT INTO `' + db.TB_ANNOUNCE_LIST + '` (`time`,`companyId`,`message`) VALUES (' + now + ',\'' + companyId + '\',\'' + message + '\') ON DUPLICATE KEY UPDATE `message` = VALUES(`message`);';
          companyList.push({dbsIdx, companyId});
        }
      }
      results = {};
      for(let dbsIdx in qStrs) {
        if(!dbsIdx) {
          continue;
        }
        results[dbsIdx] = db.pr_wquery(dbsIdx, qStrs[dbsIdx]);                         
      }
      await(results);

      // Do send notification for company
      let jobs = [];
      for(let i = 0; i < companyList.length; i++) {
        jobs[i] = {
          type: worker.TYPE.ALM_COMPANY, 
          argv: {
            dbsIdx: companyList[i].dbsIdx,
            companyId: companyList[i].companyId,
            account: req.session.user.account,
            msgCode: ALMCODE.NEW_ANNOUNCE,
            type: 0,
          }
        }; 
      }
      await(jobQueue.add(jobs));
      await(audit.log(req.session.user, audit.ADTCODE.ANNOUNCE_ALL_CMP, {'title': ((message.length > 6) ? (message.substr(0, 6) + "...") : message)}));
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } 

    let companyName = '';
    let toSubsidiary = db.escape(fields.toSubsidiary); 
    if(toSubsidiary === "1") {
      dbsIdx = -1;
      companyId = parseInt(db.escape(fields.subCompanyId));
      for(let i = 0; i < prj.DBS.length; i++) {
        qStr = 'SELECT `company` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ' LIMIT 1;';
        result = await(db.pr_query(i, qStr));
        if(!result.err && result.data.length > 0) {
          companyName = result.data[0].company;
          dbsIdx = i;
          break;
        }
      }
      if(dbsIdx < 0) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
      }
    } 

    qStr = 'INSERT INTO `' + db.TB_ANNOUNCE_LIST + '` (`time`,`companyId`,`message`) VALUES (' + now + ',\'' + companyId + '\',\'' + message + '\') ON DUPLICATE KEY UPDATE `message` = VALUES(`message`);';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) { 
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    // Do send notification for company
    await(jobQueue.add({
      type: worker.TYPE.ALM_COMPANY, 
      argv: {
        dbsIdx: dbsIdx,
        companyId: companyId,
        account: req.session.user.account,
        msgCode: ALMCODE.NEW_ANNOUNCE,
        type: 0,
      }
    }));

    let title = (message.length > 6) ? (message.substr(0, 6) + "...") : message;
    let adtCode = (toSubsidiary === "1") ? audit.ADTCODE.ANNOUNCE_SUB_CMP : audit.ADTCODE.NEW_ANNOUNCE;
    await(audit.log(req.session.user, adtCode, ((toSubsidiary === "1") ? {title, companyName} : {title})));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.delete('/:time', (req, res) => {
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

  let time = db.escape(req.params.time);
  let result = await(getTitleById(dbsIdx, companyId, time));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  let title = result.data;
  let qStr = 'DELETE FROM `' + db.TB_ANNOUNCE_LIST  + '` WHERE `time` = \'' + db.escape(req.params.time) + '\' AND `companyId` = \'' + companyId + '\' ;' ;
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  await(audit.log(req.session.user, audit.ADTCODE.DELETE_ANNOUNCE, {'title': title}));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
