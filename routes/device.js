const express = require('express');
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const shell = require('shelljs');
const prj = require('../project');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const router = express.Router();
const iosw = require(prj.LIB_PATH + '/iosw');
const audit = require(prj.LIB_PATH + '/audit');
const csid = require(prj.LIB_PATH + '/csid');
const mcache = require(prj.LIB_PATH + '/mcache');
const utils = require(prj.LIB_PATH + '/utils');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const padZero = require(prj.LIB_PATH + '/utils').padZero;
const getSlvId = require(prj.LIB_PATH + '/utils').getSlvId;
const getRealAddr = require(prj.LIB_PATH + '/utils').getRealAddr;
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const model = require(prj.ROOT_PATH + '/public/js/model');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const toJson = utils.toJson;
const toJsonStr = utils.toJsonStr;
const PRODUCT_NAME = csid.mget('C', 'PRODUCT_NAME');

const devReset = (dbsIdx, companyId, sn) => {
  let result = await(device.reset(dbsIdx, companyId, sn));
  if(result.err) {
    return result;
  }
  await(device.addRcmds(dbsIdx, sn, ['DL=1']));
  await(ctrlblk.reset(dbsIdx, companyId, sn));
};

router.get('/', (req, res) => {
  let nowMsec = Date.now();
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let userId = req.session.user.id;
  let MAX_DEVICE_QUERY = await(csid.get('C','MAX_DEVICE_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0 ;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_DEVICE_QUERY) ? db.escape(req.query.num) : MAX_DEVICE_QUERY ;

  let snFilter = '';
  if(typeof req.query.sn === 'object') {
    snFilter += ' AND (';
    req.query.sn.forEach((sn, idx) => {
      snFilter += (idx !== 0) ? ' OR ' : '' ;
      snFilter += '`' + db.TB_DEVICE  + '`.`sn` = UNHEX(\'' + mac2hex(sn) + '\')';
    });
    snFilter += ')';
  } else if(typeof req.query.sn === 'string') {
    snFilter += ' AND `' + db.TB_DEVICE  + '`.`sn` = UNHEX(\'' + mac2hex(req.query.sn) + '\') ';
  }

  // filter by device types
  let mo = (req.query.mo) ? db.escape(req.query.mo) : '' ;
  if(mo && mo !== 'CE' && mo !== 'CloudEnabler') {
    snFilter += ' AND `' + db.TB_DEVICE  + '`.`mo` = \'' + mo + '\' ';
  }

  let qStr;
  if(req.session.user.admin) {
    qStr  = 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ';' ;
    qStr += 'SELECT `name`, LOWER(HEX(`' + db.TB_DEVICE + '`.`sn`)) AS `sn`,`' + db.TB_DEVICE + '`.`mo`,`enAlarm`,`enControl`,`enMonitor`,`enLog`,`enServLog`,`mstConf`' +
        ' FROM `' + db.TB_DEVICE + '` WHERE `companyId` = '  + companyId ;
    qStr += (snFilter) ? snFilter : '';
    qStr += ' ORDER BY `' + db.TB_DEVICE  + '`.`id` LIMIT ' + num + ' OFFSET ' + from  + ' ; ';
  } else {
    qStr  = 'SELECT COUNT(`' + db.TB_DEVICE + '`.`id`) AS `total` ' +
         ' FROM `' + db.TB_DEVICE_AUTH    + '` '     +
         ' LEFT JOIN `' + db.TB_DEVICE    + '` ON `' + db.TB_DEVICE + '`.`id` = `'  + db.TB_DEVICE_AUTH + '`.`deviceId` ' +
         '   AND `' + db.TB_DEVICE        + '`.`companyId` = `' + db.TB_DEVICE_AUTH + '`.`companyId`'   +
         ' WHERE `' + db.TB_DEVICE        + '`.`companyId` = '  + companyId +
         '   AND ((`' + db.TB_DEVICE      + '`.`enMonitor` = 1' + ' AND `' + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1) ' +
         '    OR  (`' + db.TB_DEVICE      + '`.`enControl` = 1' + ' AND `' + db.TB_DEVICE_AUTH + '`.`enControl` = 1))' +
         '   AND `' + db.TB_DEVICE_AUTH   + '`.`memberId`  = '  + userId + ';' ;

    qStr += 'SELECT ' +
        '`' + db.TB_DEVICE + '`.`name`,'        +
        'LOWER(HEX(`' + db.TB_DEVICE + '`.`sn`)) AS `sn`,'   +
        '`' + db.TB_DEVICE + '`.`mo`,'          +
        '`' + db.TB_DEVICE + '`.`mstConf`,'     +
        '`' + db.TB_DEVICE + '`.`enAlarm`,'     +
        '`' + db.TB_DEVICE + '`.`enControl`,'   +
        '`' + db.TB_DEVICE + '`.`enMonitor`,'   +
        '`' + db.TB_DEVICE + '`.`enLog`, '   +
        '`' + db.TB_DEVICE + '`.`enServLog` '   +
        ' FROM `' + db.TB_DEVICE_AUTH + '` ' +
        ' LEFT JOIN `' + db.TB_DEVICE + '` ON `' + db.TB_DEVICE + '`.`id` = `' + db.TB_DEVICE_AUTH + '`.`deviceId` ' +
        '   AND `' + db.TB_DEVICE        + '`.`companyId` = `' + db.TB_DEVICE_AUTH  + '`.`companyId`' +
        ' WHERE `' + db.TB_DEVICE        + '`.`companyId` = '  + companyId +
        '   AND ((`' + db.TB_DEVICE      + '`.`enMonitor` = 1' + ' AND `' + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1) ' +
        '    OR  (`' + db.TB_DEVICE      + '`.`enControl` = 1' + ' AND `' + db.TB_DEVICE_AUTH + '`.`enControl` = 1))' +
        '   AND `' + db.TB_DEVICE_AUTH   + '`.`memberId`  = '  + userId ;

    qStr += (snFilter) ? snFilter : '' ;
    qStr +=' ORDER BY `' + db.TB_DEVICE  + '`.`id` LIMIT ' + num + ' OFFSET ' + from + ' ; ';
  }

  // Get device list from DB
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let total = result.data[0].total;
  result.data.shift();

  let confs = {};
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn;
    confs[sn] = device.get(dbsIdx, sn);
  }
  let devConfs = await(confs);
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn;
    result.data[i].sn = hex2mac(sn);

    let devConf = devConfs[sn];
    if(!devConf) {
      info('Device ' + sn + ' dont have cache data.  Try to fix it!');
      result.data[i].status = 0;
      await(devReset(dbsIdx, companyId, sn));
    } else {
      result.data[i].status = (device.isOffline(devConf) ? 0 : 1);
      if(devConf.sn2) { 
        result.data[i].sn2 = hex2mac(devConf.sn2);
      }
    }
    // Slave mode
    if(!model.isMbusMaster(result.data[i].mo)) {
      delete result.data[i].mstConf;
      continue;
    }
    // Master mode
    result.data[i].mstConf = toJson(result.data[i].mstConf, {__file, __line, sn: result.data[i].sn});
    if(devConf.slvStat && result.data[i].mstConf) {
      let ids = Object.keys(devConf.slvStat);
      for(let j = 0; j < ids.length; j++) {
        let id = ids[j];                    
        if(!result.data[i].mstConf[id]) {
          continue;
        }
        result.data[i].mstConf[id].status = devConf.slvStat[id];
      }
    } 
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    devices: result.data,
  });
});

router.get('/auth/:sn', (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = req.session.user.dbsIdx;
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({
      desc: gstate.NO_DEV,
      rd: '/device/auth',
    });
  }
  let MAX_USER_QUERY = await(csid.get('C','MAX_USER_QUERY','int'));
  let companyId = req.session.user.companyId;
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0 ;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_USER_QUERY) ? db.escape(req.query.num): MAX_USER_QUERY;
  let qStr = 'SET @deviceId = (SELECT `id` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\')) ; ' +
         'SELECT `enAlarm`,`enControl`,`enMonitor` FROM `' + db.TB_DEVICE + '` WHERE `id` = @deviceId AND `companyId` = \'' + companyId + '\'; ' +
         'SELECT `' + db.TB_USER  + '`.`id` AS memberId,'  +
         ' `' + db.TB_USER        + '`.`account`,' +
         ' `' + db.TB_USER        + '`.`name`,' +
         ' `' + db.TB_USER        + '`.`admin`,' +
         ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enAlarm`,0) enAlarm,' +
         ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enControl`,0) enControl,' +
         ' COALESCE(`' + db.TB_DEVICE_AUTH + '`.`enMonitor`,0) enMonitor' +
         ' FROM `' + db.TB_USER + '` ' +
         ' LEFT JOIN `' +  db.TB_DEVICE_AUTH + '`' +
         '  ON  `' + db.TB_DEVICE_AUTH + '`.`memberId` = `' + db.TB_USER + '`.`id`' +
         '  AND `' + db.TB_DEVICE_AUTH + '`.`companyId` = `' + db.TB_USER + '`.`companyId`' +
         '  AND `' + db.TB_DEVICE_AUTH + '`.`deviceId` = @deviceId ' +
         ' WHERE `' + db.TB_USER + '`.`companyId` = \'' + companyId + '\'' +
         ' ORDER BY `' + db.TB_USER + '`.`id` LIMIT ' + num + ' OFFSET ' + from  + ';';

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  // Ignore the first result
  result.data.shift(); // remove set @deviceId
  if (!result.data || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({
      desc: gstate.NO_RECORD,
      rd: '/device/auth',
    });
  } else if(!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({
      desc: gstate.NO_PERMISSION,
      rd: '/device/auth',
    });
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    members: result.data,
  });
});

const usedReg = (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(!ctrlData) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    regs: Object.keys(ctrlData),
  });
};
router.get('/ce/used/reg/:sn', usedReg);
router.get('/reg/used/:sn', usedReg);

router.get('/:sn', (req, res) => {
  let nowMsec = Date.now();
  let sn = mac2hex(db.escape(req.params.sn));
  let userId = req.session.user.id;
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let mbusId = '';
  let slvIdx = 0;
  let qCols = '';
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else if(model.isCloudEnabler(devConf.mo)) {
    qCols += ',`' + db.TB_DEVICE + '`.`enLog`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`enServLog`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`fixPoint` AS `logFreq`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`storCapacity`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`mbusTimeout`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`password` AS `ftpPswd`' ; // ftp server password
    qCols += ',`' + db.TB_DEVICE + '`.`enFtpCli`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`ftpCliHost`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`ftpCliPort`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`ftpCliAccount`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`ftpCliPswd`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`modbus`' ;
    qCols += ',`' + db.TB_DEVICE + '`.`extra`' ;
    mbusId = db.escape(req.query.mbusId);
    slvIdx = parseInt(db.escape(req.query.slvIdx));
  }

  let qStr = 'SELECT `id`,`createTime`,`companyId`, LOWER(HEX(`' + db.TB_DEVICE + '`.`sn`)) AS `sn`,`' + db.TB_DEVICE + '`.`mo`,`name`,`enAlarm`,`enControl`,`enMonitor`,`pollTime`' + qCols  +
         '  FROM `' + db.TB_DEVICE + '` WHERE `' + db.TB_DEVICE + '`.`sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId ;

  if(!req.session.user.admin) {
    let enMonitor = 'SET @enMonitor = (SELECT `enMonitor` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enMonitor` = 1)); ';

    let enControl = 'SET @enControl = (SELECT `enControl` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enControl` = 1)); ';

    qStr = enMonitor + enControl + qStr + ' AND (@enMonitor = 1 OR @enControl = 1) ';
  }

  // Get Device Profile from DB
  let result = await(db.pr_query(dbsIdx, qStr + ';'));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  if(!req.session.user.admin) {
    result.data.shift(); // remove set @enMonitor
    result.data.shift(); // remove set @enControl
  }
  if (!result.data || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  let rst = result.data[0];
  rst.sn = hex2mac(rst.sn);
  rst.fwVer = devConf.fwVer;
  rst.fwVerNew = await(csid.get('C','KT_6351X_VER','int'));
  rst.modbus = (rst.modbus) ? toJson(rst.modbus, {__file, __line, sn: rst.sn}) : rst.modbus ;
  rst.extra = (rst.extra) ? toJson(rst.extra, {__file, __line, sn: rst.sn}) : {} ;
  if(mbusId && rst.modbus) { // Get particular register
    let found = false;
    for(let i = 0; i < rst.modbus.length; i++) {
      if(rst.modbus[i].id !== mbusId) {
        continue;
      }
      return res.send({
        desc: gstate.OK,
        enLog: rst.enLog,
        enServLog: rst.enServLog,
        logFreq: rst.logFreq,
        modbus: rst.modbus[i],
      });
    }
    if(!found) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
    }
  } else if(slvIdx && rst.modbus) { // List all register of the slave device
    let slvRst = [];
    for(let i = 0; i < rst.modbus.length; i++) {
      if(slvIdx === getSlvId(rst.modbus[i].haddr)) {
        slvRst.push(rst.modbus[i]);
      }
    }
    if(slvRst.length > 0) {
      return res.send({
        desc: gstate.OK,
        enLog: rst.enLog,
        enServLog: rst.enServLog,
        logFreq: rst.logFreq,
        modbus: slvRst
      });
    } else {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
    }
  } else {
    return res.send({
      desc: gstate.OK,
      device: rst,
    });
  }
});

router.get('/:sn/status', (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = req.session.user.dbsIdx;
  let devConf = await(device.get(dbsIdx, sn));
  let userId = req.session.user.id;
  let companyId = req.session.user.companyId;
  let nowMsec = Date.now();
  let qStr = '';
  let ios = '';
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else {
    qStr += 'SELECT LOWER(HEX(`sn`)) AS `sn`,`mo`,`modbus` FROM `' + db.TB_DEVICE + '` ';
    qStr += 'WHERE `sn` = UNHEX(\'' + sn + '\')';
  }

  if(!req.session.user.admin) {
    let enControl = 'SET @enControl = (SELECT `enControl` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enControl` = 1)); SELECT @enControl AS `enControl`;';

    let enMonitor = 'SET @enMonitor = (SELECT `enMonitor` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enMonitor` = 1)); ';

    qStr = enControl + enMonitor + qStr + ' AND (@enMonitor = 1 OR @enControl = 1) ';
  }

  // Get device status from DB
  let result = await(db.pr_query(dbsIdx, qStr + ';'));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let userControl = 1;
  if(!req.session.user.admin) {
    result.data.shift(); // remove set @enControl ...
    userControl = result.data[0].enControl;
    result.data.shift(); // remove select @enControl AS ...
    result.data.shift(); // remove set @enMonitor ...
  }
  if(!result.data || result.data.length === 0) { // No such device
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV + ' or ' + gstate.NO_RECORD});
  }

  // Set PollingTime for device
  device.startFastPT(devConf);

  let mbQuerys = {};
  let ioswQuerys = {};
  let slvIdx = parseInt(db.escape(req.query.slvIdx));
  let mpf = (result.data[0].modbus === '') ? [] : toJson(result.data[0].modbus, {__file, __line, sn});
  for(let i = 0 ; i < mpf.length ; i++) {
    // Particular register
    if(req.query.addr && mpf[i].haddr !== req.query.addr) {
      delete mpf[i];
      continue;
    }
    // Choose registers of Slave device
    if(model.isMbusMaster(devConf.mo) && slvIdx && mpf[i].haddr) {
      if(slvIdx !== getSlvId(mpf[i].haddr)) {
        delete mpf[i];
        continue;
      }
    }
    // Limited Access
    if(mpf[i].limitId && mpf[i].limitId.indexOf(userId) >= 0) {
      delete mpf[i];
      continue; // Found in limit list, No register permission
    }
    delete mpf[i].limitId;

    // copy data
    let laddrs;
    if(iotype.is64bit(mpf[i].type)) {
      laddrs = ['haddr','iaddr','jaddr','laddr'];
    } else if(iotype.is48bit(mpf[i].type)) {
      laddrs = ['haddr','iaddr','laddr'];
    } else { 
      laddrs = ['haddr','laddr'];
    }
    for(let addr of laddrs) {
      if(mpf[i][addr]) {
        mbQuerys[mpf[i][addr]] = mbval.get(dbsIdx, sn, mpf[i][addr]);
      }
    }

    // Copy properties
    if(iotype.isIOSW(mpf[i].type) && mpf[i].swSN && mpf[i].swAddr) {
      let swSN = mac2hex(mpf[i].swSN);
      ioswQuerys[swSN] = ctrlblk.get(dbsIdx, swSN);
    }
  }
  let mbVals = await(mbQuerys);
  let ioswCtrlblk = await(ioswQuerys);

  mpf = mpf.filter(Boolean);
  for(let i = 0; i < mpf.length; i++) {
    let addrPairs; 
    if(iotype.is64bit(mpf[i].type)) {
      addrPairs = [['haddr','hval'], ['iaddr','ival'], ['jaddr','jval'], ['laddr','lval']];
    } else if(iotype.is48bit(mpf[i].type)) {
      addrPairs = [['haddr','hval'], ['iaddr','ival'], ['laddr','lval']];
    } else {
      addrPairs = [['haddr','hval'], ['laddr','lval']];
    }
    for(let [addr, val] of addrPairs) {
      mpf[i][val] = utils.isNone(mbVals[mpf[i][addr]]) ? '' : mbVals[mpf[i][addr]];
    }
    // Copy properties
    if(iotype.isIOSW(mpf[i].type) && mpf[i].swSN && mpf[i].swAddr) {
      let swSN = mac2hex(mpf[i].swSN);
      let swHaddr = (mpf[i].swAddr).split('-')[0];
      let swCtrlblk = ioswCtrlblk[swSN];
      if(!swCtrlblk || !swCtrlblk[swHaddr] || (mpf[i].swId && mpf[i].swId !== swCtrlblk[swHaddr].id)) { // Reponsed profile changed
        mpf[i].swType = iotype.TYPE_ERROR;
        continue;
      } else {
        mpf[i].swType = swCtrlblk[swHaddr].type;
      }
      for(let key of ['fpt','on','off','btnTime','unit','dt','up','low']) {
        if(utils.has(swCtrlblk[swHaddr][key])) {
          mpf[i][key] = swCtrlblk[swHaddr][key];
        }                
      }
    }
  }
  return res.send({
    desc: gstate.OK,
    iostats: mpf,
    lastUpdate: devConf.lastUpdate,
    status: device.isOffline(devConf) ? 0 : 1,
    userControl: userControl,
    enLog: devConf.enLog,
    enServLog: devConf.enServLog,
    showAll: req.query.showAll,
  });
});

router.get('/:sn/evtlog', (req, res) => {
  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let sn = mac2hex(db.escape(req.params.sn));
  let userId = req.session.user.id;
  let MAX_EVTLOG_QUERY = await(csid.get('C','MAX_EVTLOG_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0 ;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_EVTLOG_QUERY) ? db.escape(req.query.num): MAX_EVTLOG_QUERY;
  let filter = '';
  if (req.query.t) {
    filter += ' WHERE `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    filter += ' WHERE `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    filter += ' WHERE `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    filter += ' WHERE `time` <= \'' + db.escape(req.query.et) + '\'';
  }

  let qStr = 'SELECT COUNT(`time`) AS `total` FROM `' + db.TB_EVTLOG + '_' + sn + '`; ';
  qStr += 'SELECT `time`, HEX(`type`) AS `type`, `extraMsg` FROM `' + db.TB_EVTLOG + '_' + sn + '` ' + filter ;
  if(!req.session.user.admin) {
    let enControl = 'SET @enControl = (SELECT `enControl` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enControl` = 1)); ';

    let enMonitor = 'SET @enMonitor = (SELECT `enMonitor` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enMonitor` = 1)); ';

    qStr = enControl + enMonitor + qStr + ' AND (@enMonitor = 1 OR @enControl = 1) ';
  }
  qStr += ' ORDER BY `time` DESC LIMIT ' + num + ' OFFSET ' + from + ';';

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (!result.data) { // no record
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV + ' or ' + gstate.NO_RECORD});
  }

  if(!req.session.user.admin) {
    result.data.shift(); // remove set @enControl
    result.data.shift(); // remove set @enMonitor
  }
  let total = result.data[0].total;
  result.data.shift(); // remove total

  for(let i = 0; i < result.data.length; i++) {
    if(result.data[i].extraMsg) {
      let jExtra = toJson(result.data[i].extraMsg, {__file, __line, sn});
      if(jExtra) {
        result.data[i].extraMsg = jExtra;
      }
    }
  }
  return res.send({
    desc: gstate.OK,
    total: total,
    from: ((from) ? from : 0),
    evtlogs: result.data,
  });
});

const devProfile = (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  // Replace devConf if sn2 exists
  // console.log('user-agent=' + req.headers['user-agent']);
  let fromCE = (req.headers['user-agent'] && req.headers['user-agent'].match(/Wget.*1\.18 \(linux-gnu\)/ig)) ? true : false;
  let devConf = await(device.get(dbsIdx, sn));
  if(fromCE && devConf.sn2) {
    let _devConf = await(device.get(dbsIdx, devConf.sn2));
    if(_devConf) {
      sn = devConf.sn2;
      devConf = _devConf;
    }
  }

  let qCols = '' ;
  if(model.isMbusMaster(devConf.mo)) {
    qCols = ',`' + db.TB_DEVICE + '`.`mstConf`' ;
  }

  let qStr = '', slvIdx, filename;
  if(req.query.slvIdx) { // part of profile
    slvIdx = parseInt(db.escape(req.query.slvIdx));
    filename = 'slvdev-' + slvIdx + '-' + sn + '.json';
    qStr = 'SELECT `name`,`mo`,`modbus` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\')';
  } else { // whole device profile
    filename = 'profile-' + sn + '.json';
    qStr = 'SELECT `name`,`mo`,`pollTime`,`enLog`,`enServLog`,`fixPoint` AS `logFreq`,`password` AS `ftpPswd`,`storCapacity`,`mbusTimeout`,`enFtpCli`,`ftpCliHost`,`ftpCliPort`,`ftpCliAccount`,`ftpCliPswd`,`modbus`' + qCols + ' FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\')';
  }

  // Get device profile from DB
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  //  Expand I/O Switch config if need
  if(req.query.iosw) {
    let modified = false;
    let mpf = (result.data[0].modbus === '') ? '[]' : result.data[0].modbus;
    mpf = toJson(mpf, {__file, __line, sn});

    let ioswQuerys = {};
    for(let i = 0 ; i < mpf.length ; i++) {
      if(iotype.isIOSW(mpf[i].type) && mpf[i].swSN && mpf[i].swAddr) {
        let swSN = mac2hex(mpf[i].swSN);
        ioswQuerys[swSN] = ctrlblk.get(dbsIdx, swSN);
      }
    }

    let swCtrlblks = await(ioswQuerys);
    for(let i = 0 ; i < mpf.length ; i++) {
      if(iotype.isIOSW(mpf[i].type) && mpf[i].swSN && mpf[i].swAddr) {
        let swSN = mac2hex(mpf[i].swSN);
        let swHaddr = (mpf[i].swAddr).split('-')[0];
        let swCtrlblk = swCtrlblk[swSN];
        if(!swCtrlblk || !swCtrlblk[swHaddr]) {
          continue;
        } else {
          modified = true;
          mpf[i].swType = swCtrlblk[swHaddr].type;
        }
        for(let key of ['fpt','on','off','btnTime','unit','refReg','max','min']) {
          if(swCtrlblk[swHaddr][key]) {
            mpf[i][key] = swCtrlblk[swHaddr][key];
          }
        }
      }
    }
    if(modified) {
      result.data[0].modbus = toJsonStr(mpf, {__file, __line, sn});
    }
  } else if(req.query.slvIdx) {
    let mpf = (result.data[0].modbus === '') ? '[]' : result.data[0].modbus;
    mpf = toJson(mpf, {__file, __line, sn});
    for(let i = 0 ; i < mpf.length ; i++) {
      if(slvIdx === getSlvId(mpf[i].haddr)) {
        mpf[i].haddr = getRealAddr(mpf[i].haddr);
        for(let addr of ['iaddr','jaddr','laddr']) {
          if(mpf[i][addr]) {
            mpf[i][addr] = getRealAddr(mpf[i][addr]);
          }
        }
      } else {
        delete mpf[i];
      }
    }
    mpf = mpf.filter(Boolean);
    result.data[0].modbus = toJsonStr(mpf, {__file, __line, sn});
    result.data[0].slvProfile = true;
  }

  // Stringify profile
  let bufData = (result.data[0]) ? toJsonStr(result.data[0], {__file, __line, sn}) : '' ;
  if(!bufData) {
    info({__file, __line, err: 'Can not stringify data!\nDevice: ' + sn + '\nData: ' + result.data[0]});
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.ERR_DATA});
  }

  // Export profile
  let file = new Buffer(bufData, 'utf8');
  if(!file || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_FILE});
  }
  //res.setHeader('Content-Type', 'application/octet-stream; charset=UTF-8');
  // res.setHeader('Content-Encoding', 'UTF-8');
  res.setHeader('Content-Length', file.length);
  res.setHeader('Content-Disposition', 'attachment; filename=\'' + filename + '\'');
  res.write(new Buffer(file, 'utf8'), 'binary');
  res.end();
};
router.get('/:sn/ce/profile', devProfile); // @depressed
router.get('/profile/:sn', devProfile);

router.get('/datalog/:sn', (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let tryRun = mac2hex(db.escape(req.query.tryRun));
  let dbsIdx = req.session.user.dbsIdx;
  let qStr = 'SELECT `TABLE_SCHEMA`,`TABLE_NAME` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = \'rlog_' + sn + '\' AND (`TABLE_NAME` NOT LIKE \'%_raw\');';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(!result.data || result.data.length === 0) { // No such device
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  } else if(utils.has(tryRun)) {
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }

  let rndStr = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 5);
  let dirName = '/tmp/datalog/' + sn + '/' + rndStr;
  shell.mkdir('-p', dirName);

  let results = {};
  for(let i = 0; i < result.data.length; i++) {
    let table = '`' + result.data[i].TABLE_SCHEMA + '`.`' + result.data[i].TABLE_NAME + '`';
    qStr = 'SELECT CONCAT_WS(\',\',CONCAT(\'"\', REPLACE(`time`,\'"\', \'""\'), \'"\'),CONCAT(\'"\', REPLACE(`value`,\'"\',\'""\'),\'"\'),CONCAT(\'"\',REPLACE(`max`,\'"\',\'""\'),\'"\'),CONCAT(\'"\',REPLACE(`min`,\'"\',\'""\'),\'"\')) AS `log` FROM ' + table + ';';
    results[result.data[i].TABLE_NAME] = db.pr_query(dbsIdx, qStr);
  }
  results = await(results);
  for(let table in results) {
    if(results[table].err) {
      continue;
    }
    let buffer = '';
    for(let i = 0; i < results[table].data.length; i++) {
      buffer += results[table].data[i].log + '\n';
    }
    try {
      fs.writeFileSync(dirName + '/' + table + '.csv', buffer);
    } catch(e) {
      dbg(e);
    }
  }
  try {
    shell.exec('cd ' + dirName + '; [ -n "$(ls -A ' + dirName + ')" ] && /bin/tar czf ../' + rndStr + '.tar.gz * ');
    let zipData = fs.readFileSync('/tmp/datalog/' + sn + '/' + rndStr + '.tar.gz');
    if(!zipData) {
      throw gstate.NO_RECORD;
    }

    //Send file
    res.setHeader('Content-Length', zipData.length);
    res.setHeader('Content-Disposition', 'attachment; filename=\'log_' + sn + '.tar.gz' + '\'');
    res.write(zipData, 'binary');
    res.end();
  } catch(e) {
    info(e);
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_FILE});
  } finally{
    shell.exec('/bin/rm -rf ' + dirName + ';/bin/rm ' + dirName + '.tar.gz');
  }
});

router.get('/:sn/:addr/dt/:scale', (req, res) => {
  let MAX_CHART_QUERY = await(csid.get('C','MAX_CHART_QUERY','int'));
  let num  = (req.query.num && parseInt(req.query.num) < MAX_CHART_QUERY) ? db.escape(req.query.num) : MAX_CHART_QUERY;
  let tzSec = (req.query.tz) ? parseInt(db.escape(req.query.tz)) : 0 ;
  let sn = mac2hex(db.escape(req.params.sn));
  let addr = db.escape(req.params.addr);
  let scale = db.escape(req.params.scale);
  let table = (scale === 'week') ? 'month' : scale;
  let dataType = db.escape(req.query.type);
  let dbsIdx = req.session.user.dbsIdx;
  let [devConf, ctrlData] = await([device.get(dbsIdx, sn), ctrlblk.get(dbsIdx, sn)]);
  let userId = req.session.user.id;
  let companyId = req.session.user.companyId;
  if(!devConf || !ctrlData || !ctrlData[addr] || (ctrlData[addr].limitId && ctrlData[addr].limitId.indexOf(userId) >= 0)) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else if(!addr || !scale || (scale !== 'raw' && scale !== 'day' && scale !== 'week' && scale !== 'month' && scale !== 'year')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  // check datatype
  if(iotype.isEventData(ctrlData[addr].type)) {
    dataType = '`value`';
  } else if(!dataType) {
    dataType = '`value`';
  } else if(dataType === 'avg' || dataType === 'average') {
    dataType = '`value`';
  } else if(dataType === 'min') {
    dataType = '`min`';
  } else if(dataType === 'max') {
    dataType = '`max`';
  } else {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let now = (req.query.t)  ? parseInt(db.escape(req.query.t))  : parseInt(Date.now() / 1000);
  let nr  = (req.query.nr) ? parseInt(db.escape(req.query.nr)) : 1;
  let trange = utils.nTimeRange(nr, scale, now, tzSec);
  let filter = '`time` >= \'' + trange.start + '\'AND `time` < \'' + trange.end + '\'';
  filter = (prj.CUSTOMER === 'YATEC' || prj.CUSTOMER === 'HYEC') ? '`time` > \'' + trange.start + '\'AND `time` <= \'' + trange.end + '\'' : filter ;
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`,`mo` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\')';
  if(!req.session.user.admin) {
    let enMonitor = 'SET @enMonitor = (SELECT `enMonitor` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enMonitor` = 1)); ';

    qStr = enMonitor + qStr + ' AND enMonitor = 1';
  }

  let result = await(db.pr_query(dbsIdx, qStr + ';'));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(!result.data || result.data.length === 0) { // No such device
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV + ' or ' + gstate.NO_RECORD});
  }

  let retNoData = {desc: gstate.NO_RECORD, start: trange.start, end: trange.end, num: 0};
  qStr = 'SELECT `time`,' + dataType + ' AS `value` FROM (SELECT `time`,' + dataType + ' FROM `' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_' + table + '` WHERE ' + filter + ' ORDER BY `time` DESC LIMIT ' + num + ') sub ORDER BY `time` ASC;';
  result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    if(result.err.code === 'ER_NO_SUCH_TABLE') {
      return res.status(gstate.RC_OK).send(retNoData);
    } else {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }
  } else if(!result.data || result.data.length === 0) { // No such device
    return res.status(gstate.RC_OK).send(retNoData);
  }

  let time = [];
  let data = [];
  if(iotype.is48bit(ctrlData[addr].type)) {
    let shift = (ctrlData[addr].fpt > 0) ? Math.pow(10, ctrlData[addr].fpt) : 1 ;
    for(let i = 0; i < result.data.length; i++) {
      time.push(result.data[i].time);
      data.push(Math.floor((result.data[i].value / 1000) * shift) / shift);
    }  
  } else {
    let shift = (iotype.isFixPoint(ctrlData[addr].type) && ctrlData[addr].fpt > 0) ? Math.pow(10, ctrlData[addr].fpt) : 1 ;
    for(let i = 0; i < result.data.length; i++) {
      time.push(result.data[i].time);
      data.push(result.data[i].value / shift);
    }
  }

  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    start: trange.start,
    end: trange.end,
    num: time.length,
    time: time,
    data: data,
  });
});

const validInputForm = (dbsIdx, sn, fields) => {
  let errs = [];
  if(!fields.sn || !utils.validMac(fields.sn)) {
    errs.push('invalid sn');
  }
  let haddr = db.escape(fields.mbusHaddr);
  if(fields.addNewDev) {
    if(!fields.name || fields.name.length > 32 || !utils.valStr(fields.name)) {
      errs.push('invalid name (Max size: 32)');
    }
    if(prj.CUSTOMER === 'HYEC') {
      if(!fields.mo) {
        errs.push('unknown model!');
      } else if(!fields.mo.match(/HY-/)) {
        errs.push('unacceptable model!');
      }
    } else if(prj.CUSTOMER === 'YATEC') {
      if(!fields.mo) {
        errs.push('unknown model!');
      } else if(!fields.mo.match(/YT-/)) {
        errs.push('unacceptable model!');
      }
    }
  } else {
    if(fields.name && (fields.name.length > 32 || !utils.valStr(fields.name))) {
      errs.push('invalid name (Max size: 32)');
    }
  }
  if(fields.mo && !model.isCloudEnabler(fields.mo)) {
    errs.push('unknown model!');
  }
  if(fields.ftpPswd && fields.ftpPswd.length > 32) {
    errs.push('invalid ftpPswd (Max size: 32)');
  }
  if(fields.pollTime && !utils.vaildRange(fields.pollTime, 10, 864000)) {
    errs.push('invalid pollTime (Range: 10 ~ 864000)');
  }
  if(fields.mbusTimeout && !utils.vaildRange(fields.mbusTimeout, 10, 3600)) {
    errs.push('invalid mbusTimeout (Range: 10 ~ 3600)');
  }    
  if(fields.storCapacity && !utils.vaildRange(fields.storCapacity, 80, 100)) {
    errs.push('invalid storCapacity (Range: 80 ~ 100)');
  }
  if(fields.logFreq && !utils.vaildRange(fields.logFreq, 1, 3600)) {
    errs.push('invalid logFreq (Range: 1 ~ 3600)');
  }
  if(fields.enAlarm) {
    fields.enAlarm = utils.isInputChecked(db.escape(fields.enAlarm));
    if(!utils.vaildRange(fields.enAlarm, 0, 1)) {
      errs.push('invalid enAlarm (Accept: 0 or 1)');
    }
  }
  if(fields.enControl) {
    fields.enControl = utils.isInputChecked(db.escape(fields.enControl));
    if(!utils.vaildRange(fields.enControl, 0, 1)) {
      errs.push('invalid enControl (Accept: 0 or 1)');
    }
  }
  if(fields.enMonitor) {
    fields.enMonitor = utils.isInputChecked(db.escape(fields.enMonitor));
    if(!utils.vaildRange(fields.enMonitor, 0, 1)) {
      errs.push('invalid enMonitor (Accept: 0 or 1)');
    }
  }
  if(fields.enLog) {
    fields.enLog = utils.isInputChecked(db.escape(fields.enLog));
    if(!utils.vaildRange(fields.enLog, 0, 1)) {
      errs.push('invalid enLog (Accept: 0 or 1)');
    }
  }
  if(fields.enServLog) {
    fields.enServLog = utils.isInputChecked(db.escape(fields.enServLog));
    if(!utils.vaildRange(fields.enServLog, 0, 1)) {
      errs.push('invalid enServLog (Accept: 0 or 1)');
    }
  }
  if(fields.enFtpCli) {
    fields.enFtpCli = utils.isInputChecked(db.escape(fields.enFtpCli));
    if(!utils.vaildRange(fields.enFtpCli, 0, 1)) {
      errs.push('invalid enFtpCli (Accept: 0 or 1)');
    }
  }
  if(fields.ftpCliHost && fields.ftpCliHost.length > 64) {
    errs.push('invalid ftpCliHost (Max size: 64)');
  }
  if(fields.ftpCliPort && !utils.vaildRange(fields.ftpCliPort, 1, 65535)) {
    errs.push('invalid ftpCliPort (Range: 1 ~ 65535)');
  }
  if(fields.ftpCliAccount && fields.ftpCliAccount.length > 32) {
    errs.push('invalid ftpCliAccount (Max size: 32)');
  }
  if(fields.ftpCliPswd && fields.ftpCliPswd.length > 32) {
    errs.push('invalid ftpCliPswd (Max size: 32)');
  }
  if(fields.extra) {
    let extrObj = toJson(fields.extra, {__file, __line});
    if(!extrObj) {
      errs.push('invalid extra (not valid JSON object)');
    }
    if(extrObj.url_1 && !utils.valStr(extrObj.url_1)) {
      errs.push('invalid url_1 link');
    }
    if(extrObj.url_2 && !utils.valStr(extrObj.url_2)) {
      errs.push('invalid url_2 link');
    }
    if(extrObj.url_3 && !utils.valStr(extrObj.url_3)) {
      errs.push('invalid url_3 link');
    }
  }
  // Register level
  if(fields.mbusAction) { // register action
    if(fields.mbusAction === 'ADD' || fields.mbusAction === 'EDIT' || fields.mbusAction === 'DELETE') {
      if(fields.mbusAction === 'ADD') {
        if(!fields.mbusDesc || fields.mbusDesc.length > 32 || !utils.valStr(fields.mbusDesc)) {
          errs.push('invalid fields.mbusDesc (Max size: 32)');
        }
        let devConf = await(device.get(dbsIdx, sn));
        if(!devConf) {
          errs.push('No such device');
          return errs;
        }
        let haddr = parseInt(fields.mbusHaddr);
        let iaddr = parseInt(fields.mbusIaddr);
        let jaddr = parseInt(fields.mbusJaddr);
        let laddr = parseInt(fields.mbusLaddr);
        if(model.isMbusMaster(devConf.mo)) { // Master CE
          if(haddr && (haddr < 1000001 || haddr > 9965535)) {
            errs.push('invalid fields.mbusHaddr (range: 1000001 ~ 9965535)');
          }
          if(laddr && (laddr < 1000001 || laddr > 9965535)) {
            errs.push('invalid fields.mbusLaddr (range: 1000001 ~ 9965535)');
          }
          if(iaddr && (iaddr < 1000001 || iaddr > 9965535)) {
            errs.push('invalid fields.mbusIaddr (range: 1000001 ~ 9965535)');
          }                    
          if(jaddr && (jaddr < 1000001 || jaddr > 9965535)) {
            errs.push('invalid fields.mbusJaddr (range: 1000001 ~ 9965535)');
          }                                       
        } else { // Slave CE
          let maxReg = 40000 + model.getMaxReg(devConf.mo);
          if(haddr && (haddr < 40001 || haddr > maxReg)) {
            errs.push('invalid fields.mbusHaddr (range: 40001 ~ ' + maxReg + ')');
          }
          if(laddr && (laddr < 40001 || laddr > maxReg)) {
            errs.push('invalid fields.mbusLaddr (range: 40001 ~ ' + maxReg + ')');
          }
          if(iaddr && (iaddr < 40001 || iaddr > maxReg)) {
            errs.push('invalid fields.mbusIaddr (range: 40001 ~ ' + maxReg + ')');
          }                    
          if(jaddr && (jaddr < 40001 || jaddr > maxReg)) {
            errs.push('invalid fields.mbusJaddr (range: 40001 ~ ' + maxReg + ')');
          }                      
        }
        if(iotype.is48bit(fields.mbusType)) {
          if(haddr && iaddr && laddr) {
            if(haddr < laddr && (haddr + 2) === laddr && (iaddr + 1) === laddr) {
              dbg('3 continuous address!'); // 40001 ~ 40003
            } else if(haddr > laddr && (haddr - 2) === laddr && (iaddr - 1) === laddr) {
              dbg('3 continuous address!'); // 40003 ~ 40001
            } else {
              errs.push('invalid modbus address!');
            }
          } else {
            errs.push('invalid modbus address!');
          }                    
        } else if(iotype.is64bit(fields.mbusType)) {
          if(haddr && iaddr && jaddr && laddr) {
            if(haddr < laddr && (haddr + 3) === laddr && (iaddr + 2) === laddr && (jaddr + 1) === laddr) {
              dbg('4 continuous address!'); // 40001 ~ 40004
            } else if(haddr > laddr && (haddr - 3) === laddr && (iaddr - 2) === laddr && (jaddr - 1) === laddr) {
              dbg('4 continuous address!'); // 40004 ~ 40001
            } else {
              errs.push('invalid modbus address!');
            }
          } else {
            errs.push('invalid modbus address!');
          }
        } 
      } else {
        if(fields.mbusDesc && (fields.mbusDesc.length > 32 || !utils.valStr(fields.mbusDesc))) {
          errs.push('invalid fields.mbusDesc (Max size: 32)');
        }
      }
      if(fields.mbusEnlog && !utils.vaildRange(fields.mbusEnlog, 0, 1)) {
        errs.push('invalid mbusEnlog (Accept: 0 or 1)');
      }
      if(fields.mbusUnit && (fields.mbusUnit.length > 32 || !utils.valStr(fields.mbusUnit))) {
        errs.push('invalid fields.mbusUnit (Max size: 32)');
      }
      if(fields.mbusDt && !utils.vaildRange(fields.mbusDt, 0, 35)) {
        errs.push('invalid mbusDt (Accept: 0 ~ 35)');
      }
      if(fields.mbusSAM && !utils.vaildRange(fields.mbusSAM, 0, 1)) {
        errs.push('invalid mbusSAM (Accept: 0 or 1)');
      }
      if(fields.mbusDur && !utils.vaildRange(fields.mbusDur, 0, 600)) {
        errs.push('invalid mbusDur (Accept: 0 ~ 600)');
      }
      if(fields.mbusPri && !utils.vaildRange(fields.mbusPri, 0, 2)) {
        errs.push('invalid mbusPri (Accept: 0 ~ 2)');
      }
      if(fields.mbusVirt && !utils.vaildRange(fields.mbusVirt, 0, 1)) {
        errs.push('invalid mbusVirt (Accept: 0 or 1)');
      }

      let ctrlData = await(ctrlblk.get(dbsIdx, sn));
      if(fields.mbusUp) {
        if(isNaN(fields.mbusUp)) {
          errs.push('invalid mbusUp');
        } else if(typeof ctrlData[haddr].low !== 'undefined') {
          if(ctrlData[haddr].low >= parseFloat(fields.mbusUp)) {
            errs.push('invalid mbusUp, mbusUp should larger than mbusLow');
          }
        }
      }
      if(fields.mbusLow) {
        if(isNaN(fields.mbusLow)) {
          errs.push('invalid mbusLow');
        } else if(typeof ctrlData[haddr].up !== 'undefined') {
          if(ctrlData[haddr].up <= parseFloat(fields.mbusLow)) {
            errs.push('invalid mbusLow, mbusLow should smaller than mbusUp');
          }
        }
      }
      if(fields.mbusMin) {
        if(isNaN(fields.mbusMin)) {
          errs.push('invalid mbusMin');
        } else if(typeof ctrlData[haddr].max !== 'undefined') {
          if(ctrlData[haddr].max <= parseFloat(fields.mbusMin)) {
            errs.push('invalid mbusMin, mbusMin should smaller than mbusMax');
          }
        }
      }
      if(fields.mbusMax) {
        if(isNaN(fields.mbusMax)) {
          errs.push('invalid mbusMax');
        } else if(typeof ctrlData[haddr].min !== 'undefined') {
          if(ctrlData[haddr].min >= parseFloat(fields.mbusMax)) {
            errs.push('invalid mbusMax, mbusMax should larger than mbusMin');
          }
        }
      }
      if(fields.mbusEq && !utils.validMathEq(fields.mbusEq)) {
        errs.push('invalid mbusEq');
      }
    } else { //unknown action
      errs.push('Unknown mbusAction');
    }
  }
  if(errs.length > 0) {
    dbg({__file, __line, err: errs});
  }
  return errs;
};

router.post('/add', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    // Cloud Enabler default settings
    fields.addNewDev = true;
    fields.enControl = '1';
    fields.enAlarm   = '1';
    fields.enMonitor = '1';
    fields.logFreq   = (fields.logFreq) ? fields.logFreq : 10;
    fields.password  = fields.ftpPswd;

    let pollTime  = parseInt(db.escape(fields.pollTime));
    pollTime = (pollTime && pollTime >= 50) ? pollTime : 50;
    // Chcek form fields
    let sn = mac2hex(db.escape(fields.sn));
    let dbsIdx = await(device.getDBSIdx(sn));
    if(dbsIdx >= 0) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_DEV});
    } else {
      dbsIdx = req.session.user.dbsIdx;
    }

    // let dbsIdx = req.session.user.dbsIdx;
    let errs = await(validInputForm(dbsIdx, sn, fields));
    if(errs.length > 0) {
      return res.status(gstate.RC_BAD_REQUEST).send({
        desc: gstate.INVALID_DATA,
        errs: errs,
      });
    }

    // check max number of device in a company
    let time = Date.now();
    let devName = db.escape(fields.name);
    let companyId = req.session.user.companyId;
    let MAX_DEVICE = await(csid.get('C','MAX_DEVICE','int'));
    let qStr  = 'SELECT COUNT(`id`) AS `total` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) { // DB error
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if(parseInt(result.data[0].total) >= MAX_DEVICE) { // MAX number of devices
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_DEVICE});
    }

    qStr = 'CREATE TABLE IF NOT EXISTS `' + db.TB_MCACHE + '_' + sn + '` (' +
      '`time`  BIGINT UNSIGNED NOT NULL,' +
      '`type`  TINYINT         NOT NULL DEFAULT 0,' +
      '`key`   VARCHAR(32)     NOT NULL PRIMARY KEY,' +
      '`value` MEDIUMTEXT      NOT NULL,' +
      'INDEX(`time`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'CREATE TABLE IF NOT EXISTS `' + db.TB_EVTLOG + '_' + sn + '` (' +
      '`time`     INT UNSIGNED NOT NULL,' +
      '`type`     BINARY(1),'    +
      '`extraMsg` VARCHAR(1024),' +
      'UNIQUE(`time`, `type`)' +
      ') ' + prj.DB_ENGINE + ' COLLATE utf8_unicode_ci;';

    qStr += 'INSERT INTO `' + db.TB_DEVICE + '` (`createTime`,`companyId`,`sn`,`mo`,`name`,`password`,`enAlarm`,`enControl`,`enMonitor`,`enLog`,`enServLog`,`pollTime`) VALUES (UNIX_TIMESTAMP(now()),' +
      '\'' + companyId + '\',' +
      'UNHEX(\'' + sn + '\'),' +
      '\'' + db.escape(fields.mo) + '\',' +
      '\'' + db.escape(fields.name) + '\',' +
      '\'' + db.escape(fields.password) + '\',' +
      '\'' + db.escape(fields.enAlarm)   + '\',' +
      '\'' + db.escape(fields.enControl) + '\',' +
      '\'' + db.escape(fields.enMonitor) + '\',' +
      '\'' + db.escape(fields.enLog) + '\',' +
      '\'' + db.escape(fields.enServLog) + '\',' +
      '\'' + pollTime + '\'); ';

    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // reset device caches
    await(device.reset(dbsIdx, companyId, sn));
    await(device.addRcmds(dbsIdx, sn, ['DL=1']));
    await(mbval.removeAll(dbsIdx, sn));

    // reset profile caches and iosw
    await(ctrlblk.reset(dbsIdx, companyId, sn));
    await(audit.log(req.session.user, audit.ADTCODE.NEW_DEV, {'devName': devName}));
    return res.status(gstate.RC_OK).send({
      desc: gstate.OK,
      rd: '/device/edit/' + hex2mac(sn),
    });
  }));
});

const cloneReg = (target) => {
  let ret = {};
  if(!target) { return ret; }
  Object.keys(target).forEach((key) => {
    ret[key] = target[key];
  });
  return ret;
};

const availableReg = (mo, stIdx, usedReg) => {
  let maxReg = 40000 + model.getMaxReg(mo); // 128 or 256
  let addr = parseInt(stIdx);
  for(let i = 0; i < maxReg; i++) {
    addr = (addr >= maxReg) ? 40001 : (addr + 1);
    if(!usedReg[addr]) {
      return addr;
    }
  }
  return -1;
};

// Not support 64bits
const nextMbusObj = (mo, target, lendian, modbusArray) => {
  let usedReg =  {};
  for(let i = 0; i < modbusArray.length; i++) {
    for(let addr of ['haddr','iaddr','jaddr','laddr']) {
      if(modbusArray[i][addr]) {
        usedReg[modbusArray[i][addr]] = 1;
      }            
    }
  }
  // find available high register
  let freeAddr = availableReg(mo, target.haddr, usedReg);
  if(freeAddr < 0) { // no more space
    return null;
  } else {
    usedReg[freeAddr] = 1;
    target.haddr = freeAddr.toString();
  }

  // find available low register
  if(target.laddr) { // 32 bits
    freeAddr = availableReg(mo, target.laddr, usedReg);
    if(freeAddr < 0) {
      return null;
    } else {
      target.laddr = freeAddr.toString();
    }
  }

  // Check little endian (32 bits)
  if(target.laddr && lendian) {
    let tmp = target.laddr;
    target.laddr = target.haddr;
    target.haddr = tmp;
  }

  target.id = Date.now().toString(36).substr(3) + Math.random().toString(36).substr(2, 4);
  return target;
};

router.put('/reg/dup/:sn', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let mbusId = db.escape(req.query.mbusId);
  let ndup = (req.query.ndup) ? db.escape(req.query.ndup) : 1;
  if(!utils.vaildRange(ndup, 1, 256)) {
    return res.status(gstate.RC_BAD_REQUEST).send({
      desc: gstate.ERR_DATA,
      field: 'ndup (Range: 1 ~ 256)',
    });
  }

  let _sn = req.params.sn;
  if(!_sn || !mbusId || !req.query.mbusId || !_sn.match(/^([0-9A-F]{2}[:-]){5}([0-9A-F]{2})$/i)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ERR_DATA});
  }

  let dbsIdx = req.session.user.dbsIdx;
  let sn = mac2hex(db.escape(req.params.sn));
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else if(devConf.enLog === 1) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
  } else if(model.isMbusMaster(devConf)) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_SUPPORT});
  }

  let devName = devConf.name;
  let regName = '';
  let newMobus = [];
  let cqStr = '';
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`, `mo`, `modbus` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) { // DB error
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (result.data.length === 0) { // No such device
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  let modbus = [];
  if(result.data[0].modbus && result.data[0].modbus !== "") {
    modbus = toJson(result.data[0].modbus, {__file, __line, sn});
    if(!modbus) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }
  }

  let lendian = false;
  let target = null;
  for(let i = 0; i < modbus.length ; i++) {
    if(modbus[i].id === mbusId) {
      target = modbus[i];
      regName = target.desc;
      lendian = (target.laddr && (parseInt(target.haddr) > parseInt(target.laddr))) ? true : false;
      break;
    }
  }
  if(!target) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  } else if(iotype.is48bit(target.type)) {
    dbg('Not support 48 bits register duplication!');
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  } else if(iotype.is64bit(target.type)) {
    dbg('Not support 64 bits register duplication!');
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  for(let i = 0; i < ndup; i++) {
    let _mbusObj = nextMbusObj(result.data[0].mo, cloneReg(target), lendian, modbus);
    if(!_mbusObj) {
      info('No more address for this type of modbus! ');
      break;
    }
    modbus.push(_mbusObj); // all
    newMobus.push(_mbusObj); // for new modbus
  }
  if(newMobus.length < 1) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_MORE_SPACE});
  }

  // Execute SQL
  qStr = 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `modbus` = \'' + toJsonStr(modbus, {__file, __line, sn}) + '\'  WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\') ;';
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  // reset device caches
  let rcmdQuerys = {};
  let rcmds = ['DL=1'];
  await(device.reset(dbsIdx, companyId, sn));
  for(let i = 0; i < newMobus.length; i++) {
    if(newMobus[i].type === iotype.APP_SWITCH || newMobus[i].type === iotype.APP_BTN) {
      rcmdQuerys['haddr-' + i] = mbval.set(dbsIdx, sn, newMobus[i].haddr, newMobus[i].off);
      rcmds.push(newMobus[i].haddr + '=' + newMobus[i].off);
    } else {
      rcmdQuerys['haddr-' + i] = mbval.remove(dbsIdx, sn, newMobus[i].haddr);
      rcmds.push(newMobus[i].haddr + '=-');
      if(newMobus[i].laddr) { // if 32 bits register
        rcmdQuerys['laddr-' + i] = mbval.remove(dbsIdx, sn, newMobus[i].laddr);
        rcmds.push(newMobus[i].laddr + '=-');
      }
    }
  }
  await(rcmdQuerys);
  await(device.addRcmds(dbsIdx, sn, rcmds));
  await(ctrlblk.reset(dbsIdx, companyId, sn));

  // create iosw records
  let querys = {};
  for(let i = 0; i < newMobus.length ; i++) {
    if(!newMobus[i].swSN || !newMobus[i].swAddr) {
      continue;
    }
    querys['iosw-' + i] = iosw.set(dbsIdx, sn, newMobus[i].haddr, mac2hex(newMobus[i].swSN), newMobus[i].swAddr);
  }
  await(querys);

  // create logging table if not exists
  querys = {};
  for(let i = 0; i < newMobus.length ; i++) {
    if(newMobus[i].haddr && newMobus[i].enlog === '1') {
      querys['log-' + i] = db.createLogTable(dbsIdx, sn, newMobus[i].haddr, newMobus[i]);
    }
  }
  await(querys);

  await(audit.log(req.session.user, audit.ADTCODE.DUP_REG, {'devName': devName,'regName': regName,'ndup': ndup}));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

const findLoggingReg = (dbsIdx, sn) => {
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(!ctrlData) {
    return false;
  }
  let found = false;
  Object.keys(ctrlData).forEach((addr) => {
    if(ctrlData[addr].enlog !== '0') {
      found = true;
    }
  });
  return found;
};

const getMbusIdx = (modbus, mbusId) => {
  for(let i = 0; i < modbus.length ; i++) {
    if(modbus[i].id === mbusId) {
      return i;
    }
  }
  return -1;
};

router.put('/edit', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let sn = mac2hex(db.escape(fields.sn));
    let dbsIdx = req.session.user.dbsIdx;
    let errs = await(validInputForm(dbsIdx, sn, fields));
    if(errs.length > 0) {
      // ddbg(errs);
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA, errs: errs});
    }

    let devConf = await(device.get(dbsIdx, sn));
    let doChkUSBLogging = (db.escape(fields.noUsbChk) === '1') ? false : true;
    if(!devConf) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } else if(fields.mbusAction && doChkUSBLogging && devConf.enLog === 1) { // register action
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
    }

    // Add, Edit or Delete a modbus register setting
    let delQstr     = '';
    let mbusType    = 0;
    let mbusAction  = '';
    let mbusHaddr   = '';
    let mbusIaddr   = '';
    let mbusJaddr   = '';
    let mbusLaddr   = '';
    let mbusOffVal  = '';
    let mbusId      = '';
    let mbusLimitId = '';
    let chgEnlog    = false;
    let fromWeb     = (db.escape(fields.web) === '1')      ? true  : false;
    let doSndDL     = (db.escape(fields.noDevDL)  === '1') ? false : true; // send DL=1 to device
    let doRstVal    = (db.escape(fields.noRstVal) === '1') ? false : true; // reset reg value
    let companyId   = req.session.user.companyId;
    let parentId    = -1;

    let qStr = '';
    qStr += 'SELECT LOWER(HEX(`sn`)) AS `sn`, `modbus` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
    qStr += 'SELECT `parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else if (result.data.length === 0) { // No such device
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } else {
      parentId = result.data[1].parentId;
    }

    //----------------------------------------------------------------------------------------
    // Registers settings
    //----------------------------------------------------------------------------------------
    if(fields.mbusAction && (fields.mbusHaddr || fields.mbusId)) {
      let modbus = [];
      if(result.data[0].modbus && result.data[0].modbus !== "") { // parsing registers
        modbus = toJson(result.data[0].modbus, {__file, __line, sn});
        if(!modbus) {
          return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
        }
      }

      const MAX_REGS = model.getMaxReg(devConf.mo);
      let mbusEnlog = db.escape(fields.mbusEnlog);
      mbusAction = db.escape(fields.mbusAction);
      if(mbusAction === 'ADD' || mbusAction === 'EDIT') {
        let mbusDesc = db.escape(fields.mbusDesc);
        mbusHaddr = db.escape(fields.mbusHaddr);
        mbusIaddr = db.escape(fields.mbusIaddr);
        mbusJaddr = db.escape(fields.mbusJaddr);
        mbusLaddr = db.escape(fields.mbusLaddr);
        if(mbusAction === 'EDIT') {
          mbusId = db.escape(fields.mbusId);
          let i = getMbusIdx(modbus, mbusId);
          if(i < 0) {
            return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_REG});
          }
          // Audit log
          let adtData = {'devName': devConf.name,'regName': modbus[i].desc};
          for(let [addr, mbusAddr] of [['haddr', mbusHaddr], ['iaddr', modbus[i].iaddr], ['jaddr', modbus[i].jaddr], ['laddr', modbus[i].laddr]]) {
            if(mbusAddr) {
              adtData[addr] = mbusAddr;
            }                        
          }
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_REG, adtData));
          
          // Others settings
          chgEnlog = (modbus[i].enlog !== mbusEnlog) ? true : false ;
          modbus.splice(i, 1);
        } else { // 'ADD'
          let origCtrlData = await(ctrlblk.get(dbsIdx, sn));
          if(origCtrlData) {
            if(Object.keys(origCtrlData).length >= MAX_REGS) {
              return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_MORE_REGS});
            } else if((mbusHaddr && origCtrlData[mbusHaddr]) || (mbusLaddr && origCtrlData[mbusLaddr]) || (mbusIaddr && origCtrlData[mbusIaddr]) || (mbusJaddr && origCtrlData[mbusJaddr]))  {
              return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_REG});
            }
          }
          mbusId = (Date.now().toString(36).substr(3) + Math.random().toString(36).substr(2, 4));

          // Audit log
          let adtData = {'devName': devConf.name, 'regName': mbusDesc};
          for(let [addr, mbusAddr] of [['haddr', mbusHaddr], ['iaddr', mbusIaddr], ['jaddr', mbusJaddr], ['laddr', mbusLaddr]]) {
            if(mbusAddr) {
              adtData[addr] = mbusAddr;
            }                        
          }
          await(audit.log(req.session.user, audit.ADTCODE.NEW_REG, adtData));
        }
        mbusType = parseInt(db.escape(fields.mbusType));

        let mbusObj = {
          id   : mbusId,
          desc : mbusDesc,
          type : mbusType,
          haddr: mbusHaddr,
          laddr: mbusLaddr,
          enlog: mbusEnlog,
        };

        // 64 bits or 48 bits
        if(iotype.is48bit(mbusType)) {
          mbusObj.iaddr = mbusIaddr;
        } if(iotype.is64bit(mbusType)) {
          mbusObj.iaddr = mbusIaddr;
          mbusObj.jaddr = mbusJaddr;
        }

        // Show number of floating points of a floating value
        if(iotype.isFixPoint(mbusType) || iotype.isIEEE754(mbusType)) {
          mbusObj.fpt = fields.mbusFpt ? db.escape(fields.mbusFpt) : '0';
        }

        // Switch value
        if(mbusType === iotype.APP_SWITCH) {
          mbusObj.on = db.escape(fields.mbusOnVal);
          mbusObj.off = db.escape(fields.mbusOffVal);
          mbusOffVal = mbusObj.off ? mbusObj.off : '0' ;
        } else if(mbusType === iotype.APP_BTN) {
          mbusObj.on = db.escape(fields.mbusOnVal);
          mbusObj.off = db.escape(fields.mbusOffVal);
          mbusOffVal = mbusObj.off ? mbusObj.off : '0' ;
          mbusObj.btnTime = db.escape(fields.mbusBtnTime);
          mbusObj.btnTime = (mbusObj.btnTime) ? mbusObj.btnTime : 13;
        } else if(iotype.isIOSW(mbusType)) {
          mbusObj.swSN = db.escape(fields.mbusSwSN);
          mbusObj.swAddr = db.escape(fields.mbusSwAddr);
          if(!mbusObj.swSN || !mbusObj.swAddr) {
            return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
          }

          // save iosw register's id
          let addr = mbusObj.swAddr.split('-')[0];
          let _ctrlData = await(ctrlblk.get(dbsIdx, mac2hex(mbusObj.swSN)));
          if(!_ctrlData || !_ctrlData[addr]) {
            return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
          }
          mbusObj.swId = _ctrlData[addr].id;
          await(iosw.set(dbsIdx, sn, mbusHaddr, mac2hex(mbusObj.swSN), mbusObj.swAddr));
        } else if(iotype.isCommAlarm(mbusType)) {
          mbusObj.refReg = db.escape(fields.mbusRefReg);

          if(fields.mbusPri && parseInt(fields.mbusPri) > 0) {
            mbusObj.pri = db.escape(fields.mbusPri);
          }
        }

        if(fields.mbusLimitId && fields.mbusLimitId !== '[]') {
          mbusObj.limitId = toJson(db.escape(fields.mbusLimitId), {__file, __line, sn});
        }
        if(iotype.isNumber(mbusType) && fields.mbusUnit) {
          mbusObj.unit = db.escape(fields.mbusUnit);
        }
        if(iotype.isMathEq(mbusType) && fields.mbusEq) {
          mbusObj.eq = db.escape(fields.mbusEq);
        }
        if(iotype.isDispaly(mbusType) && fields.mbusDt && fields.mbusDt !== '0') {
          mbusObj.dt = db.escape(fields.mbusDt);
        }
        if(iotype.isMbusNumber(mbusType)) {
          if(fields.mbusUp) {
            mbusObj.up = db.escape(fields.mbusUp);
          }
          if(fields.mbusLow) {
            mbusObj.low = db.escape(fields.mbusLow);
          }
          if(fields.mbusSAM && fields.mbusSAM === '1') {
            mbusObj.sam = db.escape(fields.mbusSAM);
          }
          if(fields.mbusMax) {
            mbusObj.max = db.escape(fields.mbusMax);
          }
          if(fields.mbusMin) {
            mbusObj.min = db.escape(fields.mbusMin);
          }
          if(fields.mbusDur) {
            let dur = parseInt(db.escape(fields.mbusDur));
            if(dur > 0) { mbusObj.dur = dur; }
          }
          if(fields.mbusPri) {
            let pri = parseInt(db.escape(fields.mbusPri));
            if(pri > 0) { mbusObj.pri = pri; }
          }
          if(fields.mbusRR1) {
            mbusObj.rr1 = db.escape(fields.mbusRR1);
          }
          if(fields.mbusRR2) {
            mbusObj.rr2 = db.escape(fields.mbusRR2);
          }
          if(fields.mbusRR3) {
            mbusObj.rr3 = db.escape(fields.mbusRR3);
          }
          if(fields.mbusRR4) {
            mbusObj.rr4 = db.escape(fields.mbusRR4);
          }                                                            
        }
        if(fields.mbusVirt && fields.mbusVirt === '1') {
          mbusObj.virt = db.escape(fields.mbusVirt);
        }                

        // create logging table
        if(mbusEnlog === '1') {
          await(db.createLogTable(dbsIdx, sn, mbusHaddr, mbusObj));
        }
        modbus.push(mbusObj);
        fields.modbus = toJsonStr(modbus, {__file, __line, sn});
      } else if(mbusAction === 'DELETE'){ // Remove
        mbusId = db.escape(fields.mbusId);
        let i = getMbusIdx(modbus, mbusId);
        if(i < 0) {
          return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_REG});
        }
        // get address
        mbusHaddr = modbus[i].haddr;
        mbusIaddr = modbus[i].iaddr;
        mbusJaddr = modbus[i].jaddr;
        mbusLaddr = modbus[i].laddr;

        // Audit log
        let adtData = {'devName': devConf.name, 'regName': modbus[i].desc};
        for(let [addr, mbusAddr] of [['haddr', mbusHaddr], ['iaddr', mbusIaddr], ['jaddr', mbusJaddr], ['laddr', mbusLaddr]]) {
          if(mbusAddr) {
            adtData[addr] = mbusAddr;
          }
        }
        await(audit.log(req.session.user, audit.ADTCODE.DELETE_REG, adtData));
        modbus.splice(i, 1);
        fields.modbus = toJsonStr(modbus, {__file, __line, sn});

        // Delete other related
        delQstr   = 'DELETE IGNORE FROM `' + db.TB_GROUP + '` WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + mbusHaddr+ '\';';
        delQstr  += 'DELETE IGNORE FROM `' + db.TB_ALARM_LOG + '` WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + mbusHaddr + '\';';
        delQstr  += (parentId > 0) ? 'DELETE IGNORE FROM `' + db.TB_ALARM_LOG + '` WHERE `companyId` = \'' + parentId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + mbusHaddr + '\';' : '' ;
        delQstr  += 'DELETE IGNORE FROM `' + db.TB_IOSTAT_LOG + '` WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + mbusHaddr + '\';';
        await(db.deleteLogTable(dbsIdx, sn, mbusHaddr));

        // Remove from iosw table
        await(iosw.remove(dbsIdx, sn, mbusHaddr));
      }

      // Clear register value if settings changed
      if(!doRstVal) {
        dbg({__file, __line, err: 'Don\'t remove the register value!'});
      } else if(chgEnlog) {
        dbg({__file, __line, err: 'Don\'t remove the register value if changed logging setting only!'});
      } else if(mbusType === iotype.APP_SWITCH || mbusType === iotype.APP_BTN) {
        await(mbval.set(dbsIdx, sn, mbusHaddr, mbusOffVal));
      } else {
        await(mbval.remove(dbsIdx, sn, mbusHaddr));
        for(let mbusAddr of [mbusIaddr, mbusJaddr, mbusLaddr]) {
          if(mbusAddr) { // if 32/64 bits register
            await(mbval.remove(dbsIdx, sn, mbusAddr));
          }
        }
      }
    }
    //----------------------------------------------------------------------------------------
    // Device settings
    //----------------------------------------------------------------------------------------
    qStr = 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `sn` = UNHEX(\'' + sn + '\')';
    if(typeof fields.name !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'newDevName': db.escape(fields.name)}));
      qStr += ',`name` = \'' + db.escape(fields.name) + '\'';
    }
    if(typeof fields.password !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'devPswd': 1}));
      qStr += ',`password` = \'' + db.escape(fields.password) + '\'';
    }
    if(typeof fields.enAlarm !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enAlarm': db.escape(fields.enAlarm)}));
      qStr += ',`enAlarm` = \'' + db.escape(fields.enAlarm) + '\'';
    }
    if(typeof fields.enControl !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enControl': db.escape(fields.enControl)}));
      qStr += ',`enControl` = \'' + db.escape(fields.enControl) + '\'';
    }
    if(typeof fields.enMonitor !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enMonitor': db.escape(fields.enMonitor)}));
      qStr += ',`enMonitor` = \'' + db.escape(fields.enMonitor) + '\'';
    }
    if(typeof fields.enLog !== "undefined") {
      if(db.escape(fields.enLog) === '1' && !await(findLoggingReg(dbsIdx, sn))) { // Not found
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_ANY_LOG_REG});
      }
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enLog': db.escape(fields.enLog)}));
      qStr += ',`enLog` = \''  + db.escape(fields.enLog) + '\'';
    }
    if(typeof fields.enServLog !== "undefined") {
      if(db.escape(fields.enServLog) === '1' && !await(findLoggingReg(dbsIdx, sn))) { // Not found
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_ANY_LOG_REG});
      }
      let enServLog = db.escape(fields.enServLog);
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enServLog': enServLog}));
      qStr += ',`enServLog` = \''  + enServLog + '\'';
    }
    if(typeof fields.pollTime !== "undefined") {
      let pollTime = db.escape(fields.pollTime);
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'pollTime': pollTime}));
      qStr += ',`pollTime` = \'' + pollTime + '\'';
    }
    if(typeof fields.logFreq !== "undefined") {
      if(!fromWeb && doChkUSBLogging && devConf.enLog === 1) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
      }
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'logFreq': db.escape(fields.logFreq)}));
      qStr += ',`fixPoint` = \'' + db.escape(fields.logFreq) + '\'';
    }
    if(typeof fields.storCapacity !== "undefined") {
      if(!fromWeb && doChkUSBLogging && devConf.enLog === 1) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
      }
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'storCapacity': db.escape(fields.storCapacity)}));
      qStr += ',`storCapacity` = \'' + db.escape(fields.storCapacity) + '\'';
    }
    if(typeof fields.mbusTimeout !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'mbusTimeout': db.escape(fields.mbusTimeout)}));
      qStr += ',`mbusTimeout` = \'' + db.escape(fields.mbusTimeout) + '\'';
    }        
    if(typeof fields.enFtpCli !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'enFtpCli': db.escape(fields.enFtpCli)}));
      qStr += ',`enFtpCli` = \'' + db.escape(fields.enFtpCli) + '\'';
    }
    if(typeof fields.ftpPswd !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'ftpPswd': db.escape(fields.ftpPswd).substr(0, 1) + '******'}));
      qStr += ',`password` = \'' + db.escape(fields.ftpPswd) + '\'';
    }
    if(typeof fields.ftpCliHost !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'ftpCliHost': db.escape(fields.ftpCliHost)}));
      qStr += ',`ftpCliHost` = \'' + db.escape(fields.ftpCliHost) + '\'';
    }
    if(typeof fields.ftpCliPort !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'ftpCliPort': db.escape(fields.ftpCliPort)}));
      qStr += ',`ftpCliPort` = \'' + db.escape(fields.ftpCliPort) + '\'';
    }
    if(typeof fields.ftpCliAccount !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'ftpCliAccount': db.escape(fields.ftpCliAccount)}));
      qStr += ',`ftpCliAccount` = \'' + db.escape(fields.ftpCliAccount) + '\'';
    }
    if(typeof fields.ftpCliPswd !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'ftpCliPswd': db.escape(fields.ftpCliPswd).substr(0, 1) + '******'}));
      qStr += ',`ftpCliPswd` = \'' + db.escape(fields.ftpCliPswd) + '\'';
    }
    if(typeof fields.extra !== "undefined") {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'extra': db.escape(fields.extra)}));
      qStr += ',`extra` = \'' + db.escape(fields.extra) + '\'';
    }
    if(!fromWeb){ // from web
      qStr = (typeof fields.modbus !== "undefined") ? (qStr + ',`modbus` = \'' + fields.modbus + '\'') : qStr ;
    }

    // All Valid, Execute SQL
    qStr = qStr + ' WHERE `companyId` = ' + req.session.user.companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
    result = await(db.pr_wquery(dbsIdx, delQstr + qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // Reset device caches
    let hasRcmd = false;
    result = await(device.reset(dbsIdx, companyId, sn));
    devConf = await(device.get(dbsIdx, sn));
    if(mbusAction && doRstVal) {
      if(chgEnlog) {
        dbg({__file, __line, err: 'Don\'t remove the register value if changed logging setting only!'});
      } else if(mbusType === iotype.APP_SWITCH || mbusType === iotype.APP_BTN) {
        hasRcmd = true;
        devConf.rcmd.uniqPush(mbusHaddr + '=' + mbusOffVal);
      } else {
        hasRcmd = true;
        devConf.rcmd.uniqPush(mbusHaddr + '=-');
        for(let mbusAddr of [mbusIaddr, mbusJaddr, mbusLaddr]) {
          if(mbusAddr) {
            devConf.rcmd.uniqPush(mbusAddr + '=-');
          }
        }
      }
    } else if(fromWeb){ // from web
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name}));
    }

    // Send DL=1 to device
    if(doSndDL) {
      hasRcmd = true;
      devConf.rcmd.uniqPush('DL=1');
    }

    // Save back to database if have any rcmd
    if(hasRcmd) {
      await(device.set(dbsIdx, sn, devConf));
    }

    // Reset profile caches
    await(ctrlblk.reset(dbsIdx, companyId, sn));
    return res.status(gstate.RC_OK).send({desc: gstate.OK, rd: '/device/edit/' + hex2mac(sn)});
  }));
});

// Only for testing
router.get('/fake/reg', (req, res) => {
  if (!req.session.user || !req.session.user.superAdmin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.query.sn || !req.query.num) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ERR_DATA});
  }

  let enlog = req.query.enlog ? true : false;
  let num = parseInt(req.query.num);
  let sn = mac2hex(req.query.sn);
  let dbsIdx = await(device.getDBSIdx(sn));
  if(dbsIdx < 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  let querys = {};
  let companyId = devConf.companyId;
  let modbus = [];
  for(let i = 0; i < num; i++) {
    let addr = 40001 + i;
    let mbusObj = {
      id   : (Date.now().toString(36).substr(3) + Math.random().toString(36).substr(2, 4)),
      desc : addr,
      type : 0,
      haddr: addr,
      laddr: '',
      enlog: enlog ? '1' : '0',
    };
    if(enlog) {
      querys[addr] = db.createLogTable(dbsIdx, sn, addr, mbusObj);
    }
    modbus.push(mbusObj);
  }
  await(querys);

  let qStr;
  if(enlog) {
    qStr = 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `enServLog` = 1, `modbus` = \'' + toJsonStr(modbus, {__file, __line, sn}) + '\' WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  } else {
    qStr = 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `modbus` = \'' + toJsonStr(modbus, {__file, __line, sn}) + '\' WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  }
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  // Reset device caches
  await(mbval.removeAll(dbsIdx, sn));
  await(device.reset(dbsIdx, companyId, sn));
  await(device.addRcmds(dbsIdx, sn, ['DL=1']));

  // Reset profile caches
  await(ctrlblk.reset(dbsIdx, companyId, sn));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

const numUsedRegs = (profile) => {
  let count = 0;
  for(let prof of profile) {
    if(!prof) {
      continue;
    }
    for(let addr of ['haddr','iaddr','jaddr','laddr']) {
      if(utils.has(prof[addr])) {
        count++;
      }            
    }
  }
  // dbg('Register count = ' + count);
  return count;
};

const importSlvRegs = (sn, slvIdx, origMbus, newMbus) => {
  origMbus = toJson(origMbus, {__file, __line, sn});
  if(!Array.isArray(origMbus)) {
    origMbus = [];
  }

  // Remove origin registers
  for(let i = 0; i < origMbus.length; i++) {
    if(slvIdx === getSlvId(origMbus[i].haddr)) {
      delete origMbus[i];
    }
  }
  origMbus = origMbus.filter(Boolean);

  // Append new registers
  for(let i = 0; i < newMbus.length; i++) {
    for(let addr of ['haddr','iaddr','jaddr','laddr']) {
      if(newMbus[i][addr] && newMbus[i][addr].toString().length === 6) {
        newMbus[i][addr] = slvIdx + '' + newMbus[i][addr];
      } else {
        newMbus[i][addr] = '';
      }            
    }
  }
  return origMbus.concat(newMbus);
};

router.post('/import', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let sn = mac2hex(db.escape(fields.sn));
    let slvIdx = parseInt(db.escape(fields.slvIdx));
    let devConf = await(device.get(dbsIdx, sn));
    if(!devConf || !model.isCloudEnabler(devConf.mo)) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } else if(devConf.enLog === 1) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
    } else if(!files || files.length === 0 || !files.profile) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_FILE});
    }
    fs.readFile(files.profile.path, async((err, data) => {
      fs.unlink(files.profile.path);
      if(err) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: err.toString()});
      } else if(!data || data.length === 0) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_RECORD});
      }
      // Get original modbus data for slvIdx
      let qStr = 'SELECT ' + ((slvIdx) ? '`modbus`' : '`name`') + ' FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
      let result = await(db.pr_query(dbsIdx, qStr));
      if (result.err) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      } else if(slvIdx && result.data.length === 0) {
        return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
      }
      data = toJson(data, {__file, __line, sn});
      if(!data) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
      }
      let numImportReg = 0;
      if(data.modbus) { // Evaluate I/O switch data if have
        let devQuerys = {};
        let modbus = toJson(data.modbus, {__file, __line, sn});
        for(let i = 0; i < modbus.length; i++) {
          modbus[i].id = (Date.now().toString(36).substr(3) + Math.random().toString(36).substr(2, 4));
          if(!modbus[i].swSN) {
            continue;
          }
          let swSN = mac2hex(modbus[i].swSN);
          if(!devQuerys[swSN]) {
            devQuerys[swSN] = device.get(dbsIdx, swSN);
          }
        }
        let devConfs = await(devQuerys);
        for(let i = 0; i < modbus.length; i++) {
          if(!modbus[i].swSN) {
            continue;
          }
          //No such device in this company
          let swSN = mac2hex(modbus[i].swSN);
          let devConf = devConfs[swSN];
          if(!devConf || devConf.companyId !== companyId) {
            dbg('Device ' + swSN + ' is not in company ' + companyId + ', dont import its data! ');
            delete modbus[i];
          }
        }
        data.modbus = modbus.filter(Boolean);
        numImportReg = numUsedRegs(modbus);
      } else {
        data.modbus = [];
      }

      // Prepare SQL command
      let doDevReset = false;
      let setSql = '';
      try {
        const MAX_REGS = model.getMaxReg(devConf.mo);
        if(model.isMbusMaster(data.mo) && model.isMbusMaster(devConf.mo)) {
          if(slvIdx) { // A slave device under Master CE
            if(typeof data.slvProfile === 'undefined') {
              throw gstate.INVALID_MODEL;
            }
            let slvRegs = importSlvRegs(sn, slvIdx, result.data[0].modbus, data.modbus);
            if(!slvRegs) {
              throw gstate.INVALID_DATA;
            } else if(numUsedRegs(slvRegs) > MAX_REGS) {
              throw gstate.NO_MORE_REGS;
            }
            slvRegs = toJsonStr(slvRegs, {__file, __line, sn});
            setSql = '`modbus` = ' + toJsonStr(slvRegs, {__file, __line, sn});
          } else if(typeof data.mstConf !== 'undefined' && typeof data.slvProfile === 'undefined') { // Master CE
            if(numImportReg > MAX_REGS) {
              throw gstate.NO_MORE_REGS;
            }
            let mstConf = toJsonStr(data.mstConf, {__file, __line, sn});
            mstConf = mstConf ? mstConf : '\'\'';
            data.modbus = toJsonStr(data.modbus, {__file, __line, sn});
            setSql = '`modbus` = ' + toJsonStr(data.modbus, {__file, __line, sn}) + ',`mstConf` = ' + mstConf;
            doDevReset = true;
          } else {
            throw gstate.INVALID_MODEL;
          }
        } else if(model.isCloudEnabler(data.mo) &&  !model.isMbusMaster(data.mo) && !model.isMbusMaster(devConf.mo)) { // Slave CE
          if(numImportReg > MAX_REGS) {
            throw gstate.NO_MORE_REGS;
          }
          data.modbus = toJsonStr(data.modbus, {__file, __line, sn});
          setSql = '`modbus` = ' + toJsonStr(data.modbus, {__file, __line, sn});
        } else {
          throw gstate.INVALID_MODEL;
        }
      } catch(err) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: err});
      }

      // Generate clear values
      let rmSwAddr = {};
      let rVals = {};
      let ctrlData = await(ctrlblk.get(dbsIdx, sn));
      if(ctrlData) {
        Object.keys(ctrlData).forEach((addr) => {
          if (slvIdx && slvIdx !== getSlvId(addr)) {
            return;
          }
          rVals[addr] = '-';
          rmSwAddr = iosw.remove(dbsIdx, sn, addr);
        });
      }
      await(rmSwAddr); // remove previous iosw log of this sn

      // import to database
      let clrLogStr = (slvIdx) ? '' : 'DROP DATABASE IF EXISTS `' + db.DB_RLOG + '_' + sn + '`;';
      qStr = 'UPDATE `' + db.TB_DEVICE + '` SET ' + setSql + ' WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\');';
      result = await(db.pr_wquery(dbsIdx, qStr + clrLogStr));
      if (result.err) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: result.err});
      }
      if(doDevReset) {
        await(device.reset(dbsIdx, companyId, sn));
      }

      // Generate reset values
      result   = await(ctrlblk.reset(dbsIdx, companyId, sn));
      ctrlData = await(ctrlblk.get(dbsIdx, sn));
      if(ctrlData) {
        let querys = {};
        Object.keys(ctrlData).forEach((addr) => {
          if (slvIdx && slvIdx !== getSlvId(addr)) {
            return;
          }
          // create table if not exists
          if(ctrlData[addr].enlog === '1') {
            querys['enlog-' + addr] = db.createLogTable(dbsIdx, sn, addr, ctrlData[addr]);
          }
          // reset default value
          if(ctrlData[addr].type === iotype.APP_SWITCH || ctrlData[addr].type === iotype.APP_BTN) {
            rVals[addr] = ctrlData[addr].off;
          } else {
            rVals[addr] = '-';
          }
          // Add iosw records
          if(iotype.isIOSW(ctrlData[addr].type)) {
            querys['iosw' + addr] = iosw.set(dbsIdx, sn, addr, mac2hex(ctrlData[addr].swSN), ctrlData[addr].swAddr);
          }
        });
        await(querys);
      }
      // Reply values
      let rcmds = ['DL=1'];
      let rcmdQuerys = {};
      Object.keys(rVals).forEach((addr) => {
        rcmdQuerys[addr] = mbval.remove(dbsIdx, sn, addr);
        rcmds.push(addr + '=' + rVals[addr]);
      });
      await(rcmdQuerys);
      await(device.addRcmds(dbsIdx, sn, rcmds));

      devConf = await(device.get(dbsIdx, sn));
      let adtData = (slvIdx) ? {'devName': devConf.name, 'slvIdx': slvIdx} : {'devName': devConf.name} ;
      await(audit.log(req.session.user, audit.ADTCODE.DEV_IMPORT, adtData));
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    }));
  }));
});

const devAuth = (req, authData) => {
  let sn = mac2hex(db.escape(authData.sn));
  let uid = req.session.user.id;
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `id` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return {code: gstate.RC_INTERNAL_ERR, err: result.err};
  } else if(result.data.length === 0) {
    return {code: gstate.RC_NOT_FOUND, err: gstate.NO_DEV};
  }

  let devConf = await(device.get(dbsIdx, sn));
  let devtbChanged = false;
  let deviceId = result.data[0].id;
  if(req.headers['content-type'].indexOf('application/json') >= 0) {
    let enMonitor = parseInt(db.escape(authData.enMonitor));
    let enControl = parseInt(db.escape(authData.enControl));
    let enAlarm = parseInt(db.escape(authData.enAlarm));
    if(devConf.enMonitor !== enMonitor ||
       devConf.enControl !== enControl ||
       devConf.enAlarm   !== enAlarm) {
      devtbChanged = true;
      qStr = 'UPDATE `' + db.TB_DEVICE + '` SET `enMonitor` = ' + enMonitor + ', `enControl` = ' + enControl + ', `enAlarm` = ' + enAlarm + ' WHERE `id` = ' + deviceId + ' AND `companyId` = ' + companyId + ' ;';
      devConf.enMonitor = enMonitor;
      devConf.enControl = enControl;
      devConf.enAlarm = enAlarm;
    }
    if(authData.members) {
      authData.members.forEach((member) => {
        let memberId = db.escape(member.memberId);
        enMonitor = db.escape(member.enMonitor);
        enControl = db.escape(member.enControl);
        enAlarm = db.escape(member.enAlarm);
        qStr += 'INSERT INTO `' + db.TB_DEVICE_AUTH +
            '` (`companyId`,`deviceId`,`memberId`,`enMonitor`,`enControl`,`enAlarm`) VALUES (' +
               companyId + ',' + deviceId + ',' + memberId + ',' + enMonitor + ',' + enControl + ',' + enAlarm +
            ') ON DUPLICATE KEY UPDATE `enMonitor` = ' + enMonitor + ', `enControl` = ' + enControl + ', `enAlarm`  =  ' + enAlarm + ';';
      });
    }
  } else {
    let type = db.escape(authData.type);
    let memberId = db.escape(authData.memberId);
    let enable = utils.isInputChecked(db.escape(authData.enable));
    if(memberId) {
      qStr = 'INSERT INTO `' + db.TB_DEVICE_AUTH + '` (`companyId`,`deviceId`,`memberId`,`' + type + '`) VALUES (' + companyId + ',' + deviceId + ',' + memberId + ',' + enable +
           ') ON DUPLICATE KEY UPDATE `' + type + '` = ' + enable + ';';
    } else {
      devtbChanged = true;
      qStr = 'UPDATE `' + db.TB_DEVICE + '` SET ' + '`' + type + '` = \'' + enable + '\'' + ' WHERE `id` = ' + deviceId + ' AND `companyId` = ' + companyId + ';';
      devConf[type] = enable;
    }
  }
  await(device.set(dbsIdx, sn, devConf));

  result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) {
    return {code: gstate.RC_INTERNAL_ERR, err: result.err};
  }
  return {code: gstate.OK};
};

router.put('/ftplog/:sn', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }    
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let sn = mac2hex(db.escape(req.params.sn));

  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf || (companyId !== devConf.companyId)) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }
  await(device.addRcmds(dbsIdx, sn, ['FTP=1']));

  const chkDevReceived = (retry) => {
    let devConf = await(device.get(dbsIdx, sn));
    if(devConf.rcmd.indexOf('FTP=1') < 0) {
      //dbg('device took FTP ');
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      // dbg('retry ' + retry);
      if(retry++ > 4) {  // waitef for 9 sec
        return res.status(gstate.RC_TIMEOUT).send({desc: gstate.TIMEOUT});
      }
      setTimeout(async(() => { await(chkDevReceived(retry)); }), 1500);
    }
  };
  setTimeout(async(() => { await(chkDevReceived(0)); }), 1500);
  await(audit.log(req.session.user, audit.ADTCODE.SND_FTP_LOG, {'devName': devConf.name}));
});

router.put('/reboot/:sn', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }     
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let sn = mac2hex(db.escape(req.params.sn));
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf || (companyId !== devConf.companyId)) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }
  let rebootCmd = 'INIT=' + sn.substr(6, 12);
  await(device.addRcmds(dbsIdx, sn, [rebootCmd]));

  const chkDevReceived = (retry) => {
    let devConf = await(device.get(dbsIdx, sn));
    if(devConf.rcmd.indexOf(rebootCmd) < 0) {
      // dbg('device took ' + rebootCmd);
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      // dbg('retry ' + retry);
      if(retry++ > 4) {  // waitef for 9 sec
        return res.status(gstate.RC_TIMEOUT).send({desc: gstate.TIMEOUT});
      }
      setTimeout(async(() => { await(chkDevReceived(retry)); }), 1500);
    }
  };
  setTimeout(async(() => { await(chkDevReceived(0)); }), 1500);
  await(audit.log(req.session.user, audit.ADTCODE.DEV_REBOOT, {'devName': devConf.name}));
});

// PUT /api/device/28:65:6b:00:00:01?type=kt-stm32
// PUT /api/device/28:65:6b:00:00:01?type=kt-6351x
// PUT /api/device/28:65:6b:00:00:01?type=kt-6351x&force=1
router.put('/fwupg/:sn', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let ioInfo;
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let sn = mac2hex(db.escape(req.params.sn));
  let type = db.escape(req.query.type); // ['kt-stm32', 'kt-6351x']
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  let adtData = {devName: devConf.name, type: type};
  let fwUrl = '';
  if(type.match(/kt-stm32/i)) {
    fwUrl = 'FWUPG=' + await(csid.get('C','KT_STM32_URL')) ;
  } else if(type.match(/kt-6351x/i)) {
    let KT_6351X_VER = await(csid.get('C','KT_6351X_VER'));
    let force = (req.query.force && req.query.force === 1) ? true : false;
    if(!force && KT_6351X_VER <= devConf.fwVer) {
      dbg('F/W is already the latest version!');
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ALREADY_LATEST_VER});
    }
    fwUrl = 'FWUPG=' + await(csid.get('C','KT_6351X_URL'));
    adtData.fwVer = KT_6351X_VER;
  }
  if(fwUrl) {
    await(device.addRcmds(dbsIdx, sn, [fwUrl]));
  } else {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let chkTimer;
  const chkDevReceived = (retry) => {
    let devConf = await(device.get(dbsIdx, sn));
    if(devConf.rcmd.indexOf(fwUrl) < 0) {
      //dbg('device took fwupg=xxx ');
      if(type.match(/kt-6351x/i)) {
        devConf.fwUpg = 1;
        devConf.uponce = true;
        device.setOffline(devConf);
      }
      clearTimeout(chkTimer);
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      // dbg('retry ' + retry);
      if(retry++ > 4) {  // waitef for 9 sec
        clearTimeout(chkTimer);
        return res.status(gstate.RC_TIMEOUT).send({desc: gstate.TIMEOUT});
      }
      chkTimer = setTimeout(async(() => { await(chkDevReceived(retry)); }), 1500);
    }
  };
  chkTimer = setTimeout(async(() => { await(chkDevReceived(0)); }), 1500);
  await(audit.log(req.session.user, audit.ADTCODE.SND_FWUPG, adtData));
});

router.put('/auth', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let isJson = (req.headers['content-type'].indexOf('application/json') >= 0) ? true : false ;
  if(isJson && req.body.devices) { // bulk edit
    for(let i = 0; i < req.body.devices.length; i++) {
      let result = await(devAuth(req, req.body.devices[i]));
      if(result.err) {
        dbg({__file, __line, err: result.err});
        return res.status(result.code).send({desc: result.err});
      }
    }
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  } else { // one edit
    let result = await(devAuth(req, req.body));
    if(result.err) {
      dbg({__file, __line, err: result.err});
      return res.status(result.code).send({desc: result.err});
    }
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }
});

router.put('/swmac', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let exchg = mac2hex(db.escape(fields.exchg));
    let srcSN = mac2hex(db.escape(fields.srcSN));
    let srcConf = await(device.get(dbsIdx, srcSN));
    if(!srcConf || !model.isCloudEnabler(srcConf.mo)) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } 
    
    let dstSN = mac2hex(db.escape(fields.dstSN));
    let dstConf = await(device.get(dbsIdx, dstSN));
    if(!dstConf || !model.isCloudEnabler(dstConf.mo)) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    }         

    if(srcSN === dstSN) { // only for different device
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    } else if(srcConf.mo !== dstConf.mo) { // must be the same model
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_MODEL});
    } else if(exchg === '1' && ( srcConf.sn2 || dstConf.sn2))  { // either one have been binded
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ALREADY_SWMAC});
    } else if(exchg === '0' && (!srcConf.sn2 || !dstConf.sn2)) { // either one is not being binded
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ALREADY_SWMAC});
    } else if(exchg === '0' && (srcConf.sn2 !== dstSN || dstConf.sn2 !== srcSN )) { // not belong to each other
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ALREADY_SWMAC});
    } 

    if(exchg === '1') {  // switch devices
      srcConf.sn2 = dstSN;
      dstConf.sn2 = srcSN;
    } else if(exchg === '0') {  // restore
      delete srcConf.sn2;
      delete dstConf.sn2;
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    srcConf.rcmd.uniqPush('DL=1');
    dstConf.rcmd.uniqPush('DL=1');
    await(device.set(dbsIdx, srcSN, srcConf));
    await(device.set(dbsIdx, dstSN, dstConf));
    await(audit.log(req.session.user, ((exchg === '1') ? audit.ADTCODE.SWITCH_MAC : audit.ADTCODE.SWITCH_BACK), { srcSN: hex2mac(srcSN), dstSN: hex2mac(dstSN) }));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.put('/:sn/status', (req, res) => {
  let ioInfo;
  let dbsIdx = req.session.user.dbsIdx;
  let sn = mac2hex(db.escape(req.params.sn));
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }
  let wronce = db.escape(req.body.wronce);
  let addr = db.escape(req.body.addr);
  addr = (addr !== '') ? addr.toUpperCase() : addr ;

  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(!ctrlData || !ctrlData[addr]) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_RECORD});
  }

  let type = parseInt(ctrlData[addr].type);
  if(!(iotype.isAppWRable(type) || (iotype.isWrOnce(type) && wronce === '1'))) { 
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_ALLOW_WR});
  }

  let mbDataNew = {};
  let val = db.escape(req.body.val);
  if(type === iotype.APP_BTN) {
    if(parseInt(val, 16) === parseInt(ctrlData[addr].on, 16)) {
      let btnTime = (ctrlData[addr].btnTime) ? parseInt(ctrlData[addr].btnTime) : 10;
      mbDataNew[addr] = val;
      devConf.rcmd.uniqPush(addr + '=' + val);

      setTimeout(async(() => {
        let offVal = padZero(ctrlData[addr].off, 4).toUpperCase();
        let offData = {};
        offData[addr] = offVal;

        let devConf = await(device.get(dbsIdx, sn));
        devConf.rcmd.uniqPush(addr + '=' + offVal);
        await(device.set(dbsIdx, sn, devConf, offData));
      }), btnTime * 1000);
    }
  } else {
    if(wronce === '1') { // Reset cloud value
      val = val; //mbDataNew[addr] = '';
    } else if(await(mbval.get(dbsIdx, sn, addr)) !== val) {
      mbDataNew[addr] = val;
    }
    devConf.rcmd.uniqPush(addr + '=' + val);
  }

  // 32/64 bits low addr/val
  for(let [addrIdx, valIdx] of [['iaddr','ival'], ['jaddr','jval'], ['laddr','lval']]) {
    if(utils.isNone(req.body[addrIdx]) || utils.isNone(req.body[valIdx])) {
      continue;
    }
    let laddr = db.escape(req.body[addrIdx]).toUpperCase();
    if(!ctrlData[laddr]) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_RECORD});
    }
    let ltype = parseInt(ctrlData[laddr].type);
    if(!(iotype.isAppWRable(ltype) || (iotype.isWrOnce(ltype) && wronce === '1'))) { 
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_ALLOW_WR});
    }        
    let val = db.escape(req.body[valIdx]);
    if(wronce === '1') {
      val = val; //mbDataNew[laddr] = '';
    } else if(await(mbval.get(dbsIdx, sn, laddr)) !== val) {
      mbDataNew[laddr] = val;
    }
    devConf.rcmd.uniqPush(laddr + '=' + val);
  }
  await(device.set(dbsIdx, sn, devConf, mbDataNew));

  // Prepare log data
  let logData = {
    'devName': devConf.name,
    'regName': ctrlData[addr].desc,
    'type': ctrlData[addr].type,
    'haddr': addr,
    'hval': req.body.val,
  };
  if(ctrlData[addr].fpt) {
    logData.fpt = ctrlData[addr].fpt;
  }

  for(let [addrIdx, valIdx] of [['iaddr','ival'], ['jaddr','jval'], ['laddr','lval']]) {
    if(!ctrlData[addr][addrIdx]) {
      continue;
    }
    logData[addrIdx] = req.body[addrIdx];
    logData[valIdx] = req.body[valIdx];        
  }    
  await(audit.log(req.session.user, audit.ADTCODE.SET_REG, logData));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

router.delete('/:sn/evtlog/clear', (req, res) => {
  let sn = mac2hex(db.escape(req.params.sn));
  let userId = req.session.user.id;

  let companyId, dbsIdx;
  if((req.session.user.company === 'KSMT Microtech' || req.session.user.admin === 2) && req.query.companyId) {
    dbsIdx = req.query.dbsIdx;
    companyId = req.query.companyId;
  } else {
    dbsIdx = req.session.user.dbsIdx;
    companyId = req.session.user.companyId;
  }

  let filter = '';
  if (req.query.t) {
    filter += 'WHERE `time` = \'' + db.escape(req.query.t) + '\'';
  } else if (req.query.st && req.query.et) {
    filter += 'WHERE `time` BETWEEN \'' + db.escape(req.query.st) + '\' AND \'' + db.escape(req.query.et) + '\'';
  } else if (req.query.st && !req.query.et) {
    filter += 'WHERE `time` >= \'' + db.escape(req.query.st) + '\'';
  } else if (!req.query.st && req.query.et) {
    filter += 'WHERE `time` <= \'' + db.escape(req.query.et) + '\'';
  }

  let qStr = 'DELETE FROM `' + db.TB_EVTLOG + '_' + sn + '` ' + filter ;
  if(!req.session.user.admin) {
    let enControl = 'SET @enControl = (SELECT `enControl` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enControl` = 1)); ';

    let enMonitor = 'SET @enMonitor = (SELECT `enMonitor` FROM `' + db.TB_DEVICE_AUTH +
      '` WHERE `memberId` = ' + userId +
      '    AND `companyId` = ' +  companyId +
      '    AND `deviceId` = (SELECT `id` FROM `' + db.TB_DEVICE + '`' +
        '  WHERE `companyId` = ' + companyId +
        '    AND `sn` = UNHEX(\'' + sn + '\')' +
        '    AND `enMonitor` = 1)); ';

    qStr = enControl + enMonitor + qStr + ' AND (@enMonitor = 1 OR @enControl = 1) ';
  }

  let result = await(db.pr_wquery(dbsIdx, qStr + ';'));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  if(!req.session.user.admin) {
    result.data.shift(); // remove set @enControl
    result.data.shift(); // remove set @enMonitor
  }
  if (result.data && result.data.length > 0) {
    let devConf = await(device.get(dbsIdx, sn));
    await(audit.log(req.session.user, audit.ADTCODE.CLEAR_EVTLOG, {'devName': devConf.name}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  } else { // No such device
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV + ' or ' + gstate.NO_RECORD});
  }
});

router.delete('/:sn', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = req.session.user.dbsIdx;
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else if(devConf.sn2) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.ALREADY_SWMAC});
  } else if(devConf.enLog === 1) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
  }

  let parentId = -1;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  qStr    += 'SELECT `parentId` FROM `' + db.TB_COMPANY + '` WHERE `id` = ' + companyId + ' LIMIT 1;';

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else {
    parentId = result.data[1].parentId;
  }

  qStr = 'SET @deviceId = (SELECT `id` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\')) ;' +
       'DELETE FROM `' + db.TB_DEVICE      + '` WHERE `companyId` = ' + companyId + ' AND `id` = @deviceId ; ' +
       'DELETE FROM `' + db.TB_DEVICE_AUTH + '` WHERE `companyId` = ' + companyId + ' AND `deviceId` = @deviceId ;' +
       'DROP TABLE IF EXISTS `' + db.TB_EVTLOG + '_' + sn + '` ;' +
       'DROP DATABASE IF EXISTS `' + db.DB_RLOG + '_' + sn + '` ;' +
       // 'DROP TABLE IF EXISTS `' + db.TB_MCACHE + '_' + sn + '` ;' +
       // 'UPDATE `' + db.TB_MCACHE + '` SET `type` = 9 WHERE `key` = \'' + db.TB_MCACHE + '_' + sn + '\';' +
       'DELETE FROM `' + db.TB_IOSW + '` WHERE `sn` = UNHEX(\'' + sn + '\');' +
       'DELETE FROM `' + db.TB_IOSW + '` WHERE `swSN` = UNHEX(\'' + sn + '\');' +
       'DELETE FROM `' + db.TB_ALARM_LOG  + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');' +
       'DELETE FROM `' + db.TB_IOSTAT_LOG + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');' +
       'DELETE FROM `' + db.TB_GROUP      + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');' +
       'DELETE FROM `' + db.TB_ADVGP_MBR  + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');' ;

  if(parentId > 0) {
    qStr += 'DELETE FROM `' + db.TB_ALARM_LOG  + '` WHERE `companyId` = ' + parentId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  }

  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  let devName = devConf.name;
  await(device.stopFastPT(dbsIdx, sn));
  await(utils.sleep(100)); // wait for ioreg
  await(device.remove(dbsIdx, sn)); // remove mcache table
  await(audit.log(req.session.user, audit.ADTCODE.DELETE_DEV, {'devName': devName}));
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    rd: '/device',
  });
});

module.exports = router;
