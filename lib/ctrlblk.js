
const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const model = require(prj.ROOT_PATH + '/public/js/model');
const asyncUtils = require('async');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const utils = require(prj.LIB_PATH + '/utils');
const db = require(prj.LIB_PATH + '/db');
const csid = require(prj.LIB_PATH + '/csid');
const mcache = require(prj.LIB_PATH + '/mcache');
const device = require(prj.LIB_PATH + '/device');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const self = module.exports;

const parseModbus = (ctrlData) => {
  let _ctrlData = utils.toJson(ctrlData, {__file, __line});
  if(!_ctrlData) { return; }

  let ret = {};
  _ctrlData.forEach((cData, idx) => {
    if(utils.isNone(cData.haddr)) {
      return;
    }
    let haddr = cData.haddr;
    ret[haddr] = {
      id: cData.id,
      desc: cData.desc,
      type: cData.type,
      limitId: (cData.limitId) ? (cData.limitId) : [],
      enlog: cData.enlog,
      laddr: cData.laddr,
    };

    if(cData.type === iotype.APP_SWITCH) {
      ret[haddr].on = cData.on;
      ret[haddr].off = cData.off;
    } else if(cData.type === iotype.APP_BTN) {
      ret[haddr].on = cData.on;
      ret[haddr].off = cData.off;
      ret[haddr].btnTime = cData.btnTime;
    } else if(iotype.isIOSW(cData.type)) {
      ret[haddr].swSN = cData.swSN;
      ret[haddr].swAddr = (cData.swAddr) ? (cData.swAddr).split('-')[0] : cData.swAddr; // 40001 or 40001-40002
      if(cData.swId) {
        ret[haddr].swId = cData.swId;
      }
    } else if(iotype.isFixPoint(cData.type) /*|| iotype.isIEEE754(cData.type)*/) {
      ret[haddr].fpt = cData.fpt;
    } else if(iotype.isCommAlarm(cData.type)) {
      ret[haddr].refReg = cData.refReg;
      if(cData.pri) {
        ret[haddr].pri = cData.pri;
      }
    }

    if(iotype.isNumber(cData.type)) {
      for(let t of ['unit','virt']) {
        if(cData[t]) {
          ret[haddr][t] = cData[t];
        }
      }
    }

    if(iotype.isMathEq(cData.type) && cData.eq) {
      ret[haddr].eq = cData.eq;
    }

    if(iotype.isDispaly(cData.type) && cData.dt) {
      ret[haddr].dt = cData.dt;
    }

    if(iotype.isMbusNumber(cData.type)) {
      for(let t of ['up','low','max','min']) {
        if(cData[t] && !isNaN(cData[t])) {
          ret[haddr][t] = parseFloat(cData[t]);
        }
      }
      for(let t of ['sam','dur','pri','rr1','rr2','rr3','rr4']) {
        if(cData[t]) {
          ret[haddr][t] = cData[t];
        }
      }
    }

    if(utils.has(cData.laddr) && cData.haddr !== cData.laddr) {
      if(iotype.is32bit(cData.type)) {
        ret[cData.laddr] = {
          type: cData.type,
          haddr: cData.haddr,
        };
      } else if(iotype.is64bit(cData.type) || iotype.is48bit(cData.type)) {
        let addrs = utils.getContiAddrs(cData.haddr, cData.laddr);
        for(let i = 0; i < addrs.length; i++) {
          if(i === 0) {
            if(iotype.is64bit(cData.type)) {
              ret[addrs[i]].iaddr = addrs[i + 1]; 
              ret[addrs[i]].jaddr = addrs[i + 2]; 
              ret[addrs[i]].laddr = addrs[i + 3]; 
            } else { // 48 bits
              ret[addrs[i]].iaddr = addrs[i + 1]; 
              ret[addrs[i]].laddr = addrs[i + 2]; 
            }
          } else {
            ret[addrs[i]] = {
              type: cData.type, 
              haddr: cData.haddr
            }; 
          }
        }
      }
    }
  });
  return ret;
};

module.exports.reset = (dbsIdx, companyId, sn) => {
  let filter = '' ;
  if(companyId) {
    filter = ' WHERE `companyId` = \'' + companyId + '\'';
    filter = (sn) ? filter + ' AND `sn` = UNHEX(\'' + sn + '\')' : filter ;
  } else if(sn) {
    filter = ' WHERE `sn` = UNHEX(\'' + sn + '\')';
  }

  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn`,`mo`,`modbus` FROM `' + db.DB_MMC + '`.`' + db.TB_DEVICE + '`' + filter + ';';
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    return result;
  } else if(result.data.length === 0) {
    return {err: gstate.NO_RECORD};
  }

  for(let i = 0; i < result.data.length; i++) {
    let row = result.data[i];
    if(!row.modbus) {
      await(mcache.remove(dbsIdx, row.sn, 'CTRLBLK'));
      dbg({__file, __line, err: "No modbus data!"});
      continue;
    }
    let profObj = parseModbus(row.modbus);
    if(!profObj) {
      info({__file, __line, err: "Parsing profile error! sn = " + row.sn});
      continue;
    }
    if(filter.length > 0) { // set
      await(mcache.set(dbsIdx, row.sn, 'CTRLBLK', profObj));
    } else { // init
      if(!await(mcache.get(dbsIdx, row.sn, 'CTRLBLK'))) {
        await(mcache.set(dbsIdx, row.sn, 'CTRLBLK', profObj));
      }
    }
  }
};

module.exports.set = (dbsIdx, sn, profObj) => {
  await(mcache.set(dbsIdx, sn, 'CTRLBLK', profObj));
};

module.exports.init = (dbsIdx) => {
  await(self.reset(dbsIdx, null, null));
};

module.exports.getAll = () => {
  let ret = {};
  let querys = [];
  let qStr = 'SELECT LOWER(HEX(`sn`)) AS `sn` FROM `' + db.TB_DEVICE + '`;';
  for(let i = 0; i < prj.DBS.length; i++) {
    querys[i] = db.pr_query(i, qStr);
  }

  let confs = {};
  let results = await(querys);
  for(let i = 0; i < results.length; i++) {
    let result = results[i];
    if(result.err) {
      continue;
    }
    for(let j = 0; j < result.data.length; j++) {
      let sn = result.data[j].sn;
      confs[sn] = self.get(i, sn);
    }
  }

  let ctrlBlks = await(confs);
  for(let sn in ctrlBlks) {
    let ctrlBlk = ctrlBlks[sn];
    if(!ctrlBlk) {
      continue;
    }
    ret[sn] = ctrlBlk;
  }
  return ret;
};

module.exports.get = (dbsIdx, sn) => {
  return await(mcache.get(dbsIdx, sn, 'CTRLBLK'));
};

module.exports.remove = (dbsIdx, sn) => {
   await(mcache.remove(dbsIdx, sn, 'CTRLBLK'));
};

module.exports.delCache = (sn) => {
   mcache.delCache(sn, 'CTRLBLK');
};
