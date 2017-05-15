const prj = require('../project');
const gstate = require(prj.GSTATE_PATH);
const db = require(prj.LIB_PATH + '/db');
const info = require(prj.LIB_PATH + '/dbg').info;
const dbg = require(prj.LIB_PATH + '/dbg').dbg;
const ddbg = require(prj.LIB_PATH + '/dbg').ddbg;
const csid = require(prj.LIB_PATH + '/csid');
const utils = require(prj.LIB_PATH + '/utils');
const regular = require(prj.LIB_PATH + '/regular');
const device = require(prj.LIB_PATH + '/device');
const ctrlblk = require(prj.LIB_PATH + '/ctrlblk');
const register = require(prj.LIB_PATH + '/register');
const async = require('asyncawait/async');
const await = require('asyncawait/await');
const os = require('os');
const hostname = os.hostname();
const jobQueue = require(prj.LIB_PATH + '/job-queue');
const clusterId = process.env.CLUSTER_ID;
const alarm = require(prj.LIB_PATH + '/alarm');

const TYPE = {
  ALM_USER:           0,
  ALM_COMPANY:        1,
  CLOUD_LOG:          2,
  CLEAR_LOG:          3,
};
module.exports.TYPE = TYPE;

const alarmUser = (argv) => {
  return true;
};

const alarmCompany = (argv) => {
  await(alarm.sendAll(argv));
  return true;
};

const cloudLog = (argv) => {
  let sn = argv.sn;
  let dbsIdx = argv.dbsIdx;
  let ctrlData = await(ctrlblk.get(dbsIdx, sn));
  if(!ctrlData) {
    return true;
  }
  if(argv.unit === 'raw') {
    await(regular.logRawData(dbsIdx, argv.nsec, sn, ctrlData));
  } else {
    await(regular.logStatData(dbsIdx, argv.nsec, argv.unit, sn, ctrlData));
  }
  return true;
};

const clearLog = (argv) => {
  let qStr = 'DELETE FROM `' + argv.table + '` WHERE `time` <= \'' + argv.time + '\';';
  let result = await(db.pr_wquery(argv.dbsIdx, qStr));
  if (result.err) {
    info({__file, __line, err: result.err});
  }
  return true;
};

module.exports.execute = (job) => {
  let result = false;
  if(job.task.type === TYPE.ALM_USER)               { result = await(alarmUser(job.task.argv));       } 
  else if(job.task.type === TYPE.ALM_COMPANY)       { result = await(alarmCompany(job.task.argv));    } 
  else if(job.task.type === TYPE.CLOUD_LOG)         { result = await(cloudLog(job.task.argv));        } 
  else if(job.task.type === TYPE.CLEAR_LOG)         { result = await(clearLog(job.task.argv));        } 
  else {
    info('Unknown work type!', job);
    result = true;
  }
  let time = parseInt(Date.now() / 1000);
  if((time - job.execTime) > 900) {
    info('Job took too much time! exec time: ' + (time - job.execTime) + ' sec', job); 
  } 
  return result;
};
