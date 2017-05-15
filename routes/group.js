const express = require('express');
const router = express.Router();
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const asyncUtils = require('async');
const prj = require('../project');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const device = require(prj.LIB_PATH + '/device');
const mbval = require(prj.LIB_PATH + '/mbval');
const mcache = require(prj.LIB_PATH + '/mcache');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const hex2mac = require(prj.LIB_PATH + '/utils').hex2mac;
const csid = require(prj.LIB_PATH + '/csid');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const model = require(prj.ROOT_PATH + '/public/js/model');
const audit = require(prj.LIB_PATH + '/audit');
const async = require('asyncawait/async');
const await = require('asyncawait/await');

router.get('/', (req, res) => {
  let MAX_GROUP_QUERY = await(csid.get('C','MAX_GROUP_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_GROUP_QUERY) ? db.escape(req.query.num): MAX_GROUP_QUERY;
  let companyId = req.session.user.companyId;
  let dbsIdx = req.session.user.dbsIdx;
  let userId = req.session.user.id;

  let qStr = '';
  if(req.session.user.admin) { // admin
    qStr = 'SELECT DISTINCT(`name`) FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ' LIMIT ' + num + ' OFFSET ' + from + ';';
  } else { //user
    qStr  = 'SELECT DISTINCT(`' + db.TB_GROUP + '`.`name`) FROM `' + db.TB_GROUP + '`' ;
    qStr += 'LEFT JOIN `' + db.TB_DEVICE + '` `' + db.TB_DEVICE + '` on `' + db.TB_DEVICE + '`.`sn` = `' + db.TB_GROUP + '`.`sn`';
    qStr += 'LEFT JOIN `' + db.TB_DEVICE_AUTH + '` `' + db.TB_DEVICE_AUTH + '` on `' + db.TB_DEVICE_AUTH + '`.`deviceId` = `' + db.TB_DEVICE + '`.`id`';
    qStr += 'WHERE `' + db.TB_GROUP + '`.`companyId` = \'' + companyId + '\'' ;
    qStr += ' AND  `' + db.TB_DEVICE_AUTH + '`.`memberId` = ' + userId;
    qStr += ' AND (`' + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1 OR `' + db.TB_DEVICE_AUTH + '`.`enControl` = 1)';
    qStr += 'LIMIT ' + num + ' OFFSET ' + from + ';';
  }
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) { // name list
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  let groups = [];
  for (let i = 0; i < result.data.length; i++) {
    groups.push(result.data[i].name);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: groups.length,
    from: ((from) ? from : 0),
    groups: groups,
  });
});

router.get('/:name', (req, res) => {
  let MAX_GROUP_MEMBER = await(csid.get('C','MAX_GROUP_MEMBER','int'));
  let name = db.escape(req.params.name);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let userId = req.session.user.id;

  let qStr = '';
  if(req.session.user.admin) { // admin
    qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`, `addr` FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ' AND `name` = \'' + name + '\' LIMIT ' + MAX_GROUP_MEMBER + ';';
  } else { //user
    qStr  = 'SELECT `' + db.TB_GROUP + '`.`name` FROM `' + db.TB_GROUP + '`' ;
    qStr += 'LEFT JOIN `' + db.TB_DEVICE + '` `' + db.TB_DEVICE + '` on `' + db.TB_DEVICE + '`.`sn` = `' + db.TB_GROUP + '`.`sn`';
    qStr += 'LEFT JOIN `' + db.TB_DEVICE_AUTH + '` `' + db.TB_DEVICE_AUTH + '` on `' + db.TB_DEVICE_AUTH + '`.`deviceId` = `' + db.TB_DEVICE + '`.`id`';
    qStr += 'WHERE `' + db.TB_GROUP + '`.`companyId` = \'' + companyId + '\'' ;
    qStr += ' AND  `' + db.TB_GROUP + '`.`name` = \'' + name + '\'' ;
    qStr += ' AND  `' + db.TB_DEVICE_AUTH + '`.`memberId` = ' + userId;
    qStr += ' AND (`' + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1 OR `' + db.TB_DEVICE_AUTH + '`.`enControl` = 1)';
    qStr += 'LIMIT ' + MAX_GROUP_MEMBER + ';';
  }

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if (!result.data || result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
  }

  for (let i = 0; i < result.data.length; i++) {
    result.data[i].sn = hex2mac(result.data[i].sn);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    name: name,
    member: result.data,
  });
});

router.get('/status/:name', (req, res) => {
  let MAX_GROUP_MEMBER = await(csid.get('C','MAX_GROUP_MEMBER','int'));
  let name = db.escape(req.params.name);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let userId = req.session.user.id;

  let qStr = '';
  if (req.session.user.admin) {
    qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`, `addr` FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ' AND `name` = \'' + name + '\' LIMIT ' + MAX_GROUP_MEMBER + ';';
  } else {
    qStr = 'SELECT LOWER(HEX(`' + db.TB_GROUP + '`.`sn`)) AS `sn`, `' + db.TB_GROUP + '`.`addr`, `' + db.TB_DEVICE_AUTH + '`.`enControl` FROM `' + db.TB_GROUP + '`' +
           'LEFT JOIN `' + db.TB_DEVICE + '` `device` on `' + db.TB_DEVICE + '`.`sn` = `' + db.TB_GROUP + '`.`sn`' +
           'LEFT JOIN `' + db.TB_DEVICE_AUTH  + '` `device_auth` on `' + db.TB_DEVICE_AUTH + '`.`deviceId` = `' + db.TB_DEVICE + '`.`id`' +
           'WHERE `'     + db.TB_GROUP  + '`.`companyId` = ' + companyId +
           ' AND `'      + db.TB_GROUP + '`.`name` = \''  + name + '\'' +
           ' AND `'      + db.TB_DEVICE_AUTH + '`.`memberId` = ' + userId +
           ' AND (`'     + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1'  +
           '  OR  `'     + db.TB_DEVICE_AUTH + '`.`enControl` = 1)' +
           'LIMIT ' + MAX_GROUP_MEMBER + ';';
  }

  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_RECORD});
  }

  // Get all devices config in this group from mcaches
  let devQuerys = {};
  let ctrlblkQuerys = {};
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn.toLowerCase();
    devQuerys[sn] = device.get(dbsIdx, sn);
    ctrlblkQuerys[sn] = ctrlblk.get(dbsIdx, sn);
  }
  let devConfs = await(devQuerys);
  let ctrlDatas = await(ctrlblkQuerys);

  // Get iosw profiles
  let ioswQuerys = {};
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn.toLowerCase();
    let devConf = devConfs[sn];
    let ctrlData = ctrlDatas[sn];
    if(!devConf || !ctrlData) {
      continue;
    }
    let addr = result.data[i].addr;
    if(!ctrlData[addr]) {
      continue;
    } else if(ctrlData[addr].limitId && ctrlData[addr].limitId.indexOf(userId) >= 0) {
      continue; // Found in limit list, No register permission
    }
    let type = ctrlData[addr].type;
    if(iotype.isIOSW(type) && ctrlData[addr].swSN && ctrlData[addr].swAddr) {
      let swSN = mac2hex(ctrlData[addr].swSN);
      if(ctrlDatas[swSN]) {
        ioswQuerys[swSN] = ctrlDatas[swSN];
      } else {
        ioswQuerys[swSN] = ctrlblk.get(dbsIdx, swSN);
      }
    }
  }
  let ioswCtrlblks = await(ioswQuerys);

  // Get all mbval from mcaches
  let mbQuerys = {};
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn.toLowerCase();
    let devConf = devConfs[sn];
    let ctrlData = ctrlDatas[sn];
    if(!devConf || !ctrlData) {
      continue;
    }
    let addr = result.data[i].addr;
    if(!ctrlData[addr]) {
      continue;
    } else if(ctrlData[addr].limitId && ctrlData[addr].limitId.indexOf(userId) >= 0) {
      continue; // Found in limit list, No register permission
    }
    let type = ctrlData[addr].type;
    if(iotype.isIOSW(type) && ctrlData[addr].swSN && ctrlData[addr].swAddr) {
      let swSN = mac2hex(ctrlData[addr].swSN);
      let swHaddr = (ctrlData[addr].swAddr).split('-')[0];
      let swCtrlblk = ioswCtrlblks[swSN];
      if(!swCtrlblk || !swCtrlblk[swHaddr] || (ctrlData[addr].swId && ctrlData[addr].swId !== swCtrlblk[swHaddr].id)) { // Reponsed profile changed
        // Type error
      } else {
        let swLaddr = swCtrlblk[swHaddr].laddr;
        let swType = swCtrlblk[swHaddr].type;
        if(!swLaddr) {
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
        } else if(iotype.is64bit(swType)){
          let swIaddr = swCtrlblk[swHaddr].iaddr;
          let swJaddr = swCtrlblk[swHaddr].jaddr;
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
          mbQuerys[swSN + ':' + swIaddr] = mbval.get(dbsIdx, swSN, swIaddr);
          mbQuerys[swSN + ':' + swJaddr] = mbval.get(dbsIdx, swSN, swJaddr);
          mbQuerys[swSN + ':' + swLaddr] = mbval.get(dbsIdx, swSN, swLaddr);
        } else if(iotype.is48bit(swType)){
          let swIaddr = swCtrlblk[swHaddr].iaddr;
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
          mbQuerys[swSN + ':' + swIaddr] = mbval.get(dbsIdx, swSN, swIaddr);
          mbQuerys[swSN + ':' + swLaddr] = mbval.get(dbsIdx, swSN, swLaddr);                    
        } else if(iotype.is32bit(swType)){
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
          mbQuerys[swSN + ':' + swLaddr] = mbval.get(dbsIdx, swSN, swLaddr);
        } else { // 16bits
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
        }
      }
    } else {
      let laddr = ctrlData[addr].laddr;
      if(!laddr) {
        mbQuerys[sn + ':' +  addr] = mbval.get(dbsIdx, sn,  addr);
      } else if(iotype.is64bit(type)) {
        let iaddr = ctrlData[addr].iaddr;
        let jaddr = ctrlData[addr].jaddr;
        mbQuerys[sn + ':' +  addr] = mbval.get(dbsIdx, sn,  addr);
        mbQuerys[sn + ':' + iaddr] = mbval.get(dbsIdx, sn, iaddr);
        mbQuerys[sn + ':' + jaddr] = mbval.get(dbsIdx, sn, jaddr);
        mbQuerys[sn + ':' + laddr] = mbval.get(dbsIdx, sn, laddr);
      } else if(iotype.is48bit(type)) {
        let iaddr = ctrlData[addr].iaddr;
        mbQuerys[sn + ':' +  addr] = mbval.get(dbsIdx, sn,  addr);
        mbQuerys[sn + ':' + iaddr] = mbval.get(dbsIdx, sn, iaddr);
        mbQuerys[sn + ':' + laddr] = mbval.get(dbsIdx, sn, laddr);                
      } else if(iotype.is32bit(type)) {
        mbQuerys[sn + ':' +  addr] = mbval.get(dbsIdx, sn,  addr);
        mbQuerys[sn + ':' + laddr] = mbval.get(dbsIdx, sn, laddr);
      } else { // 16bits
        mbQuerys[sn + ':' +  addr] = mbval.get(dbsIdx, sn,  addr);
      }
    }
  }
  let mbVals = await(mbQuerys);

  // Ready for res.send()
  let iostats = [];
  let devcnfs = {};
  for (let i = 0; i < result.data.length; i++) {
    let sn = result.data[i].sn.toLowerCase();
    let devConf = devConfs[sn];
    if(!devConf) {
      continue;
    }
    let h2mSn = hex2mac(sn);
    devcnfs[h2mSn] = {
      mo: devConf.mo,
      name: devConf.name,
      enLog: devConf.enLog,
      enServLog: devConf.enServLog,
      logFreq: devConf.logFreq,
      lastUpdate: devConf.lastUpdate,
      status: (device.isOffline(devConf) ? 0 : 1)
    };
    if(model.isMbusMaster(devConf.mo)) {
      devcnfs[h2mSn].slvDev = devConf.slvDev;
      if(devConf.slvStat) {
        devcnfs[h2mSn].slvStat = devConf.slvStat;
      }
    }

    // Set PollingTime for device
    device.startFastPT(devConf);

    let ioObj;
    let mbData;
    let addr = result.data[i].addr;
    let ctrlData = ctrlDatas[sn];
    if(ctrlData && ctrlData[addr]) {
      if(ctrlData[addr].limitId && ctrlData[addr].limitId.indexOf(userId) >= 0) {
        continue; // Found in limit list, No register permission
      }
      let type = ctrlData[addr].type;
      ioObj = {
        id: ctrlData[addr].id,
        sn: h2mSn,
        type: type,
        enlog: ctrlData[addr].enlog,
        desc: ctrlData[addr].desc,
      };

      // I/O switch
      if(iotype.isIOSW(type) && ctrlData[addr].swSN && ctrlData[addr].swAddr) {
        let swSN = mac2hex(ctrlData[addr].swSN);
        let swHaddr = (ctrlData[addr].swAddr).split('-')[0];
        let swCtrlblk = ioswCtrlblks[swSN];
        if(!swCtrlblk || !swCtrlblk[swHaddr] || (ctrlData[addr].swId && ctrlData[addr].swId !== swCtrlblk[swHaddr].id)) { // Reponsed profile changed
          ioObj.swType = iotype.TYPE_ERROR;
          if(iotype.is32bit(type)) {
            ioObj.haddr = addr;
            ioObj.hval  = '';                         
            ioObj.laddr = '';
            ioObj.lval  = '';
          } else if(iotype.is48bit(type)) {
            ioObj.haddr = addr;
            ioObj.hval  = '';
            ioObj.iaddr = '';
            ioObj.ival  = '';
            ioObj.laddr = '';
            ioObj.lval  = '';                        
          } else if(iotype.is64bit(type)) {
            ioObj.haddr = addr;
            ioObj.hval  = '';
            ioObj.iaddr = '';
            ioObj.ival  = '';
            ioObj.jaddr = '';
            ioObj.jval  = '';                        
            ioObj.laddr = '';
            ioObj.lval  = '';
          } else {
            ioObj.haddr = addr;
            ioObj.hval  = '';                          
          }
        } else {
          ioObj.swType = swCtrlblk[swHaddr].type;
          let swLaddr = swCtrlblk[swHaddr].laddr;
          if(!swLaddr) {
            ioObj.haddr  = addr;
            ioObj.hval   = mbVals[swSN + ':' + swHaddr];
            ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;   
          } else if(iotype.is64bit(ioObj.swType)) {
            ioObj.haddr  = addr;
            ioObj.hval   = mbVals[swSN + ':' + swHaddr];
            ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;   

            ioObj.iaddr  = ctrlData[addr].iaddr;
            ioObj.ival   = mbVals[swSN + ':' + swCtrlblk[swHaddr].iaddr];
            ioObj.ival   = utils.isNone(ioObj.ival) ? '' : ioObj.ival;

            ioObj.jaddr  = ctrlData[addr].jaddr;
            ioObj.jval   = mbVals[swSN + ':' + swCtrlblk[swHaddr].jaddr];
            ioObj.jval   = utils.isNone(ioObj.jval) ? '' : ioObj.jval;
            
            ioObj.laddr  = ctrlData[addr].laddr;
            ioObj.lval   = mbVals[swSN + ':' + swLaddr];
            ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;
          } else if(iotype.is48bit(ioObj.swType)) {
            ioObj.haddr  = addr;
            ioObj.hval   = mbVals[swSN + ':' + swHaddr];
            ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;   

            ioObj.iaddr  = ctrlData[addr].iaddr;
            ioObj.ival   = mbVals[swSN + ':' + swCtrlblk[swHaddr].iaddr];
            ioObj.ival   = utils.isNone(ioObj.ival) ? '' : ioObj.ival;
            
            ioObj.laddr  = ctrlData[addr].laddr;
            ioObj.lval   = mbVals[swSN + ':' + swLaddr];
            ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;                        
          } else if(iotype.is32bit(ioObj.swType)) {
            ioObj.haddr  = addr;
            ioObj.hval   = mbVals[swSN + ':' + swHaddr];
            ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;   

            ioObj.laddr  = ctrlData[addr].laddr;
            ioObj.lval   = mbVals[swSN + ':' + swLaddr];
            ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;
          } else { // 16bits
            ioObj.haddr  = addr;
            ioObj.hval   = mbVals[swSN + ':' + swHaddr];
            ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;                        
          }
          // copy settings
          for(let key of ['fpt','on','off','btnTime','unit','dt','up','low','max','min','eq','virt']) {
            if(utils.has(swCtrlblk[swHaddr][key])) {
              ioObj[key] = swCtrlblk[swHaddr][key];
            }
          }
        }
      } else { // General Registers
        let laddr = ctrlData[addr].laddr;
        if(!laddr) {
          ioObj.haddr  = addr;
          ioObj.hval   = mbVals[sn + ':' + addr];
          ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;
        } else if(iotype.is64bit(type)) {
          ioObj.haddr  = addr;
          ioObj.hval   = mbVals[sn + ':' + addr];
          ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;

          ioObj.iaddr  = ctrlData[addr].iaddr;
          ioObj.ival   = mbVals[sn + ':' + ctrlData[addr].iaddr];
          ioObj.ival   = utils.isNone(ioObj.ival) ? '' : ioObj.ival;

          ioObj.jaddr  = ctrlData[addr].jaddr;
          ioObj.jval   = mbVals[sn + ':' + ctrlData[addr].jaddr];
          ioObj.jval   = utils.isNone(ioObj.jval) ? '' : ioObj.jval;                 

          ioObj.laddr  = laddr;
          ioObj.lval   = mbVals[sn + ':' + laddr];
          ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;
        } else if(iotype.is48bit(type)) {
          ioObj.haddr  = addr;
          ioObj.hval   = mbVals[sn + ':' + addr];
          ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;

          ioObj.iaddr  = ctrlData[addr].iaddr;
          ioObj.ival   = mbVals[sn + ':' + ctrlData[addr].iaddr];
          ioObj.ival   = utils.isNone(ioObj.ival) ? '' : ioObj.ival;

          ioObj.laddr  = laddr;
          ioObj.lval   = mbVals[sn + ':' + laddr];
          ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;                    
        } else if(iotype.is32bit(type)) {
          ioObj.haddr  = addr;
          ioObj.hval   = mbVals[sn + ':' + addr];
          ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;

          ioObj.laddr  = laddr;
          ioObj.lval   = mbVals[sn + ':' + laddr];
          ioObj.lval   = utils.isNone(ioObj.lval) ? '' : ioObj.lval;
        } else { // 16bits
          ioObj.haddr  = addr;
          ioObj.hval   = mbVals[sn + ':' + addr];
          ioObj.hval   = utils.isNone(ioObj.hval) ? '' : ioObj.hval;
        }

        // Show number of floating points of a floating value
        if(iotype.isFixPoint(type) || iotype.isIEEE754(type)) {
          ioObj.fpt = ctrlData[addr].fpt;
        }

        if(iotype.isNumber(type) && ctrlData[addr].unit) {
          ioObj.unit = ctrlData[addr].unit;
        }

        // copy settings
        for(let key of ['dt','up','low','max','min','eq','virt']) {
          if(utils.has(ctrlData[addr][key])) {
            ioObj[key] = ctrlData[addr][key];
          }
        }

        // Switch or Button ON/OFF value
        if(type === iotype.APP_SWITCH || type === iotype.APP_BTN) {
          ioObj.on = ctrlData[addr].on;
          ioObj.off = ctrlData[addr].off;
        }
      }
    } else { // the address might not exist or no longer use this address
      ioObj = {
        id: -1,
        sn: h2mSn,
        type: -1,
        desc: -1,
        enlog: 0,
        haddr: addr,
        hval: -1,
      };
    }

    // I/O Permission: Control
    ioObj.userControl = (req.session.user.admin) ? 1 : result.data[i].enControl;
    iostats.push(ioObj);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    devcnfs: devcnfs,
    iostats: iostats,
  });
});

//
// objs = [
//    {sn: , addr: },
//    {sn: , addr: },
//    ......
// ]
//
const removeDupEntry = (objs) => {
  if(!objs) { return; }
  try {
    let buffer = {};
    objs = JSON.parse(objs);
    for (let i = 0; i < objs.length; i++) {
      if(!objs[i].sn || !objs[i].addr) {
        continue;
      }
      if(!buffer[objs[i].sn]) {
        buffer[objs[i].sn] = {};
      }
      buffer[objs[i].sn][objs[i].addr] = 1;
    }
    let result = [];
    if(buffer) {
      Object.keys(buffer).forEach((sn, i) => {
        Object.keys(buffer[sn]).forEach((addr, j) => {
          result.push({
            sn: db.escape(sn),
            addr: db.escape(addr),
          });
        });
      });
    }
    if(result.length > 0) {
      return result;
    }
  } catch(e) {
    info(e.stack);
  }
  return;
};

const inMemberList = (list, sn, addr) => {
  for(let i = 0; i < list.length; i++) {
    if(list[i].sn.toLowerCase() === sn.toLowerCase() && list[i].addr === addr) {
      return true;
    }
  }
  return false;
};

router.post('/add', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let name = db.escape(fields.name);
    let qStr = 'SELECT DISTINCT(`name`) FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ';' ;
    let result = await(db.pr_query(dbsIdx, qStr)); // Check Group Name
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // Check max number of group
    let [MAX_GROUP, MAX_GROUP_MEMBER] = await([
      csid.get('C','MAX_GROUP','int'),
      csid.get('C','MAX_GROUP_MEMBER','int'),
    ]);
    let total = result.data.length;
    let found = false;  // Check if group exists or not
    for(let i = 0; i < result.data.length; i++) {
      if(result.data[i].name === name) {
        found = true;
      }
    }
    if(!found) { // not found, new group
      if(total >= MAX_GROUP) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_GROUP});
      }
    }

    // Get memebers
    qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`, `addr` FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ' AND `name` = \'' + name + '\';' ;
    result = await(db.pr_query(dbsIdx, qStr)); // Check Group Name
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // {sn: , addr: } or {member: [{sn: addr:}, {sn:, addr:} ... ]}
    let member;
    if(fields.sn && fields.addr) {
      member = [{'sn': fields.sn, 'addr': fields.addr}];
    } else {
      member = removeDupEntry(fields.member);
      if(!member) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.NO_GROUP_MEMBER});
      }
    }

    // Check the number of members
    let numgmbrs = result.data.length;
    if((numgmbrs + member.length) > MAX_GROUP_MEMBER) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_GROUP_MEMBER});
    }

    let groupMember = [];
    qStr = 'INSERT INTO `' + db.TB_GROUP + '` (`companyId`, `name`, `sn`, `addr`) VALUES ';
    for (let i = 0; i < member.length; i++) {
      let sn = db.escape(member[i].sn);
      let snHex = mac2hex(sn);
      let addr = db.escape(member[i].addr);
      if(inMemberList(result.data, snHex, addr)) {
        return res.status(gstate.RC_CREATED).send({desc: gstate.DUP_GROUP_MEMBER});
      }
      groupMember.push({'sn': sn, 'addr': addr});
      qStr += (i > 0) ? ',' : '' ;
      qStr += '(\'' + companyId + '\', \'' + name + '\', UNHEX(\'' + snHex + '\'), \'' + addr + '\')' ;
    }

    result = await(db.pr_wquery(dbsIdx, qStr + ';'));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    await(audit.log(req.session.user, audit.ADTCODE.NEW_GROUP, {'groupName': name, 'groupMember': groupMember}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK});
  }));
});

router.put('/rename', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }

  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let name = db.escape(fields.name);
    let origName = db.escape(fields.origName);
    if(!name || !origName) {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let MAX_GROUP = await(csid.get('C','MAX_GROUP','int'));
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let qStr = 'SELECT DISTINCT(`name`) AS `name` FROM `' + db.TB_GROUP + '` WHERE `companyId` = ' + companyId + ' LIMIT ' + MAX_GROUP + ' ';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    // check if gorup exists
    let found = false;
    for(let i = 0; i < result.data.length; i++) {
      if(result.data[i].name === origName) {
        found = true;
      } else if(result.data[i].name === name) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.DUP_GROUP});
      }
    }
    if(!found) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
    }

    // rename
    qStr = 'UPDATE `' + db.TB_GROUP + '` SET `name` = \'' + name + '\' WHERE `companyId` = ' + companyId + ' AND `name` = \'' + origName + '\';';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.err) {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }

    await(audit.log(req.session.user, audit.ADTCODE.EDIT_GROUP, {'groupName': name}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK, rd: '/group/edit/' + name});
  }));
});

router.delete('/:name', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let name = db.escape(req.params.name);
  let sn = mac2hex(db.escape(req.query.sn));
  let addr = db.escape(req.query.addr);
  let qStr = 'DELETE FROM `' + db.TB_GROUP + '` WHERE `name` = \'' + name + '\' AND `companyId` = \'' + companyId + '\' ';
  let adtMsg = {'groupName': name};
  if(sn && addr) {
    qStr += ' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` =  \'' + addr + '\'';
    adtMsg.groupMember = [{'sn': sn, 'addr': addr}];
  }

  let result = await(db.pr_wquery(dbsIdx, qStr + ';'));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  await(audit.log(req.session.user, audit.ADTCODE.DELETE_GROUP, adtMsg));
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    rd: '/group'
  });
});

module.exports = router;
