const express = require('express');
const router = express.Router();
const util = require('util');
const fs = require('fs');
const formidable = require('formidable');
const prj = require('../project');
const md5 = require(prj.LIB_PATH + '/pswd').md5;
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
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
const audit = require(prj.LIB_PATH + '/audit');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const toJson = utils.toJson;
const toJsonStr = utils.toJsonStr;

const getNameById = (dbsIdx, companyId, id) => {
  let qStr = 'SELECT `name` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  return {data: result.data[0].name};
};

const getInfoById = (dbsIdx, companyId, id) => {
  let qStr = 'SELECT `name`,`parentId`,`config` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = \'' + companyId + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  result.data[0].config = toJson(result.data[0].config, {__file, __line});
  return {data: result.data[0]};
};

/*
   group list
   group: [
    {
    id: xxx,
    name: xx,
    hasSub: true,
    }, {
    id: xxx,
    name: xxx,
    hasSub: false,
    }
  ]
 */
router.get('/', (req, res) => {
  let MAX_GROUP_QUERY = await(csid.get('C','MAX_GROUP_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_GROUP_QUERY) ? db.escape(req.query.num): MAX_GROUP_QUERY;
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `id`,`name`,`parentId` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = \'' + companyId + '\' LIMIT ' + num + ' OFFSET ' + from + ';';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  // find all head group
  let gdata = result.data;
  let pIds = [];
  for (let i = 0; i < gdata.length; i++) {
    if(gdata[i].parentId !== 0) {
      pIds.push(gdata[i].parentId);
    }
  }
  // group result
  let groups = [];
  for (let i = 0; i < gdata.length; i++) {
    if(gdata[i].parentId === 0) {
      groups.push({
        id: gdata[i].id,
        name: gdata[i].name,
        gnext: ((pIds.indexOf(gdata[i].id) < 0) ? false : true)
      });
    }
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: result.data.length,
    from: ((from) ? from : 0),
    groups: groups,
  });
});

/*
   L2 group list
   groups: [
    {
    id: xxx,
    name: xx,
    }, {
    id: xxx,
    name: xxx,
    }
  ]
 */
router.get('/sub/:id', (req, res) => {
  let MAX_GROUP_QUERY = await(csid.get('C','MAX_GROUP_QUERY','int'));
  let from = (req.query.from) ? parseInt(db.escape(req.query.from)) : 0;
  let num  = (req.query.num && parseInt(req.query.num) < MAX_GROUP_QUERY) ? db.escape(req.query.num): MAX_GROUP_QUERY;
  let id = db.escape(req.params.id);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let result = await(getNameById(dbsIdx, companyId, id));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
  }
  let gname = result.data;
  let qStr = 'SELECT `id`,`name` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = \'' + companyId + '\' AND `parentId` = \'' + id + '\' LIMIT ' + num + ' OFFSET ' + from + ';';
  result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    total: result.data.length,
    from: ((from) ? from : 0),
    groups: result.data,
  });
});

// Get config by group id
router.get('/id/:id', (req, res) => {
  let id = db.escape(req.params.id);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let qStr = 'SELECT `name`,`parentId`,`config` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\' LIMIT 1;';
  let result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  } else if(result.data.length === 0) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
  }
  result.data[0].config = toJson(result.data[0].config, {__file, __line});
  return res.status(gstate.RC_OK).send({desc: gstate.OK, group: result.data});
});

// Get members by group id
router.get('/mbr/:id', (req, res) => {
  let id = db.escape(req.params.id);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let result = await(getNameById(dbsIdx, companyId, id));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
  }
  let gname = result.data;
  let qStr = 'SELECT `id`, LOWER(HEX(`sn`)) AS `sn`, `addr` FROM `' + db.TB_ADVGP_MBR + '` WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\';';
  result = await(db.pr_query(dbsIdx, qStr));
  if (result.err) {
    return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
  }
  for (let i = 0; i < result.data.length; i++) {
    result.data[i].sn = hex2mac(result.data[i].sn);
  }
  return res.status(gstate.RC_OK).send({
    desc: gstate.OK,
    name: gname,
    gmbrs: result.data,
  });
});

router.get('/status/:id', (req, res) => {
  let id = db.escape(req.params.id);
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let userId = req.session.user.id;
  let qStr = '';
  if (req.session.user.admin) {
    qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`, `addr` FROM `' + db.TB_ADVGP_MBR + '` WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\';';
  } else {
    qStr = 'SELECT LOWER(HEX(`'+ db.TB_ADVGP_MBR   + '`.`sn`)) AS `sn`, `'   + db.TB_ADVGP_MBR   + '`.`addr`, `' + db.TB_DEVICE_AUTH + '`.`enControl` FROM `' + db.TB_GROUP + '`' +
           'LEFT JOIN `' + db.TB_DEVICE      + '` `device` on `'      + db.TB_DEVICE      + '`.`sn` = `'  + db.TB_ADVGP_MBR   + '`.`sn`' +
           'LEFT JOIN `' + db.TB_DEVICE_AUTH + '` `device_auth` ON `' + db.TB_DEVICE_AUTH + '`.`deviceId` = `' + db.TB_DEVICE + '`.`id`' +
           'WHERE `'     + db.TB_ADVGP_MBR   + '`.`companyId` = '  + companyId +
           ' AND `'      + db.TB_ADVGP_MBR   + '`.`id` = '         + id        +
           ' AND `'      + db.TB_DEVICE_AUTH + '`.`memberId`  = '  + userId    +
           ' AND (`'     + db.TB_DEVICE_AUTH + '`.`enMonitor` = 1' +
           '  OR  `'     + db.TB_DEVICE_AUTH + '`.`enControl` = 1)';
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
        if(!swLaddr) {
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
        } else if(iotype.is64bit(swCtrlblk.swType)){
          let swIaddr = swCtrlblk[swHaddr].iaddr;
          let swJaddr = swCtrlblk[swHaddr].jaddr;
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
          mbQuerys[swSN + ':' + swIaddr] = mbval.get(dbsIdx, swSN, swIaddr);
          mbQuerys[swSN + ':' + swJaddr] = mbval.get(dbsIdx, swSN, swJaddr);
          mbQuerys[swSN + ':' + swLaddr] = mbval.get(dbsIdx, swSN, swLaddr);
        } else if(iotype.is48bit(swCtrlblk.swType)){
          let swIaddr = swCtrlblk[swHaddr].iaddr;
          mbQuerys[swSN + ':' + swHaddr] = mbval.get(dbsIdx, swSN, swHaddr);
          mbQuerys[swSN + ':' + swIaddr] = mbval.get(dbsIdx, swSN, swIaddr);
          mbQuerys[swSN + ':' + swLaddr] = mbval.get(dbsIdx, swSN, swLaddr);                    
        } else if(iotype.is32bit(swCtrlblk.swType)){
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

  // Ready for res.sned()
  let devcnfs = {};
  let iostats = [];
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
      status: (device.isOffline(devConf) ? 0 : 1)
    };
    if(devConf.slvDev) {
      devcnfs[h2mSn].slvDev = devConf.slvDev;
    }

    // Set PollingTime for device
    device.startFastPT(devConf);

    // I/O Registers
    let ioObj;
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

          for(let opt of ['fpt','on','off','btnTime','unit','dt','up','low','max','min']) {
            if(utils.has(swCtrlblk[swHaddr][opt])) {
              ioObj[opt] = swCtrlblk[swHaddr][opt];
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

        for(let opt of ['dt','up','low','max','min']) {
          if(utils.has(ctrlData[addr][opt])) {
            ioObj[opt] = ctrlData[addr][opt];
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

/*
Group Add

1. body: { name:, sn: xxx, addr: xxx } // add group
2. body: { name: xxx, parentId: xxx, sn: xxx, addr: xxx } // add sub group
3. body: { id: xxx, sn: xxx, addr: xxx } // add group member
 */
router.post('/add', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let addMember = false;
    if(fields.sn && fields.addr && (fields.id || fields.name)) { // add level-1/2 group member
      addMember = true;
    } else if(fields.name && fields.sname) {
      addMember = false;
    } else {
      return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
    }

    let qStr = '';
    let dbsIdx = req.session.user.dbsIdx;
    let companyId = req.session.user.companyId;
    let id = db.escape(fields.id);
    let parentId = db.escape(fields.parentId);
    let sn = db.escape(fields.sn);
    let addr = db.escape(fields.addr);
    let name = db.escape(fields.name);
    let sname = db.escape(fields.sname);
    let result;
    if(id) { // existed group
      result = await(getNameById(dbsIdx, companyId, id));
      if(result.err) {
        return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
      }

      // get the number of group member
      let MAX_GROUP_MEMBER = await(csid.get('C','MAX_GROUP_MEMBER','int'));
      qStr = 'SELECT `id` FROM `' + db.TB_ADVGP_MBR + '` WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\';';
      result = await(db.pr_query(dbsIdx, qStr));
      if(result.err) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      } else if(result.data.length >= MAX_GROUP_MEMBER) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_GROUP_MEMBER});
      }
    } else { // new group
      let MAX_GROUP = await(csid.get('C','MAX_GROUP','int'));
      qStr = 'SELECT DISTINCT(`id`) FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = ' + companyId + ';';
      result = await(db.pr_query(dbsIdx, qStr));
      if(result.err) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      } else if(result.data.length >= MAX_GROUP) {
        return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.MAX_GROUP});
      }
    }

    // Level-1 Group
    let auditName = name;
    if(name && parentId) { // Add a sub-group under the group
      qStr = 'INSERT INTO `' + db.TB_ADVGP_HDR + '` (`companyId`,`name`,`parentId`) VALUES (\'' + companyId + '\',\'' + name + '\',\'' + parentId + '\');' ;
    } else if(name) { // Add level-1 group
      qStr = 'INSERT INTO `' + db.TB_ADVGP_HDR + '` (`companyId`,`name`) VALUES (\'' + companyId + '\',\'' + name + '\');' ;
    } else {
      qStr = '';
    }
    if(qStr) {
      result = await(db.pr_wquery(dbsIdx, qStr));
      if (result.err || !result.data[0]) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      }
      id = result.data[0].insertId;
      await(audit.log(req.session.user, audit.ADTCODE.NEW_GROUP, {'groupName': auditName}));
    }

    // Level-2 Group
    if(name && sname && id) {  // Add level-2 group
      auditName = sname;
      qStr = 'INSERT INTO `' + db.TB_ADVGP_HDR + '` (`companyId`,`name`,`parentId`) VALUES (\'' + companyId + '\', \'' + sname + '\', \'' + id + '\');' ;
      result = await(db.pr_wquery(dbsIdx, qStr));
      if (result.err || !result.data[0]) {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      }
      id = result.data[0].insertId;
      await(audit.log(req.session.user, audit.ADTCODE.NEW_GROUP, {'groupName': auditName}));
    }

    // Add group member
    if(addMember) {
      qStr = 'INSERT INTO `' + db.TB_ADVGP_MBR + '` (`companyId`,`id`,`sn`,`addr`) VALUES (\'' + companyId + '\',\'' + id + '\', UNHEX(\'' + mac2hex(sn) + '\'), \'' + addr + '\');' ;
      result = await(db.pr_wquery(dbsIdx, qStr));
      if (result.status === gstate.OK) {
        await(audit.log(req.session.user, audit.ADTCODE.NEW_GROUP, {'groupName': auditName, 'groupMember': [{'sn': sn, 'addr': addr}]}));
      } else if(result.err && result.err.code === 'ER_DUP_ENTRY') {
        return res.status(gstate.RC_CREATED).send({desc: gstate.DUP_GROUP});
      } else {
        return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
      }
    }
    return res.status(gstate.RC_OK).send({desc: gstate.OK, id: id});
  }));
});

router.put('/edit/:id', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  } else if(!req.headers['content-type'].match('multipart/form-data')) {
    return res.status(gstate.RC_BAD_REQUEST).send({desc: gstate.INVALID_DATA});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let id = db.escape(req.params.id);
  let result = await(getInfoById(dbsIdx, companyId, id));
  if(result.err) {
    return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
  }
  let ginfo = result.data;
  let form = new formidable.IncomingForm();
  form.parse(req, async((error, fields, files) => {
    let name = db.escape(fields.name);
    if(name && ginfo.name === name) { // no change!
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    }
    let qStr = 'UPDATE `' + db.TB_ADVGP_HDR + '` SET `name` = \'' + name + '\' WHERE `companyId` = \'' + companyId + '\' AND `id` = \'' + id + '\';';
    let result = await(db.pr_wquery(dbsIdx, qStr));
    if (result.status === gstate.OK) {
      await(audit.log(req.session.user, audit.ADTCODE.EDIT_GROUP, {'groupName': name}));
      return res.status(gstate.RC_OK).send({desc: gstate.OK});
    } else {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }
  }));
});

router.delete('/:id', (req, res) => {
  if (!req.session.user.admin) {
    return res.status(gstate.RC_NO_AUTH).send({desc: gstate.NO_PERMISSION});
  }
  let dbsIdx = req.session.user.dbsIdx;
  let companyId = req.session.user.companyId;
  let id = db.escape(req.params.id);
  if(req.query.sn && req.query.addr) { // only remove member
    let sn = mac2hex(db.escape(req.query.sn));
    let addr = db.escape(req.query.addr);
    let result = await(getNameById(dbsIdx, companyId, id));
    if(result.err) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
    }

    let gname = result.data;
    let qStr = 'DELETE FROM `'  + db.TB_ADVGP_MBR + '` WHERE `id` = \'' + id + '\' AND `companyId` = \'' + companyId + '\' AND `sn` = UNHEX(\'' + sn + '\') AND `addr` = \'' + addr + '\';';
    result = await(db.pr_wquery(dbsIdx, qStr));
    if(result.status === gstate.OK && result.data[0].affectedRows === 0) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_REG});
    } else if (result.status === gstate.OK) {
      await(audit.log(req.session.user, audit.ADTCODE.DELETE_GROUP, {'groupName': gname, 'groupMember': [{'sn': sn, 'addr': addr}]}));
      return res.status(gstate.RC_OK).send({desc: gstate.OK, rd: '/group'});
    } else {
      return res.status(gstate.RC_INTERNAL_ERR).send({desc: ((prj.DEBUG_MODE) ? result.err : gstate.DB_ERROR)});
    }
  } else { // remove all related group
    let result = await(getInfoById(dbsIdx, companyId, id));
    if(result.err) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
    }

    // Get all related groups
    let ginfo = result.data;
    let qStr = 'SELECT `id`,`name`,`parentId` FROM `' + db.TB_ADVGP_HDR + '` WHERE `companyId` = ' + companyId + ' AND (`parentId` = ' + id + ' OR `id` = ' + id + '); ';
    result = await(db.pr_query(dbsIdx, qStr));
    if(result.err) {
      return res.status(gstate.RC_NOT_FOUND).send({desc: gstate.NO_GROUP});
    }

    // Remove groups
    let sgrp = result.data;
    for(let i = 0; i < sgrp.length; i++) {
      qStr  = 'DELETE FROM `'  + db.TB_ADVGP_HDR + '` WHERE `id` = \'' + sgrp[i].id + '\' AND `companyId` = \'' + companyId + '\';';
      qStr += 'DELETE FROM `'  + db.TB_ADVGP_MBR + '` WHERE `id` = \'' + sgrp[i].id + '\' AND `companyId` = \'' + companyId + '\';';
      result = await(db.pr_wquery(dbsIdx, qStr));
      if(result.err) {
        info({__file, __line, err: result.err});
      }
    }
    await(audit.log(req.session.user, audit.ADTCODE.DELETE_GROUP, {'groupName': ginfo.name}));
    return res.status(gstate.RC_OK).send({desc: gstate.OK, rd: '/group'});
  }
});

module.exports = router;
