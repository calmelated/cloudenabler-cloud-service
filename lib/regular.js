const prj = require('../project');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const db = require(prj.LIB_PATH + '/db');
const csid = require(prj.LIB_PATH + '/csid');
const gstate = require(prj.GSTATE_PATH);
const device = require(prj.LIB_PATH + '/device');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const register = require(prj.LIB_PATH + '/register');
const mbval = require(prj.LIB_PATH + '/mbval');
const iotype = require(prj.ROOT_PATH + '/public/js/iotype');
const mac2hex = require(prj.LIB_PATH + '/utils').mac2hex;
const utils = require(prj.LIB_PATH + '/utils');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const jobQueue = require(prj.LIB_PATH + '/job-queue');
const worker = require(prj.LIB_PATH + '/worker');
const hostname = require('os').hostname();
const clusterId = process.env.CLUSTER_ID;
const host = hostname + '-' + clusterId;
const fs = require('fs');

const rstAlarmCnt = () => {
  info('Reset alarm to default !');
  for(let i = 0; i < prj.DBS.length; i++) {
    let result = await(db.pr_wquery(i, 'UPDATE `' + db.TB_COMPANY + '` SET `numAlarm` = 0;'));
    if (result.err) {
      info({__file, __line, err: result.err});
    }
  }
};
module.exports.rstAlarmCnt = rstAlarmCnt;

const purgeLog = () => {
  let dt = new Date();
  dt.setUTCMonth(dt.getUTCMonth() - 3);
  let threeMonthBefore = parseInt(dt.getTime() / 1000);
  info('Purge Event/Audit/Alarm log before ' + threeMonthBefore + ' (' + dt + ')');

  // check for all database sites
  let nj = 0;
  let jobs = [];
  let execTime = parseInt(Date.now() / 1000);
  for(let dbsIdx = 0; dbsIdx < prj.DBS.length; dbsIdx++) {
    for(let table of [db.TB_ALARM_LOG, db.TB_AUDIT_LOG, db.TB_IOSTAT_LOG]) {
      execTime++;
      jobs[nj++] = {
        type: worker.TYPE.CLEAR_LOG,
        execTime: execTime,
        argv: {
          dbsIdx: dbsIdx,
          table: table,
          time: threeMonthBefore,
        }
      };
    }
    let qStr = "SELECT table_name FROM information_schema.tables WHERE table_type = \'base table\' AND table_schema=\'" + db.DB_MMC + "\' AND `table_name` like \'" + db.TB_EVTLOG + "_%\'";
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      info({__file, __line, err: result.err});
      continue;
    }
    for(let j = 0; j < result.data.length; j++) {
      execTime++;
      jobs[nj++] = {
        type: worker.TYPE.CLEAR_LOG,
        execTime: execTime,
        argv: {
          dbsIdx: dbsIdx,
          table: result.data[j].table_name,
          time: threeMonthBefore,
        }
      };
    }
  }
  await(jobQueue.add(jobs));
};
module.exports.purgeLog = purgeLog;

const purgeRegLog = (unit) => {
  let now = new Date();
  let beforeTime;
  if(unit === 'raw') { // keep 30 hours
    now.setHours(now.getHours() - 30);
    beforeTime = parseInt(now.getTime() / 1000);
  } else if(unit === 'day') { // keep 1 year
    now.setFullYear(now.getFullYear() - 1);
    beforeTime = parseInt(now.getTime() / 1000);
  } else if(unit === 'month' || unit === 'year') {
    now.setFullYear(now.getFullYear() - 5);
    beforeTime = parseInt(now.getTime() / 1000);
  }

  // check for all database sites
  let nj = 0;
  let jobs = [];
  let execTime = parseInt(Date.now() / 1000);
  for(let dbsIdx = 0; dbsIdx < prj.DBS.length; dbsIdx++) {
    let qStr = 'SELECT `table_schema`,`table_name` FROM `information_schema`.`tables` WHERE `table_schema` like \'' + db.DB_RLOG + '_%\' and `table_name` like \'%_' + unit + '\';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (result.err) {
      info({__file, __line, err: result.err});
      continue;
    }
    for(let j = 0; j < result.data.length; j++) {
      execTime++;
      jobs[nj++] = {
        type: worker.TYPE.CLEAR_LOG,
        execTime: execTime,
        argv: {
          dbsIdx: dbsIdx,
          table: result.data[j].table_schema + '`.`' + result.data[j].table_name,
          time: beforeTime,
        }
      };
    }
  }
  await(jobQueue.add(jobs));
};
module.exports.purgeRegLog = purgeRegLog;

const logAlarmData = (dbsIdx, sn, addr, val) => {
  let nsec = parseInt(new Date().getTime() / 1000);
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  let type = ctrlData[addr].type;
  if(!ctrlData[addr] || ctrlData[addr].enlog !== '1' || ctrlData[addr].haddr || !iotype.enCloudLogging(type)) {
    return;
  }
  // fix points value  -> integer
  if(iotype.is48bit(type)) {
    val = val * 1000;
  } else if(iotype.isFixPoint(type) && ctrlData[addr].fpt > 0) {
    val = val * Math.pow(10, ctrlData[addr].fpt);
  }
  let qStr = 'INSERT LOW_PRIORITY INTO `' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_raw` (`time`,`value`) VALUES (\'' + nsec + '\',\'' + val + '\');' ;
  let result = await(db.pr_wquery(dbsIdx, qStr));
  if (result.err) {
    info({__file, __line, err: result.err});
  }
  return result;
};
module.exports.logAlarmData = logAlarmData;

const logStatData = (dbsIdx, nsec, unit, sn, ctrlData) => {
  let qStrs = [];
  let addrs = Object.keys(ctrlData);
  for(let j = 0; j < addrs.length; j++) {
    let addr = addrs[j];
    let type = ctrlData[addr].type;
    if(!ctrlData[addr] || ctrlData[addr].enlog !== '1' || ctrlData[addr].haddr || !iotype.enCloudLogging(type)) {
      continue;
    }
    let trange;
    let toTb, fromTb, cols;
    if(unit === 'day') {
      trange = utils.timeRange('lastHour', nsec);
      fromTb = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_raw`';
      toTb   = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_' + unit + '`';
      cols   = 'AVG(`value`) AS `value`, MAX(`value`) AS `max`, MIN(`value`) AS `min`';
    } else if(unit === 'month') {
      trange = utils.timeRange('lastDay', nsec);
      fromTb = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_day`';
      toTb   = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_' + unit + '`';
      cols   = 'AVG(`value`) AS `value`, MAX(`max`) AS `max`, MIN(`min`) AS `min`';
    } else if(unit === 'year') { // every 8hr
      trange = utils.timeRange('lastMonth', nsec);
      fromTb = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_month`';
      toTb   = '`' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_' + unit + '`';
      cols   = 'AVG(`value`) AS `value`, MAX(`max`) AS `max`, MIN(`min`) AS `min`';
    }

    let qStr = 'SELECT `time` FROM ' + toTb + ' WHERE `time` = ' + trange.end + ';';
    let result = await(db.pr_query(dbsIdx, qStr));
    if (!result.err && result.data.length > 0) {
      //dbg('sn=' + sn + ', addr=' + addr + ', unit=' + unit + ', time=' + trange.end + ' already logged!');
      continue;
    }

    //dbg('sn=' + sn + ', addr=' + addr + ', unit=' + unit + ', time=' + trange.end + ' logging!');
    let logTime, filter;
    if(prj.CUSTOMER === 'YATEC' || prj.CUSTOMER === 'HYEC') {
      filter  = '`time` > '  + trange.start + ' AND `time` <= ' + trange.end;
      logTime = trange.end;
    } else {
      filter = '`time` >= ' + trange.start + ' AND `time` < ' + trange.end;
      logTime = trange.start;
    }
    if(iotype.isEventData(ctrlData[addr].type)) {
      qStrs.push('INSERT INTO ' + toTb + ' (SELECT ' + logTime + ', SUM(`value`) AS `value` FROM ' + fromTb + ' WHERE ' + filter + ') ON DUPLICATE KEY UPDATE `time` = `time`;');
    } else {
      qStrs.push('INSERT INTO ' + toTb + ' (SELECT * FROM (SELECT ' + logTime + ','  + cols + ' FROM ' + fromTb + ' WHERE ' + filter + ') stat WHERE `stat`.`value` IS NOT NULL) ON DUPLICATE KEY UPDATE ' + toTb + '.`time` = ' + toTb + '.`time` ;' );
    }
  }
  let date = new Date();
  let execTime = ((date.getTime() / 1000) - nsec);
  if(execTime > 30) {
    info('[' + date.toUTCString() + '] Logging data (Stat) for ' + sn + ', execTime: ' + execTime);
  }
  for(let i = 0; i < qStrs.length; i++) {
    db.wquery(dbsIdx, qStrs[i], (result) => {
      if (result.err) {
        return info({__file, __line, err: result.err});
      }
    });
  }
};
module.exports.logStatData = logStatData;

const logRawData = (dbsIdx, nsec, sn, ctrlData) => {
  let qStr = '';
  let addrs = Object.keys(ctrlData);
  for(let j = 0; j < addrs.length; j++) {
    let addr = addrs[j];
    let type = ctrlData[addr].type;
    if(!ctrlData[addr] || ctrlData[addr].enlog !== '1' || ctrlData[addr].haddr || !iotype.enCloudLogging(type)) {
      continue;
    } else if(iotype.isEventData(type)) {
      continue;
    }
    let regVal = await(register.toDecVal(dbsIdx, sn, addr, true));
    if(typeof regVal === 'undefined') {
      continue;
    }
    qStr += 'INSERT INTO `' + db.DB_RLOG + '_' + sn + '`.`' + addr + '_raw` (`time`,`value`) VALUES (\'' + nsec + '\',\'' + regVal + '\') ON DUPLICATE KEY UPDATE `time` = `time`;';
  }
  if(qStr) {
    let date = new Date();
    let execTime = ((date.getTime() / 1000) - nsec);
    if(execTime > 30) {
      info('[' + date.toUTCString() + '] Logging data (RAW) for ' + sn + ', execTime: ' + execTime);
    }
    db.wquery(dbsIdx, qStr, (result) => {
      if (result.err) {
        return info({__file, __line, err: result.err});
      }
    });
  }
};
module.exports.logRawData = logRawData;

const logByDate = (inMocha, date, unit) => {
  let jobs = [];
  let devConfs = await(device.getAll());
  let sns = Object.keys(devConfs);
  for(let i = 0; i < sns.length; i++) {
    let sn = sns[i];
    let devConf = devConfs[sn];
    if(!devConf || devConf.enServLog !== 1) {
      continue;
    } else if(!inMocha && devConf.status === 0) { // normal mode and device disconnected
      continue;
    }
    jobs[i] = {
      type: worker.TYPE.CLOUD_LOG,
      argv: {
        sn: sn,
        dbsIdx: devConf.dbsIdx,
        nsec: parseInt(date.getTime() / 1000),
        unit: unit,
      }
    };
  }
  await(jobQueue.add(jobs));

  // For mocha test only: check job queue immediately
  if(inMocha) {
    while(true) {
      await(utils.sleep(10));
      let avail = await(jobQueue.available());
      if(avail) {
        await(jobQueue.check(host));
      } else {
        break;
      }
      //await(utils.sleep(200));
    }
  }
};
module.exports.logByDate = logByDate;

const logData = (unit) => {
  await(logByDate(false, new Date(), unit));
};
module.exports.logData = logData;
