const express = require('express');
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
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
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const model = require(prj.ROOT_PATH + '/public/js/model');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const getSlvId = require(prj.LIB_PATH + '/utils').getSlvId;
const getFCode = require(prj.LIB_PATH + '/utils').getFCode;
const getMbusAddr = require(prj.LIB_PATH + '/utils').getMbusAddr;

// GET /api/slvdev/:sn&?id=:id  get setting of this slave device
router.get('/:sn', (req, res) => {
  let nowMsec = Date.now();
  let sn = mac2hex(db.escape(req.params.sn));
  let id = (typeof req.query.id === 'undefined') ? -1 : parseInt(db.escape(req.query.id));
  let dbsIdx = req.session.user.dbsIdx;
  let userId = req.session.user.id;
  let companyId = req.session.user.companyId;
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }
  let qStr = 'SELECT `' + db.TB_DEVICE + '`.`mstConf` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId ;
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

  let mstConf = utils.toJson(result.data[0].mstConf, {__file, __line, sn: req.params.sn});
  if(id > -1 && mstConf) {
    if(mstConf[id]) {
      return res.send({desc: gstate.OK, slvDev: mstConf[id]});
    } else {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
    }
  } else if(!mstConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  } else {
    return res.send({desc: gstate.OK, slvDevs: mstConf});
  }
});

const isDupSlvId = (mstConf, comPort, slvId) => {
  let found = false;
  if(!mstConf || !comPort || !slvId) {
    return found;
  }
  Object.keys(mstConf).forEach((id) => {
    //dbg(mstConf[id].comPort + ',' + comPort + ',' + mstConf[id].slvId + ',' + slvId);
    if(mstConf[id].type === 'TCP') {
      return;
    } else if(mstConf[id].comPort === comPort && mstConf[id].slvId === parseInt(slvId)) {
      found = true;
      return;
    }
  });
  return found;
};

const isDupTCPSetting = (mstConf, id, fields) => {
  let ip, port, slvId;
  if(mstConf[id]) { // edit
    ip    = (fields.ip)    ? fields.ip              : mstConf[id].ip;
    port  = (fields.port)  ? parseInt(fields.port)  : mstConf[id].port;
    slvId = (fields.slvId) ? parseInt(fields.slvId) : ((mstConf[id].slvId) ? mstConf[id].slvId : 255);
  } else { // new
    ip    = fields.ip;
    port  = parseInt(fields.port);
    slvId = parseInt(fields.slvId);
  }
  let found = false;
  Object.keys(mstConf).forEach((idx) => {
    if(id === parseInt(idx)) {
      return;
    } else if(mstConf[idx].type !== 'TCP') {
      return;
    }
    if(mstConf[idx].ip    === ip    &&
       mstConf[idx].port  === port  &&
       mstConf[idx].slvId === slvId) {
      found = true;
    }
  });
  return found;
};

const validInputForm = (devConf, fields, mstConf, id) => {
  if(fields.addNewDev) {
    if(!fields.name || fields.name.length > 32 || !utils.valStr(fields.name)) {
      return 'Invalid name (Max size: 32)';
    }
  } else {
    if(fields.name && (fields.name.length > 32 || !utils.valStr(fields.name))) {
      return 'Invalid name (Max size: 32)';
    }
  }
  if(!model.isMbusMaster(devConf.mo)) {
    return 'Not modbus master device';
  }
  if(fields.enable) {
    fields.enable = utils.isInputChecked(db.escape(fields.enable));
    if(!utils.vaildRange(fields.enable, 0, 1)) {
      return 'Invalid enable (Accept: 0 or 1)';
    }
  }
  if(fields.timeout && !utils.vaildRange(fields.timeout, 100, 60000)) {
    return 'Invalid timeout (Range : 100 ~ 60000)';
  }
  if(fields.delayPoll && !utils.vaildRange(fields.delayPoll, 0, 60000)) {
    return 'Invalid delayPoll (Range : 0 ~ 60000)';
  }
  if(fields.maxRetry && !utils.vaildRange(fields.maxRetry, 1, 1000)) {
    return 'Invalid maxRetry (Range : 1 ~ 1000)';
  }
  if(fields.addNewDev) {
    if(fields.type === 'Serial') {
      if(!fields.comPort || (fields.comPort !== 'COM0' && fields.comPort !== 'COM1')) {
        return 'Invalid serial port (COM Port shoud be: COM0, COM1)';
      } else if(!fields.slvId || !utils.vaildRange(fields.slvId, 1, 254)) {
        return 'Invalid slave id (slvId range : 1 ~ 254)';
      } else if(isDupSlvId(mstConf, fields.comPort, fields.slvId)) {
        return 'The slave setting has been used';
      }
    } else if(fields.type === 'TCP') {
      if(!fields.ip || !fields.port || !utils.vaildRange(fields.port, 1, 65535)) {
        return 'Invalid TCP/IP settings for modbus master';
      } else if(fields.slvId && !utils.vaildRange(fields.slvId, 1, 255)) {
        return 'Invalid slave id (slvId range : 1 ~ 255)';
      } else if(isDupTCPSetting(mstConf, id, fields)) {
        return 'The slave setting has been used';
      }
    } else {
      return 'Invalid master type (Should be Serial, or TCP)';
    }
  } else { // Edit
    if(mstConf[id].type === 'TCP') {
      if(fields.port && !utils.vaildRange(fields.port, 1, 65535)) {
        return 'Invalid TCP/IP settings for modbus master';
      } else if(fields.slvId && !utils.vaildRange(fields.slvId, 1, 255)) {
        return 'Invalid slave id (slvId range : 1 ~ 255)';
      } else if(isDupTCPSetting(mstConf, id, fields)) {
        return 'The slave setting has been used';
      }
    } else {
      if(fields.comPort && (fields.comPort !== 'COM0' && fields.comPort !== 'COM1')) {
        return 'Invalid serial port (COM Port shoud be: COM0, COM1)';
      } else if(fields.comPort && isDupSlvId(mstConf, fields.comPort, mstConf[id].slvId)) {
        return 'The slave setting has been used';
      } else if(fields.slvId && isDupSlvId(mstConf, mstConf[id].comPort, fields.slvId)) {
        return 'The slave setting has been used';
      } else if(fields.slvId && !utils.vaildRange(fields.slvId, 1, 254)) {
        return 'Invalid slave id (slvId range : 1 ~ 254)';
      }
    }
  }
  return;
};

const availId = (mstConf) => {
  let _mstConf = Object.keys(mstConf);
  for(let i = 1; i < 10; i++) {
    let found = false;
    for(let j = 0; j < _mstConf.length; j++) {
      let id = parseInt(_mstConf[j]);
      if(id === i) {
        found = true;
        break;
      }
    }
    if(!found) {
      return i;
    }
  }
  return -1; // no available id
};

router.post('/update', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let sn = mac2hex(db.escape(fields.sn));
    let dbsIdx = req.session.user.dbsIdx;
    let devConf = await(device.get(dbsIdx, sn));
    if(!devConf) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } else if(devConf.enLog === 1) { // register action
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
    }

    let companyId = req.session.user.companyId;
    let qStr = 'SELECT `mstConf` FROM `' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId + ';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    } else  if (result.data.length === 0) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    }

    fields.addNewDev = false;
    let id = (typeof fields.id === 'undefined') ? -1 : parseInt(db.escape(fields.id));
    let type = db.escape(fields.type);
    let time = Date.now();
    let mstConf = utils.toJson(result.data[0].mstConf, {__file, __line, sn: fields.sn});
    if(mstConf && (id > -1)) { // update
      if(!mstConf[id]) { // not found
        return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
      }
    } else if(mstConf && (id < 0)) { // another new one
      let MAX_SLVDEV = await(csid.get('C','MAX_SLVDEV','int'));
      let numConfs = Object.keys(mstConf);
      id = availId(mstConf);
      if(numConfs.length >= MAX_SLVDEV || id < 0) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_DEVICE});
      }
      fields.addNewDev = true;
    } else if(!mstConf && (id > -1)) { // not found
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
    } else { // first one
      mstConf = {};
      id = 1;
      fields.addNewDev = true;
    }

    // // Chcek form fields
    let err = validInputForm(devConf, fields, mstConf, id);
    if(err) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: err});
    }

    let name = db.escape(fields.name);
    let ip = db.escape(fields.ip);
    let port = parseInt(db.escape(fields.port));
    let comPort = db.escape(fields.comPort);
    let slvId = parseInt(db.escape(fields.slvId));
    let timeout = parseInt(db.escape(fields.timeout));
    let delayPoll = parseInt(db.escape(fields.delayPoll));
    let maxRetry = parseInt(db.escape(fields.maxRetry));
    let enable = fields.enable;
    if(fields.addNewDev) { // Add
      mstConf[id] = {};
      mstConf[id].name = name;
      mstConf[id].enable = enable;
      mstConf[id].type = type;

      if(type === 'TCP') {
        mstConf[id].ip = ip;
        mstConf[id].port = port;
        mstConf[id].slvId = (slvId) ? slvId : 255;
      } else {
        mstConf[id].comPort = comPort;
        mstConf[id].slvId = slvId;
      }
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': name}));
    } else { // Edit
      if(typeof fields.name !== 'undefined' && mstConf[id].name !== name) {
        await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': name, 'origName': mstConf[id].name}));
        mstConf[id].name = name;
      }
      if(typeof fields.enable !== 'undefined' && mstConf[id].enable !== enable) {
        await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'enable': enable}));
        mstConf[id].enable = enable;
      }
      if(typeof fields.timeout !== 'undefined' && mstConf[id].timeout !== timeout) {
        await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'timeout': timeout}));
        mstConf[id].timeout = timeout;
      }
      if(typeof fields.delayPoll !== 'undefined' && mstConf[id].delayPoll !== delayPoll) {
        await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'delayPoll': delayPoll}));
        mstConf[id].delayPoll = delayPoll;
      }
      if(typeof fields.maxRetry !== 'undefined' && mstConf[id].maxRetry !== maxRetry) {
        await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'maxRetry': maxRetry}));
        mstConf[id].maxRetry = maxRetry;
      }
      if(mstConf[id].type === 'TCP') { // TCP
        if(typeof fields.ip !== 'undefined' && mstConf[id].ip !== ip) {
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'ip': ip}));
          mstConf[id].ip = ip;
        }
        if(typeof fields.port !== 'undefined' && mstConf[id].port !== port) {
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'port': port}));
          mstConf[id].port = port;
        }
        if(typeof fields.slvId !== 'undefined' && mstConf[id].slvId !== slvId) {
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'slvId': slvId}));
          mstConf[id].slvId = slvId;
        }
      } else { // RTU/ASCII
        if(typeof fields.comPort !== 'undefined' && mstConf[id].comPort !== comPort) {
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'comPort': comPort}));
          mstConf[id].comPort = comPort;
        }
        if(typeof fields.slvId !== 'undefined' && mstConf[id].slvId !== slvId) {
          await(audit.log(req.session.user, audit.ADTCODE.EDIT_DEV, {'devName': devConf.name, 'slvDevName': mstConf[id].name, 'slvId': slvId}));
          mstConf[id].slvId = slvId;
        }
      }
    }

    // Write to database
    qStr = 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `mstConf` = \'' + utils.toJsonStr(mstConf, {__file, __line, sn: fields.sn}) + '\' WHERE `sn` = UNHEX(\'' + sn + '\') AND `companyId` = ' + companyId + ';';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    await(device.reset(dbsIdx, companyId, sn));
    await(device.addRcmds(dbsIdx, sn, ['DL=1']));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.delete('/:sn/:id', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }

  let sn = mac2hex(db.escape(req.params.sn));
  let dbsIdx = req.session.user.dbsIdx;
  let devConf = await(device.get(dbsIdx, sn));
  if(!devConf) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  } else if(devConf.enLog === 1) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DEV_LOGGING});
  }

  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `mstConf`,`modbus` FROM `' + db.TB_DEVICE + '` WHERE `companyId` = ' + companyId + ' AND `sn` = UNHEX(\'' + sn + '\');';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }

  // Remove slave config by id
  let id = parseInt(db.escape(req.params.id));
  let mstConf = utils.toJson(result.data[0].mstConf, {__file, __line, sn: req.params.sn});
  if(!mstConf || !mstConf[id])  {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_DEV});
  }
  delete mstConf[id];
  mstConf = (Object.keys(mstConf).length > 0) ? utils.toJsonStr(mstConf, {__file, __line, sn: req.params.sn}) : '';

  // Remove all registers (according to this slvId)
  let rcmds = ['DL=1'];
  let delQstr = '';
  let modbus  = '';
  if(result.data[0].modbus) {
    let delCmds = {};
    modbus = utils.toJson(result.data[0].modbus, {__file, __line, sn: req.params.sn});
    for(let i = 0; i < modbus.length; i++) {
      if(id !== getSlvId(modbus[i].haddr)) {
        continue;
      }
      delQstr += 'DELETE FROM `' + db.TB_GROUP + '` WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + modbus[i].haddr + '\'; ';

      // remove log table and modbus val
      delCmds['log-' + sn + modbus[i].haddr] = db.deleteLogTable(dbsIdx, sn, modbus[i].haddr);
      delCmds['mbv-' + sn + modbus[i].haddr] = mbval.remove(dbsIdx, sn, modbus[i].haddr);
      delCmds['iosw-' + sn + modbus[i].haddr] = iosw.remove(dbsIdx, sn, modbus[i].haddr);
      rcmds.push(modbus[i].haddr + '=-');

      // Reset modbus lval
      for(let laddr of ['iaddr','jaddr','laddr']) {
        if(modbus[i][laddr]) { // if 32/64 bits register
          delCmds['log-' + sn + modbus[i][laddr]] = mbval.remove(dbsIdx, sn, modbus[i][laddr]);
          rcmds.push(modbus[i][laddr] + '=-');
        }
      }
      delete modbus[i];
    }
    modbus = modbus.filter(Boolean);
    modbus = utils.toJsonStr(modbus, {__file, __line, sn: req.params.sn});
    await(delCmds); // do reset and remove
  }

  qStr = delQstr + 'UPDATE `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` SET `mstConf` = \'' + mstConf + '\', `modbus` = \'' + modbus + '\' WHERE `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\');';
  result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }

  //Reset device -> mcaches
  await(device.reset(dbsIdx, companyId, sn));
  await(device.addRcmds(dbsIdx, sn, rcmds));
  await(ctrlblk.reset(dbsIdx, companyId, sn));
  await(audit.log(req.session.user, audit.ADTCODE.DELETE_DEV, {'devName': devConf.name, 'slvDevName': devConf.name}));
  return res.status(gstate.RC_OK).send({desc: gstate.OK});
});

module.exports = router;
