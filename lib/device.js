const prj = require('../project');
const asyncUtils = require('async');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const db = require(prj.DB_PATH);
const gstate = require(prj.GSTATE_PATH);
const utils = require(prj.LIB_PATH + '/utils');
const csid = require(prj.LIB_PATH + '/csid');
const iosw = require(prj.LIB_PATH + '/iosw');
const mcache = require(prj.LIB_PATH + '/mcache');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const model = require(prj.ROOT_PATH + '/public/js/model');
const alarm = require(prj.LIB_PATH + '/alarm');
const ALMCODE = alarm.ALMCODE;
const self = module.exports;

const statTimer = {};
const fastPtTimer = {};
let offTimeout = 180000;

module.exports.reset = (dbsIdx, companyId, sn) => {
  let filter = '' ;
  if(companyId) {
    filter = ' WHERE `companyId` = \'' + companyId + '\'';
    filter = (sn) ? filter + ' AND `sn` = UNHEX(\'' + sn + '\')' : filter ;
  } else if(sn) {
    filter = ' WHERE `sn` = UNHEX(\'' + sn + '\')';
  }

  let qStr = 'SELECT `id`,`companyId`, LOWER(HEX(`sn`)) AS `sn`,`mo`,`name`,`enAlarm`,`enControl`,`enMonitor`,`enLog`,`enServLog`,`pollTime`,`fixPoint`,`mstConf` FROM `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` ' + filter + ';';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if(result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }
  result.data.forEach((dev) => {
    let isNewConf = false;
    let devConf = await(mcache.get(dbsIdx, dev.sn, 'DEV-CONF'));
    if(devConf) { //reset
      devConf.dbsIdx      = dbsIdx;
      devConf.companyId   = dev.companyId;
      devConf.id          = dev.id;
      devConf.sn          = dev.sn;
      devConf.name        = dev.name;
      devConf.mo          = dev.mo;
      devConf.enLog       = dev.enLog;
      devConf.enServLog   = dev.enServLog;
      devConf.enAlarm     = dev.enAlarm;
      devConf.enControl   = dev.enControl;
      devConf.enMonitor   = dev.enMonitor;
      devConf.logFreq     = dev.fixPoint;
      devConf.pollTime    = ((dev.pollTime) ? dev.pollTime : 0);
    } else {
      isNewConf = true;
      devConf = {
        dbsIdx      : dbsIdx,
        companyId   : dev.companyId,
        id          : dev.id,
        sn          : dev.sn,
        name        : dev.name,
        mo          : dev.mo,
        enLog       : dev.enLog,
        enServLog   : dev.enServLog,
        enAlarm     : dev.enAlarm,
        enControl   : dev.enControl,
        enMonitor   : dev.enMonitor,
        pollTime    : ((dev.pollTime) ? dev.pollTime : 0),
        logFreq     : dev.fixPoint,
      };
    }

    // Update Slave edevice
    let mstConf = utils.toJson(dev.mstConf, {__file, __line, sn: dev.sn});
    if(mstConf) {
      delete devConf.slvDev;
      devConf.slvDev = {};
      Object.keys(mstConf).forEach((id) => {
        devConf.slvDev[id] = mstConf[id].name;
      });
    }

    if(filter.length > 0) { // set
      await(self.set(dbsIdx, dev.sn, devConf, null));
    } else if(isNewConf) { // init
      let result = await(mcache.create(dbsIdx, dev.companyId, dev.sn));
      if(!result.err) {
        await(self.set(dbsIdx, dev.sn, devConf));
      }
    }
  });
  return {status: gstate.OK};
};

module.exports.init = (dbsIdx) => {
  await(self.reset(dbsIdx, null, null));
};

module.exports.addRcmds = (dbsIdx, sn, rcmds) => {
  let pairs = {};
  while(rcmds.length > 0) {
    let rcmd = rcmds.shift();
    rcmd = rcmd.split('=');
    pairs['RCMD:' + rcmd[0]] = rcmd[1];
  }
  await(mcache.setPairs(dbsIdx, sn, pairs));
};

// called by APP only
module.exports.set = (dbsIdx, sn, newConf, mbData) => {
  delete newConf.slvStat;
  delete newConf.status;
  delete newConf.lastUpdate;
  delete newConf.seq;
  delete newConf.ip;

  // set device cofig
  let pairs = {};
  pairs['DEV-CONF'] = newConf;

  // modbus data
  if(mbData) {
    Object.keys(mbData).forEach((addr) => {
      pairs['MB-VAL:' + addr] = mbData[addr];
    });
  }

  // reponse command
  if(newConf.rcmd) {
    while(newConf.rcmd.length > 0) {
      let rcmd = newConf.rcmd.shift();
      rcmd = rcmd.split('=');
      pairs['RCMD:' + rcmd[0]] = rcmd[1];
    }
  }

  // save to mcache
  await(mcache.setPairs(dbsIdx, sn, pairs));

  // remove command from mcache
  if(newConf._rcmd) {
    let rcmds = [];
    while(newConf._rcmd.length > 0) {
      let rcmd = newConf._rcmd.shift();
      rcmd = rcmd.split('=');
      rcmds.uniqPush('RCMD:' + rcmd[0]);
    }
    delete newConf._rcmd;
    await(mcache.remove(dbsIdx, sn, rcmds));
  }
};

module.exports.isOffline = (devConf) => {
  if(devConf.fwUpg === 1) {
    return true; //f/w upgrading
  }
  let _offTimeout = (offTimeout) ? offTimeout : csid.mget('C','OFFLINE_TIMEOUT','int');
  if((Date.now() - devConf.lastUpdate) > (devConf.pollTime * 100 + offTimeout)) {
    return true;
  }
  return false;
};

module.exports.setOffline = (devConf) => {
  devConf.status = 0;
  delete devConf.slvStat;
  self.ceUpdate(devConf.sn, devConf);
  alarm.send({
    dbsIdx: devConf.dbsIdx,
    companyId: devConf.companyId,
    sn: devConf.sn,
    type: 0, // push only
    priority: 1,
    msgCode: ALMCODE.OFFLINE,
  });
  return self.stopStatTimer(devConf.sn);
};

// called by /ioreg only
module.exports.ceUpdate = (sn, updateConf, mbData) => {
  // update time for device
  let pairs = {};
  pairs['DEV-UPDATE'] = {
    seq:        (updateConf.seq)        ? updateConf.seq        : null,
    lastUpdate: (updateConf.lastUpdate) ? updateConf.lastUpdate : null,
    status:     (updateConf.status)     ? updateConf.status     : 0,
    slvStat:    (updateConf.slvStat)    ? updateConf.slvStat    : null,
  };

  if(updateConf.uponce) {
    pairs['DEV-UPONCE'] = {
      ip:    (updateConf.ip)    ? updateConf.ip    : null,
      fwVer: (updateConf.fwVer) ? updateConf.fwVer : 0,
      fwUpg: (updateConf.fwUpg) ? updateConf.fwUpg : 0,
    };
    delete updateConf.uponce;
  }    

  // modbus data
  if(mbData) {
    Object.keys(mbData).forEach((addr) => {
      pairs['MB-VAL:' + addr] = mbData[addr];
    });
  }

  // reponse command
  if(updateConf.rcmd) {
    while(updateConf.rcmd.length > 0) {
      let rcmd = updateConf.rcmd.shift();
      rcmd = rcmd.split('=');
      pairs['RCMD:' + rcmd[0]] = rcmd[1];
    }
  }

  // save to mcache
  let dbsIdx = updateConf.dbsIdx;
  await(mcache.setPairs(dbsIdx, sn, pairs));

  // remove command from mcache
  if(updateConf._rcmd) {
    let rcmds = [];
    while(updateConf._rcmd.length > 0) {
      let rcmd = updateConf._rcmd.shift();
      rcmd = rcmd.split('=');
      rcmds.uniqPush('RCMD:' + rcmd[0]);
    }
    await(mcache.remove(dbsIdx, sn, rcmds));
    delete updateConf._rcmd;
  }
};

// Single thread version
module.exports.getAll = () => {
  let ret = {};
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '`;';
  for(let i = 0; i < prj.DBS.length; i++) {
    let result = await(db.pr_query(i, qStr));
    if(result.err) { continue; }

    for(let j = 0; j < result.data.length; j++) {
      let sn = result.data[j].sn;
      if(ret[sn]) { 
        return; // duplication
      }
      ret[sn] = await(self.get(i, sn));   
    }
  }
  return ret;
};

// Multi thread version
module.exports.getAllMulti = () => {
  let ret = {};
  let querys = [];
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '`;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr);
  }

  let devs = {};
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(result.err) {
      continue;
    }
    for(let j = 0; j < result.data.length; j++) {
      let sn = result.data[j].sn;
      devs[sn] = self.get(i, sn);
    }
  }

  let devConfs = await(devs);
  for(let sn in devConfs) {
    let devConf = devConfs[sn];
    if(!devConf) {
      continue;
    }
    ret[sn] = devConf;
  }
  return ret;
};

module.exports.get = (dbsIdx, sn) => {
  let [conf, update, uponce, rcmd] = await([
    mcache.get(dbsIdx, sn, 'DEV-CONF'),
    mcache.get(dbsIdx, sn, 'DEV-UPDATE'),
    mcache.get(dbsIdx, sn, 'DEV-UPONCE'),
    mcache.getAll(dbsIdx, sn, 'RCMD'),
  ]);
  if(!conf) {
    return null;
  }

  // status from ioreg
  conf.seq        = (update && update.seq)        ? update.seq        : null ;
  conf.status     = (update && update.status)     ? update.status     : 0 ;
  conf.slvStat    = (update && update.slvStat)    ? update.slvStat    : null ;
  conf.lastUpdate = (update && update.lastUpdate) ? update.lastUpdate : null ;
  conf.ip         = (uponce && uponce.ip)         ? uponce.ip         : null ;
  conf.fwVer      = (uponce && uponce.fwVer)      ? uponce.fwVer      : 0 ;
  conf.fwUpg      = (uponce && uponce.fwUpg)      ? uponce.fwUpg      : 0 ;

  // reply
  let _rcmd = [];
  if(rcmd) {
    for(let key in rcmd) {
      _rcmd.push(key + '=' + rcmd[key]);
    }
  }
  conf.rcmd = _rcmd;
  return conf;
};

module.exports.remove = (dbsIdx, sn) => {
  await(mcache.remove(dbsIdx, sn));
};

module.exports.delCache = (sn) => {
   mcache.delCache(sn);
};

module.exports.getDBSIdx = (sn) => {
  let querys = [];
  let qStr = 'SELECT `id` FROM `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '` WHERE `sn` = UNHEX(\'' + sn + '\') LIMIT 1;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr);
  }
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if (result.err || result.data.length === 0) {
      continue;
    }
    return i;
  }
  return -1;
};

module.exports.stopFastPT = (dbsIdx, sn) => {
  clearTimeout(fastPtTimer[sn]);
  delete fastPtTimer[sn];
  mcache.remove(dbsIdx, sn, 'DEV_FAST_PT');
};

module.exports.startFastPT = (devConf) => {
  if(!devConf) {
    return;
  }

  let sn = devConf.sn;
  let dbsIdx = devConf.dbsIdx;
  if(devConf.pollTime !== prj.DEV_FAST_PT) {
    if(await(mcache.get(dbsIdx, sn, 'DEV_FAST_PT', 'int')) !== prj.DEV_FAST_PT) {
      // dbg(__file + ':' + __line + ' '+  sn + ' -> use fast PT ' + prj.DEV_FAST_PT);
      mcache.set(dbsIdx, sn, 'DEV_FAST_PT', prj.DEV_FAST_PT);
    }
  }

  clearTimeout(fastPtTimer[sn]);
  fastPtTimer[sn] = setTimeout(async((sn) => {
    // dbg(__file + ':' + __line + ' '+  sn + ' -> use idle PT ' + prj.DEV_IDLE_PT);
    delete fastPtTimer[sn];
    let dbsIdx = await(module.exports.getDBSIdx(sn));
    if(dbsIdx < 0) {
      return dbg('device been removed!');
    }
    mcache.remove(dbsIdx, sn, 'DEV_FAST_PT');
  }), prj.DEV_FAST_PT_TIMEOUT, sn);

};

module.exports.stopStatTimer = (sn) => {
  clearTimeout(statTimer[sn]);
  delete statTimer[sn];
};

module.exports.startStatTimer = (devConf, timeout) => {
  offTimeout = await(csid.get('C','OFFLINE_TIMEOUT','int')); // default: 180 sec
  timeout = (timeout) ? timeout : (devConf.pollTime * 100 + offTimeout + parseInt((Math.random() * 1000)));
  clearTimeout(statTimer[devConf.sn]);

  statTimer[devConf.sn] = setTimeout(async((companyId, sn) => {
    let dbsIdx = await(self.getDBSIdx(sn));
    if(dbsIdx < 0) {
      info('Clear the timer of device ' + sn + ' (be removed) ');
      return self.stopStatTimer(sn);
    }
    let devConf = await(module.exports.get(dbsIdx, sn));
    if(devConf.status === 0) { // already offline
      return self.stopStatTimer(sn);
    } else if(self.isOffline(devConf)) {
      return self.setOffline(devConf);
    } else { // check again
      // console.log('restart timer again !');
      self.startStatTimer(devConf);
    }
  }), timeout, devConf.companyId, devConf.sn);
};
