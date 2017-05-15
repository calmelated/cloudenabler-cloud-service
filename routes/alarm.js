const express = require('express');
const util = require('util');
const fs = require('fs');
const router = express.Router();
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const shell = require('shelljs');
const audit = require(prj.LIB_PATH + '/audit');
const alarm = require(prj.LIB_PATH + '/alarm');
const ALMCODE = alarm.ALMCODE;
const csid = require(prj.LIB_PATH + '/csid');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const device = require(prj.LIB_PATH + '/device');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;

router.get('/', (req, res) => {
  let companyId, dbsIdx, userId = -1; 
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
    userId = req.session.user.id;
  }

  let MAX_ALARM_QUERY = await(csid.get('C','MAX_ALARM_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_ALARM_QUERY) ? db.escape(req.query.num): MAX_ALARM_QUERY;
  let filter = 'WHERE `companyId` = \'' + companyId + '\'';
  filter += (req.query.sn)   ? ' AND `sn` = UNHEX(\'' + mac2hex(db.escape(req.query.sn)) + '\')' : '' ;
  filter += (req.query.addr) ? ' AND `addr` = \'' + db.escape(req.query.addr) + '\'' : '' ;

  // keyword search (superAdmin only)
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.key) {
    let keyword = db.escape(req.query.key);
    // filter += (req.query.key)  ? ' AND (`account` LIKE \'%' + keyword + '%\' OR `extra` LIKE \'%' + keyword + '%\')' : '' ;
    filter += (req.query.key)  ? ' AND (`account` LIKE \'%' + keyword + '%\')' : '' ;
    num = (num === MAX_ALARM_QUERY) ? 10000 : num;
  }
  
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
    qStr = 'SELECT `deviceId` FROM `' + db.TB_DEVICE_AUTH + '` WHERE `memberId` = ' + userId + ' AND `enAlarm` = 1 AND `companyId` = ' + companyId + ';';
    result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      return res.send({
        desc: gstate.OK,
        total: 0,
        from: ((from) ? from : 0),
        almlogs: [],
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

  qStr  = 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_ALARM_LOG + '` ' + filter + snFilter + ';';
  qStr += 'SELECT `id`,`time`,`account`,`status`,`msgCode`,`priority`,`done`,`message`,`extra` FROM `' + db.TB_ALARM_LOG + '` ' + filter + snFilter + tfilter + ' ';
  qStr += 'ORDER BY `time` DESC LIMIT ' + num + ' OFFSET ' + from + ';';
  result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let total = result.data[0].total;
  result.data.shift(); // remove total
  for(let i = 0; i < result.data.length; i++) {
    if(result.data[i].extra) {
      let extraVal = utils.toJson(result.data[i].extra, {__file, __line});
      if(extraVal) {
        result.data[i].extra = extraVal;
      }
    } else {
      delete result.data[i].extra;
    }
  }
  if (result.data) {
    return res.send({
      desc: gstate.OK,
      total: total,
      from: ((from) ? from : 0),
      almlogs: result.data,
    });
  } else { // No record
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
});

router.get('/unread/:time', (req, res) => {
  let time = db.escape(req.params.time);
  if(!time) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let userId = req.session.user.id;
  let filter = 'WHERE `companyId` = \'' + companyId + '\'';
  filter += (req.query.sn)   ? ' AND `sn` = UNHEX(\'' + mac2hex(db.escape(req.query.sn)) + '\')' : '' ;
  filter += (req.query.addr) ? ' AND `addr` = \'' + db.escape(req.query.addr) + '\'' : '' ;

  let qStr, result, snFilter = '';
  if(!req.session.user.admin) {
    qStr = 'SELECT `deviceId` FROM `' + db.TB_DEVICE_AUTH + '` WHERE `memberId` = ' + userId + ' AND `enAlarm` = 1 AND `companyId` = ' + companyId + ';';
    result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(result.data.length === 0) {
      return res.send({desc: gstate.OK, num: 0});             
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

  qStr = 'SELECT COUNT(`time`) AS `num` FROM `' + db.TB_ALARM_LOG + '` ' + filter + snFilter + ' AND `time` > ' + time + ' LIMIT 1;';
  result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.send({desc: gstate.OK, num: 0});                
  } 
  return res.send({
    desc: gstate.OK,
    num: result.data[0].num,
  });        
});

const fstreamPromise = (fstream, data) => {
  return new Promise((resolve, reject) => {
    fstream.write(data, () => {
      return resolve();
    });
  });
};

router.get('/export', (req, res) => {
  if (!req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let MAX_ALARM_QUERY = 100000;
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_ALARM_QUERY) ? db.escape(req.query.num): MAX_ALARM_QUERY;
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

  let fname = 'alarm.csv';
  let fstream = null;
  let rndStr = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
  let dirName = '/tmp/alarm/' + rndStr;
  shell.mkdir('-p', dirName);

  let qStr = 'SELECT `id`,`time`,`account`,`msgCode`,`priority`,`extra` FROM `' + db.TB_ALARM_LOG + '` ' + filter + tfilter + ' LIMIT ' + num + ' OFFSET ' + from + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  try {
    fstream = fs.createWriteStream(dirName + '/' + fname, {flags: 'w'});
    await(fstreamPromise(fstream, '"id","time","priority","from","msgCode","extra"' + '\n'));
    for(let i = 0; i < result.data.length; i++) {
      let wrData = '';
      wrData +=  '"' + result.data[i].id + '"';
      wrData += ',"' + result.data[i].time + '"';
      wrData += ',"' + result.data[i].priority + '"';
      wrData += ',"' + result.data[i].account + '"';
      wrData += ',"' + result.data[i].msgCode + '"';
      wrData += ',"' + (utils.has(result.data[i].extra) ? result.data[i].extra : '') + '"';
      wrData += '\n';
      await(fstreamPromise(fstream, wrData));
    }

    // zip the file
    shell.exec('cd ' + dirName + '; [ -n "$(ls -A ' + dirName + ')" ] && /bin/tar czf ../' + rndStr + '.tar.gz * ');
    let zipData = fs.readFileSync('/tmp/alarm/' + rndStr + '.tar.gz');
    if(!zipData) {
      throw gstate.NO_RECORD;
    }

    //Send file to client
    res.setHeader('Content-Length', zipData.length);
    res.setHeader('Content-Disposition', 'attachment; filename=\'alarm.tar.gz' + '\'');
    res.write(zipData, 'binary');
    res.end();
  } catch(e) {
    info(e);
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_FILE});
  } finally{
    shell.exec('/bin/rm -rf ' + dirName + ';/bin/rm ' + dirName + '.tar.gz');
    if(fstream) {
      fstream.end();
    }
  }
});

router.put('/done', (req, res) => {
  let id = db.escape(req.query.id);
  let time = db.escape(req.query.time);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let filter = '';
  if(id) {
    filter = 'WHERE `id` = ' + id ;
  } else if(time) {
    filter = 'WHERE `companyId` = ' + companyId + ' AND `time` <= ' + time ;
  } else {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});        
  }

  let qStr = 'UPDATE `' + db.TB_ALARM_LOG + '` SET `done` = 1 ' + filter  + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});        
  }
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
  if(!req.body.sn || !(req.body.sn && req.body.sn.match(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i))) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ERR_DATA});
  }

  let account = req.session.user.account;
  let sn = mac2hex(db.escape(req.body.sn));
  let message = db.escape(req.body.message);
  let result = await(alarm.send({
    dbsIdx: dbsIdx,
    companyId: companyId,
    account: account,
    type: 0,
    sn: sn,
    subject: 'Cloud Alarm',
    msgCode: ALMCODE.USER_DEFINED,
    message: message,
    limitId: null,
    extra: null,
  }));

  if(result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
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

  let qStr = 'DELETE FROM `' + db.TB_ALARM_LOG  + '` ' + filter + tfilter + ';';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }        

  await(audit.log(req.session.user, audit.ADTCODE.CLEAR_ALARM));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
